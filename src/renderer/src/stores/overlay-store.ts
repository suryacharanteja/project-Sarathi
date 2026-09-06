import { create } from 'zustand'
import type { AnswerCard, TranscriptMessage } from '@shared/transcript-types'

interface OverlayStore {
  transcript: TranscriptMessage[]
  partialText: { mic: string; system: string }
  sttStatus: { mic: string; system: string }
  cards: AnswerCard[]
  activeCardIndex: number
  autoAnswerOn: boolean
  questionDetected: boolean
  micLevel: number
  /** cardId currently armed to receive the next mic utterance as a voice
   *  follow-up instruction, or null when not armed. */
  voiceFollowUpCardId: string | null
  /** cardId currently armed to record a spoken "Query" about staged
   *  screenshots — independent of voiceFollowUpCardId on purpose. Reusing
   *  that field made this button's armed-state light up the card's separate,
   *  unrelated "Speak" chip too, and inherited its cancel-on-toggle-off
   *  behaviour (silently discarding instead of sending) — the exact bug that
   *  motivated splitting this out. Toggle-off HERE finalizes and sends,
   *  mirroring reCaptureCardId/interviewerQuestionCardId, not the silence-
   *  timer-based voiceFollowUpCardId. */
  screenshotQueryCardId: string | null
  /** Screenshots staged for the CURRENT screenshotQueryCardId arm cycle.
   *  Cleared on every finalize/cancel/timeout path so a stale value can
   *  never leak into a later, unrelated Query. */
  screenshotQueryScreenshots: string[] | null
  /** cardId currently armed to capture the interviewer repeating the
   *  question (system audio) and regenerate from it, or null when not armed. */
  reCaptureCardId: string | null
  /** cardId currently armed to capture the INTERVIEWER's next remark (system
   *  audio) as a cross-question/clarification, added as a follow-up on the
   *  same card — the mirror of voiceFollowUpCardId, which captures the
   *  CANDIDATE's own mic instead. Unlike reCaptureCardId, this never
   *  replaces the question — see finalizeInterviewerQuestion. */
  interviewerQuestionCardId: string | null
  /** Global fallback capture, not tied to any card: when armed, system-audio
   *  turns are buffered and, on disarm, unconditionally turned into a new
   *  answer card — bypassing the normal question-detection heuristics. Exists
   *  so a missed automatic capture is never a dead end even when no card is
   *  on screen to attach a per-card recovery action to. */
  manualCaptureArmed: boolean

  addTranscriptMessage: (message: TranscriptMessage) => void
  setPartialText: (source: 'mic' | 'system', text: string) => void
  setSttStatus: (source: 'mic' | 'system', status: string) => void
  addCard: (card: AnswerCard) => void
  updateCard: (id: string, patch: Partial<AnswerCard>) => void
  setActiveCardIndex: (index: number) => void
  nextCard: () => void
  prevCard: () => void
  setAutoAnswerOn: (on: boolean) => void
  setQuestionDetected: (detected: boolean) => void
  setMicLevel: (level: number) => void
  setVoiceFollowUpCardId: (cardId: string | null) => void
  setScreenshotQueryCardId: (cardId: string | null) => void
  setScreenshotQueryScreenshots: (screenshots: string[] | null) => void
  setReCaptureCardId: (cardId: string | null) => void
  setInterviewerQuestionCardId: (cardId: string | null) => void
  setManualCaptureArmed: (armed: boolean) => void
}

export const useOverlayStore = create<OverlayStore>((set, get) => ({
  transcript: [],
  partialText: { mic: '', system: '' },
  sttStatus: { mic: 'off', system: 'off' },
  cards: [],
  activeCardIndex: 0,
  autoAnswerOn: true,
  questionDetected: false,
  micLevel: 0,
  voiceFollowUpCardId: null,
  screenshotQueryCardId: null,
  screenshotQueryScreenshots: null,
  reCaptureCardId: null,
  interviewerQuestionCardId: null,
  manualCaptureArmed: false,

  addTranscriptMessage: (message) =>
    set((state) => ({ transcript: [...state.transcript.slice(-49), message] })),

  setPartialText: (source, text) =>
    set((state) => ({ partialText: { ...state.partialText, [source]: text } })),

  setSttStatus: (source, status) => set((state) => ({ sttStatus: { ...state.sttStatus, [source]: status } })),

  addCard: (card) =>
    set((state) => ({
      cards: [...state.cards, card],
      activeCardIndex: state.cards.length
    })),

  updateCard: (id, patch) =>
    set((state) => ({
      cards: state.cards.map((card) => (card.id === id ? { ...card, ...patch } : card))
    })),

  setActiveCardIndex: (index) =>
    set((state) => ({
      activeCardIndex: Math.max(0, Math.min(index, state.cards.length - 1))
    })),

  nextCard: () => {
    const { activeCardIndex, cards } = get()
    if (activeCardIndex < cards.length - 1) {
      set({ activeCardIndex: activeCardIndex + 1 })
    }
  },

  prevCard: () => {
    const { activeCardIndex } = get()
    if (activeCardIndex > 0) {
      set({ activeCardIndex: activeCardIndex - 1 })
    }
  },

  setAutoAnswerOn: (autoAnswerOn) => set({ autoAnswerOn }),
  setQuestionDetected: (questionDetected) => set({ questionDetected }),
  setMicLevel: (micLevel) => set({ micLevel }),
  setVoiceFollowUpCardId: (voiceFollowUpCardId) => set({ voiceFollowUpCardId }),
  setScreenshotQueryCardId: (screenshotQueryCardId) => set({ screenshotQueryCardId }),
  setScreenshotQueryScreenshots: (screenshotQueryScreenshots) => set({ screenshotQueryScreenshots }),
  setReCaptureCardId: (reCaptureCardId) => set({ reCaptureCardId }),
  setInterviewerQuestionCardId: (interviewerQuestionCardId) => set({ interviewerQuestionCardId }),
  setManualCaptureArmed: (manualCaptureArmed) => set({ manualCaptureArmed })
}))
