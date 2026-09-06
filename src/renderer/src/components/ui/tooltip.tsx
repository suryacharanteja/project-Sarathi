import { useState, type ReactNode } from 'react'

/**
 * Replaces the native `title` attribute everywhere in this app. A native
 * title tooltip is rendered by Chromium as a separate top-level OS popup
 * (its own window on Windows) — NOT part of the overlay's own render
 * surface, so it is NOT covered by setContentProtection and can appear on a
 * screen the user is sharing even though the rest of the app is invisible.
 * This renders as ordinary page content inside the same window instead, so
 * it's covered by the exact same protection as everything else.
 */
export function Tooltip({
  label,
  children,
  side = 'bottom'
}: {
  label: string
  children: ReactNode
  side?: 'top' | 'bottom'
}): React.JSX.Element {
  const [visible, setVisible] = useState(false)

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && (
        <span
          role="tooltip"
          className={`pointer-events-none absolute left-1/2 z-50 w-max max-w-[220px] -translate-x-1/2 rounded-md border border-white/10 bg-neutral-950/95 px-2 py-1 text-[10px] leading-snug text-neutral-200 shadow-xl ${
            side === 'bottom' ? 'top-full mt-1.5' : 'bottom-full mb-1.5'
          }`}
        >
          {label}
        </span>
      )}
    </span>
  )
}
