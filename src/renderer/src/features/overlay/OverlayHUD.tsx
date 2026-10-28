import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, PanelRightOpen, Pause, Play } from 'lucide-react'
import { QuestionDetectionToggle, TranscriptStrip } from './TranscriptStrip'
import { AnswerCardStack } from './AnswerCardStack'
import { AskAiBar } from './AskAiBar'
import { useLiveTranscription } from './useLiveTranscription'
import { useOverlayStore } from '../../stores/overlay-store'
import { usePrompterStore } from '../prompter/prompter-store'
import { SlideCarouselPanel } from '../slides/SlideCarouselPanel'
import { PdfViewerPanel } from '../viewer/PdfViewerPanel'
import { DocumentViewerPanel } from '../viewer/DocumentViewerPanel'
import { OverlayTopBar } from './OverlayTopBar'
import { ShortcutCheatsheet } from './ShortcutCheatsheet'
import { BookmarkRail } from './BookmarkRail'
import { initLocalShortcuts, onShortcutTriggered } from './local-shortcuts'

export function OverlayHUD({
  onHome,
  onMinimize,
  onClose
}: {
  onHome: () => void
  onMinimize: () => void
  onClose: () => void
}): React.JSX.Element {
  const { errors, micOn, toggleMic, systemAudioIssue, retrySystemAudio } = useLiveTranscription()
  const manualCaptureArmed = useOverlayStore((s) => s.manualCaptureArmed)
  const setManualCaptureArmed = useOverlayStore((s) => s.setManualCaptureArmed)
  const copilotCardCount = useOverlayStore((s) => s.cards.length)
  const questionDetected = useOverlayStore((s) => s.questionDetected)

  const {
    scriptText,
    scrollSpeed,
    fontSize,
    mirrorFlip,
    contentMode,
    pdfFilePath,
    docHtml,
    slides,
    currentSlideIndex,
    bookmarks,
    lessonDurationMinutes,
    setScrollSpeed,
    setFontSize,
    addBookmark
  } = usePrompterStore()
  const isCarousel = contentMode === 'carousel'
  const isPdf = contentMode === 'pdf' && !!pdfFilePath
  const isDocument = contentMode === 'document' && !!docHtml
  const usesTeleprompterScroll = !isCarousel && !isPdf

  const [paused, setPaused] = useState(false)
  const [showCheatsheet, setShowCheatsheet] = useState(false)
  const [scrollProgress, setScrollProgress] = useState(0)
  const [pdfPage, setPdfPage] = useState(1)
  const [pdfTotal, setPdfTotal] = useState(0)
  const [copilotExpanded, setCopilotExpanded] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const animFrameRef = useRef<number | null>(null)
  const pausedRef = useRef(paused)

  const micOnRef = useRef(micOn)
  const toggleMicRef = useRef(toggleMic)

  function setScrollPaused(next: boolean): void {
    pausedRef.current = next
    setPaused(next)
  }

  function toggleScrollPaused(): void {
    setScrollPaused(!pausedRef.current)
  }

  function scrollManually(direction: -1 | 1): void {
    setScrollPaused(true)
    const el = scrollRef.current
    if (!el) return
    el.scrollBy({
      top: direction * Math.max(el.clientHeight * 0.75, 120),
      behavior: 'smooth'
    })
  }

  useEffect(() => {
    micOnRef.current = micOn
    toggleMicRef.current = toggleMic
  }, [micOn, toggleMic])

  useEffect(() => { pausedRef.current = paused }, [paused])

  useEffect(() => {
    if (copilotCardCount > 0 || questionDetected || errors.system || errors.mic) setCopilotExpanded(true)
    else setCopilotExpanded(false)
  }, [copilotCardCount, questionDetected, errors.system, errors.mic])

  // Auto-scroll loop — px per frame scaled by scrollSpeed (1-10)
  useEffect(() => {
    if (!usesTeleprompterScroll) return
    const el = scrollRef.current
    if (!el) return
    const pxPerFrame = scrollSpeed * 0.4

    function tick(): void {
      if (!pausedRef.current && el) {
        el.scrollTop += pxPerFrame
      }
      animFrameRef.current = requestAnimationFrame(tick)
    }
    animFrameRef.current = requestAnimationFrame(tick)
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current) }
  }, [scrollSpeed, usesTeleprompterScroll])

  // Scroll-position progress for the top bar — polled rather than driven by
  // the rAF tick above, to avoid a React re-render on every animation frame.
  useEffect(() => {
    if (!usesTeleprompterScroll) {
      setScrollProgress(0)
      return
    }
    const interval = setInterval(() => {
      const el = scrollRef.current
      if (!el) return
      const max = el.scrollHeight - el.clientHeight
      setScrollProgress(max > 0 ? Math.min(1, el.scrollTop / max) : 0)
    }, 200)
    return () => clearInterval(interval)
  }, [usesTeleprompterScroll])

  // Spacebar: pause / resume scroll (teleprompter/doc only — carousel/PDF use arrow keys)
  useEffect(() => {
    if (!usesTeleprompterScroll) return
    function onKey(e: KeyboardEvent): void {
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault()
        toggleScrollPaused()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [usesTeleprompterScroll])

  // FR-07 shortcuts: cheatsheet toggle (all modes), font size (text modes,
  // PDF keeps +/- for its own zoom), scroll speed + bookmarks (teleprompter/doc).
  useEffect(() => {
    function jumpBookmark(direction: 1 | -1): void {
      const el = scrollRef.current
      if (!el || bookmarks.length === 0) return
      const current = el.scrollTop
      const sorted = [...bookmarks].sort((a, b) => a - b)
      const target =
        direction === 1
          ? sorted.find((pos) => pos > current + 1)
          : [...sorted].reverse().find((pos) => pos < current - 1)
      if (target !== undefined) el.scrollTo({ top: target, behavior: 'smooth' })
    }

    function onKey(e: KeyboardEvent): void {
      if (e.target !== document.body) return

      if (e.key === '?') {
        e.preventDefault()
        setShowCheatsheet((v) => !v)
        return
      }
      if (e.code === 'Escape') {
        if (showCheatsheet) setShowCheatsheet(false)
        return
      }
      if (!isPdf && (e.key === '+' || e.key === '=')) {
        e.preventDefault()
        setFontSize(Math.min(72, fontSize + 2))
        return
      }
      if (!isPdf && e.key === '-') {
        e.preventDefault()
        setFontSize(Math.max(16, fontSize - 2))
        return
      }
      if (!usesTeleprompterScroll) return
      if (e.shiftKey && e.code === 'ArrowUp') {
        e.preventDefault()
        setScrollSpeed(Math.min(10, scrollSpeed + 1))
      } else if (e.shiftKey && e.code === 'ArrowDown') {
        e.preventDefault()
        setScrollSpeed(Math.max(1, scrollSpeed - 1))
      } else if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
        e.preventDefault()
        scrollManually(e.code === 'ArrowDown' ? 1 : -1)
      } else if (e.key.toLowerCase() === 'b') {
        e.preventDefault()
        const el = scrollRef.current
        if (el) addBookmark(Math.round(el.scrollTop))
      } else if (e.key.toLowerCase() === 'j') {
        e.preventDefault()
        jumpBookmark(1)
      } else if (e.key.toLowerCase() === 'k') {
        e.preventDefault()
        jumpBookmark(-1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isPdf, usesTeleprompterScroll, fontSize, scrollSpeed, bookmarks, showCheatsheet, setFontSize, setScrollSpeed, addBookmark])

  useEffect(() => initLocalShortcuts(), [])

  useEffect(() => {
    return onShortcutTriggered(({ id }) => {
      if (id === 'manual-capture-toggle') {
        setManualCaptureArmed(!useOverlayStore.getState().manualCaptureArmed)
      }
    })
  }, [])

  useEffect(() => {
    return useOverlayStore.subscribe((state, prev) => {
      if (state.voiceFollowUpCardId && !prev.voiceFollowUpCardId && !micOnRef.current) {
        toggleMicRef.current()
      }
    })
  }, [])

  // Show AI panel when there are cards OR when errors occur


  let modeBadge = 'Scroll'
  let counterText = ''
  let progress = 0
  if (isCarousel) {
    modeBadge = 'Slides'
    counterText = slides.length > 0 ? `${currentSlideIndex + 1} / ${slides.length}` : ''
    progress = slides.length > 0 ? (currentSlideIndex + 1) / slides.length : 0
  } else if (isPdf) {
    modeBadge = 'PDF'
    counterText = pdfTotal > 0 ? `${pdfPage} / ${pdfTotal}` : ''
    progress = pdfTotal > 0 ? pdfPage / pdfTotal : 0
  } else if (isDocument) {
    modeBadge = 'Doc'
    counterText = `${Math.round(scrollProgress * 100)}%`
    progress = scrollProgress
  } else {
    counterText = `${Math.round(scrollProgress * 100)}%`
    progress = scrollProgress
  }
  const pauseIndicator = usesTeleprompterScroll ? (paused ? '⏸ paused' : '▶ scrolling') : null

  return (
    <div
      data-screen="presentation"
      className="elevation-0 relative flex h-full w-full overflow-hidden rounded-2xl border border-[var(--bg-edge)] text-[var(--text-hi)] shadow-2xl"
      // Inline, not the backdrop-blur-xl Tailwind class — see the
      // .elevation-3 comment in index.css; the bug affects any
      // backdrop-filter utility, not just this component's own class.
      style={{ backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' }}
    >

      {/* Teleprompter panel */}
      <div
        className="relative flex min-h-0 flex-col flex-1 min-w-0 border-r border-[var(--bg-edge)]"
        onWheel={usesTeleprompterScroll ? () => setScrollPaused(true) : undefined}
        onTouchMove={usesTeleprompterScroll ? () => setScrollPaused(true) : undefined}
      >
        <OverlayTopBar
          onHome={onHome}
          onMinimize={onMinimize}
          onClose={onClose}
          modeBadge={modeBadge}
          progress={progress}
          counterText={counterText}
          pauseIndicator={pauseIndicator}
          lessonDurationMinutes={lessonDurationMinutes}
        />

        {isCarousel ? (
          <SlideCarouselPanel mirrorFlip={mirrorFlip} fontSize={fontSize} />
        ) : isPdf ? (
          <PdfViewerPanel filePath={pdfFilePath as string} onProgress={(page, total) => { setPdfPage(page); setPdfTotal(total) }} />
        ) : isDocument ? (
          <DocumentViewerPanel ref={scrollRef} html={docHtml as string} fontSize={fontSize} mirrorFlip={mirrorFlip} />
        ) : (
          /* Script scroll area */
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto overflow-x-hidden px-8 py-6 select-none"
            style={{
              transform: mirrorFlip ? 'scaleX(-1)' : undefined,
              fontSize: `${fontSize}px`,
              lineHeight: 1.5,
              color: 'var(--text-hi)',
              fontFamily: '"Georgia", serif',
              scrollbarWidth: 'none'
            }}
          >
            <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {scriptText || (
                <span className="text-[var(--text-mid)] text-base italic">
                  No script loaded — go back to Setup and load a file.
                </span>
              )}
            </div>
            {/* Trailing blank space so the last line can scroll fully into view */}
            <div style={{ height: '60vh' }} />
          </div>
        )}

        {usesTeleprompterScroll && <BookmarkRail containerRef={scrollRef} bookmarks={bookmarks} />}
        {usesTeleprompterScroll && (
          <div
            role="group"
            aria-label="Teleprompter scrolling controls"
            className="pointer-events-none absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-[var(--bg-edge)] bg-[var(--bg-surface)] p-1 shadow-xl"
          >
            <button
              type="button"
              onClick={() => scrollManually(-1)}
              aria-label="Scroll up manually"
              title="Scroll up manually"
              className="pointer-events-auto flex min-h-12 min-w-12 items-center justify-center rounded-lg text-[var(--text-mid)] transition hover:bg-[var(--state-layer)] hover:text-[var(--text-hi)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
            >
              <ArrowUp size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={toggleScrollPaused}
              aria-label={paused ? 'Resume auto-scroll' : 'Pause auto-scroll'}
              aria-pressed={paused}
              title={paused ? 'Resume auto-scroll' : 'Pause auto-scroll'}
              className="pointer-events-auto flex min-h-12 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-[var(--text-hi)] transition hover:bg-[var(--state-layer)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
            >
              {paused ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}
              {paused ? 'Resume' : 'Pause'}
            </button>
            <button
              type="button"
              onClick={() => scrollManually(1)}
              aria-label="Scroll down manually"
              title="Scroll down manually"
              className="pointer-events-auto flex min-h-12 min-w-12 items-center justify-center rounded-lg text-[var(--text-mid)] transition hover:bg-[var(--state-layer)] hover:text-[var(--text-hi)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
            >
              <ArrowDown size={18} aria-hidden="true" />
            </button>
          </div>
        )}
        {showCheatsheet && <ShortcutCheatsheet onClose={() => setShowCheatsheet(false)} />}
      </div>

      {copilotExpanded ? (
        <div id="copilot-panel" data-panel="copilot" className="flex min-h-0 flex-col w-72 shrink-0">
          <TranscriptStrip
            micOn={micOn}
            onToggleMic={toggleMic}
            systemAudioIssue={systemAudioIssue}
            manualCaptureArmed={manualCaptureArmed}
            onToggleManualCapture={() => setManualCaptureArmed(!manualCaptureArmed)}
            onToggleCopilot={() => setCopilotExpanded(false)}
          />
          {(errors.system || errors.mic) && (
            <div className="flex items-center justify-between gap-2 border-b border-[var(--bg-edge)] bg-red-500/10 px-3 py-1.5">
              <div className="min-w-0 flex-1 space-y-0.5">
                {errors.system && <p className="text-xs text-[var(--danger)]">System: {errors.system}</p>}
                {errors.mic && <p className="text-xs text-[var(--danger)]">Mic: {errors.mic}</p>}
              </div>
              {systemAudioIssue && (
                <button
                  onClick={retrySystemAudio}
                  className="shrink-0 rounded-full bg-red-500/20 px-2 py-0.5 text-xs font-medium text-[var(--danger)] transition hover:bg-red-500/30"
                >
                  Retry
                </button>
              )}
            </div>
          )}
          <div className="flex-1 overflow-hidden">
            <AnswerCardStack />
          </div>
          <AskAiBar />
        </div>
      ) : (
        <div className="pointer-events-none absolute right-2 top-1/2 z-30 flex -translate-y-1/2 flex-col gap-1 rounded-xl border border-[var(--bg-edge)] bg-[var(--bg-surface)] p-1 shadow-xl">
          <div className="pointer-events-auto">
            <QuestionDetectionToggle />
          </div>
          <button
            type="button"
            onClick={() => setCopilotExpanded(true)}
            aria-label="Open co-pilot"
            aria-expanded={false}
            title={copilotCardCount > 0 ? `Open co-pilot (${copilotCardCount} answers)` : 'Open co-pilot'}
            className="pointer-events-auto icon-button"
          >
            <PanelRightOpen size={20} aria-hidden="true" />
            {copilotCardCount > 0 && (
              <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[10px] text-white">
                {copilotCardCount}
              </span>
            )}
          </button>
        </div>
      )}
    </div>
  )
}
