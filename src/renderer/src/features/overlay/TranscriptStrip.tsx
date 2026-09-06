import { useEffect, useRef } from 'react'
import { Ear, Home, Mic, MicOff, Minus, Radio, Sparkles, X } from 'lucide-react'
import { useOverlayStore } from '../../stores/overlay-store'
import { Tooltip } from '../../components/ui/tooltip'

export function TranscriptStrip({
  micOn,
  onToggleMic,
  onHome,
  onMinimize,
  onClose,
  systemAudioIssue,
  manualCaptureArmed,
  onToggleManualCapture
}: {
  micOn: boolean
  onToggleMic: () => void
  onHome: () => void
  onMinimize: () => void
  onClose: () => void
  systemAudioIssue: boolean
  manualCaptureArmed: boolean
  onToggleManualCapture: () => void
}): React.JSX.Element {
  const transcript = useOverlayStore((s) => s.transcript)
  const partialText = useOverlayStore((s) => s.partialText)
  const sttStatus = useOverlayStore((s) => s.sttStatus)
  const questionDetected = useOverlayStore((s) => s.questionDetected)
  const autoAnswerOn = useOverlayStore((s) => s.autoAnswerOn)
  const setAutoAnswerOn = useOverlayStore((s) => s.setAutoAnswerOn)
  const scrollRef = useRef<HTMLDivElement>(null)

  const liveText = [
    transcript.map((m) => m.text).join(' '),
    partialText.system,
    partialText.mic
  ]
    .filter(Boolean)
    .join(' ')

  useEffect(() => {
    // Vertical, not horizontal: liveText is the whole session's concatenated
    // transcript, so a static 2-line clamp would freeze on the FIRST two
    // lines forever. Scrolling to the bottom on every update is what
    // actually keeps the latest speech visible as it grows — the same
    // "always show the tail" intent the old horizontal auto-scroll had.
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [liveText])

  const isListening = sttStatus.system === 'listening' || sttStatus.mic === 'listening'
  const isConnecting = sttStatus.system === 'connecting' || sttStatus.mic === 'connecting'

  return (
    <div
      className="flex items-center gap-3 border-b border-white/10 bg-black/40 px-3 py-2"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <Tooltip label={systemAudioIssue ? 'System audio: connected but no sound detected' : `System audio: ${sttStatus.system}`}>
        <div className="flex items-center gap-1.5 text-neutral-400">
          <Radio
            size={14}
            className={systemAudioIssue ? 'text-amber-400' : isListening ? 'text-emerald-400' : undefined}
          />
        </div>
      </Tooltip>

      <div
        ref={scrollRef}
        className="min-w-0 flex-1 overflow-y-hidden text-sm leading-snug text-neutral-300"
        style={{ maxHeight: '2.8em' } as React.CSSProperties}
      >
        <span className="opacity-80">
          {liveText ||
            (systemAudioIssue
              ? 'No system audio detected…'
              : isConnecting
                ? 'Connecting…'
                : isListening
                  ? 'Listening…'
                  : 'Not listening')}
        </span>
      </div>

      {questionDetected && (
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          Question detected
        </span>
      )}

      {/* Icon-only, matching the mic button below: color state + a Tooltip
          on hover is already the established, sufficient pattern in this
          same toolbar — a permanent text pill here (and on Capture below)
          was squeezing the transcript region, the one flexible element in
          this row, toward zero width on a narrow window. */}
      <Tooltip label={autoAnswerOn ? 'Auto Answer: On — click to pause' : 'Auto Answer: Off — click to resume'}>
        <button
          onClick={() => setAutoAnswerOn(!autoAnswerOn)}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          className={`shrink-0 rounded-full p-1.5 transition ${
            autoAnswerOn ? 'bg-white/15 text-white' : 'bg-white/5 text-neutral-500'
          }`}
        >
          <Sparkles size={14} />
        </button>
      </Tooltip>

      {/* Icon-only + Tooltip, not a permanent label — this is the recovery
          path when auto-capture misses a question, and the mic button two
          slots over already proves icon+color+tooltip is discoverable
          enough in this toolbar without a persistent text pill. Armed state
          is still obvious at a glance via the pulse + color change alone.
          The shortcut is stated as focus-dependent because it genuinely is —
          local-shortcuts.ts only fires while Sarathi's own window has OS
          focus, so during a call (focus on the meeting window) clicking is
          the only thing that actually works. */}
      <Tooltip
        label={
          manualCaptureArmed
            ? 'Listening — click again when the question is finished. (Ctrl+Plus+A works only while Sarathi is focused.)'
            : "Question missed? Click to capture it manually. (Ctrl+Plus+A works only while Sarathi is focused.)"
        }
      >
        <button
          onClick={onToggleManualCapture}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          className={`shrink-0 rounded-full p-1.5 transition ${
            manualCaptureArmed ? 'animate-pulse bg-amber-500/25 text-amber-300' : 'bg-white/5 text-neutral-500'
          }`}
        >
          <Ear size={14} />
        </button>
      </Tooltip>

      <Tooltip label={micOn ? 'Mic on — click to mute' : 'Mic off — click to enable'}>
        <button
          onClick={onToggleMic}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          className={`shrink-0 rounded-full p-1.5 transition ${
            micOn ? 'bg-white/15 text-emerald-400' : 'bg-white/5 text-neutral-500'
          }`}
        >
          {micOn ? <Mic size={14} /> : <MicOff size={14} />}
        </button>
      </Tooltip>

      <div
        className="flex shrink-0 items-center gap-0.5 border-l border-white/10 pl-2"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <Tooltip label="Back to home">
          <button
            onClick={onHome}
            className="rounded-full p-1.5 text-neutral-400 transition hover:bg-white/10 hover:text-white"
          >
            <Home size={14} />
          </button>
        </Tooltip>
        <Tooltip label="Minimize to bubble">
          <button
            onClick={onMinimize}
            className="rounded-full p-1.5 text-neutral-400 transition hover:bg-white/10 hover:text-white"
          >
            <Minus size={14} />
          </button>
        </Tooltip>
        <Tooltip label="Close Sarathi">
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-neutral-400 transition hover:bg-red-500/20 hover:text-red-400"
          >
            <X size={14} />
          </button>
        </Tooltip>
      </div>
    </div>
  )
}
