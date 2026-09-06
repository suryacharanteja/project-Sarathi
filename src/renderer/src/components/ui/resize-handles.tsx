import { useRef } from 'react'

interface DragState {
  edge: 'left' | 'right' | 'bottom'
  startMouseX: number
  startMouseY: number
  startWidth: number
  startHeight: number
  startX: number
  startY: number
  pendingFrame: number | null
}

/**
 * Replaces native edge-resize (see overlay.ts: resizable:false). Electron
 * draws the OS double-arrow resize cursor for a resizable frameless
 * window's non-client border — that's OS chrome outside the page, so no
 * CSS rule can suppress it. These are ordinary in-DOM elements instead,
 * so the app's own cursor:default rule (index.css) applies to them like
 * everything else, and dragging is driven entirely by our own mouse
 * tracking + IPC calls to window.setBounds.
 */
export function ResizeHandles(): React.JSX.Element {
  const dragRef = useRef<DragState | null>(null)

  function beginDrag(edge: DragState['edge'], e: React.MouseEvent): void {
    e.preventDefault()
    dragRef.current = {
      edge,
      startMouseX: e.screenX,
      startMouseY: e.screenY,
      startWidth: window.innerWidth,
      startHeight: window.innerHeight,
      startX: window.screenX,
      startY: window.screenY,
      pendingFrame: null
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  function onMouseMove(e: MouseEvent): void {
    const drag = dragRef.current
    if (!drag) return
    if (drag.pendingFrame !== null) cancelAnimationFrame(drag.pendingFrame)
    drag.pendingFrame = requestAnimationFrame(() => {
      const deltaX = e.screenX - drag.startMouseX
      const deltaY = e.screenY - drag.startMouseY

      if (drag.edge === 'right') {
        window.sarathi.resizeWindow({ width: Math.max(1, drag.startWidth + deltaX) })
      } else if (drag.edge === 'bottom') {
        window.sarathi.resizeWindow({ height: Math.max(1, drag.startHeight + deltaY) })
      } else {
        // Left edge: shrink/grow width from the left while keeping the
        // right edge anchored, matching normal OS resize behavior.
        const width = Math.max(1, drag.startWidth - deltaX)
        window.sarathi.resizeWindow({ x: drag.startX + (drag.startWidth - width), width })
      }
    })
  }

  function onMouseUp(): void {
    const drag = dragRef.current
    if (drag?.pendingFrame !== null && drag) cancelAnimationFrame(drag.pendingFrame)
    dragRef.current = null
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }

  const handleStyle = { WebkitAppRegion: 'no-drag' } as React.CSSProperties

  return (
    <>
      <div
        onMouseDown={(e) => beginDrag('left', e)}
        style={handleStyle}
        className="fixed left-0 top-0 z-[60] h-full w-3"
      />
      <div
        onMouseDown={(e) => beginDrag('right', e)}
        style={handleStyle}
        className="fixed right-0 top-0 z-[60] h-full w-3"
      />
      <div
        onMouseDown={(e) => beginDrag('bottom', e)}
        style={handleStyle}
        className="fixed bottom-0 left-0 z-[60] h-3 w-full"
      />
    </>
  )
}
