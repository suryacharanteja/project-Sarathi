import type { QuestionType } from '../../../shared/question-frameworks'

/**
 * Local, zero-network heuristic — runs in the same process, in the same
 * request, at effectively zero cost, so picking a per-question framework
 * never adds a round trip the way an LLM classifier would. A misclassified
 * question is cheap to fix (the card's type tag can be overridden and
 * regenerated); a slow or unreliable classifier call would not be.
 *
 * Score-based rather than first-match: real questions mix signal words
 * ("design a caching strategy" reads like both scenario and system-design).
 * Patterns are grouped most-specific-vocabulary-first so a tie favors the
 * narrower, more technical category over a vaguer one.
 *
 * `enabledTypes` is the user's Answer Preferences selection — chosen ahead
 * of time, never live — so detection only ever picks a framework the user
 * actually opted into. An empty list means the framework system is off
 * entirely for this session; every question is then answered with no
 * imposed structure at all.
 */
interface Rule {
  type: QuestionType
  patterns: RegExp[]
  weight: number
}

/**
 * Questions that must NEVER get a framework, checked before the scoring
 * rules so they beat false-positive matches. "Why do you want this role?"
 * matches the behavioral rule below, and STAR-L (Situation/Task/Action/
 * Result) is nonsense for a motivation question — so a positive match in
 * RULES is not sufficient evidence on its own.
 *
 * These are the questions that bookend every real interview. UAT caught
 * "quick walkthrough of your career so far" being answered with a DEFC
 * FORMULA section reading "business problem plus reliable data plus
 * production-grade engineering equals useful AI" — a template being
 * satisfied rather than a question being answered.
 */
