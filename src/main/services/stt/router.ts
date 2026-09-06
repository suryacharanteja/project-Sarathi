import type { WebContents } from 'electron'
import { IPC_CHANNELS, type AppSettings } from '../../../shared/ipc-contract'
import type { SttEngine, SttSource } from '../../../shared/stt-types'
import { safeSend } from '../../utils/safe-send'
import { createAssemblyAiSttService } from './assemblyai'
import { createLocalSttService } from './local'

/**
 * Engine router.
 *
 * The renderer, the audio pipeline, the question detector and the overlay
 * all keep talking to the exact same seam they always did — `start` / `stop`
 * / `pushAudioChunk` / `dispose`, plus the `stt:status` / `stt:partial` /
 * `stt:final` / `stt:error` events. Only what sits behind that seam changed:
 * AssemblyAI first (accurate, low-latency, cloud), local Whisper as the
 * fallback for when that single vendor is unreachable — a repeated
 * connection outage, an invalid/revoked key, or no network at all — so one
 * vendor's outage never fully blocks an interview mid-call.
 *
 * Fallback is per-source and one-way for the life of a source's stream. Once
 * a source has failed over to local it stays there until it is explicitly
 * stopped — flapping between engines during an interview would produce
 * duplicated or dropped turns, which is worse than staying on the fallback
 * engine (with its higher per-turn latency) for the rest of the call.
 */
export function createSttService(webContents: WebContents, readSettings: () => AppSettings) {
  const local = createLocalSttService(webContents, { onUnavailable: handleLocalUnavailable })
  const assembly = createAssemblyAiSttService(webContents, { onUnavailable: handleCloudUnavailable })

  const engine: Record<SttSource, SttEngine | null> = { mic: null, system: null }
  /** Sources that already failed over — never sent back to AssemblyAI mid-call. */
  const lockedToFallback: Record<SttSource, boolean> = { mic: false, system: false }

  function send(channel: string, payload: unknown): void {
    safeSend(webContents, channel, payload)
  }

  function announce(source: SttSource, next: SttEngine, reason?: string): void {
    engine[source] = next
    send(IPC_CHANNELS.sttEngine, { source, engine: next, reason })
  }

  function handleCloudUnavailable(source: SttSource, reason: string): void {
    if (engine[source] !== 'assemblyai') return

    const settings = readSettings()
    if (!settings.sttFallbackToLocal) {
      engine[source] = null
      assembly.stop(source)
      send(IPC_CHANNELS.sttError, {
        source,
        error: `${reason} Local fallback is turned off in Settings, so this source is not being transcribed.`
      })
      send(IPC_CHANNELS.sttStatus, { source, status: 'error' })
      return
    }

    // Configure BEFORE checking readiness. local.ts's internal model id
    // starts at the hardcoded DEFAULT_STT_MODEL_ID and is only ever updated
    // by configure() — checking modelStatus() first (the old order) asked
    // "is the DEFAULT model cached?" instead of "is the user's actual
    // configured model cached?" on the very first fallback of a session,
    // wrongly refusing to fall back even when the real model was fully
    // downloaded and ready. configure() is a no-op when the model id is
    // already current (see local.ts), so this reorder changes nothing else.
    local.configure({
      modelId: settings.sttModel,
      language: settings.sttLanguage === 'auto' ? null : settings.sttLanguage
    })

    if (local.modelStatus().phase !== 'ready') {
      engine[source] = null
      assembly.stop(source)
      send(IPC_CHANNELS.sttError, {
        source,
        error: `${reason} Download the offline backup model in Settings to enable automatic fallback.`
      })
      send(IPC_CHANNELS.sttStatus, { source, status: 'error' })
      return
    }

    assembly.stop(source)
    lockedToFallback[source] = true
    announce(source, 'local', reason)
    local.start(source)
  }

  /**
   * Local is the terminal fallback — there's nowhere further to go if it
   * also fails, since we already left AssemblyAI (or the user chose local
   * outright and it turned out unavailable). Surface a hard error rather
   * than attempting to bounce back to a cloud vendor we may have already
   * exhausted retries against.
   */
  function handleLocalUnavailable(scope: SttSource | 'all', reason: string): void {
    const affected: SttSource[] = scope === 'all' ? ['mic', 'system'] : [scope]
    for (const source of affected) {
      if (engine[source] !== 'local') continue
      engine[source] = null
      local.stop(source)
      send(IPC_CHANNELS.sttError, { source, error: reason })
      send(IPC_CHANNELS.sttStatus, { source, status: 'error' })
    }
  }

  function start(source: SttSource): { success: boolean; error?: string } {
    const settings = readSettings()
    const preferCloud = settings.sttEngine !== 'local' && !lockedToFallback[source]

    if (preferCloud) {
      if (settings.assemblyAiApiKey) {
        announce(source, 'assemblyai')
        return assembly.start(source, settings.assemblyAiApiKey)
      }
      // No cloud key at all — nothing to prefer. Use local directly if it's
      // ready rather than hard-failing when a working fallback exists.
      if (settings.sttFallbackToLocal && local.modelStatus().phase === 'ready') {
        local.configure({
          modelId: settings.sttModel,
          language: settings.sttLanguage === 'auto' ? null : settings.sttLanguage
        })
        announce(source, 'local')
        return local.start(source)
      }
      return {
        success: false,
        error: 'AssemblyAI API key not configured. Add it in Settings, or download the offline backup model.'
      }
    }

    local.configure({
      modelId: settings.sttModel,
      language: settings.sttLanguage === 'auto' ? null : settings.sttLanguage
    })
    announce(source, 'local')
    // A synchronous `onUnavailable` (model not downloaded) can fire from
    // inside this call and flip the source to an error state before it
    // returns — that is the intended path, so the result is deliberately
    // not gated on `engine[source]` still being 'local' here.
    return local.start(source)
  }

  function stop(source: SttSource): void {
    if (engine[source] === 'local') local.stop(source)
    else assembly.stop(source)
    engine[source] = null
    lockedToFallback[source] = false
  }

  function pushAudioChunk(source: SttSource, data: ArrayBuffer): void {
    if (engine[source] === 'local') local.pushAudioChunk(source, data)
    else if (engine[source] === 'assemblyai') assembly.pushAudioChunk(source, data)
  }

  function dispose(): void {
    local.dispose()
    assembly.dispose()
    engine.mic = null
    engine.system = null
  }

  return {
    start,
    stop,
    pushAudioChunk,
    dispose,
    /** First-run model download, driven from Settings. */
    ensureLocalModel: (): ReturnType<typeof local.ensureModel> => {
      // Pick up a model the user just switched to before downloading, so the
      // button downloads what the dropdown says rather than what was last used.
      const settings = readSettings()
      local.configure({
        modelId: settings.sttModel,
        language: settings.sttLanguage === 'auto' ? null : settings.sttLanguage
      })
      return local.ensureModel()
    },
    localModelStatus: (): ReturnType<typeof local.modelStatus> => {
      const settings = readSettings()
      local.configure({
        modelId: settings.sttModel,
        language: settings.sttLanguage === 'auto' ? null : settings.sttLanguage
      })
      return local.modelStatus()
    },
    activeEngine: (source: SttSource): SttEngine | null => engine[source]
  }
}

export type SttService = ReturnType<typeof createSttService>
