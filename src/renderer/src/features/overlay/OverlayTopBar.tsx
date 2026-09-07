import { useEffect, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

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
  pauseIndicator
}: {
  onHome: () => void
  onMinimize: () => void
  onClose: () => void
  modeBadge: string
  progress: number
  counterText: string
  pauseIndicator: string | null
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

  return (
    <div className="shrink-0 border-b border-white/10">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <button
          onClick={onHome}
          className="rounded text-xs text-neutral-500 hover:text-neutral-300 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
          title="Back to setup"
        >
          ← Setup
        </button>
        <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-400">
          {modeBadge}
        </span>
        {counterText && <span className="text-xs text-neutral-500 select-none">{counterText}</span>}
        <div className="flex-1" />
        {pauseIndicator && <span className="text-xs text-neutral-600 select-none">{pauseIndicator}</span>}
        <span className="text-xs text-neutral-600 select-none" title="Session timer">
          ⏱ {formatElapsed(elapsed)}
        </span>
        <span className="text-xs text-neutral-600 select-none" title="Current time">
          🕐 {clock}
        </span>
        <button
          onClick={toggleCaptureVisibility}
          className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 ${
            visibleToCapture ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20' : 'text-neutral-500 hover:text-neutral-300'
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
        <div className="flex gap-1">
          <button onClick={onMinimize} className="rounded px-2 py-0.5 text-xs text-neutral-500 hover:text-neutral-300 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40">—</button>
          <button onClick={onClose} className="rounded px-2 py-0.5 text-xs text-neutral-500 hover:text-red-400 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--danger)]/40">✕</button>
        </div>
      </div>
      <div className="h-1 w-full bg-white/5">
        <div
          className="h-full bg-[var(--accent)] transition-all duration-300"
          style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
        />
      </div>
    </div>
  )
}
