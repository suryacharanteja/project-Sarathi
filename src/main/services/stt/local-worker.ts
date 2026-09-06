/**
 * Local speech-to-text worker (Electron `utilityProcess` entry point).
 *
 * Why a separate process at all: Whisper inference is a synchronous, native,
 * multi-second CPU burst. Run it on the main process — which is where Skill
 * Recorder runs it, because it transcribes *after* a recording has stopped —
 * and every decode freezes Sarathi's IPC for its duration. During a live call
 * that means the overlay stops streaming the answer, audio chunks queue up,
 * and window drags stutter, once per spoken turn. Isolating it costs one
 * structured-clone hop per 100 ms frame and buys a main process that stays
 * responsive no matter how slow the machine is.
 */
import {
  closeUtterance,
  collectUtterance,
  createEndpointerState,
  hasEnoughSpeech,
  pcm16ToFloat32,
  pushFrame,
  type EndpointerState
} from './endpointing'
import { isMeaningfulTranscript } from './hallucinations'
import {
  DEFAULT_STT_MODEL_ID,
  getAsrPipeline,
  isSttModelCachedAt,
  type AsrPipeline,
  type SttModelId
} from './whisper'
import type { WorkerRequest, WorkerResponse } from './worker-protocol'
import type { SttSource } from '../../../shared/stt-types'

/**
 * How often an interim decode of the in-progress utterance is attempted, to
 * keep the live transcript strip moving while someone is still talking.
 * Partials are display-only in Sarathi (`setPartialText`) — every downstream
 * decision runs off finals — so they are explicitly best-effort.
 */
const PARTIAL_INTERVAL_MS = 1500
/**
 * Partials are earned, not assumed.
 *
 * Whisper always pads its input to 30 s, so a decode costs roughly the same
 * whether the utterance is 3 s or 10 s. Measured on an i5-11260H (12 threads,
 * CPU, q8): ~3.0-3.4 s per decode at every length. On that machine an interim
 * decode cannot possibly keep up with a 1.5 s cadence, and worse, the queue is
 * serial — an in-flight partial delays the final behind it by its full
 * duration, on the one path where latency is actually load bearing.
 *
 * So partials stay off until the engine has measured itself on this specific
 * machine: only once a real final decode has come in at or under the partial
 * cadence do interim decodes start. Slow machines never pay for them; a fast
 * machine (or a future GPU backend) gets them automatically, with no constant
 * to retune.
 */
let lastFinalDecodeMs = 0

interface SourceState {
  endpointer: EndpointerState
  active: boolean
  lastPartialAt: number
}

type Job =
  | { kind: 'final'; source: SttSource; samples: Float32Array }
  | { kind: 'partial'; source: SttSource; samples: Float32Array }

const sources: Record<SttSource, SourceState> = {
  mic: { endpointer: createEndpointerState(), active: false, lastPartialAt: 0 },
  system: { endpointer: createEndpointerState(), active: false, lastPartialAt: 0 }
}

let pipe: AsrPipeline | null = null
let language: string | null = 'en'
let modelId: SttModelId = DEFAULT_STT_MODEL_ID
let queue: Job[] = []
let draining = false

