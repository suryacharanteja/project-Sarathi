import { useEffect, useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useOverlayStore } from '../../stores/overlay-store'
import { AnswerCardView } from './AnswerCardView'

export function AnswerCardStack(): React.JSX.Element {
  const cards = useOverlayStore((s) => s.cards)
  const activeCardIndex = useOverlayStore((s) => s.activeCardIndex)
  const nextCard = useOverlayStore((s) => s.nextCard)
  const prevCard = useOverlayStore((s) => s.prevCard)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (!e.ctrlKey) return
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        nextCard()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        prevCard()
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        scrollRef.current?.scrollBy({ top: -80, behavior: 'smooth' })
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        scrollRef.current?.scrollBy({ top: 80, behavior: 'smooth' })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [nextCard, prevCard])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [activeCardIndex])

  if (cards.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-neutral-500">
        No answers yet. Ask AI or wait for auto-answer to trigger.
      </div>
    )
  }

  const activeCard = cards[activeCardIndex]

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5">
        <button
          onClick={prevCard}
          disabled={activeCardIndex === 0}
          className="flex items-center gap-1 rounded-full bg-white/5 px-2 py-1 text-xs text-neutral-300 disabled:opacity-30"
        >
          <ChevronLeft size={12} /> Ctrl+←
        </button>
        <span className="text-xs text-neutral-500">
          {activeCardIndex + 1} / {cards.length}
        </span>
        <button
          onClick={nextCard}
          disabled={activeCardIndex === cards.length - 1}
          className="flex items-center gap-1 rounded-full bg-white/5 px-2 py-1 text-xs text-neutral-300 disabled:opacity-30"
        >
          Ctrl+→ <ChevronRight size={12} />
        </button>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <AnswerCardView card={activeCard} />
      </div>
    </div>
  )
}
