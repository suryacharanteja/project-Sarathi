import type { AnswerPreferences, SessionType, AnswerFormat } from '../../../shared/session-types'
import type { QuestionType } from '../../../shared/question-frameworks'
import { frameworkResponseFormat } from './question-frameworks'

export type LlmProvider = 'gemini' | 'openai' | 'opencode-go' | 'opencode-zen' | 'deepseek'

export interface PriorAnswerSummary {
  answer: string
  keySteps?: string[]
  code?: { language: string; content: string }
  explanation?: string
  timeComplexity?: string
  spaceComplexity?: string
  /** A framework-based answer (STAR-L/DEFC/SCOPE/REALM/most of REACT) puts
   *  its real content here, not in `answer` — see answer-parser.ts's default
   *  branch. Without this, a follow-up on any framework-based answer (the
   *  majority of questions) saw an empty "Answer: " and had no idea what the
   *  original answer actually said, producing disconnected, generic
   *  follow-ups instead of ones that build on the real content on screen. */
  frameworkSections?: { label: string; body: string }[]
}

export interface AskParams {
  apiKey: string
  model: string
  question: string
  /** When set, buildPrompt() returns this verbatim instead of assembling a
   *  prompt from the other fields — used for narrow, single-purpose calls
   *  (e.g. the turn-completeness classifier in turn-completeness.ts) that
   *  don't fit the interview-answer prompt shape at all. */
  rawPrompt?: string
  company?: string
  jobDescription?: string
  extraContext?: string
  answerPreferences?: AnswerPreferences
  /** Present only for a follow-up ask — the current best-known answer to
   *  `question`, given as context so the model knows what a short follow-up
   *  instruction like "add code for this" refers to. */
  priorAnswer?: PriorAnswerSummary
  /** Present only for a follow-up ask — the new/additional thing being asked
   *  about the same question. When set, buildPrompt returns a follow-up
   *  prompt instead of a fresh-question prompt. */
  followUpInstruction?: string
  /** Screenshot(s) attached as extra visual context — data URLs
   *  ("data:image/png;base64,..."). The images themselves are attached to
   *  the provider request separately (see gemini.ts/openai-compatible.ts);
   *  this field only controls whether/how the TEXT prompt references them. */
  imageDataUrls?: string[]
  /** Steers the prompt's framing — e.g. a Coding Challenge session gets a
   *  problem-solving framing instead of an interview-candidate framing. */
  sessionType?: SessionType
  /** Resolved candidate profile text (resume/bio) — already resolved from
   *  a profile id to plain text by the caller (main/ipc.ts), since this
   *  layer doesn't own the filesystem. */
  profileContext?: string
  /** Resolved uploaded-document text, already labeled per document by the
   *  caller (main/ipc.ts) — see the same note as profileContext. */
  documentsContext?: string
  /** Server-detected (or user-overridden) question category — drives which
   *  structured framework instruction gets injected. See
   *  question-type-detector.ts / question-frameworks.ts. */
  questionType?: QuestionType
  /** Resolved from the active profile's speakingStyleProfile when the
   *  user's answerPreferences.matchSpeakingStyle is on — see
   *  main/profiles/speaking-style.ts. */
  speakingStyleContext?: string
  /** Conversational/rapport question (greeting, "why this role", career
   *  walkthrough) — answer briefly and naturally with no imposed structure.
   *  Set independently of questionType: see isGeneralQuestion(). */
  generalQuestion?: boolean
}

/**
 * Sentinel markers instead of a JSON object. A JSON blob can't be validly
 * parsed — or rendered — until the whole thing has arrived; that was the
 * actual cause of answers appearing "all at once" after a 3-4s wait, not
 * network speed. Plain-text markers let each section render the instant its
 * marker streams past, well before the response finishes. Bracketed
 * sentinels (not markdown `##` headers) avoid false-positive collisions with
 * content the model might generate, e.g. a code comment reading "# Key Steps".
 */
export const RESPONSE_FORMAT_INSTRUCTIONS = `Format your response using these exact section markers, each alone on its own line. Do not use markdown headers (#) or fenced code blocks (\`\`\`) anywhere — use only the markers below. Only <<<ANSWER>>> is required; omit any other section entirely if it doesn't apply.

<<<ANSWER>>>
The main answer, 1-4 sentences, plain prose, first person as the candidate.

<<<KEY_STEPS>>>
- short bullet step
- short bullet step
(omit this section if not applicable)

<<<CODE:language>>>
code only, no fences. The candidate must TYPE this live in an interview, so give the shortest correct solution — no helper classes, no extra abstraction, no imports or boilerplate unless genuinely required to run. Include 1-2 brief comments marking the key steps, so the candidate can explain what they are writing as they type it.
(omit this section if code isn't the natural output)

<<<EXPLANATION>>>
1-2 sentences of extra context or reasoning
(omit this section if not needed)

<<<COMPLEXITY>>>
Time: O(...)
Space: O(...)
(omit this section if not applicable)`

