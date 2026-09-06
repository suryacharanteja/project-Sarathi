export type SttSource = 'mic' | 'system'
export type SttStatus = 'off' | 'connecting' | 'listening' | 'error'

export interface SttStatusEvent {
  source: SttSource
  status: SttStatus
}

export interface SttTranscriptEvent {
  source: SttSource
  text: string
}

export interface SttErrorEvent {
  source: SttSource
  error: string
}

export interface DesktopSource {
  id: string
  name: string
}

/**
 * Which engine actually produced a transcript. AssemblyAI is the default —
 * accurate, low-latency, but a single cloud vendor's outage can otherwise
 * take down transcription mid-interview. Local Whisper is the automatic
 * fallback for exactly that: no network dependency once the model is
 * downloaded, at the cost of higher per-turn latency (batch decode, not a
 * true live stream).
 */
export type SttEngine = 'assemblyai' | 'local'

/** The user's configured preference; the router may still fall back from 'assemblyai'. */
export type SttEnginePreference = SttEngine

export interface SttEngineEvent {
  source: SttSource
  engine: SttEngine
  /** Present when this is a fallback, i.e. why the preferred engine could not be used. */
  reason?: string
}

export type LocalSttModelPhase = 'missing' | 'downloading' | 'loading' | 'ready' | 'error'

export interface LocalSttModelStatus {
  phase: LocalSttModelPhase
  /** Download progress 0-100, only while phase === 'downloading'. */
  percent: number | null
  loadedBytes: number | null
  totalBytes: number | null
  error: string | null
  modelId: string
  /** Human-readable download size, e.g. "~252 MB". */
  downloadLabel: string
}

/**
 * The two checkpoints offered, both multilingual int8 (q8) ONNX. `base`
 * decodes a turn in ~2-3s, `small` in ~5-6s — meaningfully more robust on
 * accents/jargon, but slow enough in a live interview that it's an explicit
 * user trade-off rather than the default.
 */
export const STT_MODELS = [
  {
    id: 'Xenova/whisper-base',
    label: 'Fast',
    sizeLabel: '~77 MB',
    note: 'Answers start sooner. Less robust on strong accents and jargon.'
  },
  {
    id: 'Xenova/whisper-small',
    label: 'Accurate',
    sizeLabel: '~241 MB',
    note: 'Noticeably better on accents and technical terms, a few seconds slower per turn.'
  }
] as const

export type SttModelId = (typeof STT_MODELS)[number]['id']

export const DEFAULT_STT_MODEL_ID: SttModelId = 'Xenova/whisper-base'

export function isSttModelId(value: unknown): value is SttModelId {
  return typeof value === 'string' && STT_MODELS.some((model) => model.id === value)
}

export function sttModelInfo(id: SttModelId): (typeof STT_MODELS)[number] {
  const match = STT_MODELS.find((model) => model.id === id)
  if (!match) throw new Error(`Unsupported speech model: ${id}`)
  return match
}
