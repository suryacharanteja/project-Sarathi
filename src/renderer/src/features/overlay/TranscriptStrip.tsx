import { useEffect, useRef } from 'react'
import { Ear, MessageCircleQuestion, Mic, MicOff, PanelRightClose, Radio, Sparkles } from 'lucide-react'
import { useOverlayStore } from '../../stores/overlay-store'
import { Tooltip } from '../../components/ui/tooltip'

export function TranscriptStrip({
  micOn,
  onToggleMic,
  systemAudioIssue,
  manualCaptureArmed,
  onToggleManualCapture,
  onToggleCopilot
}: {
  micOn: boolean
  onToggleMic: () => void
  systemAudioIssue: boolean
  manualCaptureArmed: boolean
  onToggleManualCapture: () => void
  onToggleCopilot: () => void
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
      className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--bg-edge)] bg-[var(--state-layer)] px-3 py-2"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <Tooltip label={systemAudioIssue ? 'System audio is unavailable or no sound was detected' : `System audio: ${sttStatus.system}`}>
        <div className="flex items-center gap-1.5 text-[var(--text-mid)]">
          <Radio
            size={20}
            className={systemAudioIssue ? 'text-[var(--warning)]' : isListening ? 'text-[var(--positive)]' : undefined}
          />
        </div>
      </Tooltip>

      <div
        ref={scrollRef}
        className="min-w-0 flex-1 overflow-hidden text-sm leading-snug text-[var(--text-hi)]"
        style={{ flexBasis: 'calc(100% - 40px)', maxHeight: '2.8em' } as React.CSSProperties}
      >
        <span className="opacity-80">
          {liveText ||
            (systemAudioIssue
              ? 'Audio unavailable — see details below'
              : isConnecting
                ? 'Connecting…'
                : isListening
                  ? 'Listening…'
                  : 'Not listening')}
        </span>
      </div>

      {questionDetected && (
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-[var(--positive)]">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          Question detected
        </span>
      )}

      <QuestionDetectionToggle />

      {/* Icon-only, matching the mic button below: color state + a Tooltip
          on hover is already the established, sufficient pattern in this
          same toolbar — a permanent text pill here (and on Capture below)
          was squeezing the transcript region, the one flexible element in
          this row, toward zero width on a narrow window. */}
      <Tooltip label={autoAnswerOn ? 'Auto Answer: On — click to pause' : 'Auto Answer: Off — click to resume'}>
        <button
          onClick={() => setAutoAnswerOn(!autoAnswerOn)}
          aria-label="Auto answer" aria-pressed={autoAnswerOn}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          className={`icon-button transition ${
            autoAnswerOn ? 'bg-[var(--state-layer)] text-[var(--text-hi)]' : 'bg-[var(--state-layer)] text-[var(--text-mid)]'
          }`}
        >
          <Sparkles size={20} />
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
          aria-label="Capture a question" aria-pressed={manualCaptureArmed}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          className={`icon-button transition ${
            manualCaptureArmed ? 'animate-pulse bg-amber-500/25 text-[var(--warning)]' : 'bg-[var(--state-layer)] text-[var(--text-mid)]'
          }`}
        >
          <Ear size={20} />
        </button>
      </Tooltip>

      <Tooltip label={micOn ? 'Mic on — click to mute' : 'Mic off — click to enable'}>
        <button
          onClick={onToggleMic}
          aria-label="Microphone" aria-pressed={micOn}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          className={`icon-button transition ${
            micOn ? 'bg-[var(--state-layer)] text-[var(--positive)]' : 'bg-[var(--state-layer)] text-[var(--text-mid)]'
          }`}
        >
          {micOn ? <Mic size={20} /> : <MicOff size={20} />}
        </button>
      </Tooltip>

      <Tooltip label="Minimize co-pilot panel">
        <button
          type="button"
          onClick={onToggleCopilot}
          aria-label="Minimize co-pilot"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          className="icon-button"
        >
          <PanelRightClose size={20} />
        </button>
      </Tooltip>

    </div>
  )
}

export function QuestionDetectionToggle(): React.JSX.Element {
  const questionDetectionOn = useOverlayStore((s) => s.questionDetectionOn)
  const setQuestionDetectionOn = useOverlayStore((s) => s.setQuestionDetectionOn)

  return (
    <Tooltip label={questionDetectionOn ? 'Question detection: On — click to turn off' : 'Question detection: Off — click to turn on'}>
      <button
        type="button"
        onClick={() => setQuestionDetectionOn(!questionDetectionOn)}
        aria-label="Question detection"
        aria-pressed={questionDetectionOn}
        className={`icon-button transition ${
          questionDetectionOn ? 'bg-[var(--state-layer)] text-[var(--positive)]' : 'bg-[var(--state-layer)] text-[var(--text-mid)]'
        }`}
      >
        <MessageCircleQuestion size={20} aria-hidden="true" />
      </button>
    </Tooltip>
  )
}
