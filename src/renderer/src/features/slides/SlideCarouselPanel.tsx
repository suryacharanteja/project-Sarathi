import { useEffect } from 'react'
import { usePrompterStore } from '../prompter/prompter-store'

export function SlideCarouselPanel({
  mirrorFlip,
  fontSize
}: {
  mirrorFlip: boolean
  fontSize: number
}): React.JSX.Element {
  const { slides, currentSlideIndex, setCurrentSlideIndex } = usePrompterStore()
  const total = slides.length
  const current = slides[currentSlideIndex] ?? null

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.target !== document.body) return
      if (e.code === 'ArrowRight' || e.code === 'PageDown') {
        e.preventDefault()
        setCurrentSlideIndex(currentSlideIndex + 1)
      } else if (e.code === 'ArrowLeft' || e.code === 'PageUp') {
        e.preventDefault()
        setCurrentSlideIndex(currentSlideIndex - 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [currentSlideIndex, setCurrentSlideIndex])

  if (!current) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span className="text-base italic text-neutral-600">No slides loaded — go back to Setup and add slides.</span>
      </div>
    )
  }

  const progress = total > 0 ? ((currentSlideIndex + 1) / total) * 100 : 0

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <div
        className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-10 py-8 text-center select-none"
        style={{ transform: mirrorFlip ? 'scaleX(-1)' : undefined }}
      >
        <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-indigo-400">
          {current.title || 'Untitled'}
        </p>
        <div
          style={{
            fontSize: `${fontSize}px`,
            lineHeight: 1.5,
            fontFamily: '"Georgia", serif',
            color: '#f5f5f5',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word'
          }}
        >
          {current.body || <span className="text-base italic text-neutral-600">(empty slide)</span>}
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-white/10 px-4 py-2">
        <button
          onClick={() => setCurrentSlideIndex(currentSlideIndex - 1)}
          disabled={currentSlideIndex === 0}
          className="rounded px-2 py-1 text-xs text-neutral-400 transition hover:text-neutral-100 disabled:opacity-30 disabled:hover:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
        >
          ← Previous
        </button>
        <span className="select-none text-xs text-neutral-500">
          Slide {currentSlideIndex + 1} / {total}
        </span>
        <button
          onClick={() => setCurrentSlideIndex(currentSlideIndex + 1)}
          disabled={currentSlideIndex === total - 1}
          className="rounded px-2 py-1 text-xs text-neutral-400 transition hover:text-neutral-100 disabled:opacity-30 disabled:hover:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
        >
          Next →
        </button>
      </div>
      <div className="h-1 w-full shrink-0 bg-white/5">
        <div className="h-full bg-[var(--accent)] transition-all duration-300" style={{ width: `${progress}%` }} />
      </div>
    </div>
  )
}
