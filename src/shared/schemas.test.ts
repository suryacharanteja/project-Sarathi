import assert from 'node:assert/strict'
import test from 'node:test'

import {
  appSettingsSchema,
  askAiRequestSchema,
  createSessionFormSchema,
  sttSourceSchema
} from './schemas.ts'

/**
 * These are the exact validation gates every IPC handler in main/ipc.ts
 * runs untrusted renderer input through before touching any service —
 * see LLD section 3 ("IPC schema validation failure returns a typed error
 * and does not mutate state") and section 8's IPC test-area requirement
 * ("Invalid payloads, cancellation, missing files, typed result shape").
 * Pure functions over plain objects, so no Electron, no I/O.
 *
 * Run with: npm run test:schemas
 */

const validAnswerPreferences = {
  tone: 'conversational',
  length: 'medium',
  format: 'script-bullets',
  seniority: 'senior',
  codeLanguage: 'Python',
  useFillerWords: false,
  matchSpeakingStyle: false,
  enabledFrameworks: []
}

const validSessionForm = {
  sessionType: 'regular-call',
  company: '',
  jobDescription: '',
  profileId: null,
  extraContext: '',
  documentIds: [],
  provider: 'gemini',
  model: 'gemini-2.5-flash',
  outputLanguage: 'English',
  answerPreferences: validAnswerPreferences,
  autoAnswer: true,
  saveTranscript: false
}

test('createSessionFormSchema accepts a well-formed regular-call form', () => {
  const result = createSessionFormSchema.safeParse(validSessionForm)
  assert.equal(result.success, true)
})

test('createSessionFormSchema requires a company for interview sessions but not regular calls', () => {
  const asInterview = { ...validSessionForm, sessionType: 'interview', company: '' }
  const interviewResult = createSessionFormSchema.safeParse(asInterview)
  assert.equal(interviewResult.success, false)

  const asInterviewWithCompany = { ...asInterview, company: 'Acme' }
  assert.equal(createSessionFormSchema.safeParse(asInterviewWithCompany).success, true)

  // The refine only fires for 'interview' — a blank company must stay valid
  // for regular-call, since CreateSessionScreen.tsx always sends company: 'Webinar'
  // but nothing should hard-require it for this session type.
  assert.equal(createSessionFormSchema.safeParse(validSessionForm).success, true)
})

test('createSessionFormSchema rejects an unknown provider rather than silently passing it through', () => {
  const result = createSessionFormSchema.safeParse({ ...validSessionForm, provider: 'not-a-real-provider' })
  assert.equal(result.success, false)
})

test('createSessionFormSchema rejects a missing/empty model', () => {
  const result = createSessionFormSchema.safeParse({ ...validSessionForm, model: '' })
  assert.equal(result.success, false)
})

test('createSessionFormSchema rejects more than 5 attached documents', () => {
  const tooMany = Array.from({ length: 6 }, (_, i) => `doc-${i}`)
  const result = createSessionFormSchema.safeParse({ ...validSessionForm, documentIds: tooMany })
  assert.equal(result.success, false)
})

test('appSettingsSchema falls back to safe defaults for a corrupted/partial settings file instead of throwing', () => {
  // .catch() fields — this is what readSettings() in main/store.ts relies
  // on to recover from a hand-edited or partially-written settings.json
  // rather than crashing the whole app on startup.
  const result = appSettingsSchema.safeParse({ sttEngine: 'not-a-real-engine' })
  assert.equal(result.success, true)
  assert.equal(result.data?.sttEngine, 'assemblyai')
  assert.equal(result.data?.geminiApiKey, null)
})

test('appSettingsSchema round-trips a fully-populated valid settings object unchanged', () => {
  const settings = {
    geminiApiKey: 'key-1',
    assemblyAiApiKey: null,
    openaiApiKey: null,
    openCodeGoApiKey: null,
    openCodeZenApiKey: null,
    deepseekApiKey: null,
    sttEngine: 'local',
    sttFallbackToLocal: false,
    sttLanguage: 'en',
    sttModel: 'Xenova/whisper-small'
  }
  const result = appSettingsSchema.safeParse(settings)
  assert.equal(result.success, true)
  assert.deepEqual(result.data, settings)
})

test('askAiRequestSchema rejects an empty question', () => {
  const result = askAiRequestSchema.safeParse({
    cardId: 'card-1',
    question: '',
    provider: 'gemini',
    model: 'gemini-2.5-flash'
  })
  assert.equal(result.success, false)
})

test('askAiRequestSchema only accepts data:image/ URLs, not arbitrary strings, for imageDataUrls', () => {
  const withBadImage = {
    cardId: 'card-1',
    question: 'What is on screen?',
    provider: 'openai',
    model: 'gpt-4o',
    imageDataUrls: ['not-a-data-url']
  }
  assert.equal(askAiRequestSchema.safeParse(withBadImage).success, false)

  const withGoodImage = { ...withBadImage, imageDataUrls: ['data:image/png;base64,AAAA'] }
  assert.equal(askAiRequestSchema.safeParse(withGoodImage).success, true)
})

test('askAiRequestSchema requires cardId — the field every ai:chunk/ai:done/ai:error event is scoped by', () => {
  const result = askAiRequestSchema.safeParse({
    cardId: '',
    question: 'Anything',
    provider: 'gemini',
    model: 'gemini-2.5-flash'
  })
  assert.equal(result.success, false)
})

test('sttSourceSchema only accepts the two real audio sources', () => {
  assert.equal(sttSourceSchema.safeParse('mic').success, true)
  assert.equal(sttSourceSchema.safeParse('system').success, true)
  assert.equal(sttSourceSchema.safeParse('speaker').success, false)
  assert.equal(sttSourceSchema.safeParse(undefined).success, false)
})
