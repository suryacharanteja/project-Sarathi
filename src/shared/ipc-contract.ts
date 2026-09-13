import type { AnswerPreferences, CreateSessionForm, LlmProvider, SessionType } from './session-types'
import type {
  DesktopSource,
  LocalSttModelStatus,
  SttEngineEvent,
  SttEnginePreference,
  SttErrorEvent,
  SttModelId,
  SttStatusEvent,
  SttTranscriptEvent
} from './stt-types'
import { DEFAULT_STT_MODEL_ID } from './stt-types'
import type { TranscriptMessage } from './transcript-types'
import type { Profile, DocumentRecord } from './profile-types'
import type { QuestionType } from './question-frameworks'

export type { LlmProvider } from './session-types'
export type { QuestionType } from './question-frameworks'

export const IPC_CHANNELS = {
  getSettings: 'app:getSettings',
  setSettings: 'app:setSettings',
  createSession: 'session:create',
  listSessions: 'session:list',
  getSession: 'session:get',
  appendTranscriptEntry: 'session:appendTranscript',
  getSessionTranscript: 'session:getTranscript',
  createProfile: 'profile:create',
  listProfiles: 'profile:list',
  learnSpeakingStyleStats: 'profile:learnSpeakingStyleStats',
  learnSpeakingStyle: 'profile:learnSpeakingStyle',
  submitPracticeAnswers: 'profile:submitPracticeAnswers',
  uploadDocument: 'document:upload',
  listDocuments: 'document:list',
  extractResumeFromFile: 'resume:extractFromFile',
  getDocumentFilePath: 'document:getFilePath',
  getDocumentHtml: 'document:getHtml',
  readDocumentBytes: 'document:readBytes',
  importSlideSource: 'slides:importSource',
  exportSlides: 'slides:export',
  aiAskStart: 'ai:askStart',
  checkTurnComplete: 'ai:checkTurnComplete',
  aiChunk: 'ai:chunk',
  aiDone: 'ai:done',
  aiError: 'ai:error',
  sttGetDesktopSources: 'stt:getDesktopSources',
  sttStart: 'stt:start',
  sttStop: 'stt:stop',
  sttAudioChunk: 'stt:audioChunk',
  sttStatus: 'stt:status',
  sttPartial: 'stt:partial',
  sttFinal: 'stt:final',
  sttError: 'stt:error',
  sttEngine: 'stt:engine',
  sttModelStatus: 'stt:modelStatus',
  sttGetModelStatus: 'stt:getModelStatus',
  sttEnsureModel: 'stt:ensureModel',
  windowMinimize: 'window:minimize',
  windowRestore: 'window:restore',
  windowClose: 'window:close',
  windowResize: 'window:resize',
  screenshotCapture: 'screenshot:capture',
  setScreenCaptureVisibility: 'window:setScreenCaptureVisibility'
} as const

export const SHORTCUT_IDS = [
  'follow-up-code',
  'follow-up-pseudocode',
  'interviewer-question',
  'follow-up-complexity',
  'follow-up-voice',
  'reask-relisten',
  'manual-capture-toggle',
  'screenshot-capture'
] as const
export type ShortcutId = (typeof SHORTCUT_IDS)[number]

export interface AppSettings {
  geminiApiKey: string | null
  assemblyAiApiKey: string | null
  openaiApiKey: string | null
  openCodeGoApiKey: string | null
  openCodeZenApiKey: string | null
  deepseekApiKey: string | null
  /** Preferred transcription engine — AssemblyAI by default, with automatic
   *  fallback to local Whisper on a vendor outage (see sttFallbackToLocal). */
  sttEngine: SttEnginePreference
  /** If AssemblyAI becomes unreachable mid-call, switch that audio source to
   *  local Whisper for the rest of the call instead of losing transcription. */
  sttFallbackToLocal: boolean
  sttLanguage: string
  sttModel: SttModelId
}

export const defaultAppSettings: AppSettings = {
  geminiApiKey: null,
  assemblyAiApiKey: null,
  openaiApiKey: null,
  openCodeGoApiKey: null,
  openCodeZenApiKey: null,
  deepseekApiKey: null,
  sttEngine: 'assemblyai',
  sttFallbackToLocal: true,
  sttLanguage: 'en',
  sttModel: DEFAULT_STT_MODEL_ID
}

export interface CreateSessionResult {
  ok: true
  sessionId: string
}

export interface CreateSessionError {
  ok: false
  error: string
}

export interface SessionSummary {
  id: string
  form: CreateSessionForm
  createdAt: string
  updatedAt: string
}

