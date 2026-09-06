export interface ParsedAnswer {
  answer: string
  keySteps: string[]
  code: { language: string; content: string } | null
  explanation: string
  timeComplexity: string | null
  spaceComplexity: string | null
  /** Framework-specific stages (e.g. Situation/Task/Action/Result/Learning
   *  for STAR-L), in the order they streamed in — anything that isn't one
   *  of the well-known tags below (ANSWER/KEY_STEPS/CODE/EXPLANATION/
   *  COMPLEXITY) falls through to here generically. See
   *  main/services/llm/question-frameworks.ts's frameworkResponseFormat(). */
  frameworkSections: { label: string; body: string }[]
}

// Any all-caps/underscore tag, not a fixed enum — framework stage tags
// (SITUATION, LATENCY_SCALE, etc.) vary per question type and are handled
// generically below, while the original fixed set keeps its special
// handling so code rendering/complexity badges/follow-ups are unaffected.
const SECTION_MARKER = /<<<([A-Z_]+)(?::([\w+#.-]+))?>>>/g

const KNOWN_KINDS = new Set(['ANSWER', 'KEY_STEPS', 'EXPLANATION', 'COMPLEXITY', 'CODE'])

/** "LATENCY_SCALE" -> "Latency Scale" — good enough for a section heading;
 *  exact framework label text isn't shared cross-process, so this is a
 *  generic humanization rather than a lookup table. */
function humanizeTag(tag: string): string {
  return tag
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * Regex-splits the WHOLE accumulated buffer on every call — no parser state
 * carried between calls. That's what makes it safe to call repeatedly as
 * chunks stream in (each call just re-derives the current best-known state
 * from scratch) and once more at completion, with no risk of drifting out of
 * sync with a partial/still-growing final section. Pairs with the sentinel
 * markers the model is instructed to emit (see RESPONSE_FORMAT_INSTRUCTIONS /
 * frameworkResponseFormat() in src/main/services/llm/types.ts) instead of a
 * JSON object, which can't be rendered until it's fully received.
 */
export function parseStreamingAnswer(accumulatedText: string): ParsedAnswer {
  const result: ParsedAnswer = {
    answer: '',
    keySteps: [],
    code: null,
    explanation: '',
    timeComplexity: null,
    spaceComplexity: null,
    frameworkSections: []
  }

  const matches = [...accumulatedText.matchAll(SECTION_MARKER)]

  if (matches.length === 0) {
    // No marker has streamed in yet (or the model never emits one) — treat
    // everything as the answer so text is renderable from the very first
    // token, not just once <<<ANSWER>>> itself has arrived.
    result.answer = accumulatedText.trim()
    return result
  }

  const leading = accumulatedText.slice(0, matches[0].index).trim()
  if (leading) result.answer = leading

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i]
    const kind = match[1].toUpperCase()
    const codeLanguage = match[2]
    const bodyStart = match.index! + match[0].length
    const bodyEnd = i + 1 < matches.length ? matches[i + 1].index! : accumulatedText.length
    const body = accumulatedText.slice(bodyStart, bodyEnd).trim()

    switch (kind) {
      case 'ANSWER':
        result.answer = body
        break
      case 'KEY_STEPS':
        result.keySteps = body
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.startsWith('- ') || line.startsWith('* '))
          .map((line) => line.slice(2).trim())
        break
      case 'CODE':
        if (body) result.code = { language: codeLanguage || 'text', content: body }
        break
      case 'EXPLANATION':
        result.explanation = body
        break
      case 'COMPLEXITY': {
        const timeMatch = body.match(/time:\s*(.+)/i)
        const spaceMatch = body.match(/space:\s*(.+)/i)
        result.timeComplexity = timeMatch ? timeMatch[1].trim() : null
        result.spaceComplexity = spaceMatch ? spaceMatch[1].trim() : null
        break
      }
      default:
        if (!KNOWN_KINDS.has(kind) && body) {
          result.frameworkSections.push({ label: humanizeTag(kind), body })
        }
        break
    }
  }

  return result
}
