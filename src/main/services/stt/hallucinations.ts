/**
 * Whisper hallucinates stock phrases over silence and noise — this list and the
 * `isMeaningfulTranscript` test are taken from Skill Recorder
 * (`electron/narration/transcribe.ts`, MIT), where they were tuned against real
 * recordings. Endpointing means we only ever decode spans that already passed a
 * VAD, but a 2.5 s trailing pause is still enough audio for the model to invent
 * "Thanks for watching" — and a hallucinated turn here doesn't just look wrong,
 * it feeds the question detector and spawns a bogus answer card.
 */
const BOILERPLATE = new Set([
  'you',
  'thank you',
  'thanks',
  'thanks for watching',
  'thank you for watching',
  'please subscribe',
  'subtitles by the amara org community',
  'bye',
  'grazie',
  'grazie per aver guardato',
  'iscriviti al canale',
  'ciao',
  'merci',
  'merci d avoir regardé',
  'abonnez vous',
  'au revoir',
  'gracias',
  'gracias por ver',
  'suscríbete',
  'adiós'
])

export function isMeaningfulTranscript(text: string): boolean {
  if (text.length < 2) return false
  if (!/\p{L}/u.test(text)) return false
  const normalized = text
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
  return !BOILERPLATE.has(normalized)
}
