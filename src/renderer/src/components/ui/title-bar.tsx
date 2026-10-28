import { Home, Minus, Move, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { ThemeToggle } from './theme-toggle'
import { Tooltip } from './tooltip'
import sarathiIcon from '../../assets/sarathi-icon.png'

/**
 * Frameless windows (frame:false) have no native title bar to drag by.
 * The drag-region div below opts back into OS window dragging via
 * -webkit-app-region: drag; interactive children must opt out with
 * -webkit-app-region: no-drag or clicks won't reach them.
 */
export function TitleBar({
  children,
  onHome,
  onMinimize,
  onClose
}: {
  children?: ReactNode
  onHome?: () => void
  onMinimize?: () => void
  onClose?: () => void
}): React.JSX.Element {
  return (
    <div
      className="flex items-center justify-between border-b border-[var(--bg-edge)] px-3 py-2"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="flex items-center gap-2 font-semibold text-[var(--text-hi)]">
        <Tooltip label="Drag anywhere on this bar to move the window">
          <span
            className="flex items-center text-[var(--text-mid)]"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <Move size={14} />
          </span>
        </Tooltip>
        <img src={sarathiIcon} alt="" className="h-5 w-5 rounded-full" />
        <span>Sarathi</span>
      </div>
      <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {children}
        <ThemeToggle />
        {onHome && (
          <Tooltip label="Back to home">
            <button
              onClick={onHome}
              aria-label="Back to home"
              className="icon-button"
            >
              <Home size={20} />
            </button>
          </Tooltip>
        )}
        {onMinimize && (
          <Tooltip label="Minimize to bubble">
            <button
              onClick={onMinimize}
              aria-label="Minimize to bubble"
              className="icon-button"
            >
              <Minus size={20} />
            </button>
          </Tooltip>
        )}
        {onClose && (
          <Tooltip label="Close Sarathi">
            <button
              onClick={onClose}
              aria-label="Close Sarathi"
              className="icon-button"
            >
              <X size={20} />
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  )
}
