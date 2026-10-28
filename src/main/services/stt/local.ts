import { app, utilityProcess, type UtilityProcess, type WebContents } from 'electron'
import { join } from 'path'
import type { LocalSttModelStatus, SttSource } from '../../../shared/stt-types'
import { safeSend } from '../../utils/safe-send'
import { IPC_CHANNELS } from '../../../shared/ipc-contract'
import {
  DEFAULT_STT_MODEL_ID,
  isSttModelCachedAt,
  sttModelInfo,
  type SttModelId
} from './whisper'
import type { WorkerRequest, WorkerResponse } from './worker-protocol'

/**
 * How many consecutive decode failures make the local engine untrustworthy for
 * this call. One failure is a bad buffer; three in a row is a broken pipeline,
 * and continuing to feed it silently drops the interviewer's questions — which
 * is exactly the failure the AssemblyAI fallback exists to catch.
 */
const DECODE_FAILURE_LIMIT = 3
const STOP_DRAIN_TIMEOUT_MS = 30000

/** Where the ONNX weights live. Survives app upgrades; trivial to locate or clear. */
export function sttModelCacheDir(): string {
  const override = process.env['Sarathi_MODELS_DIR']
  if (override) return override
  return join(app.getPath('userData'), 'models')
}

/**
 * Resolve the compiled worker entry. electron-vite emits it next to the main
 * bundle (see `electron.vite.config.ts`), so it sits beside this module's own
 * output in both dev (`out/main`) and a packaged asar.
 */
function workerEntry(): string {
  return join(__dirname, 'stt-worker.js')
}

export interface LocalSttCallbacks {
  /** Fired when the local engine cannot serve this source — the router fails over. */
  onUnavailable: (source: SttSource | 'all', reason: string) => void
}

