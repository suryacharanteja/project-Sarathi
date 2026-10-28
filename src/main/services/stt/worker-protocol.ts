import type { SttSource } from '../../../shared/stt-types'
import type { SttModelId } from './whisper'

/** Messages the main process sends into the local-STT utility process. */
export type WorkerRequest =
  | { type: 'init'; modelId: SttModelId; cacheDir: string; language: string | null; allowDownload: boolean }
  | { type: 'ensure-model'; modelId: SttModelId; cacheDir: string; language: string | null }
  | { type: 'start'; source: SttSource; generation: number }
  | { type: 'stop'; source: SttSource; generation: number }
  | { type: 'audio'; source: SttSource; pcm: ArrayBuffer }
  | { type: 'dispose' }

/** Messages the local-STT utility process sends back to the main process. */
export type WorkerResponse =
  | { type: 'model-progress'; phase: 'downloading' | 'loading'; percent: number | null; loadedBytes: number | null; totalBytes: number | null }
  | { type: 'model-ready' }
  | { type: 'model-error'; error: string; cached: boolean }
  | { type: 'listening'; source: SttSource; generation: number }
  | { type: 'stopped'; source: SttSource; generation: number }
  | { type: 'partial'; source: SttSource; generation: number; text: string }
  | { type: 'final'; source: SttSource; generation: number; text: string }
  | { type: 'decode-error'; source: SttSource; generation: number; error: string }
