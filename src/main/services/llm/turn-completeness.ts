import type { AskParams, LlmProvider } from './types'
import { askGemini } from './gemini'
import { askOpenAi, askOpenCodeGo, askOpenCodeZen, askDeepSeek } from './openai-compatible'

// Deliberately short and retry-free — this is a hot-path classifier gating
// how long the interviewer's turn buffer waits before dispatching, not a
// full answer generation (that already has its own generous
// timeout/retry regime in router.ts, which would be far too slow here).
// UAT showed the original 4s bound made every non-"?" question noticeably
// slower to answer — cut to 1.5s so the worst case (a slow/unresponsive
// provider) never adds more than a small, bounded delay on top of the
// existing silence debounce.
const CLASSIFIER_TIMEOUT_MS = 1500

function dispatch(provider: LlmProvider, params: AskParams, onChunk: (text: string) => void): Promise<void> {
  switch (provider) {
    case 'gemini':
      return askGemini(params, onChunk)
    case 'openai':
      return askOpenAi(params, onChunk)
    case 'opencode-go':
      return askOpenCodeGo(params, onChunk)
    case 'opencode-zen':
      return askOpenCodeZen(params, onChunk)
    case 'deepseek':
      return askDeepSeek(params, onChunk)
  }
}

export interface TurnClassification {
  complete: boolean
  /** True when this is backchannel/conversational filler with no answerable
   *  content — a repair request ("can you repeat that"), an acknowledgment,
   *  a rhetorical remark — rather than a genuine question. Dialogue-act
   *  classification (Statement/Question/Backchannel/Agreement...) is a real,
   *  established NLP task; this asks the same LLM already configured for
   *  answering to make that judgment directly, rather than matching against
   *  an enumerated phrase list that can only ever cover phrasing already
   *  seen. Only meaningful when `complete` is true. */
  isBackchannel: boolean
}

/**
 * A lightweight semantic classifier — the same technique production
 * voice-agent frameworks (e.g. LiveKit's turn-detector model) layer on top
 * of pure silence-duration endpointing, since a fixed pause length alone
 * can't distinguish "done talking" from "pausing mid-thought before the next
 * clause" on a long, multi-part question. Extended to also classify
 * backchannel vs. genuine question in the SAME call — not a second round
 * trip — since a short, ambiguous utterance already pays this cost today for
 * completeness; asking it one more thing costs nothing extra. No retries and
 * a short timeout — on any failure this "fails open" (treated as a complete,
 * genuine question), so the existing silence-debounce-only behavior is the
 * worst case this can produce, never a regression.
 */
export async function classifyTurn(
  provider: LlmProvider,
  apiKey: string,
  model: string,
  transcriptSoFar: string
): Promise<TurnClassification> {
  const rawPrompt = `An interviewer is speaking to a candidate during a live interview. Here is what has been transcribed from their speech so far:

"${transcriptSoFar}"

Classify this as EXACTLY one of the following three words, and reply with ONLY that word:
- INCOMPLETE — the interviewer has clearly not finished their question or instruction yet (e.g. about to add another clause, constraint, or follow-up detail).
- BACKCHANNEL — this is NOT a real question or request for the candidate to answer. It is conversational filler with no answerable content: an acknowledgment ("okay", "right"), a request to repeat or rephrase something already said ("can you repeat that", "come again", "pardon", "one more time", "say that again"), a rhetorical remark ("why not"), or similar.
- QUESTION — the interviewer has finished asking a genuine, answerable question or instruction.

Reply with exactly one word: INCOMPLETE, BACKCHANNEL, or QUESTION.`

  let buffer = ''
  try {
    await Promise.race([
      dispatch(provider, { apiKey, model, question: '', rawPrompt }, (chunk) => {
        buffer += chunk
      }),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('turn classification timed out')), CLASSIFIER_TIMEOUT_MS)
      )
    ])
  } catch {
    return { complete: true, isBackchannel: false }
  }

  const verdict = buffer.trim().toUpperCase()
  if (verdict.startsWith('INCOMPLETE')) return { complete: false, isBackchannel: false }
  if (verdict.startsWith('BACKCHANNEL')) return { complete: true, isBackchannel: true }
  return { complete: true, isBackchannel: false }
}