export function buildPrompt(params: AskParams): string {
  if (params.rawPrompt) return params.rawPrompt
  if (params.priorAnswer && params.followUpInstruction) {
    return buildFollowUpPrompt(params.priorAnswer, params.followUpInstruction, params)
  }

  const contextLines = [
    params.company ? `Company: ${params.company}` : null,
    params.jobDescription ? `Job description: ${params.jobDescription}` : null,
    params.profileContext ? `Candidate profile:\n${params.profileContext}` : null,
    params.documentsContext ?? null,
    params.extraContext ? `Extra context: ${params.extraContext}` : null
  ].filter(Boolean)

  const hasCandidateContext = Boolean(params.profileContext || params.documentsContext)
  const format = params.answerPreferences?.format
  const useFillerWords = Boolean(params.answerPreferences?.useFillerWords)

  // Voice/phrasing only — scoped explicitly so it doesn't compete with the
  // framework instruction over what the answer's actual structure should be.
  const styleLine = params.speakingStyleContext
    ? `Match this speaking style when writing the answer (voice and phrasing only — still follow the structure below): ${params.speakingStyleContext}`
    : null

  const prefLines: string[] = []
  if (params.answerPreferences) {
    const p = params.answerPreferences
    prefLines.push(`Response tone: ${p.tone}.`)
    prefLines.push(`Target seniority level: ${p.seniority}.`)
    if (p.codeLanguage) {
      prefLines.push(`Preferred code language: ${p.codeLanguage}.`)
    }
  }

  // Framework active: its own sentinel format REPLACES the generic one and
  // owns format/filler-words wording too, since folding them into the same
  // structural block is what makes the model actually follow them (see
  // question-frameworks.ts's frameworkResponseFormat doc comment). No
  // framework: fall back to the original generic format, unchanged, with
  // format/filler-words as their own prefLines exactly as before.
  const responseFormat = params.questionType
    ? frameworkResponseFormat(params.questionType, hasCandidateContext, format, useFillerWords)
    : RESPONSE_FORMAT_INSTRUCTIONS
  if (!params.questionType && params.answerPreferences) {
    prefLines.splice(1, 0, FORMAT_PROMPT_TEXT[params.answerPreferences.format])
    if (params.answerPreferences.useFillerWords) prefLines.push(FILLER_WORDS_INSTRUCTION)
  }

  return [
    codingChallengeOpeningLine(params.sessionType),
    contextLines.length > 0 ? contextLines.join('\n') : null,
    styleLine,
    prefLines.length > 0 ? prefLines.join(' ') : null,
    `Question: ${params.question}`,
    params.generalQuestion ? GENERAL_ANSWER_INSTRUCTION : null,
    SPOKEN_OUTPUT_GUARD,
    responseFormat
  ]
    .filter(Boolean)
    .join('\n\n')
}

const FORMAT_PROMPT_TEXT: Record<AnswerFormat, string> = {
  'full-script':
    'Give the answer as a full word-for-word script the candidate can read or say verbatim — complete sentences, no bullet shorthand.',
  'script-bullets':
    "Open with one full spoken sentence framing the answer, then continue with concise supporting bullet points (not full sentences) for the remaining detail.",
  bullets:
    "Give the answer as short bullet points in the candidate's own words — terse, not full sentences, meant to be glanced at and paraphrased aloud, not read verbatim."
}

/**
 * The output is read ALOUD to a live interviewer, so anything that reveals
 * the app's own scaffolding is worse than unhelpful — it makes the candidate
 * sound like they're reciting from a cheat sheet. UAT caught real answers
 * opening with "Yes—I'd be happy to share more about the project, and to add
 * to my DEFC answer..." — the model narrating the button that was pressed
 * instead of just answering. Stated as a hard prohibition, not a stylistic
 * hint, because soft instructions get dropped when several compete (the same
 * dilution problem documented in question-frameworks.ts).
 */
