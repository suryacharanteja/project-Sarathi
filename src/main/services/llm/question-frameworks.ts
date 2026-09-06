import type { QuestionType } from '../../../shared/question-frameworks'
import type { AnswerFormat } from '../../../shared/session-types'

/**
 * Visible, per-framework sentinel sections — not a prose paragraph asking
 * the model to "structure your answer using STAR-L" and hoping it complies.
 *
 * UAT confirmed the prose-instruction approach didn't work: every answer
 * looked identical regardless of which framework was detected, because the
 * card's rendered shape came entirely from the fixed generic
 * `<<<ANSWER>>>`/`<<<KEY_STEPS>>>` sentinels in types.ts, completely
 * decoupled from whatever the framework instruction asked for. The ONE
 * thing in this whole prompt that's ever reliably followed is the sentinel-
 * marker mechanism itself (`<<<CODE:language>>>`/`<<<COMPLEXITY>>>` already
 * work perfectly) — because it's a hard structural target paired with a
 * parser that renders it, not a soft suggestion competing with a dozen
 * other instructions. So each framework now gets its own sentinel tags,
 * parsed generically by answer-parser.ts into AnswerCard.frameworkSections
 * and rendered as distinct labeled blocks in AnswerCardView.tsx — visible
 * proof the framework was actually used, not just a claim.
 */
export interface FrameworkStage {
  tag: string
  label: string
  instruction: string
}

function groundingLine(hasCandidateContext: boolean, subject: string): string {
  return hasCandidateContext
    ? `base this on a REAL project/role/achievement from the candidate profile or attached documents above — don't invent a generic scenario when real material is available`
    : `describe a plausible, specific-sounding ${subject} rather than a vague generality (no candidate profile/documents are attached)`
}

export function frameworkStages(type: QuestionType, hasCandidateContext: boolean): FrameworkStage[] {
  switch (type) {
    case 'behavioral':
      return [
        { tag: 'SITUATION', label: 'Situation', instruction: `one sentence of concrete context — ${groundingLine(hasCandidateContext, 'situation')}` },
        { tag: 'TASK', label: 'Task', instruction: 'what you were specifically responsible for' },
        { tag: 'ACTION', label: 'Action', instruction: 'the concrete steps YOU took, first person, not "we"' },
        { tag: 'RESULT', label: 'Result', instruction: 'a measurable or observable outcome' },
        { tag: 'LEARNING', label: 'Learning', instruction: 'what you took from it and applied afterward' }
      ]
    case 'theoretical':
      return [
        { tag: 'DEFINITION', label: 'Definition', instruction: 'a crisp one-line explanation of the concept' },
        { tag: 'EXAMPLE', label: 'Example', instruction: `a concrete instance where you actually applied it — ${groundingLine(hasCandidateContext, 'example')}` },
        { tag: 'FORMULA', label: 'Formula/Fundamentals', instruction: 'the core mechanism, metric, or formula involved' },
        { tag: 'CONCLUSION', label: 'Conclusion', instruction: 'when to use it, or its practical impact' }
      ]
    case 'scenario':
      return [
        { tag: 'CLARIFY', label: 'Scope', instruction: "how you'd clarify the ambiguous prompt, briefly" },
        { tag: 'CONSTRAINTS', label: 'Constraints', instruction: 'the real-world limitations at play — data, budget, timeline' },
        { tag: 'OPTIONS', label: 'Options', instruction: '2-3 possible approaches, briefly' },
        { tag: 'PROPOSAL', label: 'Proposal', instruction: `the approach you'd choose and why — ${groundingLine(hasCandidateContext, 'reasoning')}` },
        { tag: 'EVALUATE', label: 'Evaluate', instruction: 'edge cases, risks, or failure points of your proposal' }
      ]
    case 'coding':
      return [
        { tag: 'RESTATE', label: 'Restate', instruction: 'briefly restate the problem and any edge cases (e.g. can input be empty)' },
        { tag: 'EXAMPLES', label: 'Examples', instruction: 'a simple input and its expected output' },
        { tag: 'APPROACH', label: 'Approach', instruction: 'the algorithm/logic in plain words, explained before any code' },
        {
          tag: 'CODE',
          label: 'Code',
          // "modular" used to be here and was the main verbosity driver — it
          // invites helper classes and abstraction the candidate then has to
          // type out live. Shortest-correct is the interview-correct target.
          instruction:
            'the shortest correct solution — no fences, no helper classes, no extra abstraction, no imports or boilerplate unless genuinely required. Include 1-2 brief comments marking the key steps so the candidate can explain the code aloud while typing it'
        },
        { tag: 'COMPLEXITY', label: 'Complexity', instruction: 'Time: O(...) and Space: O(...) on separate lines' },
        { tag: 'TEST', label: 'Test', instruction: 'dry-run the code against the example from Examples to confirm correctness' }
      ]
    case 'system-design':
      return [
        { tag: 'REQUIREMENTS', label: 'Requirements', instruction: 'functional and non-functional — scale, speed, availability' },
        { tag: 'ENTITIES', label: 'Entities/Data', instruction: 'the data model and storage choices' },
        { tag: 'ARCHITECTURE', label: 'Architecture', instruction: 'the high-level components — APIs, services, queues' },
        { tag: 'LATENCY_SCALE', label: 'Latency/Scale', instruction: 'how bottlenecks are handled — caching, load balancing, async processing' },
        { tag: 'MONITORING', label: 'Monitoring', instruction: "how you'd track system health and failure modes" }
      ]
  }
}