function send(message: WorkerResponse): void {
  process.parentPort.postMessage(message)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function loadModel(cacheDir: string, allowDownload: boolean): Promise<void> {
  const cached = isSttModelCachedAt(cacheDir, modelId)
  if (!allowDownload && !cached) {
    send({ type: 'model-error', error: 'The local speech model is not downloaded yet.', cached: false })
    return
  }

  send({
    type: 'model-progress',
    phase: cached ? 'loading' : 'downloading',
    percent: cached ? null : 0,
    loadedBytes: null,
    totalBytes: null
  })

  let lastPercent = -1
  try {
    pipe = await getAsrPipeline({
      modelId,
      cacheDir,
      allowDownload,
      onProgress: (progress) => {
        if (cached || progress.status !== 'progress_total') return
        const percent = Math.max(0, Math.min(100, Math.floor(progress.progress ?? 0)))
        if (percent === lastPercent) return
        lastPercent = percent
        send({
          type: 'model-progress',
          phase: 'downloading',
          percent,
          loadedBytes: progress.loaded ?? null,
          totalBytes: progress.total ?? null
        })
      }
    })
    send({ type: 'model-ready' })
    for (const source of ['mic', 'system'] as SttSource[]) {
      if (sources[source].active) send({ type: 'listening', source })
    }
  } catch (error) {
    pipe = null
    send({ type: 'model-error', error: errorMessage(error), cached: isSttModelCachedAt(cacheDir, modelId) })
  }
}

/**
 * Whisper is a single-session pipeline: two concurrent calls would either
 * serialize inside onnxruntime or corrupt state. One queue, drained strictly
 * in order, with finals always ahead of partials.
 */
function enqueue(job: Job): void {
  if (job.kind === 'partial') {
    queue.push(job)
  } else {
    const lastFinal = queue.map((j) => j.kind).lastIndexOf('final')
    queue.splice(lastFinal + 1, 0, job)
  }
  void drain()
}

async function drain(): Promise<void> {
  if (draining) return
  draining = true
  try {
    while (queue.length > 0) {
      const job = queue.shift()!
      if (!pipe || !sources[job.source].active) continue
      // A partial that waited behind a final is already stale — the final it
      // was previewing has been emitted, so publishing it now would rewind the
      // transcript strip.
      if (job.kind === 'partial' && queue.some((j) => j.kind === 'final' && j.source === job.source)) continue

      const startedAt = Date.now()
      try {
        const result = await pipe(job.samples, {
          return_timestamps: false,
          task: 'transcribe',
          ...(language ? { language } : {})
        })
        const text = (result.text ?? '').trim()
        if (job.kind === 'final') {
          lastFinalDecodeMs = Date.now() - startedAt
          if (isMeaningfulTranscript(text)) send({ type: 'final', source: job.source, text })
        } else if (text) {
          send({ type: 'partial', source: job.source, text })
        }
      } catch (error) {
        send({ type: 'decode-error', source: job.source, error: errorMessage(error) })
      }
    }
  } finally {
    draining = false
  }
}

function onAudio(source: SttSource, pcm: ArrayBuffer): void {
  const state = sources[source]
  if (!state.active) return

  const frame = pcm16ToFloat32(new Int16Array(pcm))
  const event = pushFrame(state.endpointer, frame)

  if (event.type === 'end-of-turn') {
    if (hasEnoughSpeech(state.endpointer)) {
      enqueue({ kind: 'final', source, samples: collectUtterance(state.endpointer) })
    }
    closeUtterance(state.endpointer, event.reason)
    state.lastPartialAt = 0
    return
  }

  if (!state.endpointer.speaking || !pipe) return
  // See `lastFinalDecodeMs`: partials only run on a machine that has already
  // proved it can decode a whole utterance inside the partial cadence.
  if (lastFinalDecodeMs === 0 || lastFinalDecodeMs > PARTIAL_INTERVAL_MS) return

  const now = Date.now()
  if (state.lastPartialAt === 0) {
    state.lastPartialAt = now
  } else if (now - state.lastPartialAt >= PARTIAL_INTERVAL_MS && hasEnoughSpeech(state.endpointer)) {
    state.lastPartialAt = now
    // Never let partials pile up: if one is already queued for this source the
    // machine is behind, so skip this tick entirely.
    if (!queue.some((j) => j.kind === 'partial' && j.source === source)) {
      enqueue({ kind: 'partial', source, samples: collectUtterance(state.endpointer) })
    }
  }
}

function reset(source: SttSource): void {
  sources[source] = {
    endpointer: createEndpointerState(),
    active: false,
    lastPartialAt: 0
  }
  queue = queue.filter((job) => job.source !== source)
}

process.parentPort.on('message', (event) => {
  const message = event.data as WorkerRequest
  switch (message.type) {
    case 'init':
      language = message.language
      modelId = message.modelId
      void loadModel(message.cacheDir, message.allowDownload)
      break
    case 'ensure-model':
      language = message.language
      modelId = message.modelId
      void loadModel(message.cacheDir, true)
      break
    case 'start':
      reset(message.source)
      sources[message.source].active = true
      if (pipe) send({ type: 'listening', source: message.source })
      break
    case 'stop': {
      // Flush whatever was mid-utterance rather than discarding it — someone
      // toggling the mic off right after finishing a sentence should still see
      // that sentence.
      const state = sources[message.source]
      if (state.active && state.endpointer.speaking && hasEnoughSpeech(state.endpointer)) {
        enqueue({ kind: 'final', source: message.source, samples: collectUtterance(state.endpointer) })
      }
      reset(message.source)
      break
    }
    case 'audio':
      onAudio(message.source, message.pcm)
      break
    case 'dispose':
      queue = []
      process.exit(0)
      break
  }
})