const GENERAL_PATTERNS: RegExp[] = [
  // Greetings / small talk
  /^(hi|hello|hey)\b/,
  /how are you/,
  /how('s| is|'re| are) (your|things|it going)/,
  /nice to (meet|see) you/,
  // Interview bookends
  /do you have any questions/,
  /any questions for (us|me)/,
  /anything (else )?(you('d| would) like to )?(add|ask|know)/,
  /is there anything else/,
  // Logistics
  /notice period/,
  /when can you (start|join)/,
  /(salary|compensation|ctc) (expectation|range)?/,
  /willing to relocate/,
  /current (location|company|role|ctc)/,
  // Career narrative / motivation — substantive, but not framework-shaped
  /walk ?through of your (career|background|experience|profile)/,
  /walk me through your (career|background|resume|profile|journey)/,
  /tell me about your (career|background|journey|experience|profile)/,
  /(brief|quick) (intro|introduction|overview) (of|about)/,
  /what attracted you/,
  /why (do you want|are you looking|are you interested|are you leaving)/,
  /why (this|our) (role|company|position|team)/,
  /why (are you )?(applying|considering)/
]

/**
 * A conversational/rapport question that should get a short, natural spoken
 * answer rather than any imposed structure. Deliberately separate from
 * detectQuestionType returning null — null ALSO means "the user disabled all
 * frameworks", and someone who did that and then asks a hard technical
 * question still wants a full answer, not a two-liner.
 */
export function isGeneralQuestion(question: string): boolean {
  const text = question.toLowerCase()
  return GENERAL_PATTERNS.some((pattern) => pattern.test(text))
}

const RULES: Rule[] = [
  {
    type: 'system-design',
    weight: 3,
    patterns: [
      /design (a|an|the) (system|api|service|architecture|database schema)/,
      /how would you scale/,
      /(architecture|infrastructure) for/,
      /microservices?/,
      /load balanc/,
      /design .*(instagram|twitter|uber|netflix|url shortener|chat app|feed|search engine)/,
      /handle millions of/,
      /database (schema|design)/,
      /high[- ]level design/,
      // Added after UAT: "structure branching promotion and approvals for
      // a regulated bank environment" was missed entirely — real system-
      // design/process-architecture questions rarely say "design a system".
      /how (would|do) you (structure|approach|set up|organize) (the |a |an )?(branching|deployment|release|pipeline|environment|infrastructure|approval)/,
      /branching (strategy|model|promotion)/,
      /approval (workflow|process|chain)/,
      /regulated (bank|financial|environment)/,
      /environment[- ]gated/,
      /promotion (process|pipeline)/,
      /ci\/?cd (pipeline|process|architecture)/
    ]
  },
  {
    type: 'coding',
    weight: 3,
    patterns: [
      /write (a|an|some) (function|code|program|algorithm|query)/,
      /\bimplement\b/,
      /leetcode/,
      /given an? (array|string|list|linked list|tree|graph|matrix)/,
      /(time|space) complexity/,
      /\bbig o\b/,
      /reverse a|find the (max|min|duplicate|missing)/,
      /two sum/,
      /write pseudocode/
    ]
  },
  {
    type: 'behavioral',
    weight: 2,
    patterns: [
      /tell me about a time/,
      /describe a situation/,
      /give (me )?an example of/,
      /how did you handle/,
      /have you ever (had to|dealt with)/,
      /walk me through a (challenge|conflict|failure|mistake)/,
      /(disagreement|conflict) with a (colleague|manager|teammate)/,
      /your (greatest|biggest) (strength|weakness|failure|achievement)/,
      /why (do you want|should we hire)/,
      /tell me about yourself/,
      // Added after UAT: "tell me about the difficulty... what went wrong
      // and how did you recover" was missed — "tell me about a time" alone
      // is too narrow a phrasing to require literally.
      /tell me about (the|a) (difficulty|difficult|challenge|mistake|failure|time)/,
      /what went wrong/,
      /how did you recover/,
      /you (handled|dealt with|managed) (a|an|the)/,
      /what did you learn from/,
      /biggest (challenge|obstacle) you/,
      /(a time|an occasion) (when|where) you/
    ]
  },
  {
    type: 'scenario',
    weight: 2,
    patterns: [
      /what would you do if/,
      /how would you approach/,
      /imagine (you|a situation)/,
      /\bsuppose\b/,
      /if you (had|were) to/,
      /how would you (prioritize|decide|handle)/,
      /design a (strategy|plan|process)/,
      // Added after UAT: broader "how would you roll this out / handle this
      // process" phrasings that aren't strictly system architecture.
      /how would you (roll out|introduce|migrate|manage)/,
      /what('s| is) your approach to/,
      /how do you decide (when|whether|which)/
    ]
  },
  {
    type: 'theoretical',
    weight: 1,
    patterns: [
      /what is/,
      /\bexplain\b/,
      /difference between/,
      /how does .* work/,
      /\bdefine\b/,
      /what are the (benefits|drawbacks|pros and cons)/,
      /when (would|should) you use/,
      // Theoretical no longer inherits the "nothing matched" fallback, so it
      // has to actually earn the match on its own vocabulary now.
      /what does .* mean/,
      /how is .* different/,
      /pros and cons of/,
      /what('s| is) the (purpose|point|idea) (of|behind)/,
      /can you (explain|walk me through) (how|what|why)/,
      /trade[- ]?offs? between/,
      /\bcompare\b .* (and|vs|versus)/,
      /how would you explain/
    ]
  }
]

export function detectQuestionType(question: string, enabledTypes: QuestionType[]): QuestionType | null {
  if (enabledTypes.length === 0) return null
  // Checked before scoring so it overrides false-positive rule matches.
  if (isGeneralQuestion(question)) return null

  const text = question.toLowerCase()
  let best: { type: QuestionType; score: number } | null = null

  for (const rule of RULES) {
    if (!enabledTypes.includes(rule.type)) continue
    let hits = 0
    for (const pattern of rule.patterns) {
      if (pattern.test(text)) hits += 1
    }
    if (hits === 0) continue
    const score = hits * rule.weight
    if (!best || score > best.score) {
      best = { type: rule.type, score }
    }
  }

  if (best) return best.type
  // No framework without POSITIVE evidence. This used to fall back to
  // 'theoretical', which meant every unmatched question — greetings, "any
  // questions for us?", career walkthroughs — was answered as rigid DEFC.
  // Under-applying a framework is a far cheaper failure than forcing one
  // onto a question that has no business having one.
  return null
}