const FORMAT_STAGE_NOTE: Record<AnswerFormat, string> = {
  'full-script': 'Write each section as 1-2 complete, speakable sentences — a script the candidate could read verbatim.',
  'script-bullets': 'Write each section as a short, complete sentence — concise, but still a full sentence, not a fragment.',
  bullets: 'Write each section as ONE short bullet point (no "- " prefix needed, just the terse phrase) — not a full sentence.'
}

/**
 * Filler words are embedded directly into this structural block instead of
 * living as a separate `prefLines` entry — UAT confirmed a standalone soft
 * instruction gets silently dropped when it has to compete with several
 * other prompt instructions. Folding it into the one instruction set that's
 * actually reliably followed is the fix.
 */
function fillerWordsNote(useFillerWords: boolean): string {
  return useFillerWords
    ? ' In exactly ONE of these sections, naturally work in a couple of real spoken filler words ("um", "so", "basically", "you know") — enough to sound like genuine speech, not a script; do not add them to every section.'
    : ''
}

/**
 * Replaces the generic RESPONSE_FORMAT_INSTRUCTIONS (types.ts) when a
 * framework is active. Every stage becomes its own sentinel tag, generically
 * parsed by answer-parser.ts's SECTION_MARKER into AnswerCard.frameworkSections
 * — CODE and COMPLEXITY reuse the exact tags the existing UI already renders
 * specially (syntax block, time/space badges), so those keep working
 * unchanged for the coding framework.
 */
export function frameworkResponseFormat(
  type: QuestionType,
  hasCandidateContext: boolean,
  format: AnswerFormat | undefined,
  useFillerWords: boolean
): string {
  const stages = frameworkStages(type, hasCandidateContext)
  const formatNote = FORMAT_STAGE_NOTE[format ?? 'script-bullets']

  const sections = stages
    .map((stage, i) => {
      const tag = stage.tag === 'CODE' ? '<<<CODE:language>>>' : `<<<${stage.tag}>>>`
      const filler = i === 0 ? fillerWordsNote(useFillerWords) : ''
      return `${tag}\n${stage.instruction}.${filler}`
    })
    .join('\n\n')

  return `Format your response using these exact section markers, each alone on its own line, in this exact order. Do not use markdown headers (#) or fenced code blocks (\`\`\`) anywhere — use only the markers below. ${formatNote}

${sections}`
}
