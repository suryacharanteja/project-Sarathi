import { useEffect, useState, type RefObject } from 'react'

export function BookmarkRail({
  containerRef,
  bookmarks
}: {
  containerRef: RefObject<HTMLDivElement | null>
  bookmarks: number[]
}): React.JSX.Element | null {
  const [dims, setDims] = useState({ scrollHeight: 0, clientHeight: 0 })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    function measure(): void {
      if (!el) return
      setDims({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight })
    }
    measure()

    // ResizeObserver alone misses scrollHeight growth from content reflow
    // (font-size change, auto-scroll revealing more content) since the
    // container's own box size doesn't change — poll as a cheap fallback.
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    const interval = setInterval(measure, 1000)
    return () => {
      observer.disconnect()
      clearInterval(interval)
    }
  }, [containerRef, bookmarks.length])

  if (bookmarks.length === 0) return null

  const range = Math.max(1, dims.scrollHeight - dims.clientHeight)

  return (
    <div className="pointer-events-none absolute bottom-0 right-1 top-0 w-3">
      {bookmarks.map((pos) => (
        <div
          key={pos}
          className="absolute -translate-y-1/2 text-[10px] leading-none text-indigo-400"
          style={{ top: `${Math.min(100, Math.max(0, (pos / range) * 100))}%` }}
          title="Bookmark"
        >
          ◆
        </div>
      ))}
    </div>
  )
}
