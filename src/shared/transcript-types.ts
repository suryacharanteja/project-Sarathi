import type { QuestionType } from './question-frameworks'

export type TranscriptSource = 'mic' | 'system'

export interface TranscriptMessage {
  id: string
  source: TranscriptSource
  text: string
  isFinal: boolean
  timestamp: number
}

export interface FollowUpEntry {
  instruction: string
  answer: string
  keySteps?: string[]
  code?: { language: string; content: string }
  explanation?: string
  timeComplexity?: string
  spaceComplexity?: string
  /** Present when this follow-up attached one or more screenshots — shown
   *  as thumbnails so the candidate can confirm what was actually
   *  captured. */
  imageDataUrls?: string[]
  createdAt: number
}

export interface AnswerCard {
  id: string
  question: string
  understanding?: string
  answer: string
  keySteps?: string[]
  code?: { language: string; content: string }
  explanation?: string
  timeComplexity?: string
  spaceComplexity?: string
  /** Additional targeted asks appended after the primary answer (e.g. "+ Code",
   *  "explain more") — kept separate from the primary fields above so a
   *  follow-up never silently overwrites the original answer. */
  followUps?: FollowUpEntry[]
  /** A follow-up currently streaming in — shown live below the primary
   *  content, then moved into followUps (or promoted into the primary code
   *  field) once done. Distinct from `status`, which tracks the primary
   *  answer only, so a follow-up in flight never flips the card back to a
   *  "streaming" primary-answer state. */
  pendingFollowUp?: Omit<FollowUpEntry, 'createdAt'>
  status: 'streaming' | 'done' | 'error'
  createdAt: number
  /** The framework-selection type this answer was generated with — auto-
   *  detected server-side unless the user overrode it via the card's tag. */
  questionType?: QuestionType
  questionTypeIsOverridden?: boolean
  /** Framework-specific stages (Situation/Task/Action/Result/Learning, etc.)
   *  parsed from the model's sentinel output, in order — see
   *  answer-parser.ts and main/services/llm/question-frameworks.ts. Present
   *  only when questionType is set; rendered as distinct labeled blocks
   *  instead of the generic answer/key-steps shape. */
  frameworkSections?: { label: string; body: string }[]
  /** True when this answer was actually written in the candidate's learned
   *  speaking style (answerPreferences.matchSpeakingStyle was on AND the
   *  active profile had a speakingStyleProfile to apply) — shown as a
   *  read-only badge so the feature's effect is visible per-answer instead
   *  of only trusted at toggle-time. */
  styledFromProfile?: boolean
}
