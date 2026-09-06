import { z } from 'zod/v4'
import { QUESTION_TYPES } from './question-frameworks'

export const LLM_PROVIDERS = ['gemini', 'openai', 'opencode-go', 'opencode-zen', 'deepseek'] as const
export const SESSION_TYPES = ['interview', 'regular-call'] as const
export const TONE_OPTIONS = ['conversational', 'formal', 'concise'] as const
export const LENGTH_OPTIONS = ['short', 'medium', 'long'] as const
export const FORMAT_OPTIONS = ['full-script', 'script-bullets', 'bullets'] as const
export const SENIORITY_OPTIONS = ['junior', 'mid', 'senior'] as const
export const STT_SOURCES = ['mic', 'system'] as const
export const STT_ENGINES = ['assemblyai', 'local'] as const
export const STT_MODEL_IDS = ['Xenova/whisper-base', 'Xenova/whisper-small'] as const

const answerPreferencesSchema = z.object({
  tone: z.enum(TONE_OPTIONS).catch('conversational'),
  length: z.enum(LENGTH_OPTIONS).catch('medium'),
  format: z.enum(FORMAT_OPTIONS).catch('script-bullets'),
  seniority: z.enum(SENIORITY_OPTIONS).catch('senior'),
  codeLanguage: z.string().catch('Python'),
  useFillerWords: z.boolean().catch(false),
  matchSpeakingStyle: z.boolean().catch(false),
  enabledFrameworks: z.array(z.enum(QUESTION_TYPES)).catch([...QUESTION_TYPES])
})

export const createSessionFormSchema = z
  .object({
    sessionType: z.enum(SESSION_TYPES),
    company: z.string().max(200),
    jobDescription: z.string().max(2000),
    profileId: z.string().nullable(),
    extraContext: z.string().max(1000),
    documentIds: z.array(z.string()).max(5),
    provider: z.enum(LLM_PROVIDERS),
    model: z.string().min(1, 'Model is required'),
    outputLanguage: z.string().min(1, 'Language is required'),
    answerPreferences: answerPreferencesSchema,
    autoAnswer: z.boolean(),
    saveTranscript: z.boolean()
  })
  .refine(
    (data) => data.sessionType !== 'interview' || data.company.trim().length > 0,
    { message: 'Company is required for interview sessions', path: ['company'] }
  )

export const appSettingsSchema = z.object({
  geminiApiKey: z.string().nullable().catch(null),
  assemblyAiApiKey: z.string().nullable().catch(null),
  openaiApiKey: z.string().nullable().catch(null),
  openCodeGoApiKey: z.string().nullable().catch(null),
  openCodeZenApiKey: z.string().nullable().catch(null),
  deepseekApiKey: z.string().nullable().catch(null),
  sttEngine: z.enum(STT_ENGINES).catch('assemblyai'),
  sttFallbackToLocal: z.boolean().catch(true),
  sttLanguage: z.string().catch('en'),
  sttModel: z.enum(STT_MODEL_IDS).catch('Xenova/whisper-base')
})

export const sessionMetadataSchema = z.object({
  id: z.string().min(1),
  form: createSessionFormSchema,
  createdAt: z.string(),
  updatedAt: z.string()
})

export const profileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  resumeText: z.string().max(20000),
  speakingStyleProfile: z.string().nullable().catch(null),
  speakingStyleGeneratedAt: z.string().nullable().catch(null),
  createdAt: z.string(),
  updatedAt: z.string()
})

export const documentRecordSchema = z.object({
  id: z.string().min(1),
  fileName: z.string().min(1),
  extractedText: z.string(),
  sizeBytes: z.number(),
  createdAt: z.string()
})

const priorAnswerSchema = z.object({
  answer: z.string(),
  keySteps: z.array(z.string()).optional(),
  code: z.object({ language: z.string(), content: z.string() }).optional(),
  explanation: z.string().optional(),
  timeComplexity: z.string().optional(),
  spaceComplexity: z.string().optional()
})

export const askAiRequestSchema = z.object({
  cardId: z.string().min(1),
  question: z.string().min(1, 'Question cannot be empty'),
  provider: z.enum(LLM_PROVIDERS),
  model: z.string().min(1),
  company: z.string().optional(),
  jobDescription: z.string().optional(),
  extraContext: z.string().optional(),
  answerPreferences: answerPreferencesSchema.optional(),
  followUpInstruction: z.string().min(1).optional(),
  priorAnswer: priorAnswerSchema.optional(),
  imageDataUrls: z.array(z.string().startsWith('data:image/')).optional(),
  sessionType: z.enum(SESSION_TYPES).optional(),
  profileId: z.string().nullable().optional(),
  documentIds: z.array(z.string()).max(5).optional(),
  questionType: z.enum(QUESTION_TYPES).optional()
})

export const answerResultSchema = z.object({
  answer: z.string().catch(''),
  keySteps: z.array(z.string()).catch([]),
  code: z
    .object({
      language: z.string(),
      content: z.string()
    })
    .nullable()
    .catch(null),
  explanation: z.string().catch(''),
  timeComplexity: z.string().nullable().catch(null),
  spaceComplexity: z.string().nullable().catch(null)
})

export const sttSourceSchema = z.enum(STT_SOURCES)