export function createLocalSttService(webContents: WebContents, callbacks: LocalSttCallbacks) {
  let child: UtilityProcess | null = null
  let disposed = false
  let language: string | null = 'en'
  let modelId: SttModelId = DEFAULT_STT_MODEL_ID
  const active: Record<SttSource, boolean> = { mic: false, system: false }
  const generations: Record<SttSource, number> = { mic: 0, system: 0 }
  const stopping = new Map<SttSource, ReturnType<typeof setTimeout>>()
  const decodeFailures: Record<SttSource, number> = { mic: 0, system: 0 }

  /** One-shot listeners used by `ensureModel` to await a download outcome. */
  const watchers = new Set<(message: WorkerResponse) => void>()

  let status: LocalSttModelStatus = {
    phase: 'missing',
    percent: null,
    loadedBytes: null,
    totalBytes: null,
    error: null,
    modelId,
    downloadLabel: sttModelInfo(modelId).sizeLabel
  }

  function send(channel: string, payload: unknown): void {
    safeSend(webContents, channel, payload)
  }

  function updateStatus(patch: Partial<LocalSttModelStatus>): void {
    status = { ...status, ...patch }
    send(IPC_CHANNELS.sttModelStatus, status)
  }

  function post(message: WorkerRequest): void {
    child?.postMessage(message)
  }

  function ensureChild(allowDownload = false): UtilityProcess {
    if (disposed) throw new Error('The local speech service has been disposed.')
    if (child) return child
    const spawned = utilityProcess.fork(workerEntry(), [], {
      serviceName: 'Sarathi-local-stt',
      stdio: 'inherit'
    })
    child = spawned

    spawned.on('message', (message: WorkerResponse) => {
      if (child === spawned) handleWorkerMessage(message)
    })
    spawned.on('exit', (code) => {
      if (child !== spawned) return
      child = null
      if (disposed) return
      // An unexpected exit is the onnxruntime native-crash case Skill Recorder
      // documents. Nothing is recoverable in-process, so hand every live source
      // to the fallback rather than sitting on a dead worker.
      const reason = `The local speech engine stopped unexpectedly (exit ${code}).`
      for (const source of stopping.keys()) send(IPC_CHANNELS.sttError, { source, error: reason })
      clearStops()
      failPending(reason)
      updateStatus({ phase: 'error', error: reason })
      if (active.mic || active.system) callbacks.onUnavailable('all', reason)
    })

    post({ type: 'init', modelId, cacheDir: sttModelCacheDir(), language, allowDownload })
    return spawned
  }

  function handleWorkerMessage(message: WorkerResponse): void {
    if ('generation' in message && (
      message.generation !== generations[message.source] ||
      (!active[message.source] && !stopping.has(message.source))
    )) return
    switch (message.type) {
      case 'model-progress':
        updateStatus({
          phase: message.phase,
          percent: message.percent,
          loadedBytes: message.loadedBytes,
          totalBytes: message.totalBytes,
          error: null
        })
        break
      case 'model-ready':
        updateStatus({ phase: 'ready', percent: null, loadedBytes: null, totalBytes: null, error: null })
        break
      case 'model-error':
        updateStatus({ phase: message.cached ? 'error' : 'missing', percent: null, error: message.error })
        if (active.mic || active.system) callbacks.onUnavailable('all', message.error)
        break
      case 'listening':
        if (active[message.source]) send(IPC_CHANNELS.sttStatus, { source: message.source, status: 'listening' })
        break
      case 'stopped':
        clearStop(message.source)
        shutdownIfIdle()
        break
      case 'partial':
        if (active[message.source]) send(IPC_CHANNELS.sttPartial, { source: message.source, text: message.text })
        break
      case 'final':
        decodeFailures[message.source] = 0
        send(IPC_CHANNELS.sttFinal, { source: message.source, text: message.text })
        break
      case 'decode-error':
        decodeFailures[message.source] += 1
        if (decodeFailures[message.source] >= DECODE_FAILURE_LIMIT) {
          decodeFailures[message.source] = 0
          callbacks.onUnavailable(message.source, `Local transcription failed repeatedly: ${message.error}`)
        }
        break
    }
    for (const watcher of [...watchers]) watcher(message)
  }

  function start(source: SttSource): { success: boolean; error?: string } {
    ensureChild()
    clearStop(source)
    generations[source] += 1
    active[source] = true
    decodeFailures[source] = 0
    // 'connecting' here means "engine warming up" — the same state the UI
    // already renders for the AssemblyAI handshake, so nothing downstream had
    // to learn a new vocabulary.
    send(IPC_CHANNELS.sttStatus, { source, status: 'connecting' })
    post({ type: 'start', source, generation: generations[source] })
    if (modelStatus().phase === 'missing') {
      // Not downloaded and we are mid-call: this is precisely when downloading
      // 252 MB is the wrong move. Report unavailable and let the router fall
      // back now; the download is an explicit, out-of-call action in Settings.
      callbacks.onUnavailable(source, 'The local speech model is not downloaded yet.')
      return { success: true }
    }
    return { success: true }
  }

  function stop(source: SttSource): void {
    if (!active[source]) return
    active[source] = false
    if (!child) {
      send(IPC_CHANNELS.sttStatus, { source, status: 'off' })
      return
    }
    // Keep the worker alive until its queued/in-flight finals are delivered.
    // A later start invalidates this generation and cancels the old drain.
    stopping.set(source, setTimeout(() => {
      clearStop(source)
      send(IPC_CHANNELS.sttError, { source, error: 'Timed out finishing the last speech turn.' })
      shutdownIfIdle()
    }, STOP_DRAIN_TIMEOUT_MS))
    post({ type: 'stop', source, generation: generations[source] })
    send(IPC_CHANNELS.sttStatus, { source, status: 'off' })
  }

  function clearStop(source: SttSource): void {
    const timer = stopping.get(source)
    if (timer) clearTimeout(timer)
    stopping.delete(source)
  }

  function clearStops(): void {
    for (const source of stopping.keys()) clearStop(source)
  }

  function shutdownIfIdle(): void {
    if (!active.mic && !active.system && stopping.size === 0 && watchers.size === 0) shutdownChild()
  }

  function pushAudioChunk(source: SttSource, data: ArrayBuffer): void {
    if (!active[source] || !child) return
    post({ type: 'audio', source, pcm: data })
  }

  function failPending(error: string): void {
    for (const watcher of [...watchers]) watcher({ type: 'model-error', error, cached: false })
  }

  function shutdownChild(): void {
    clearStops()
    failPending('The local speech engine stopped. Please retry the model download.')
    if (!child) return
    const spawned = child
    child = null
    try {
      spawned.postMessage({ type: 'dispose' } satisfies WorkerRequest)
    } catch {
      // no-op — the kill below is the backstop
    }
    setTimeout(() => {
      try {
        spawned.kill()
      } catch {
        // no-op
      }
    }, 500)
  }

  /**
   * Explicit, user-initiated first-time setup: download the weights. Kept out of
   * the call path on purpose (see `start`), and resolved from the status stream
   * rather than a worker round trip so a long download still streams progress.
   */
  function ensureModel(): Promise<{ ok: boolean; error?: string }> {
    return new Promise((resolve) => {
      const settle = (result: { ok: boolean; error?: string }): void => {
        watchers.delete(watcher)
        resolve(result)
      }
      const watcher = (message: WorkerResponse): void => {
        if (message.type === 'model-ready') settle({ ok: true })
        else if (message.type === 'model-error') settle({ ok: false, error: message.error })
      }
      watchers.add(watcher)
      try {
        // A fresh download worker must initialize with downloads allowed.
        // Sending offline init first races its expected missing-model error
        // against this request and incorrectly reports the download failed.
        const alreadyRunning = child !== null
        ensureChild(true)
        if (alreadyRunning) post({ type: 'ensure-model', modelId, cacheDir: sttModelCacheDir(), language })
      } catch (error) {
        settle({ ok: false, error: error instanceof Error ? error.message : 'Unable to start the model download.' })
      }
    })
  }

  /**
   * Apply the user's current transcription settings. Switching models has to
   * tear the worker down: the pipeline is built once per process and holds the
   * old weights, so reusing it would keep transcribing with the model the user
   * just moved away from.
   */
  function configure(next: { modelId: SttModelId; language: string | null }): void {
    language = next.language
    if (next.modelId === modelId) return
    modelId = next.modelId
    shutdownChild()
    status = {
      ...status,
      modelId,
      downloadLabel: sttModelInfo(modelId).sizeLabel,
      phase: 'missing',
      percent: null,
      loadedBytes: null,
      totalBytes: null,
      error: null
    }
    updateStatus({})
  }

  /**
   * Reported from disk, not from whether the worker happens to be running, so
   * Settings can say "Ready" the moment it opens instead of only after a call
   * has warmed the engine up.
   */
  function modelStatus(): LocalSttModelStatus {
    if (status.phase === 'missing' || status.phase === 'ready') {
      return { ...status, phase: isSttModelCachedAt(sttModelCacheDir(), modelId) ? 'ready' : 'missing' }
    }
    return { ...status }
  }

  function dispose(): void {
    disposed = true
    active.mic = false
    active.system = false
    shutdownChild()
  }

  return { start, stop, pushAudioChunk, ensureModel, modelStatus, configure, dispose }
}

export type LocalSttService = ReturnType<typeof createLocalSttService>
