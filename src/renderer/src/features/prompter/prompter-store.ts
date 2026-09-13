import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ContentMode = 'teleprompter' | 'carousel' | 'pdf' | 'document'

export interface Slide {
  id: string
  title: string
  body: string
}

interface PrompterState {
  scriptText: string
  scriptFileName: string | null
  scrollSpeed: number
  fontSize: number
  mirrorFlip: boolean
  aiListenerEnabled: boolean
  contentMode: ContentMode
  slides: Slide[]
  currentSlideIndex: number
  bookmarks: number[]
  pdfFilePath: string | null
  docHtml: string | null
  /** Teacher persona's "Lesson Timer" (FR-01) — null means disabled. When
   *  set, the overlay counts down instead of just counting up, warning as
   *  the class period runs low or over. */
  lessonDurationMinutes: number | null
  setScriptText: (text: string, fileName?: string) => void
  setScrollSpeed: (v: number) => void
  setFontSize: (v: number) => void
  setMirrorFlip: (v: boolean) => void
  setAiListenerEnabled: (v: boolean) => void
  setContentMode: (mode: ContentMode) => void
  setSlides: (slides: Slide[]) => void
  addSlide: (slide: Slide) => void
  updateSlide: (id: string, patch: Partial<Slide>) => void
  removeSlide: (id: string) => void
  reorderSlide: (fromIndex: number, toIndex: number) => void
  setCurrentSlideIndex: (index: number) => void
  addBookmark: (position: number) => void
  clearBookmarks: () => void
  setPdfFilePath: (path: string | null) => void
  setDocHtml: (html: string | null) => void
  setLessonDurationMinutes: (minutes: number | null) => void
}

export const usePrompterStore = create<PrompterState>()(
  persist(
    (set) => ({
  scriptText: '',
  scriptFileName: null,
  scrollSpeed: 3,
  fontSize: 32,
  mirrorFlip: false,
  aiListenerEnabled: true,
  contentMode: 'teleprompter',
  slides: [],
  currentSlideIndex: 0,
  bookmarks: [],
  pdfFilePath: null,
  docHtml: null,
  lessonDurationMinutes: null,

  setScriptText: (text, fileName) =>
    set({ scriptText: text, scriptFileName: fileName ?? null, bookmarks: [] }),
  setScrollSpeed: (v) => set({ scrollSpeed: v }),
  setFontSize: (v) => set({ fontSize: v }),
  setMirrorFlip: (v) => set({ mirrorFlip: v }),
  setAiListenerEnabled: (v) => set({ aiListenerEnabled: v }),

  setContentMode: (mode) => set({ contentMode: mode }),

  setSlides: (slides) => set({ slides, currentSlideIndex: 0 }),
  addSlide: (slide) => set((state) => ({ slides: [...state.slides, slide] })),
  updateSlide: (id, patch) =>
    set((state) => ({
      slides: state.slides.map((slide) => (slide.id === id ? { ...slide, ...patch } : slide))
    })),
  removeSlide: (id) =>
    set((state) => {
      const slides = state.slides.filter((slide) => slide.id !== id)
      return { slides, currentSlideIndex: Math.min(state.currentSlideIndex, Math.max(0, slides.length - 1)) }
    }),
  reorderSlide: (fromIndex, toIndex) =>
    set((state) => {
      const slides = [...state.slides]
      const [moved] = slides.splice(fromIndex, 1)
      slides.splice(toIndex, 0, moved)
      return { slides }
    }),
  setCurrentSlideIndex: (index) =>
    set((state) => ({
      currentSlideIndex: Math.max(0, Math.min(index, state.slides.length - 1))
    })),

  addBookmark: (position) => set((state) => ({ bookmarks: [...state.bookmarks, position].sort((a, b) => a - b) })),
  clearBookmarks: () => set({ bookmarks: [] }),

  setPdfFilePath: (path) => set({ pdfFilePath: path }),
  setDocHtml: (html) => set({ docHtml: html }),
  setLessonDurationMinutes: (minutes) => set({ lessonDurationMinutes: minutes })
    }),
    {
      name: 'sarathi-prompter-draft',
      // Only content worth protecting from an accidental close/crash, plus
      // cheap preference settings. Deliberately excludes session-specific
      // state (contentMode, currentSlideIndex, bookmarks, pdfFilePath,
      // docHtml, lessonDurationMinutes) — a pdfFilePath restored from a
      // previous launch could point at a file that no longer exists, and
      // the rest is meaningless without an active presenting session.
      partialize: (state) => ({
        scriptText: state.scriptText,
        scriptFileName: state.scriptFileName,
        slides: state.slides,
        scrollSpeed: state.scrollSpeed,
        fontSize: state.fontSize,
        mirrorFlip: state.mirrorFlip,
        aiListenerEnabled: state.aiListenerEnabled
      })
    }
  )
)
