import WebSocket from 'ws'
import type { WebContents } from 'electron'
import type { SttSource } from '../../../shared/stt-types'
import { safeSend } from '../../utils/safe-send'

const SAMPLE_RATE = 16000
const WATCHDOG_INTERVAL_MS = 1000
const PING_INTERVAL_MS = 10000
const PONG_TIMEOUT_MS = 25000
const MAX_CONNECT_RETRIES = 5
const BASE_RETRY_DELAY_MS = 1000
const MAX_RETRY_DELAY_MS = 16000
/** A connection has to survive this long after opening before a later drop
 *  counts as "healthy, then lost" and earns a fresh retry budget. Without
 *  this, a connection that opens and drops every couple of seconds (real
 *  flaky-wifi behavior, not a full outage) resets retryCount to 0 on every
 *  brief success and NEVER accumulates toward MAX_CONNECT_RETRIES — so it
 *  reconnects forever without ever escalating to the local-Whisper fallback,
 *  which is exactly the bug UAT hit on a bad-but-not-dead network. */
const STABLE_CONNECTION_MS = 10000

/**
 * `streaming.assemblyai.com` is the default edge-routing endpoint; AssemblyAI
 * also runs region-pinned hosts for data-residency accounts. If the edge host
 * fails to even connect (DNS failure, refused, timeout — never reaches
 * "open"), cycle through the region hosts before falling back to timed
 * retries, since a region-provisioned key may not route reliably through the
 * generic edge host on every network.
 */
const STT_HOSTS = ['streaming.assemblyai.com', 'streaming.eu.assemblyai.com', 'streaming.us.assemblyai.com']

function normalizeSource(source: string): SttSource {
  return source === 'system' ? 'system' : 'mic'
}

/**
 * The `ws` library surfaces raw Node errors (DNS failures, ECONNRESET, etc.)
 * with no classification of its own — without this, a transient network blip
 * shows the user "getaddrinfo ENOTFOUND streaming.assemblyai.com" instead of
 * something actionable.
 */
function classifyConnectError(message: string): string {
  const lower = message.toLowerCase()
  if (lower.includes('enotfound') || lower.includes('eai_again') || lower.includes('getaddrinfo')) {
    return "Can't reach the transcription service — check your internet connection."
  }
  if (lower.includes('econnrefused') || lower.includes('econnreset') || lower.includes('etimedout')) {
    return 'Transcription service connection was interrupted.'
  }
  if (lower.includes('401') || lower.includes('403') || lower.includes('unauthorized')) {
    return 'Invalid AssemblyAI API key. Check it in Settings.'
  }
  return message
}

interface SourceState {
  ws: WebSocket | null
  streaming: boolean
  closingIntentionally: boolean
  lastMessageAt: number
  lastPongAt: number
  apiKey: string
  retryCount: number
  retryTimer: ReturnType<typeof setTimeout> | null
  hostIndex: number
  pingTimer: ReturnType<typeof setInterval> | null
  /** When the current/most recent attempt reached 'open' — 0 if it never
   *  did. Used to decide whether a disconnect earns a fresh retry budget
   *  (see STABLE_CONNECTION_MS) instead of unconditionally resetting on
   *  every successful open, which masked flaky-network disconnects. */
  openedAt: number
}

function createSourceState(): SourceState {
  return {
    ws: null,
    streaming: false,
    closingIntentionally: false,
    lastMessageAt: 0,
    lastPongAt: 0,
    apiKey: '',
    retryCount: 0,
    retryTimer: null,
    hostIndex: 0,
    pingTimer: null,
    openedAt: 0
  }
}

export interface AssemblyAiCallbacks {
  /** Fired once a source has exhausted every reconnect attempt — the router
   *  fails that source over to the local engine. */
  onUnavailable: (source: SttSource, reason: string) => void
}

