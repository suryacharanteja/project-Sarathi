export const QUESTION_TYPES = ['behavioral', 'theoretical', 'scenario', 'coding', 'system-design'] as const
export type QuestionType = (typeof QUESTION_TYPES)[number]

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  behavioral: 'Behavioral',
  theoretical: 'Theoretical',
  scenario: 'Scenario',
  coding: 'Coding',
  'system-design': 'System Design'
}

/** Which structured framework each question type answers with — shown next
 *  to the label in the UI so the user knows what shape to expect. */
export const QUESTION_TYPE_FRAMEWORK_NAMES: Record<QuestionType, string> = {
  behavioral: 'STAR-L',
  theoretical: 'DEFC',
  scenario: 'SCOPE',
  coding: 'REACT',
  'system-design': 'REALM'
}

export function isQuestionType(value: unknown): value is QuestionType {
  return typeof value === 'string' && (QUESTION_TYPES as readonly string[]).includes(value)
}