export interface PriorAnswerPayload {
  answer: string
  keySteps?: string[]
  code?: { language: string; content: string }
  explanation?: string
  timeComplexity?: string
  spaceComplexity?: string
  /** A framework-based answer's real content lives here, not in `answer` —
   *  see AnswerCard.frameworkSections / answer-parser.ts. Without this, a
   *  follow-up on a framework-based answer had no idea what the original
   *  answer said. */
  frameworkSections?: { label: string; body: string }[]
}

export interface AskAiRequest {
  cardId: string
  question: string
  provider: LlmProvider
  model: string
  company?: string
  jobDescription?: string
  extraContext?: string
  answerPreferences?: AnswerPreferences
  /** Set only for a follow-up ask on an existing card — see priorAnswer. */
  followUpInstruction?: string
  priorAnswer?: PriorAnswerPayload
  /** Screenshot(s) attached to this specific follow-up as extra visual
   *  context (e.g. a coding question shown on screen, possibly spanning
   *  several scrolled captures) — data URLs ("data:image/png;base64,..."). */
  imageDataUrls?: string[]
  /** The session's type, so the prompt can be steered (e.g. "Coding
   *  Challenge" sessions get a solving-a-problem framing instead of an
   *  interview framing). */
  sessionType?: SessionType
  /** Resolved server-side (main owns the filesystem) into profileContext/
   *  documentsContext text before reaching the LLM — see main/ipc.ts. */
  profileId?: string | null
  documentIds?: string[]
  /** User-picked override for the answer-framework question type — when
   *  omitted, the server auto-detects one from `question`. */
  questionType?: QuestionType
}

export interface SpeakingStyleStats {
  sessionCount: number
  micUtteranceCount: number
  micCharCount: number
}

export interface LearnSpeakingStyleResult {
  ok: boolean
  profile?: Profile
  error?: string
}

export interface PracticeAnswerPayload {
  question: string
  answer: string
}

export interface CheckTurnCompleteRequest {
  provider: LlmProvider
  model: string
  text: string
}

export interface CheckTurnCompleteResult {
  complete: boolean
  /** True when this is backchannel/conversational filler (an acknowledgment,
   *  a "can you repeat that", a rhetorical remark) rather than a genuine
   *  answerable question — see turn-completeness.ts's classifyTurn(). Only
   *  meaningful when `complete` is true. */
  isBackchannel: boolean
}

export interface UploadDocumentResult {
  document?: DocumentRecord
  /** Set when the user cancelled the file picker — not an error. */
  cancelled?: boolean
  error?: string
}

export interface ExtractResumeResult {
  fileName?: string
  text?: string
  cancelled?: boolean
  error?: string
}

export interface GetDocumentFilePathResult {
  filePath?: string
  fileName?: string
  /** Which viewer this file should be routed to — `pdf` for a .pdf file,
   *  `document` for .docx/.txt/.md — so the caller doesn't need to re-parse
   *  the extension itself. */
  kind?: 'pdf' | 'document'
  /** Plain-text extraction (same extractText() used elsewhere), returned
   *  alongside the path so the setup screen can mirror it into scriptText
   *  (word count, teleprompter fallback) without a second file dialog. */
  text?: string
  cancelled?: boolean
  error?: string
}

export interface GetDocumentHtmlResult {
  html?: string
  error?: string
}

/** Raw file bytes for a PDF already picked via getDocumentFilePath — the
 *  renderer can't read the filesystem itself, and pdfjs-dist needs the raw
 *  bytes (not a file:// URL, which the CSP/origin model blocks fetching
 *  from the dev-server-hosted renderer). */
export interface ReadDocumentBytesResult {
  data?: Uint8Array
  error?: string
}

export interface ImportedSlide {
  title: string
  body: string
}

/** Used by the Slide Builder's "Import from file". A .pptx source returns
 *  real slide-by-slide structure via `slides`; a flat-text source (PDF/
 *  DOCX/TXT/MD, same as before) returns `text` for the renderer's existing
 *  heading-based parser to split into slides. */
export interface ImportSlideSourceResult {
  slides?: ImportedSlide[]
  text?: string
  fileName?: string
  cancelled?: boolean
  error?: string
}

export interface ExportSlidesResult {
  filePath?: string
  cancelled?: boolean
  error?: string
}

export interface ScreenshotCaptureResult {
  dataUrl?: string
  error?: string
}

export interface AskAiStartResult {
  cardId: string
  error?: string
}

export interface AskAiChunkEvent {
  cardId: string
  delta: string
}

