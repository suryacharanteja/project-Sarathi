import { type AskParams, buildPrompt } from './types'

type OnChunk = (text: string) => void

/**
 * Works for any OpenAI-compatible chat/completions endpoint — real OpenAI,
 * OpenCode Go/Zen, and DeepSeek — all share the same `stream: true` SSE
 * shape: lines of `data: {...}\n\n`, terminated by a literal `data: [DONE]`.
 * Node's global fetch (Node 18+) returns a Response whose .body is a
 * web-standard ReadableStream, readable via getReader() without any extra
 * dependency.
 */
export async function askOpenAiCompatible(
  params: AskParams,
  options: { baseUrl: string; providerLabel: string },
  onChunk: OnChunk
): Promise<void> {
  const response = await fetch(`${options.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.apiKey}`
    },
    body: JSON.stringify({
      model: params.model,
      messages: [
        {
          role: 'user',
          content:
            params.imageDataUrls && params.imageDataUrls.length > 0
              ? [
                  { type: 'text', text: buildPrompt(params) },
                  ...params.imageDataUrls.map((url) => ({ type: 'image_url', image_url: { url } }))
                ]
              : buildPrompt(params)
        }
      ],
      temperature: 0.4,
      stream: true
    })
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`${options.providerLabel} error (${response.status}): ${body.slice(0, 300)}`)
  }
  if (!response.body) {
    throw new Error(`${options.providerLabel} returned no response body.`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let separatorIndex: number
    while ((separatorIndex = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, separatorIndex)
      buffer = buffer.slice(separatorIndex + 2)

      for (const line of frame.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const payload = trimmed.slice(5).trim()
        if (payload === '[DONE]') continue
        try {
          const parsed = JSON.parse(payload)
          const delta = parsed?.choices?.[0]?.delta?.content
          if (typeof delta === 'string' && delta) onChunk(delta)
        } catch {
          // ignore malformed/partial SSE frames
        }
      }
    }
  }
}

export function askOpenAi(params: AskParams, onChunk: OnChunk): Promise<void> {
  return askOpenAiCompatible(params, { baseUrl: 'https://api.openai.com/v1', providerLabel: 'OpenAI' }, onChunk)
}

export function askOpenCodeGo(params: AskParams, onChunk: OnChunk): Promise<void> {
  return askOpenAiCompatible(
    params,
    { baseUrl: 'https://opencode.ai/zen/go/v1', providerLabel: 'OpenCode Go' },
    onChunk
  )
}

export function askOpenCodeZen(params: AskParams, onChunk: OnChunk): Promise<void> {
  return askOpenAiCompatible(params, { baseUrl: 'https://opencode.ai/zen/v1', providerLabel: 'OpenCode Zen' }, onChunk)
}

export function askDeepSeek(params: AskParams, onChunk: OnChunk): Promise<void> {
  return askOpenAiCompatible(params, { baseUrl: 'https://api.deepseek.com/v1', providerLabel: 'DeepSeek' }, onChunk)
}
