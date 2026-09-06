import { normalizeSource, type AudioSource } from './source-state'

const TARGET_SAMPLE_RATE = 16000
const TARGET_FRAME_MS = 100
const MIN_FRAME_MS = 50
const TARGET_FRAME_SAMPLES = Math.round((TARGET_SAMPLE_RATE * TARGET_FRAME_MS) / 1000)
const MIN_FRAME_SAMPLES = Math.round((TARGET_SAMPLE_RATE * MIN_FRAME_MS) / 1000)
// A leading slash resolves against the filesystem root under the packaged
// app's file:// origin (breaking addModule() there, since it's served over
// http://localhost in dev, but as file://.../out/renderer/index.html once
// packaged) — a relative path resolves correctly against the current
// document's own directory in both cases, since index.html and this worklet
// file are copied into the same out/renderer/ folder at build time.
const WORKLET_MODULE_PATH = './pcm-capture-worklet.js'

type MonitorLogger = (level: string, code: string, message: string, source?: string, meta?: Record<string, unknown>) => void
type SendAudioChunk = (source: AudioSource, buffer: ArrayBuffer) => void
type LevelReporter = (source: AudioSource, level: number) => void

interface SampleQueue {
  chunks: Float32Array[]
  length: number
}

export function createAudioPipeline({
  sendAudioChunk,
  addMonitorLog,
  onLevel
}: {
  sendAudioChunk: SendAudioChunk
  addMonitorLog: MonitorLogger
  onLevel?: LevelReporter
}) {
  const workletLoadedContexts = new WeakSet<AudioContext>()
  const sourceSampleQueues: Record<AudioSource, SampleQueue> = {
    mic: { chunks: [], length: 0 },
    system: { chunks: [], length: 0 }
  }
  const audioChunkCounters: Record<AudioSource, number> = { mic: 0, system: 0 }

  function convertToPCM16(float32Data: Float32Array): Int16Array {
    const int16Data = new Int16Array(float32Data.length)
    for (let index = 0; index < float32Data.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, float32Data[index]))
      int16Data[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
    }
    return int16Data
  }

  function downsampleFloat32Buffer(
    input: Float32Array,
    inputSampleRate: number,
    outputSampleRate: number = TARGET_SAMPLE_RATE
  ): Float32Array {
    if (inputSampleRate <= 0 || outputSampleRate <= 0 || input.length === 0) {
      return input
    }

    if (inputSampleRate === outputSampleRate) {
      return input
    }

    const sampleRateRatio = inputSampleRate / outputSampleRate
    const newLength = Math.max(1, Math.round(input.length / sampleRateRatio))
    const result = new Float32Array(newLength)
    let offsetResult = 0
    let offsetInput = 0

    while (offsetResult < result.length) {
      const nextOffsetInput = Math.min(input.length, Math.round((offsetResult + 1) * sampleRateRatio))
      let accum = 0
      let count = 0

      for (let index = offsetInput; index < nextOffsetInput; index += 1) {
        accum += input[index]
        count += 1
      }

      result[offsetResult] = count > 0 ? accum / count : 0
      offsetResult += 1
      offsetInput = nextOffsetInput
    }

    return result
  }

  async function ensureWorkletModule(context: AudioContext): Promise<void> {
    if (workletLoadedContexts.has(context)) {
      return
    }

    await context.audioWorklet.addModule(WORKLET_MODULE_PATH)
    workletLoadedContexts.add(context)
  }

  function computeRms(samples: Float32Array): number {
    if (samples.length === 0) return 0
    let sumSquares = 0
    for (let i = 0; i < samples.length; i += 1) {
      sumSquares += samples[i] * samples[i]
    }
    return Math.sqrt(sumSquares / samples.length)
  }

  function isLikelyCameraTrack(trackLabel: string): boolean {
    const label = String(trackLabel || '').toLowerCase()
    return label.includes('camera') || label.includes('webcam')
  }

  /**
   * The old chromeMediaSource:'desktop' getUserMedia constraint hack was
   * repurposing a video/tab-capture API to also carry audio as a side
   * effect — on Windows it frequently "succeeded" (no thrown error) with an
   * audio track that carried no actual sound, since it doesn't reliably
   * engage real OS-level loopback capture. electron-audio-loopback solves
   * this properly via Electron's session.setDisplayMediaRequestHandler:
   * the main process (see src/main/index.ts's initMain() call) intercepts
   * getDisplayMedia and resolves it with a genuine loopback-audio stream.
   * enableLoopbackAudio()/disableLoopbackAudio() bracket the call so the
   * main-process handler is only active for the moment it's needed.
   */
  async function getSystemAudioStream(): Promise<MediaStream> {
    await window.sarathi.enableLoopbackAudio()
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
      const audioTracks = stream.getAudioTracks()
      // Diagnostic only — distinguishes "got no audio track at all" (a
      // capture/permission problem) from "got a track but it's silent" (an
      // OS loopback-routing problem), instead of guessing from the RMS
      // watchdog alone.
      addMonitorLog(
        'info',
        'system-audio-stream-acquired',
        `getDisplayMedia resolved with ${audioTracks.length} audio track(s)`,
        'system',
        {
          audioTracks: audioTracks.map((t) => ({
            label: t.label,
            readyState: t.readyState,
            muted: t.muted,
            settings: t.getSettings()
          }))
        }
      )
      if (audioTracks.length === 0) {
        addMonitorLog('error', 'system-audio-no-track', 'getDisplayMedia returned zero audio tracks', 'system')
      }
      return stream
    } finally {
      await window.sarathi.disableLoopbackAudio()
    }
  }

  function resetSourceSampleQueue(source: string): void {
    const resolvedSource = normalizeSource(source)
    sourceSampleQueues[resolvedSource] = { chunks: [], length: 0 }
  }

  function appendSourceSamples(source: string, samples: Float32Array): void {
    if (!samples || samples.length === 0) {
      return
    }

    const resolvedSource = normalizeSource(source)
    sourceSampleQueues[resolvedSource].chunks.push(samples)
    sourceSampleQueues[resolvedSource].length += samples.length
  }

  function pullSourceSamples(source: string, count: number): Float32Array {
    const resolvedSource = normalizeSource(source)
    const queue = sourceSampleQueues[resolvedSource]
    const output = new Float32Array(count)
    let written = 0

    while (written < count && queue.chunks.length > 0) {
      const first = queue.chunks[0]
      const take = Math.min(first.length, count - written)
      output.set(first.subarray(0, take), written)
      written += take

      if (take === first.length) {
        queue.chunks.shift()
      } else {
        queue.chunks[0] = first.subarray(take)
      }

      queue.length -= take
    }

    if (written === count) {
      return output
    }

    return output.subarray(0, written)
  }

  function sendPcmFrame(source: string, floatSamples: Float32Array): void {
    if (!floatSamples || floatSamples.length < MIN_FRAME_SAMPLES) {
      return
    }

    const resolvedSource = normalizeSource(source)
    const pcm = convertToPCM16(floatSamples)
    sendAudioChunk(resolvedSource, pcm.buffer as ArrayBuffer)
    audioChunkCounters[resolvedSource] += 1

    if (audioChunkCounters[resolvedSource] % 50 === 0) {
      addMonitorLog('info', 'chunk-heartbeat', `Chunks sent: ${audioChunkCounters[resolvedSource]}`, resolvedSource, {
        chunks: audioChunkCounters[resolvedSource],
        frameSamples: floatSamples.length
      })
    }
  }

  function drainSourceSampleQueue(source: string, { flushPartial = false }: { flushPartial?: boolean } = {}): void {
    const resolvedSource = normalizeSource(source)
    const queue = sourceSampleQueues[resolvedSource]

    while (queue.length >= TARGET_FRAME_SAMPLES) {
      const frame = pullSourceSamples(resolvedSource, TARGET_FRAME_SAMPLES)
      sendPcmFrame(resolvedSource, frame)
    }

    if (flushPartial && queue.length >= MIN_FRAME_SAMPLES) {
      const tailFrame = pullSourceSamples(resolvedSource, queue.length)
      sendPcmFrame(resolvedSource, tailFrame)
    }
  }

  async function buildAudioProcessor(
    context: AudioContext,
    stream: MediaStream,
    source: string,
    activeCheck: () => boolean
  ) {
    await ensureWorkletModule(context)

    const src = context.createMediaStreamSource(stream)
    const node = new AudioWorkletNode(context, 'pcm-capture-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1]
    })

    const silentGain = context.createGain()
    silentGain.gain.value = 0
    let levelLogCounter = 0

    node.port.onmessage = (event: MessageEvent) => {
      if (!activeCheck()) {
        return
      }

      try {
        const chunk = event.data instanceof Float32Array ? event.data : new Float32Array(event.data || [])
        if (onLevel) {
          const rms = computeRms(chunk)
          onLevel(normalizeSource(source), rms)
          // Periodic RMS heartbeat (~every 100 chunks) — lets a real test
          // show whether the source is truly silent (always ~0) vs. just
          // below the noise floor vs. genuinely carrying speech, instead of
          // only knowing the watchdog's after-the-fact pass/fail verdict.
          levelLogCounter += 1
          if (levelLogCounter % 100 === 0) {
            addMonitorLog('info', 'audio-level', `RMS level: ${rms.toFixed(5)}`, source)
          }
        }
        const normalizedChunk = downsampleFloat32Buffer(chunk, context.sampleRate, TARGET_SAMPLE_RATE)
        appendSourceSamples(source, normalizedChunk)
        drainSourceSampleQueue(source)
      } catch (error) {
        addMonitorLog('error', 'audio-process-failed', (error as Error).message || 'Audio processing failed', source)
      }
    }

    src.connect(node)
    node.connect(silentGain)
    silentGain.connect(context.destination)

    return {
      disconnect: () => {
        try {
          node.port.onmessage = null
        } catch (_) {
          // no-op
        }
        try {
          src.disconnect()
        } catch (_) {
          // no-op
        }
        try {
          node.disconnect()
        } catch (_) {
          // no-op
        }
        try {
          silentGain.disconnect()
        } catch (_) {
          // no-op
        }
      }
    }
  }

  function stopAudioResources(
    context: AudioContext | undefined,
    stream: MediaStream | undefined,
    processor: { disconnect: () => void } | undefined
  ): void {
    try {
      processor?.disconnect()
    } catch (_) {
      // no-op
    }

    try {
      context?.close()
    } catch (_) {
      // no-op
    }

    stream?.getTracks().forEach((track) => track.stop())
  }

  function resetChunkCounter(source: string): void {
    audioChunkCounters[normalizeSource(source)] = 0
  }

  return {
    buildAudioProcessor,
    drainSourceSampleQueue,
    getSystemAudioStream,
    isLikelyCameraTrack,
    resetChunkCounter,
    resetSourceSampleQueue,
    stopAudioResources
  }
}
