import { createAudioPipeline } from './audio-pipeline'
import type { AudioSource } from './source-state'

interface SourceRuntime {
  context: AudioContext | null
  stream: MediaStream | null
  processor: { disconnect: () => void } | null
  active: boolean
  queue: Promise<void>
}

export function createAudioCapture(
  onMonitorLog?: (level: string, code: string, message: string) => void,
  onLevel?: (source: AudioSource, level: number) => void,
  onTrackEnded?: (source: AudioSource) => void
) {
  const runtime: Record<AudioSource, SourceRuntime> = {
    mic: { context: null, stream: null, processor: null, active: false, queue: Promise.resolve() },
    system: { context: null, stream: null, processor: null, active: false, queue: Promise.resolve() }
  }

  const pipeline = createAudioPipeline({
    sendAudioChunk: (source, buffer) => window.sarathi.sttSendAudioChunk(source, buffer),
    addMonitorLog: (level, _code, message) => onMonitorLog?.(level, _code, message),
    onLevel
  })

  /**
   * Every start/stop for a given source is chained onto that source's queue, so
   * operations always run in the order requested and each one only begins after
   * the previous has fully settled (network calls included). This is what makes
   * React StrictMode's dev-only mount→cleanup→mount sequence safe: it becomes
   * connect→disconnect→reconnect instead of two connections racing over shared
   * state. Production (single mount) just runs the one start, no extra churn.
   */
  function enqueue<T extends AudioSource>(source: T, op: () => Promise<void>): Promise<void> {
    const next = runtime[source].queue.then(op, op)
    runtime[source].queue = next.catch(() => undefined)
    return next
  }

  async function doStartMic(): Promise<void> {
    if (runtime.mic.active) return

    const result = await window.sarathi.sttStart('mic')
    if (!result.success) throw new Error(result.error ?? 'Failed to start mic transcription.')

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
    })
    const context = new AudioContext()
    await context.resume()
    pipeline.resetSourceSampleQueue('mic')
    const processor = await pipeline.buildAudioProcessor(context, stream, 'mic', () => runtime.mic.active)

    runtime.mic.context = context
    runtime.mic.stream = stream
    runtime.mic.processor = processor
    runtime.mic.active = true
  }

  async function doStopMic(): Promise<void> {
    if (!runtime.mic.active && !runtime.mic.context) return
    pipeline.drainSourceSampleQueue('mic', { flushPartial: true })
    pipeline.stopAudioResources(runtime.mic.context ?? undefined, runtime.mic.stream ?? undefined, runtime.mic.processor ?? undefined)
    runtime.mic.context = null
    runtime.mic.stream = null
    runtime.mic.processor = null
    runtime.mic.active = false
    pipeline.resetChunkCounter('mic')
    await window.sarathi.sttStop('mic')
  }

  async function doStartSystem(): Promise<void> {
    if (runtime.system.active) return

    const result = await window.sarathi.sttStart('system')
    if (!result.success) throw new Error(result.error ?? 'Failed to start system-audio transcription.')

    // Source selection is handled entirely by the main process's
    // setDisplayMediaRequestHandler (electron-audio-loopback) now — no more
    // desktopCapturer round trip or blind sources[0] pick from here.
    const stream = await pipeline.getSystemAudioStream()
    const videoTrack = stream.getVideoTracks()[0]
    if (videoTrack && pipeline.isLikelyCameraTrack(videoTrack.label)) {
      stream.getTracks().forEach((track) => track.stop())
      throw new Error(`Desktop capture fell back to a camera source (${videoTrack.label || 'unknown'}).`)
    }
    stream.getVideoTracks().forEach((track) => track.stop())

    // 'active'/runtime state doesn't reflect the underlying track dying —
    // Windows/Chromium can tear down a loopback session mid-call (source
    // window closed, audio device changed, OS revokes it) without the app
    // doing anything wrong. Without this, the only way to notice was
    // inferring it from up to 40s of silence via the RMS watchdog. Listening
    // directly cuts that to the watchdog's next ~5s tick.
    stream.getAudioTracks()[0]?.addEventListener('ended', () => {
      runtime.system.active = false
      onTrackEnded?.('system')
    })

    const context = new AudioContext()
    await context.resume()
    pipeline.resetSourceSampleQueue('system')
    const processor = await pipeline.buildAudioProcessor(context, stream, 'system', () => runtime.system.active)

    runtime.system.context = context
    runtime.system.stream = stream
    runtime.system.processor = processor
    runtime.system.active = true
  }

  async function doStopSystem(): Promise<void> {
    if (!runtime.system.active && !runtime.system.context) return
    pipeline.drainSourceSampleQueue('system', { flushPartial: true })
    pipeline.stopAudioResources(
      runtime.system.context ?? undefined,
      runtime.system.stream ?? undefined,
      runtime.system.processor ?? undefined
    )
    runtime.system.context = null
    runtime.system.stream = null
    runtime.system.processor = null
    runtime.system.active = false
    pipeline.resetChunkCounter('system')
    await window.sarathi.sttStop('system')
  }

  const startMic = (): Promise<void> => enqueue('mic', doStartMic)
  const stopMic = (): Promise<void> => enqueue('mic', doStopMic)
  const startSystem = (): Promise<void> => enqueue('system', doStartSystem)
  const stopSystem = (): Promise<void> => enqueue('system', doStopSystem)

  async function stopAll(): Promise<void> {
    await Promise.all([stopMic(), stopSystem()])
  }

  return { startMic, stopMic, startSystem, stopSystem, stopAll }
}

export type AudioCapture = ReturnType<typeof createAudioCapture>
