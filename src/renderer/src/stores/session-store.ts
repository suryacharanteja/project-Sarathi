import { create } from 'zustand'
import {
  type CreateSessionForm,
  type SessionType,
  type AnswerPreferences,
  defaultCreateSessionForm
} from '@shared/session-types'

interface SessionStore {
  form: CreateSessionForm
  /** Id of the currently active session (set once createSession succeeds),
   *  used to mirror finalized transcript messages to disk when
   *  form.saveTranscript is on — see useLiveTranscription.ts. */
  sessionId: string | null
  setSessionType: (type: SessionType) => void
  setField: <K extends keyof CreateSessionForm>(key: K, value: CreateSessionForm[K]) => void
  setAnswerPreference: <K extends keyof AnswerPreferences>(key: K, value: AnswerPreferences[K]) => void
  setSessionId: (sessionId: string | null) => void
  reset: () => void
}

export const useSessionStore = create<SessionStore>((set) => ({
  form: defaultCreateSessionForm,
  sessionId: null,
  setSessionType: (sessionType) => set((state) => ({ form: { ...state.form, sessionType } })),
  setField: (key, value) => set((state) => ({ form: { ...state.form, [key]: value } })),
  setAnswerPreference: (key, value) =>
    set((state) => ({
      form: { ...state.form, answerPreferences: { ...state.form.answerPreferences, [key]: value } }
    })),
  setSessionId: (sessionId) => set({ sessionId }),
  reset: () => set({ form: defaultCreateSessionForm, sessionId: null })
}))
