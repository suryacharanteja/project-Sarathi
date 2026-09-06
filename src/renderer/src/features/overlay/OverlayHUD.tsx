import { useEffect, useRef, useState } from 'react'
import { TranscriptStrip } from './TranscriptStrip'
import { AnswerCardStack } from './AnswerCardStack'
import { AskAiBar } from './AskAiBar'
import { useLiveTranscription } from './useLiveTranscription'
import { useOverlayStore } from '../../stores/overlay-store'
import { usePrompterStore } from '../prompter/prompter-store'
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
  const answerCards = useOverlayStore((s) => s.answerCards)

  const { scriptText, scrollSpeed, fontSize, mirrorFlip } = usePrompterStore()

  const [paused, setPaused] = useState(false)
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
  }, [scrollSpeed])

  // Spacebar: pause / resume scroll
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault()
        setPaused((p) => !p)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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

  return (
    <div className="flex h-full w-full overflow-hidden rounded-2xl border border-white/10 bg-neutral-950/95 text-neutral-100 shadow-2xl backdrop-blur-xl">

      {/* Teleprompter panel */}
      <div className="relative flex flex-col flex-1 min-w-0 border-r border-white/10">
        {/* Narrow top bar with nav controls */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/10 shrink-0">
          <button
            onClick={onHome}
            className="text-xs text-neutral-500 hover:text-neutral-300 transition"
            title="Back to setup"
          >
            ← Setup
          </button>
          <span className="text-xs text-neutral-600 select-none">
            {paused ? '⏸ paused' : '▶ scrolling'} · Space to toggle
          </span>
          <div className="flex gap-1">
            <button onClick={onMinimize} className="rounded px-2 py-0.5 text-xs text-neutral-500 hover:text-neutral-300 transition">—</button>
            <button onClick={onClose} className="rounded px-2 py-0.5 text-xs text-neutral-500 hover:text-red-400 transition">✕</button>
          </div>
        </div>

        {/* Script scroll area */}
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
