import { existsSync } from 'fs'
import path from 'path'
import { DEFAULT_STT_MODEL_ID, STT_MODELS, sttModelInfo, type SttModelId } from '../../../shared/stt-types'

export { DEFAULT_STT_MODEL_ID, STT_MODELS, sttModelInfo }
export type { SttModelId }

/**
 * Local Whisper loader.
 *
 * The model choice, dtype, cache layout and the two non-obvious runtime
 * workarounds below are taken as-is from Microsoft's Skill Recorder
 * (`electron/narration/whisper.ts`, MIT), which ships the same
 * transformers.js + onnxruntime-node stack inside Electron. The only
 * adaptations are (a) the cache directory is injected rather than read from
 * `electron.app`, because this module is loaded inside a `utilityProcess`
 * child where the full Electron API is not available, and (b) Sarathi never
 * decodes a file — the renderer already hands us 16 kHz mono PCM.
 */

const DTYPE = 'q8'

export const STT_MODEL_FILES = [
  'config.json',
  'generation_config.json',
  'preprocessor_config.json',
  'tokenizer_config.json',
  'tokenizer.json',
  path.join('onnx', 'encoder_model_quantized.onnx'),
  path.join('onnx', 'decoder_model_merged_quantized.onnx')
] as const

/**
 * The subset of the transformers.js ASR pipeline we actually call. Typing it as
 * a plain callable avoids fighting the library's large pipeline union while
 * keeping the return shape we depend on explicit.
 */
export type AsrPipeline = (
  audio: Float32Array,
  options?: {
    return_timestamps?: boolean | 'word'
    chunk_length_s?: number
    stride_length_s?: number
    language?: string
    task?: 'transcribe' | 'translate'
  }
) => Promise<{
  text: string
  chunks?: Array<{ timestamp: [number, number | null]; text: string }>
}>

export interface ModelLoadProgress {
  status: string
  file?: string
  progress?: number
  loaded?: number
  total?: number
}

export interface WhisperLoadOptions {
  modelId: SttModelId
  cacheDir: string
  allowDownload: boolean
  onProgress?: (progress: ModelLoadProgress) => void
}

// Keyed by model id: switching models must build a new pipeline rather than
// silently reusing the previous one's weights.
const loadedPipes = new Map<string, AsrPipeline>()
const pipePromises = new Map<string, Promise<AsrPipeline | null>>()

/** True when every weight file is already on disk, i.e. the app can run offline. */
export function isSttModelCachedAt(cacheDir: string, modelId: string): boolean {
  const root = path.join(cacheDir, ...modelId.split('/'))
  return STT_MODEL_FILES.every((file) => existsSync(path.join(root, file)))
}

async function build(options: WhisperLoadOptions): Promise<AsrPipeline> {
  // Dynamic import: transformers.js + onnxruntime-node are heavy native deps we
  // only ever touch when a model download or transcription is requested.
  const tf = await import('@huggingface/transformers')

  // Keep every downloaded model under the app's user-data dir so it survives
  // upgrades and is trivial to locate or clear. First run needs the network once;
  // every run after is offline from this cache. Nothing is bundled with the app.
  tf.env.cacheDir = options.cacheDir

  const pipe = await tf.pipeline('automatic-speech-recognition', options.modelId, {
    dtype: DTYPE,
    local_files_only: !options.allowDownload,
    progress_callback: options.onProgress,
    // onnxruntime-node's CPU memory arena SIGTRAPs (hard native crash) under
    // Electron's runtime, in both the main and utility processes. Disabling the
    // arena is the single option that avoids it; unlike throttling threads or
    // graph optimization it keeps multithreading and fusions on, so transcription
    // stays near-native speed with no change in output.
    session_options: { enableCpuMemArena: false }
  })
  return pipe as unknown as AsrPipeline
}

/**
 * Lazily builds and caches the ASR pipeline for the process. Failed loads are
 * deliberately not memoized so an offline attempt can be retried without an app
 * restart.
 */
export async function getAsrPipeline(options: WhisperLoadOptions): Promise<AsrPipeline> {
  const cached = loadedPipes.get(options.modelId)
  if (cached) return cached

  let promise = pipePromises.get(options.modelId)
  if (!promise) {
    promise = build(options)
    pipePromises.set(options.modelId, promise)
  }
  try {
    const pipe = await promise
    if (!pipe) throw new Error('Whisper model did not load.')
    loadedPipes.set(options.modelId, pipe)
    return pipe
  } finally {
    pipePromises.delete(options.modelId)
  }
}
