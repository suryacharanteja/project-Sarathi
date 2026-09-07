import { useEffect, useRef, useState } from 'react'
import { TranscriptStrip } from './TranscriptStrip'
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
  const answerCards = useOverlayStore((s) => s.cards)

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
  const scrollRef = useRef<HTMLDivElement>(null)
  const animFrameRef = useRef<number | null>(null)
  const pausedRef = useRef(paused)

  const micOnRef = useRef(micOn)
  const toggleMicRef = useRef(toggleMic)
  useEffect(() => {
    micOnRef.current = micOn
    toggleMicRef.current = toggleMic
  }, [micOn, toggleMic])

  useEffect(() => { pausedRef.current = paused }, [paused])

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
        setPaused((p) => !p)
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
  const showAiPanel = answerCards.length > 0 || errors.system || errors.mic || systemAudioIssue

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
    <div className="flex h-full w-full overflow-hidden rounded-2xl border border-white/10 bg-[var(--bg-base)] text-neutral-100 shadow-2xl backdrop-blur-xl">

      {/* Teleprompter panel */}
      <div className="relative flex flex-col flex-1 min-w-0 border-r border-white/10">
        <OverlayTopBar
          onHome={onHome}
          onMinimize={onMinimize}
          onClose={onClose}
          modeBadge={modeBadge}
          progress={progress}
          counterText={counterText}
          pauseIndicator={pauseIndicator}
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
              color: '#f5f5f5',
              fontFamily: '"Georgia", serif',
              scrollbarWidth: 'none'
            }}
          >
            <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {scriptText || (
                <span className="text-neutral-600 text-base italic">
                  No script loaded — go back to Setup and load a file.
                </span>
              )}
            </div>
            {/* Trailing blank space so the last line can scroll fully into view */}
            <div style={{ height: '60vh' }} />
          </div>
        )}

        {usesTeleprompterScroll && <BookmarkRail containerRef={scrollRef} bookmarks={bookmarks} />}
        {showCheatsheet && <ShortcutCheatsheet onClose={() => setShowCheatsheet(false)} />}
      </div>

      {/* AI Co-pilot panel — visible when there's content, or always shown as transcript strip */}
      <div className="flex flex-col w-72 shrink-0">
        <TranscriptStrip
          micOn={micOn}
          onToggleMic={toggleMic}
          onHome={onHome}
          onMinimize={onMinimize}
          onClose={onClose}
          systemAudioIssue={systemAudioIssue}
          manualCaptureArmed={manualCaptureArmed}
          onToggleManualCapture={() => setManualCaptureArmed(!manualCaptureArmed)}
        />
        {(errors.system || errors.mic) && (
          <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-red-500/10 px-3 py-1.5">
            <div className="min-w-0 flex-1 space-y-0.5">
              {errors.system && <p className="text-xs text-red-400">System: {errors.system}</p>}
              {errors.mic && <p className="text-xs text-red-400">Mic: {errors.mic}</p>}
            </div>
            {systemAudioIssue && (
              <button
                onClick={retrySystemAudio}
                className="shrink-0 rounded-full bg-red-500/20 px-2 py-0.5 text-xs font-medium text-red-300 transition hover:bg-red-500/30"
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
    </div>
  )
}
