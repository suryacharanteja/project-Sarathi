import { listSessions, getSessionTranscript } from '../sessions/store'
import { askLlmWithFallback, type ProviderCandidate } from '../services/llm/router'

export interface SpeakingStyleSourceStats {
  sessionCount: number
  micUtteranceCount: number
  micCharCount: number
}

/** Roughly a couple of minutes of real speech — below this, warn rather
 *  than block, since the user should still be able to force it on a single
 *  long session, but a low-signal summary isn't worth generating silently. */
export const MIN_CHARS_FOR_GOOD_STYLE = 1500

/**
 * Pulls together every past session tied to this profile that had
 * `saveTranscript` on, keeping only the candidate's own mic speech (never
 * the interviewer's system-audio side) — that's what "how do THEY talk"
 * needs, and reuses the session/transcript stores as-is, no new linkage.
 */
export function gatherSpeakingStyleSource(profileId: string): { stats: SpeakingStyleSourceStats; text: string } {
  const sessions = listSessions().filter((s) => s.form.profileId === profileId && s.form.saveTranscript)

  const micTexts: string[] = []
  for (const session of sessions) {
    const transcript = getSessionTranscript(session.id)
    for (const message of transcript) {
      if (message.source === 'mic' && message.isFinal && message.text.trim()) {
        micTexts.push(message.text.trim())
      }
    }
  }

  const text = micTexts.join('\n')
  return {
    stats: { sessionCount: sessions.length, micUtteranceCount: micTexts.length, micCharCount: text.length },
    text
  }
}

const STYLE_ANALYSIS_INSTRUCTION =
  'Write a concise style profile (150-250 words) covering: typical sentence length and structure, filler words/verbal habits actually observed (quote 2-4 real ones if present), how they tend to open and close an answer, vocabulary level/formality, and any recurring phrasing patterns. Do not summarize WHAT they talked about (the content/subject matter) — only HOW they talk. Write it as instructions to a future writer imitating this voice, e.g. "Uses short, punchy sentences and often starts with \'So basically...\'".'

async function summarizeStyle(sourceDescription: string, text: string, candidates: ProviderCandidate[]): Promise<string> {
  const rawPrompt = `You are analyzing ${sourceDescription}, to build a reusable description of their personal speaking style — NOT to answer any interview question.

${text}

${STYLE_ANALYSIS_INSTRUCTION}`

  let accumulated = ''
  await askLlmWithFallback(candidates, { question: '', rawPrompt }, (delta) => {
    accumulated += delta
  })

  const styleText = accumulated.trim()
  if (!styleText) {
    throw new Error('The model returned an empty style profile — try again.')
  }
  return styleText
}

/**
 * One-shot, on-demand summarization from PAST live-interview transcripts —
 * never triggered automatically (not on session end, not on a timer). Lower
 * signal than the practice-interview path below (compressed, under-pressure
 * speech, no guarantee of enough of it), kept as the faster secondary option.
 */
export async function generateSpeakingStyleProfile(
  profileId: string,
  candidates: ProviderCandidate[]
): Promise<string> {
  const { text } = gatherSpeakingStyleSource(profileId)
  if (!text.trim()) {
    throw new Error('No saved speech found for this profile yet.')
  }
  return summarizeStyle(
    "a transcript of one person's spoken answers during past interviews (their words only, interviewer's excluded)",
    `Transcript:\n${text}`,
    candidates
  )
}

export interface PracticeAnswer {
  question: string
  answer: string
}

/**
 * The primary, recommended path: deliberate, curated Q&A the candidate
 * answers on purpose (spoken or typed) in a dedicated practice flow,
 * instead of scraped fragments of real interviews. Higher signal, and the
 * candidate can see exactly what data is going in, unlike the passive path.
 */
export async function generateSpeakingStyleFromPractice(
  answers: PracticeAnswer[],
  candidates: ProviderCandidate[]
): Promise<string> {
  const usable = answers.filter((a) => a.answer.trim().length > 0)
  if (usable.length === 0) {
    throw new Error('No practice answers were provided.')
  }
  const text = usable.map((a) => `Q: ${a.question}\nA: ${a.answer.trim()}`).join('\n\n')
  return summarizeStyle(
    "a person's own answers to a set of practice interview questions they deliberately answered",
    text,
    candidates
  )
}