export interface AskAiDoneEvent {
  cardId: string
  /** The provider that actually produced this answer — only present when
   *  it differs from the one the request asked for, i.e. automatic
   *  vendor-failover kicked in. Lets the UI disclose the switch instead of
   *  silently answering from a different model than the user configured. */
  fallbackProvider?: LlmProvider
  /** The question type this answer was actually generated with — the
   *  server's auto-detection result, or the caller's explicit override.
   *  Absent when the framework system is off (no frameworks enabled in
   *  Answer Preferences) — no badge should render in that case. */
  questionType?: QuestionType
  /** True when this answer was actually written using the profile's learned
   *  speaking style — set only when matchSpeakingStyle was on AND the
   *  active profile actually had a style to apply. See main/ipc.ts. */
  styledFromProfile?: boolean
}

export interface AskAiErrorEvent {
  cardId: string
  error: string
  /** true = content had already streamed in before the failure — the
   *  renderer should append a trailing note, not clear/replace the card. */
  partial: boolean
}

export interface SttStartResult {
  success: boolean
  error?: string
}

export interface ShortcutTriggeredEvent {
  id: ShortcutId
}

/** Partial window bounds for a manual, in-DOM resize drag — only the
 *  fields that changed for this drag step are sent. */
export interface WindowResizeBounds {
  x?: number
  y?: number
  width?: number
  height?: number
}

export interface SarathiApi {
  getSettings: () => Promise<AppSettings>
  setSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>
  createSession: (form: CreateSessionForm) => Promise<CreateSessionResult | CreateSessionError>
  listSessions: () => Promise<SessionSummary[]>
  getSession: (id: string) => Promise<SessionSummary | null>
  appendTranscriptEntry: (sessionId: string, message: TranscriptMessage) => void
  getSessionTranscript: (id: string) => Promise<TranscriptMessage[]>
  createProfile: (name: string, resumeText: string) => Promise<Profile>
  listProfiles: () => Promise<Profile[]>
  learnSpeakingStyleStats: (profileId: string) => Promise<SpeakingStyleStats>
  learnSpeakingStyle: (profileId: string) => Promise<LearnSpeakingStyleResult>
  submitPracticeAnswers: (profileId: string, answers: PracticeAnswerPayload[]) => Promise<LearnSpeakingStyleResult>
  uploadDocument: () => Promise<UploadDocumentResult>
  listDocuments: () => Promise<DocumentRecord[]>
  extractResumeFromFile: () => Promise<ExtractResumeResult>
  getDocumentFilePath: () => Promise<GetDocumentFilePathResult>
  getDocumentHtml: (filePath: string) => Promise<GetDocumentHtmlResult>
  readDocumentBytes: (filePath: string) => Promise<ReadDocumentBytesResult>
  importSlideSource: () => Promise<ImportSlideSourceResult>
  exportSlides: (markdown: string, suggestedFileName: string) => Promise<ExportSlidesResult>
  askAiStart: (request: AskAiRequest) => Promise<AskAiStartResult>
  checkTurnComplete: (request: CheckTurnCompleteRequest) => Promise<CheckTurnCompleteResult>
  onAiChunk: (callback: (event: AskAiChunkEvent) => void) => () => void
  onAiDone: (callback: (event: AskAiDoneEvent) => void) => () => void
  onAiError: (callback: (event: AskAiErrorEvent) => void) => () => void
  enableLoopbackAudio: () => Promise<void>
  disableLoopbackAudio: () => Promise<void>
  sttGetDesktopSources: () => Promise<DesktopSource[]>
  sttStart: (source: string) => Promise<SttStartResult>
  sttStop: (source: string) => Promise<void>
  sttSendAudioChunk: (source: string, data: ArrayBuffer) => void
  onSttStatus: (callback: (event: SttStatusEvent) => void) => () => void
  onSttPartial: (callback: (event: SttTranscriptEvent) => void) => () => void
  onSttFinal: (callback: (event: SttTranscriptEvent) => void) => () => void
  onSttError: (callback: (event: SttErrorEvent) => void) => () => void
  onSttEngine: (callback: (event: SttEngineEvent) => void) => () => void
  onSttModelStatus: (callback: (status: LocalSttModelStatus) => void) => () => void
  sttGetModelStatus: () => Promise<LocalSttModelStatus>
  /** Explicit first-run download of the local speech model (~77-241 MB). */
  sttEnsureModel: () => Promise<{ ok: boolean; error?: string }>

  windowMinimize: () => void
  windowRestore: () => void
  windowClose: () => void
  resizeWindow: (bounds: WindowResizeBounds) => void
  /** false = window is excluded from screenshots/screen-share capture
   *  (default, "stealth"); true = visible to capture, e.g. so a webinar
   *  host can reveal the overlay to their shared screen when they want to. */
  setScreenCaptureVisibility: (visible: boolean) => void

  screenshotCapture: () => Promise<ScreenshotCaptureResult>
}
