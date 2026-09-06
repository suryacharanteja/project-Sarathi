const INTERROGATIVE_STARTERS = [
  'what',
  'how',
  'why',
  'when',
  'where',
  'who',
  'which',
  'can you',
  'could you',
  'would you',
  'do you',
  'did you',
  'have you',
  'are you',
  'is there',
  'tell me',
  'walk me through',
  'describe',
  'explain',
  'give me',
  'show me'
]

/**
 * Matched with startsWith() against each clause HEAD, so entries can be
 * multi-word to buy precision — same trick INTERROGATIVE_STARTERS already
 * uses for 'can you' / 'walk me through'.
 *
 * The data/SQL block was added after a real miss: "Identify distinct user
 * sessions... Assign a unique session_id to each group" produced no card at
 * all, because every verb here was a software-engineering one and the list
 * had no analytics vocabulary whatsoever. Purely additive — this function
 * returns true on ANY matching clause head, so extending the list can only
 * ever add captures, never remove one that works today.
 *
 * Ambiguous verbs are deliberately listed only in multi-word form: bare
 * 'find' would fire on "find out more about our benefits", bare 'select' on
 * "select a time that works". 'join'/'add'/'remove'/'check'/'update' are
 * excluded entirely — too common in ordinary interview conversation to be
 * safe at a clause head ("join the call at three").
 */
const IMPERATIVE_TASK_VERBS = [
  'write',
  'implement',
  'design',
  'build',
  'solve',
  'optimise',
  'optimize',
  'debug',
  'code',
  'create',
  'define',
  'compare',
  'list',
  // Data / SQL / analytics task verbs — unambiguous as a clause head
  'identify',
  'assign',
  'calculate',
  'compute',
  'determine',
  'extract',
  'derive',
  'aggregate',
  'partition',
  'rank',
  'classify',
  'deduplicate',
  'bucket',
  'flag',
  // 'name' alone matched ANY clause starting with the word "name" in any
  // sense ("Name called the retry" — garbled backchannel, not a prompt) —
  // restricted to the forms a real interview prompt actually uses.
  'name a',
  'name an',
  'name the',
  'name one',
  'name two',
  'name three',
  'name some',
  'name any',
  // Ambiguous alone — only safe in these specific forms
  'find the',
  'find all',
  'find every',
  'return the',
  'return all',
  'select the',
  'select all',
  'group the',
  'group by',
  'count the',
  'count how many'
]

const MIN_WORDS_FOR_QUESTION = 3

/**
 * Repair/backchannel remarks — "can you come again", "one more time", "why
 * not" — are grammatically question-shaped (interrogative pronoun + "?",
 * clears MIN_WORDS_FOR_QUESTION) but carry no answerable content. UAT showed
 * these being captured and answered with fully fabricated technical content:
 * "Can you come again?" produced a made-up career summary. The `?`-path
 * below does no semantic filtering at all — any question-mark text with 3+
 * words matches — so this is checked before it, matched against the WHOLE
 * normalized utterance (not a clause-head prefix), so a longer substantive
 * question that happens to start the same way ("can you reiterate the
 * constraints you mentioned...") is never excluded — only the short,
 * content-free form reduces to one of these exact bodies.
 */
const BACKCHANNEL_CORES = new Set([
  'can you come again',
  'could you come again',
  'come again',
  'can you repeat that',
  'can you repeat',
  'could you repeat that',
  'could you repeat',
  'can you say that again',
  'could you say that again',
  'say that again',
  'say again',
  'one more time',
  'can you reiterate this',
  'can you reiterate that',
  'can you reiterate',
  'could you reiterate',
  'can you rephrase that',
  'can you rephrase',
  'could you rephrase',
  'pardon',
  'pardon me',
  'sorry what',
  'sorry what was that',
  'why not'
])

// Acknowledgment words stripped before matching, so "Can you reiterate this?
// Okay." (the substance plus a trailing filler word) still normalizes to
// exactly "can you reiterate this".
const ACK_WORDS = new Set(['okay', 'ok', 'alright', 'yeah', 'yes', 'sure', 'right'])

function normalizeForBackchannel(text: string): string {
  return text
    .toLowerCase()
    .replace(/[?!]/g, '')
    .replace(/[.,]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => !ACK_WORDS.has(word))
    .join(' ')
    .trim()
}

function isBackchannelRemark(text: string): boolean {
  return BACKCHANNEL_CORES.has(normalizeForBackchannel(text))
}

