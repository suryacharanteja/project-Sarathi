import type { AskParams, LlmProvider } from './types'
import { askGemini } from './gemini'
import { askOpenAi, askOpenCodeGo, askOpenCodeZen, askDeepSeek } from './openai-compatible'

const MAX_RETRIES = 3
const RETRY_DELAYS = [1000, 2000, 4000]
// Two timeout regimes instead of one fixed request-length ceiling: a
// generous "did the model even start responding" timeout before the first
// chunk, then a much shorter "stalled mid-stream" timeout rearmed on every
// chunk after — directly analogous to the STT ping/pong watchdog
// (assemblyai.ts) judging liveness by actual activity, not elapsed time.
const FIRST_CHUNK_TIMEOUT_MS = 25000
const STALL_TIMEOUT_MS = 15000

type OnChunk = (text: string) => void
export type LlmError = Error & { partial?: boolean }

class LlmTimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LlmTimeoutError'
  }
}

function dispatch(provider: LlmProvider, params: AskParams, onChunk: OnChunk): Promise<void> {
  switch (provider) {
    case 'gemini':
      return askGemini(params, onChunk)
    case 'openai':
      return askOpenAi(params, onChunk)
    case 'opencode-go':
      return askOpenCodeGo(params, onChunk)
    case 'opencode-zen':
      return askOpenCodeZen(params, onChunk)
    case 'deepseek':
      return askDeepSeek(params, onChunk)
  }
}

function dispatchWithWatchdog(provider: LlmProvider, params: AskParams, onChunk: OnChunk): Promise<void> {
  return new Promise((resolve, reject) => {
    let firstChunkReceived = false
    let settled = false
    let timer: ReturnType<typeof setTimeout>

    function settleReject(error: LlmError): void {
      if (settled) return
      settled = true
      clearTimeout(timer)
      error.partial = firstChunkReceived
      reject(error)
    }

    function armTimer(ms: number, message: string): void {
      timer = setTimeout(() => settleReject(new LlmTimeoutError(message)), ms)
    }

    armTimer(FIRST_CHUNK_TIMEOUT_MS, 'Request timed out')

    dispatch(provider, params, (text) => {
      if (settled) return
      firstChunkReceived = true
      clearTimeout(timer)
      armTimer(STALL_TIMEOUT_MS, 'Connection stalled')
      onChunk(text)
    }).then(
      () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve()
      },
      (error) => settleReject(error instanceof Error ? error : new Error(String(error)))
    )
  })
}

function isRetryable(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  if (error instanceof LlmTimeoutError) return true
  const msg = error.message.toLowerCase()
  return (
    msg.includes('429') ||
    msg.includes('500') ||
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('rate limit') ||
    msg.includes('overloaded') ||
    msg.includes('high demand') ||
    msg.includes('fetch failed') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('timed out')
  )
}

function classifyError(error: unknown): string {
  if (!(error instanceof Error)) return 'Ask AI failed.'
  if (error instanceof LlmTimeoutError) {
    return error.message === 'Connection stalled'
      ? 'The connection stalled mid-response.'
      : 'The AI took too long to respond. Please try again.'
  }
  const msg = error.message.toLowerCase()
  if (msg.includes('401') || msg.includes('403') || msg.includes('invalid') && msg.includes('key')) {
    return 'Invalid API key. Check your key in Settings.'
  }
  if (msg.includes('429') || msg.includes('rate limit') || msg.includes('quota')) {
    return 'Rate limited. Please wait a moment and try again.'
  }
  if (
    msg.includes('500') ||
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('overloaded') ||
    msg.includes('high demand') ||
    msg.includes('service unavailable')
  ) {
    return 'The AI service is temporarily overloaded. Please try again in a moment.'
  }
  if (msg.includes('fetch failed') || msg.includes('econnreset') || msg.includes('etimedout')) {
    return 'Network error. Check your internet connection.'
  }
  return error.message.slice(0, 300)
}

/**
 * Resolves once the stream completes cleanly (onChunk already delivered
 * every token). Rejects with an LlmError carrying `.partial` — true means
 * content had already started streaming when it failed, so the caller
 * should append a trailing error rather than replace what's shown.
 */
export async function askLlm(provider: LlmProvider, params: AskParams, onChunk: OnChunk): Promise<void> {
  let lastError: LlmError | undefined
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      await dispatchWithWatchdog(provider, params, onChunk)
      return
    } catch (error) {
      const err = error as LlmError
      lastError = err
      // Once the user has seen partial content, don't silently retry — that
      // would either duplicate what's already shown or restart into a
      // confusing mix. Surface it instead.
      if (err.partial) break
      if (attempt < MAX_RETRIES && isRetryable(err)) {
        await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]))
        continue
      }
      break
    }
  }
  const finalError: LlmError = new Error(classifyError(lastError))
  finalError.partial = lastError?.partial ?? false
  throw finalError
}

export interface ProviderCandidate {
  provider: LlmProvider
  apiKey: string
  model: string
}

/**
 * A single vendor being down (outage, revoked key, sustained rate-limit)
 * must never fully block the interview — this tries each candidate in
 * order, moving to the next only when the failed one produced NO content
 * at all. Once real text has streamed to the card, switching vendors mid-
 * answer would duplicate or garble what's already shown, so a partial
 * failure is surfaced immediately instead of silently retried elsewhere —
 * same boundary askLlm's own same-provider retry already respects.
 */
export async function askLlmWithFallback(
  candidates: ProviderCandidate[],
  params: Omit<AskParams, 'apiKey' | 'model'>,
  onChunk: OnChunk
): Promise<{ provider: LlmProvider }> {
  if (candidates.length > 1) {
    console.log(`[llm-failover] chain for this request: ${candidates.map((c) => c.provider).join(' -> ')}`)
  } else {
    console.log(`[llm-failover] only ${candidates[0]?.provider} configured — no fallback available if it fails`)
  }
  let lastError: LlmError | undefined
  for (const { provider, apiKey, model } of candidates) {
    try {
      await askLlm(provider, { ...params, apiKey, model }, onChunk)
      if (provider !== candidates[0].provider) {
        console.log(`[llm-failover] ${provider} answered after an earlier provider failed`)
      }
      return { provider }
    } catch (error) {
      const err = error as LlmError
      console.warn(`[llm-failover] ${provider} failed (partial=${Boolean(err.partial)}): ${err.message}`)
      if (err.partial) throw err
      lastError = err
    }
  }
  throw lastError ?? new Error('No LLM provider available.')
}
