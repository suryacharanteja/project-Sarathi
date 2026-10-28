import { useEffect, useState } from 'react'
import { Eye, EyeOff, Home, Minus, X, Timer, Clock } from 'lucide-react'

import { ThemeToggle } from '../../components/ui/theme-toggle'

function formatElapsed(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

function formatClock(): string {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date())
}

export function OverlayTopBar({
  onHome,
  onMinimize,
  onClose,
  modeBadge,
  progress,
  counterText,
  pauseIndicator,
  lessonDurationMinutes
}: {
  onHome: () => void
  onMinimize: () => void
  onClose: () => void
  modeBadge: string
  progress: number
  counterText: string
  pauseIndicator: string | null
  /** Teacher's optional "Lesson Timer" (FR-01) — when set, the session
   *  timer counts down class-period time remaining instead of just
   *  counting up, warning as it runs low and again once past zero. */
  lessonDurationMinutes: number | null
}): React.JSX.Element {
  const [elapsed, setElapsed] = useState(0)
  const [clock, setClock] = useState(() => formatClock())
  // Defaults to hidden (stealth) — matches the window's own creation-time default.
  const [visibleToCapture, setVisibleToCapture] = useState(false)

  function toggleCaptureVisibility(): void {
    const next = !visibleToCapture
    setVisibleToCapture(next)
    window.sarathi.setScreenCaptureVisibility(next)
  }

  // Session timer — counts up from when this overlay mounted (Start Presenting)
  useEffect(() => {
    const start = Date.now()
    const interval = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(interval)
  }, [])

  // Clock only needs minute resolution, so a cheap 30s tick is enough
  useEffect(() => {
    const interval = setInterval(() => setClock(formatClock()), 30_000)
    return () => clearInterval(interval)
  }, [])

  const remainingSeconds = lessonDurationMinutes !== null ? lessonDurationMinutes * 60 - elapsed : null
  const isOvertime = remainingSeconds !== null && remainingSeconds < 0
  const isLessonWarning = remainingSeconds !== null && !isOvertime && remainingSeconds <= 300
  const timerColorClass = isOvertime ? 'text-[var(--danger)]' : isLessonWarning ? 'text-[var(--warning)]' : 'text-[var(--text-mid)]'
  const timerLabel =
    remainingSeconds !== null
      ? `${isOvertime ? '+' : ''}${formatElapsed(Math.abs(remainingSeconds))}`
      : formatElapsed(elapsed)
  const timerTitle =
    remainingSeconds !== null
      ? isOvertime
        ? 'Lesson timer — over the class period'
        : 'Lesson timer — time remaining'
      : 'Session timer'

  return (
    <div className="shrink-0 border-b border-[var(--bg-edge)]">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <button
          onClick={onHome}
          className="icon-button"
          aria-label="Back to setup" title="Back to setup"
        >
          <Home size={18} aria-hidden="true" /><span className="sr-only">Back to setup</span>
        </button>
        <ThemeToggle />
        {/* Negotiable info — shrinks/clips first so Setup/capture-toggle/
            minimize/close (below) never get pushed off-screen at the app's
            360px minimum width. min-w-0 is required: flex items refuse to
            shrink below their content's natural width otherwise. */}
        <div className="hidden sm:flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          <span className="shrink-0 rounded bg-[var(--state-layer)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--text-mid)]">
            {modeBadge}
          </span>
          {counterText && <span className="shrink-0 text-xs text-[var(--text-mid)] select-none">{counterText}</span>}
          <div className="flex-1" />
          {pauseIndicator && <span className="shrink-0 text-xs text-[var(--text-mid)] select-none">{pauseIndicator}</span>}
          <span className={`shrink-0 text-xs select-none ${timerColorClass}`} title={timerTitle}>
            <Timer size={14} className="inline mr-1" aria-hidden="true" />{timerLabel}
          </span>
          <span className="shrink-0 text-xs text-[var(--text-mid)] select-none" title="Current time">
            <Clock size={14} className="inline mr-1" aria-hidden="true" />{clock}
          </span>
        </div>
        <button
          onClick={toggleCaptureVisibility}
          aria-label={visibleToCapture ? "Hide from screen capture" : "Show in screen capture"}
          aria-pressed={visibleToCapture}
          className={`flex min-h-12 shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[10px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 ${
            visibleToCapture ? 'bg-amber-500/10 text-[var(--warning)] hover:bg-amber-500/20' : 'text-[var(--text-mid)] hover:text-[var(--text-hi)]'
          }`}
          title={
            visibleToCapture
              ? 'Visible in screenshots/screen share — click to hide again'
              : 'Hidden from screenshots/screen share — click to make visible'
          }
        >
          {visibleToCapture ? <Eye size={12} /> : <EyeOff size={12} />}
          {visibleToCapture ? 'Visible' : 'Hidden'}
        </button>
        <div className="flex shrink-0 gap-1">
          <button onClick={onMinimize} aria-label="Minimize to bubble" className="icon-button"><Minus size={20} /></button>
          <button onClick={onClose} aria-label="Close Sarathi" className="icon-button"><X size={20} /></button>
        </div>
      </div>
      <div className="h-1 w-full bg-[var(--state-layer)]">
        <div
          className="h-full bg-[var(--accent)] transition-all duration-300"
          style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
        />
      </div>
    </div>
  )
}
