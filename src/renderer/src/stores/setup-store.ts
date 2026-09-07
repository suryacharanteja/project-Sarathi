import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const PERSONAS = ['webinar-host', 'teacher', 'speaker', 'meeting'] as const
export type Persona = (typeof PERSONAS)[number]

interface SetupStore {
  activePersona: Persona
  setActivePersona: (persona: Persona) => void
}

export const useSetupStore = create<SetupStore>()(
  persist(
    (set) => ({
      activePersona: 'webinar-host',
      setActivePersona: (persona) => set({ activePersona: persona })
    }),
    { name: 'sarathi-setup-store' }
  )
)