// Words that essentially never end a complete English sentence — a spoken
// question/instruction that trails off on one of these is almost certainly
// mid-clause, not finished. This is the deterministic, zero-latency local
// signal (no network round trip, no ML model) for the exact failure pattern
// that splits one question into two: an interviewer pausing right after a
// conjunction/preposition/article/dangling-verb before continuing —
// "compare arrays and... [pause]... linked lists" is far more likely to be
// unfinished than "compare arrays and linked lists" is.
const DANGLING_TRAILING_WORDS = new Set([
  // conjunctions
  'and', 'or', 'but', 'so', 'because', 'that', 'which', 'who', 'whom',
  'if', 'when', 'while', 'since', 'unless', 'although', 'though', 'as',
  // prepositions
  'to', 'of', 'in', 'on', 'at', 'with', 'for', 'from', 'by', 'about',
  'into', 'onto', 'over', 'under', 'through', 'between', 'against', 'across',
  // articles / determiners
  'a', 'an', 'the', 'this', 'these', 'those', 'my', 'your', 'his', 'her',
  'its', 'our', 'their',
  // dangling auxiliary/modal verbs
  'is', 'are', 'was', 'were', 'be', 'being', 'been', 'will', 'would',
  'can', 'could', 'should', 'must', 'do', 'does', 'did', 'has', 'have', 'had'
])

// Filler words interviewers say before actually getting to the point ("So,
// uh, write a function that...", "Now let's move to a coding question, write
// a function that..."). Stripped from the head of each clause before
// checking for a signal word, so a transitional preamble doesn't push the
// real task verb out of startsWith() range.
const FILLER_LEADS = ['so', 'now', 'okay', 'ok', 'alright', 'well', 'um', 'umm', 'uh', 'uhh', 'right', 'also', 'and']

/**
 * Counts words that aren't filler ("so", "uh"...) — raw word count let a
 * filler-padded fragment like "So, uh, when?" (3 raw words, 1 real word)
 * clear the MIN_WORDS_FOR_QUESTION floor and get dispatched as if it were a
 * complete question, even though "when" alone has nothing to answer.
 */
export function countContentWords(text: string): number {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => !FILLER_LEADS.includes(word.toLowerCase().replace(/[^a-z]/g, '')))
    .length
}

function splitIntoClauses(text: string): string[] {
  return text
    .split(/[.!?;]+|,/g)
    .map((c) => c.trim())
    .filter((c) => c.length > 0)
}

function stripFillerLead(clause: string): string {
  const words = clause.split(/\s+/)
  let start = 0
  while (start < words.length && FILLER_LEADS.includes(words[start].toLowerCase().replace(/[^a-z]/g, ''))) {
    start += 1
  }
  return words.slice(start).join(' ')
}

// AssemblyAI homophone confusion: "write" is frequently mis-transcribed as
// "right" — a real UAT miss, confirmed on a fast, stable connection, so not
// a network issue. "write a function..." is typically flat/declarative in
// intonation and gets no trailing "?", so it depends entirely on matching
// the verb; the homophone swap makes it invisible. Bare 'right' is
// deliberately NOT added as a task verb — "that's right", "you're right",
// "right, so..." are extremely common filler (see FILLER_LEADS above, where
// 'right' is already treated as noise) and would reopen the exact
// backchannel false-positive class Round 27 fixed. Only these specific
// shapes, WITH a trailing space, so "right away/along/after/around" (common
// phrases where "right a..." would otherwise be a literal string prefix,
// e.g. "right a" is a prefix of "right away") can never match.
const RIGHT_HOMOPHONE_ALIASES = ['right a ', 'right an ', 'right the ', 'right some ', 'right code', 'right me a ', 'right us a ']
// Same FILLER_LEADS list minus 'right' itself — used only for the homophone
// check above, so a leading "So, right a function..." still resolves to
// "right a function..." without 'right' being stripped as filler first (the
// exact collision that made the plain, shared stripFillerLead() unusable
// here — it strips 'right' before this check would ever see it).
const FILLER_LEADS_EXCLUDING_RIGHT = FILLER_LEADS.filter((word) => word !== 'right')

function stripFillerLeadExcludingRight(clause: string): string {
  const words = clause.split(/\s+/)
  let start = 0
  while (start < words.length && FILLER_LEADS_EXCLUDING_RIGHT.includes(words[start].toLowerCase().replace(/[^a-z]/g, ''))) {
    start += 1
  }
  return words.slice(start).join(' ')
}

