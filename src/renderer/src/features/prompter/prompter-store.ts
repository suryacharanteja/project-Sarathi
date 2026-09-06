import { create } from 'zustand'

interface PrompterState {
  scriptText: string
  scriptFileName: string | null
  scrollSpeed: number
  fontSize: number
  mirrorFlip: boolean
  aiListenerEnabled: boolean
  setScriptText: (text: string, fileName?: string) => void
  setScrollSpeed: (v: number) => void
  setFontSize: (v: number) => void
  setMirrorFlip: (v: boolean) => void
  setAiListenerEnabled: (v: boolean) => void
}

export const usePrompterStore = create<PrompterState>((set) => ({
  scriptText: '',
  scriptFileName: null,
  scrollSpeed: 3,
  fontSize: 32,
  mirrorFlip: false,
  aiListenerEnabled: true,
  setScriptText: (text, fileName) => set({ scriptText: text, scriptFileName: fileName ?? null }),
  setScrollSpeed: (v) => set({ scrollSpeed: v }),
  setFontSize: (v) => set({ fontSize: v }),
  setMirrorFlip: (v) => set({ mirrorFlip: v }),
  setAiListenerEnabled: (v) => set({ aiListenerEnabled: v })
}))