export function createAssemblyAiSttService(webContents: WebContents, callbacks: AssemblyAiCallbacks) {
  const state: Record<SttSource, SourceState> = {
    mic: createSourceState(),
    system: createSourceState()
  }

  let watchdogTimer: ReturnType<typeof setInterval> | null = null

  function send(channel: string, payload: unknown): void {
    safeSend(webContents, channel, payload)
  }

  function clearPingTimer(source: SttSource): void {
    const timer = state[source].pingTimer
    if (timer) {
      clearInterval(timer)
      state[source].pingTimer = null
    }
  }

  function terminateQuietly(source: SttSource): void {
    const ws = state[source].ws
    clearPingTimer(source)
    if (!ws) return
    state[source].closingIntentionally = true
    try {
      ws.terminate()
    } catch {
      // no-op
    }
    state[source].ws = null
  }

  function clearRetryTimer(source: SttSource): void {
    const timer = state[source].retryTimer
    if (timer) {
      clearTimeout(timer)
      state[source].retryTimer = null
    }
  }

  /**
   * Liveness is judged by WebSocket ping/pong, NOT by whether AssemblyAI has
   * sent a transcript recently. Silence is normal during a call — nobody
   * talking for 15-30s produces zero "Turn" messages from a perfectly healthy
   * socket, since the server only emits messages when there's speech to
   * transcribe. Judging staleness by content arrival was firing false
   * "Connection may be stale" warnings during ordinary pauses. Ping/pong
   * probes the transport itself, independent of speech activity.
   */
  function startWatchdog(): void {
    if (watchdogTimer) return
    watchdogTimer = setInterval(() => {
      for (const source of ['mic', 'system'] as SttSource[]) {
        const s = state[source]
        if (!s.streaming || !s.ws) continue
        const elapsedSincePong = Date.now() - s.lastPongAt
        if (elapsedSincePong >= PONG_TIMEOUT_MS) {
          send('stt:error', { source, error: 'Connection lost. Reconnecting...' })
          terminateQuietly(source)
          handleDisconnect(source, false)
        }
      }
    }, WATCHDOG_INTERVAL_MS)
  }

  /**
   * Single funnel for every non-intentional disconnect (post-open error,
   * post-open close, or a pong-timeout the watchdog caught) — previously
   * only a connection that failed BEFORE ever opening went through
   * scheduleRetry()'s escalation to onUnavailable; a connection that opened
   * and then dropped just went inert with no retry and no fallback trigger
   * at all. This is what actually fixes that.
   */
  function handleDisconnect(source: SttSource, intentional: boolean): void {
    const s = state[source]
    // Only a connection that stayed up for a real stretch earns a fresh
    // retry budget — otherwise a connection that opens-then-drops every
    // couple of seconds resets retryCount to 0 on every brief success and
    // never accumulates toward MAX_CONNECT_RETRIES.
    if (s.openedAt && Date.now() - s.openedAt >= STABLE_CONNECTION_MS) {
      s.retryCount = 0
    }
    s.openedAt = 0
    resetSource(source)
    if (intentional) return
    scheduleRetry(source)
  }

  function stopWatchdog(): void {
    const anyActive = state.mic.streaming || state.system.streaming
    if (!anyActive && watchdogTimer) {
      clearInterval(watchdogTimer)
      watchdogTimer = null
    }
  }

  /**
   * Schedules a reconnect attempt for a source that failed before ever
   * reaching "open". Cycles through STT_HOSTS immediately (no delay — a
   * region-mismatched host fails fast, so trying the next one costs little),
   * then once all hosts have been tried, backs off exponentially and repeats
   * the cycle up to MAX_CONNECT_RETRIES total attempts.
   */
  function scheduleRetry(source: SttSource): void {
    const s = state[source]
    if (s.closingIntentionally) return

    s.retryCount += 1
    if (s.retryCount > MAX_CONNECT_RETRIES) {
      const reason = "Couldn't connect to the transcription service after several attempts."
      send('stt:error', { source, error: `${reason} Check your connection and try again.` })
      callbacks.onUnavailable(source, reason)
      return
    }

    s.hostIndex = (s.hostIndex + 1) % STT_HOSTS.length
    const completedFullCycle = s.hostIndex === 0
    const delay = completedFullCycle
      ? Math.min(BASE_RETRY_DELAY_MS * 2 ** (s.retryCount - 1), MAX_RETRY_DELAY_MS)
      : 0

    clearRetryTimer(source)
    s.retryTimer = setTimeout(() => {
      s.retryTimer = null
      if (!s.closingIntentionally) connect(source, s.apiKey)
    }, delay)
  }

  function connect(source: SttSource, apiKey: string): void {
    const s = state[source]
    const host = STT_HOSTS[s.hostIndex]

    const query = new URLSearchParams({
      sample_rate: String(SAMPLE_RATE),
      format_turns: 'true',
      // Without this, AssemblyAI's documented default is the multilingual
      // model with "no steering... code-switches natively across all of its
      // supported languages" — it was genuinely trying to detect whatever
      // language it thought it heard, which is why clear English speech
      // sometimes came back as Chinese/Hindi/etc. This is a dedicated
      // English-only model, not just biasing a multilingual one toward
      // English — it can't output another language's script at all.
      speech_model: 'universal-streaming-english',
      // Defaults (max_turn_silence: 1280ms, end_of_turn_confidence_threshold:
      // 0.4) were cutting a turn mid-question on a normal thinking pause or
      // breath, splitting one spoken question into two answer cards. Raising
      // both makes AssemblyAI itself wait longer and need higher confidence
      // before forcing end_of_turn.
      max_turn_silence: '2500',
      end_of_turn_confidence_threshold: '0.6'
    })
    const ws = new WebSocket(`wss://${host}/v3/ws?${query.toString()}`, {
      headers: { Authorization: apiKey }
    })
    s.ws = ws
    s.closingIntentionally = false
    s.lastMessageAt = Date.now()

    // Per-attempt guard: 'error' and 'close' both fire for a real network
    // failure, and without this each would independently call
    // handleDisconnect(), double-incrementing retryCount and scheduling two
    // reconnects for the same drop.
    let disconnectHandled = false

    ws.on('open', () => {
      s.openedAt = Date.now()
      s.streaming = true
      s.lastMessageAt = Date.now()
      s.lastPongAt = Date.now()
      send('stt:status', { source, status: 'connecting' })
      startWatchdog()

      clearPingTimer(source)
      s.pingTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.ping()
          } catch {
            // no-op — watchdog will catch a genuinely dead socket via pong timeout
          }
        }
      }, PING_INTERVAL_MS)
    })

    ws.on('pong', () => {
      s.lastPongAt = Date.now()
    })

    ws.on('message', (raw: Buffer) => {
      s.lastMessageAt = Date.now()
      try {
        const msg = JSON.parse(raw.toString())
        switch (msg.type) {
          case 'Begin':
            send('stt:status', { source, status: 'listening' })
            break
          case 'Turn':
            if (msg.transcript) {
              // With format_turns=true (set below), AssemblyAI sends TWO
              // end_of_turn:true messages per turn_order for the same
              // utterance: an unformatted final first, then a formatted
              // final right after (their own docs: "render the latest
              // transcript; do not append"). Treating both as separate
              // finals was appending both into the transcript/auto-answer
              // buffer, producing duplicated openers like "Write a write a
              // Python program...". Only the fully formatted final
              // (end_of_turn && turn_is_formatted) is the real final; the
              // unformatted one is forwarded as a partial update instead so
              // the live transcript still updates promptly.
              const isTrulyFinal = msg.end_of_turn === true && msg.turn_is_formatted === true
              send(isTrulyFinal ? 'stt:final' : 'stt:partial', { source, text: msg.transcript })
            }
            break
          case 'Termination':
            resetSource(source)
            send('stt:status', { source, status: 'off' })
            break
        }
      } catch {
        // ignore malformed frames
      }
    })

    ws.on('error', (error: Error) => {
      if (disconnectHandled) return
      disconnectHandled = true
      const intentional = s.closingIntentionally
      if (!intentional) {
        send('stt:error', { source, error: classifyConnectError(error.message) })
      }
      handleDisconnect(source, intentional)
    })

    ws.on('close', () => {
      if (disconnectHandled) return
      disconnectHandled = true
      const wasIntentional = s.closingIntentionally
      if (!wasIntentional) {
        send('stt:status', { source, status: 'off' })
      }
      handleDisconnect(source, wasIntentional)
    })
  }

  function start(source: string, apiKey: string): { success: boolean; error?: string } {
    const resolvedSource = normalizeSource(source)

    if (!apiKey) {
      return { success: false, error: 'AssemblyAI API key not configured. Add it in Settings.' }
    }
    if (state[resolvedSource].streaming) {
      return { success: true }
    }

    terminateQuietly(resolvedSource)
    clearRetryTimer(resolvedSource)

    state[resolvedSource].apiKey = apiKey
    state[resolvedSource].retryCount = 0
    // Keep hostIndex as-is: if a previous session already learned which host
    // works for this key/network, reuse it instead of re-probing from edge.

    connect(resolvedSource, apiKey)

    return { success: true }
  }

  function resetSource(source: SttSource): void {
    clearPingTimer(source)
    state[source].ws = null
    state[source].streaming = false
    stopWatchdog()
  }

  function stop(source: string): void {
    const resolvedSource = normalizeSource(source)
    clearRetryTimer(resolvedSource)
    state[resolvedSource].closingIntentionally = true
    const ws = state[resolvedSource].ws
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: 'Terminate' }))
      } catch {
        // no-op
      }
    }
    terminateQuietly(resolvedSource)
    state[resolvedSource].streaming = false
    state[resolvedSource].retryCount = 0
    stopWatchdog()
  }

  function pushAudioChunk(source: string, data: ArrayBuffer): void {
    const resolvedSource = normalizeSource(source)
    const ws = state[resolvedSource].ws
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(Buffer.from(data))
    }
  }

  function dispose(): void {
    stop('mic')
    stop('system')
    if (watchdogTimer) {
      clearInterval(watchdogTimer)
      watchdogTimer = null
    }
  }

  return { start, stop, pushAudioChunk, dispose }
}

export type AssemblyAiSttService = ReturnType<typeof createAssemblyAiSttService>
