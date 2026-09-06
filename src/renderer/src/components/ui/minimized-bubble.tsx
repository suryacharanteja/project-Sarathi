import { useRef } from 'react'
import { Tooltip } from './tooltip'

/** Movement beyond this (px) turns a press into a drag instead of a click. */
const DRAG_THRESHOLD = 4

interface DragState {
  startScreenX: number
  startScreenY: number
  startWindowX: number
  startWindowY: number
  isDrag: boolean
  pendingFrame: number | null
}

export function MinimizedBubble({ onRestore }: { onRestore: () => void }): React.JSX.Element {
  const dragRef = useRef<DragState | null>(null)

  function handleMouseDown(e: React.MouseEvent): void {
    e.preventDefault()
    dragRef.current = {
      startScreenX: e.screenX,
      startScreenY: e.screenY,
      startWindowX: window.screenX,
      startWindowY: window.screenY,
      isDrag: false,
      pendingFrame: null
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  function onMouseMove(e: MouseEvent): void {
    const drag = dragRef.current
    if (!drag) return
    const deltaX = e.screenX - drag.startScreenX
    const deltaY = e.screenY - drag.startScreenY

    if (!drag.isDrag && Math.hypot(deltaX, deltaY) > DRAG_THRESHOLD) {
      drag.isDrag = true
    }
    if (!drag.isDrag) return

    if (drag.pendingFrame !== null) cancelAnimationFrame(drag.pendingFrame)
    drag.pendingFrame = requestAnimationFrame(() => {
      window.sarathi.resizeWindow({ x: drag.startWindowX + deltaX, y: drag.startWindowY + deltaY })
    })
  }

  function onMouseUp(): void {
    const drag = dragRef.current
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
    dragRef.current = null
    // Only a press that never crossed the drag threshold counts as a
    // click-to-restore — a real -webkit-app-region:drag button has its
    // click swallowed by the OS drag gesture before onClick ever fires,
    // which is why dragging is handled manually here instead.
    if (drag && !drag.isDrag) onRestore()
  }

  return (
    <Tooltip label="Click to expand · drag to move">
      <button
        onMouseDown={handleMouseDown}
        className="flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-neutral-950/95 text-2xl shadow-2xl backdrop-blur-xl transition hover:scale-105"
      >
        🦜
      </button>
    </Tooltip>
  )
}
