import { Moon, Sun } from 'lucide-react'
import { useThemeStore } from '../../stores/theme-store'
import { Tooltip } from './tooltip'

export function ThemeToggle(): React.JSX.Element {
  const { theme, toggleTheme } = useThemeStore()
  const label = `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`
  return (
    <Tooltip label={label}>
      <button type="button" className="icon-button" aria-label={label}
        aria-pressed={theme === 'dark'} data-testid="theme-toggle" onClick={toggleTheme}>
        {theme === 'dark' ? <Sun size={20} aria-hidden="true" /> : <Moon size={20} aria-hidden="true" />}
      </button>
    </Tooltip>
  )
}
