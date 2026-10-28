import { create } from 'zustand'

export type Theme = 'light' | 'dark'
const storageKey = 'sarathi-theme'

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(storageKey)
    if (saved === 'light' || saved === 'dark') return saved
  } catch { /* Storage may be unavailable; switching still works in memory. */ }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
}

const theme = initialTheme()
applyTheme(theme)

export const useThemeStore = create<{ theme: Theme; toggleTheme: () => void }>((set) => ({
  theme,
  toggleTheme: () => set((state) => {
    const next = state.theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    try { localStorage.setItem(storageKey, next) } catch { /* In-memory preference remains usable. */ }
    return { theme: next }
  })
}))
