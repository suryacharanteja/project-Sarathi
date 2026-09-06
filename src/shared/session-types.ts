import type { QuestionType } from './question-frameworks'
import { QUESTION_TYPES } from './question-frameworks'

export type SessionType = 'interview' | 'regular-call'
export type LlmProvider = 'gemini' | 'openai' | 'opencode-go' | 'opencode-zen' | 'deepseek'

/**
 * Priority order for automatic vendor failover — if a request to a
 * provider produces no content at all (network error, outage, revoked
 * key, rate limit), the next provider in this list with a configured API
 * key is tried automatically, so a single vendor's outage never fully
 * blocks the interview. OpenAI first per explicit product decision.
 */
export const LLM_FALLBACK_ORDER: LlmProvider[] = ['openai', 'gemini', 'deepseek', 'opencode-go', 'opencode-zen']

/** Model used for a provider when it's engaged as an automatic fallback
 *  (the user never picked a model for it) — one sane default per vendor. */
export const DEFAULT_MODEL_BY_PROVIDER: Record<LlmProvider, string> = {
  openai: 'gpt-5.4',
  gemini: 'gemini-flash-latest',
  deepseek: 'deepseek-chat',
  'opencode-go': 'glm-5.3',
  'opencode-zen': 'big-pickle'
}

export type AnswerFormat = 'full-script' | 'script-bullets' | 'bullets'

export interface AnswerPreferences {
  tone: 'conversational' | 'formal' | 'concise'
  /** @deprecated No longer read when building prompts — see `format`, which
   *  replaced it. Kept only so sessions saved before this field existed
   *  still parse (schemas.ts defaults `format`/`useFillerWords` via
   *  `.catch()` for those old records). Do not wire this back into prompt
   *  text; `format` is the single source of truth for response shape now. */
  length: 'short' | 'medium' | 'long'
  /** How the answer should be delivered: word-for-word script, an opening
   *  line plus supporting bullets, or terse own-words bullets. */
  format: AnswerFormat
  seniority: 'junior' | 'mid' | 'senior'
  codeLanguage: string
  /** Sprinkle sparing natural speech disfluencies ("um", "so", "basically")
   *  so the answer reads less like a polished GPT paragraph. */
  useFillerWords: boolean
  /** Write in the candidate's own voice, using the profile's learned
   *  speakingStyleProfile (see profile-types.ts) — requires that profile to
   *  have run "Learn my speaking style" at least once. */
  matchSpeakingStyle: boolean
  /** Which question-type frameworks (STAR-L/DEFC/SCOPE/REACT/REALM) are
   *  allowed to be auto-applied. Selected entirely ahead of time here, in
   *  Settings — never mid-call — because a live, in-card control that
   *  requires a click is exactly the mouse movement this app's whole
   *  shortcut system exists to avoid. Empty array = framework system fully
   *  off (plain, unstructured answers). Default is all 5, matching the
   *  original always-on behavior. */
  enabledFrameworks: QuestionType[]
}

export interface CreateSessionForm {
  sessionType: SessionType
  company: string
  jobDescription: string
  profileId: string | null
  extraContext: string
  documentIds: string[]
  provider: LlmProvider
  model: string
  outputLanguage: string
  answerPreferences: AnswerPreferences
  autoAnswer: boolean
  saveTranscript: boolean
}

export const defaultCreateSessionForm: CreateSessionForm = {
  sessionType: 'interview',
  company: '',
  jobDescription: '',
  profileId: null,
  extraContext: '',
  documentIds: [],
  provider: 'openai',
  model: 'gpt-5.4',
  outputLanguage: 'English',
  answerPreferences: {
    tone: 'conversational',
    length: 'medium',
    format: 'script-bullets',
    seniority: 'senior',
    codeLanguage: 'Python',
    useFillerWords: false,
    matchSpeakingStyle: false,
    enabledFrameworks: [...QUESTION_TYPES]
  },
  autoAnswer: true,
  saveTranscript: true
}