const SPOKEN_OUTPUT_GUARD = `Everything you write will be read out loud by the candidate to the interviewer, word for word. So it must contain ONLY what a person would actually say in that conversation. Never name or allude to any framework, method, acronym, or structure. Never describe what your answer is doing ("To add more detail...", "I'd structure this as..."). Never acknowledge or restate the request ("Yes, I'd be happy to...", "Sure, adding to my earlier answer..."). Start immediately with the substance of the answer itself. (This applies to the prose sections. A CODE section is read on screen rather than spoken, so it should still be given when the question calls for it — but the candidate has to TYPE it live during the interview, so it must be as short as possible.)`

/**
 * Greetings, "why this role", "walk me through your career", "any questions
 * for us?" — the questions that bookend every interview. UAT caught these
 * being answered with a rigid DEFC FORMULA section, which makes the
 * candidate sound like they're reciting a template for small talk.
 */
const GENERAL_ANSWER_INSTRUCTION =
  'This is a conversational question, not a technical one. Answer it the way a person actually would out loud: a short, natural spoken paragraph (or 2-3 brief bullets if it is genuinely a list). Keep it brief and warm. Do NOT impose any structure, do NOT break it into labelled stages, and do NOT invent framing devices like formulas or equations.'

const FILLER_WORDS_INSTRUCTION =
  'Sprinkle a few natural spoken filler words/disfluencies ("um", "so", "basically", "you know") sparingly through the answer so it reads like real speech, not a polished paragraph — 1-2 per section maximum, do not overdo it.'

/**
 * 'regular-call' is the Coding Challenge session type's underlying literal
 * (kept unchanged from its original "Regular Call" name to avoid breaking
 * saveTranscript.safeParse for sessions already on disk under the old
 * label — only the UI-facing label/icon changed, see CreateSessionScreen.tsx).
 */
function codingChallengeOpeningLine(sessionType: SessionType | undefined): string {
  return sessionType === 'regular-call'
    ? 'You are solving a coding/algorithm challenge (LeetCode/HackerRank-style). Give a correct, minimal solution — the candidate has to type it out live, so favour the shortest clear implementation over a thorough one — and always include its time and space complexity.'
    : 'You are answering as the candidate, in first person, in an interview or meeting.'
}

function buildFollowUpPrompt(prior: PriorAnswerSummary, instruction: string, params: AskParams): string {
  const priorSummaryLines = [
    // Framework-based answers put their real content in frameworkSections,
    // not `answer` (which stays empty in that case) — include both so a
    // follow-up on ANY answer shape actually sees what was said.
    prior.frameworkSections?.length
      ? prior.frameworkSections.map((s) => `${s.label}: ${s.body}`).join('\n')
      : null,
    prior.answer ? `Answer: ${prior.answer}` : null,
    prior.keySteps?.length ? `Key steps: ${prior.keySteps.join('; ')}` : null,
    prior.code ? `Code (${prior.code.language}):\n${prior.code.content}` : null,
    prior.explanation ? `Explanation: ${prior.explanation}` : null,
    prior.timeComplexity ? `Time complexity: ${prior.timeComplexity}` : null,
    prior.spaceComplexity ? `Space complexity: ${prior.spaceComplexity}` : null
  ].filter(Boolean)

  return [
    `${codingChallengeOpeningLine(params.sessionType)} You already gave an answer to this question, and the candidate now wants to add something to it.`,
    `Original question: ${params.question}`,
    `Your existing answer so far:\n${priorSummaryLines.join('\n')}`,
    // Deliberately names NO framework. Interpolating the acronym here (the
    // old behaviour) put "DEFC"/"STAR-L"/etc. into the prompt, and the model
    // then echoed it back in first-person prose the candidate reads aloud
    // ("to add to my DEFC answer...") — incomprehensible and incriminating
    // to an interviewer. Acronyms now live only in renderer UI labels.
    params.questionType ? 'Match the structure, depth, and voice of the existing answer above.' : null,
    `Additional request: ${instruction}`,
    params.imageDataUrls && params.imageDataUrls.length > 0
      ? params.imageDataUrls.length === 1
        ? 'A screenshot is attached — it may show code, a diagram, or other on-screen context relevant to this question. Use it.'
        : `${params.imageDataUrls.length} screenshots are attached (e.g. successive scrolled captures of the same content) — they may show code, a diagram, or other on-screen context relevant to this question. Use them together.`
      : null,
    "Respond with ONLY the new or updated sections needed to satisfy the additional request — do not repeat the full original answer.",
    SPOKEN_OUTPUT_GUARD,
    RESPONSE_FORMAT_INSTRUCTIONS
  ]
    .filter(Boolean)
    .join('\n\n')
}