/**
 * Clause-based scan instead of a single startsWith() on the whole utterance.
 * Splitting on sentence punctuation/commas and stripping leading filler
 * words from each clause catches a signal word buried behind a transitional
 * preamble ("Now let's move to a coding question, write a function that
 * reverses a linked list" — the clause "write a function..." matches after
 * filler-stripping) without false-positiving on a signal word merely
 * appearing mid-clause as an ordinary verb/object ("I did not write anything
 * about that topic" has no clause boundary before "write", so it's correctly
 * not flagged — the check only ever looks at each clause's head, never its
 * middle).
 */
export function isLikelyQuestion(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.length === 0) return false
  if (isBackchannelRemark(trimmed)) return false

  const contentWordCount = countContentWords(trimmed)

  // A "?" anywhere in the text is a strong signal — but require at least 3
  // CONTENT words (fillers don't count) to avoid false positives on
  // fragments like "?", "huh?", or "So, uh, when?" (3 raw words, 1 real one).
  if (trimmed.includes('?') && contentWordCount >= MIN_WORDS_FOR_QUESTION) return true

  // Same floor applies to the starter/verb clause matches below. Without it, a
  // lone fragment like "How" — the whole buffer, if the interviewer paused
  // right after starting a sentence — satisfied startsWith('how') instantly
  // and got dispatched as a "complete" question with nothing to actually
  // answer. The floor is checked against the WHOLE buffer (the unit that
  // actually gets dispatched), not the individual clause, so a real question
  // still matches immediately once enough of it has arrived.
  if (contentWordCount < MIN_WORDS_FOR_QUESTION) return false

  for (const clause of splitIntoClauses(trimmed)) {
    const head = stripFillerLead(clause).toLowerCase()
    if (!head) continue
    if (INTERROGATIVE_STARTERS.some((starter) => head.startsWith(starter))) return true
    if (IMPERATIVE_TASK_VERBS.some((verb) => head.startsWith(verb))) return true
    // Checked separately, against a head stripped of every filler EXCEPT
    // 'right' — the standard stripFillerLead() above would remove 'right'
    // itself before this could ever match, since it's also a legitimate
    // filler word.
    const rightHead = `${stripFillerLeadExcludingRight(clause).toLowerCase()} `
    if (RIGHT_HOMOPHONE_ALIASES.some((alias) => rightHead.startsWith(alias))) return true
  }

  return false
}

/**
 * Fast, local, zero-network completeness check — see DANGLING_TRAILING_WORDS
 * above. Deliberately conservative: only flags "definitely not done" when
 * the very last word is one that essentially never ends a sentence. It says
 * nothing about the genuinely ambiguous middle ground (that's what the
 * slower LLM-based check in useLiveTranscription.ts is still for) — this
 * only ever catches the clear-cut case, instantly and for free.
 */
export function hasDanglingTrailingWord(text: string): boolean {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return false
  const last = words[words.length - 1].toLowerCase().replace(/[^a-z']/g, '')
  return DANGLING_TRAILING_WORDS.has(last)
}

// Devanagari, CJK, Hiragana/Katakana, Hangul, Arabic, Cyrillic. AssemblyAI's
// real-time streaming model is English-only — when fed a low-quality or
// silent audio segment, it can hallucinate plausible-looking text in one of
// these scripts rather than failing cleanly (a known failure mode of
// transformer ASR under poor SNR). Left unfiltered, that garbage was landing
// in the transcript and feeding the auto-answer question buffer, corrupting
// both the display and whatever got sent to the LLM.
const NON_LATIN_SCRIPT = /[ऀ-ॿ一-鿿぀-ヿ가-힯؀-ۿЀ-ӿ]/g

export function isLikelyGarbledTranscript(text: string): boolean {
  const letters = text.match(/[\p{L}]/gu)
  if (!letters || letters.length < 4) return false
  const nonLatinCount = (text.match(NON_LATIN_SCRIPT) ?? []).length
  return nonLatinCount / letters.length > 0.3
}

function normalizeForDedupe(text: string): string {
  return text.trim().toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ')
}

export function isDuplicateQuestion(candidate: string, recent: string[]): boolean {
  const normalizedCandidate = normalizeForDedupe(candidate)
  return recent.some((q) => {
    const normalizedRecent = normalizeForDedupe(q)
    if (normalizedCandidate === normalizedRecent) return true
    const shorter = Math.min(normalizedCandidate.length, normalizedRecent.length)
    const longer = Math.max(normalizedCandidate.length, normalizedRecent.length)
    return shorter > 20 && longer > 0 && shorter / longer > 0.8 && normalizedRecent.includes(normalizedCandidate.slice(0, shorter))
  })
}
