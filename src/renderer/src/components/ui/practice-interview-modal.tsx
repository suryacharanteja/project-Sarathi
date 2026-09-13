import { useEffect, useRef, useState } from 'react'
import { X, Mic, Square, ChevronRight, Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import type { Profile } from '@shared/profile-types'
import { PRACTICE_QUESTIONS } from '@shared/practice-interview'
import { TextArea } from './field-shell'
import { createAudioCapture } from '../../features/audio/capture'

/**
 * Safety ceiling only — NOT the expected way to finish. A practice answer is
 * a real interview answer (30-90s), so the old 12s cut people off mid-sentence.
 * The user stops when they're done; this just guarantees the mic never stays
 * open forever if they walk away.
 */
const SPEAK_TIMEOUT_MS = 120000

/**
 * A dedicated, guided flow for capturing deliberate, curated answers instead
 * of scraping fragments of past live-interview transcripts — higher signal,
 * and the candidate can see exactly what data goes in, unlike the passive
 * "learn from past interviews" path. Reuses the exact mic-capture pattern
 * already proven in TranscriptionSettings.tsx's microphone test — same
 * `createAudioCapture` + sttStart/onSttFinal/onSttError sequence, no new
 * audio infrastructure needed.
 */
export function PracticeInterviewModal({
  profileId,
  profileName,
  onClose,
  onComplete
}: {
  profileId: string
  profileName: string
  onClose: () => void
  onComplete: (profile: Profile) => void
}): React.JSX.Element {
  const [index, setIndex] = useState(0)
  const [drafts, setDrafts] = useState<string[]>(() => PRACTICE_QUESTIONS.map(() => ''))
  /** Synchronous mirror of `drafts`. handleSubmit runs in the same tick as the
   *  stopRecording() that commits the last spoken answer, so reading React
   *  state there would submit a stale array and silently drop that answer. */
  const draftsRef = useRef<string[]>(PRACTICE_QUESTIONS.map(() => ''))
  const [recording, setRecording] = useState(false)
  const [recordError, setRecordError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [resultText, setResultText] = useState<string | null>(null)

  /** Live transcription shown while speaking, so it's visibly working. */
  const [livePreview, setLivePreview] = useState('')

  const captureRef = useRef<ReturnType<typeof createAudioCapture> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Mirrors `index` for the STT subscription, which is registered once with
   *  [] deps and would otherwise capture index=0 forever — speaking on
   *  question 3 wrote its text into question 1's box. */
  const indexRef = useRef(0)
  const recordingRef = useRef(false)
  /** ALL finalized turns for the current recording, not just the first. */
  const finalsRef = useRef<string[]>([])
  /** Latest in-flight partial — committed too, so a last sentence that never
   *  got finalized before the user pressed Stop is not silently lost. */
  const partialRef = useRef('')

  useEffect(() => {
    indexRef.current = index
  }, [index])

  useEffect(() => {
    const unsubPartial = window.sarathi.onSttPartial((event) => {
      if (event.source !== 'mic' || !recordingRef.current) return
      partialRef.current = event.text ?? ''
      setLivePreview([...finalsRef.current, partialRef.current].join(' ').trim())
    })
    const unsubFinal = window.sarathi.onSttFinal((event) => {
      if (event.source !== 'mic' || !recordingRef.current) return
      // Accumulate and KEEP RECORDING. Previously the first final ended the
      // whole session, truncating any answer longer than one spoken turn.
      if (event.text) finalsRef.current.push(event.text)
      partialRef.current = ''
      setLivePreview(finalsRef.current.join(' ').trim())
    })
    const unsubError = window.sarathi.onSttError((event) => {
      if (event.source !== 'mic' || !recordingRef.current) return
      // Still commit whatever was captured before the failure.
      stopRecording(event.error)
    })
    return () => {
      unsubPartial()
      unsubFinal()
      unsubError()
      stopCaptureQuietly()
      // Released only here, not on every stop — the instance is reused across
      // record cycles for the modal's lifetime (see getCapture).
      captureRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * One capture instance for the modal's whole lifetime, NOT one per click.
   * createAudioCapture() gives each instance its own serialization queue, so
   * ordering is only guaranteed within a single instance — with a fresh
   * instance per click, an old instance's queued stopMic (and its sttStop)
   * could land after a new instance's start and kill the fresh connection.
   */
  function getCapture(): ReturnType<typeof createAudioCapture> {
    if (!captureRef.current) captureRef.current = createAudioCapture()
    return captureRef.current
  }

  function stopCaptureQuietly(): void {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    captureRef.current?.stopMic().catch(() => {})
    // Load-bearing, not redundant: if getUserMedia rejects inside doStartMic
    // AFTER its sttStart already succeeded, runtime.mic.active stays false and
    // doStopMic early-returns without ever calling sttStop — leaving the
    // main-process socket open. stop() is safe to call twice.
    window.sarathi.sttStop('mic')
  }

  /**
   * Stops capture and COMMITS everything heard into the current question's
   * draft. The previous version passed `null` from the Stop button and from
   * the timeout, so the only text ever saved was a final that happened to
   * arrive mid-recording — pressing Stop threw the answer away.
   */
  function stopRecording(error?: string): void {
    if (!recordingRef.current) return
    recordingRef.current = false
    stopCaptureQuietly()
    setRecording(false)

    const spoken = [...finalsRef.current, partialRef.current].join(' ').replace(/\s+/g, ' ').trim()
    finalsRef.current = []
    partialRef.current = ''
    setLivePreview('')

    if (spoken) {
      // indexRef, not index — see the ref's declaration.
      const target = indexRef.current
      const next = [...draftsRef.current]
      next[target] = next[target] ? `${next[target]} ${spoken}` : spoken
      draftsRef.current = next
      setDrafts(next)
    }
    if (error) setRecordError(error)
  }

  async function handleSpeak(): Promise<void> {
    setRecordError(null)
    finalsRef.current = []
    partialRef.current = ''
    setLivePreview('')
    recordingRef.current = true
    setRecording(true)
    try {
      // NO explicit sttStart here — capture.startMic() already performs it
      // (see doStartMic in features/audio/capture.ts). Calling it here too
      // started the socket twice within milliseconds, and assemblyai.ts only
      // treats a re-start as a no-op once `streaming` is true, which is set
      // in ws.on('open'). During the connect window the second call instead
      // fell through to terminateQuietly() → ws.terminate() on a CONNECTING
      // socket, producing exactly "WebSocket was closed before the connection
      // was established". startMic() throws with the real reason on failure,
      // so error reporting is preserved by the catch below.
      await getCapture().startMic()
    } catch (err) {
      recordingRef.current = false
      setRecording(false)
      setRecordError(err instanceof Error ? err.message : 'Could not access the microphone.')
      stopCaptureQuietly()
      return
    }
    timeoutRef.current = setTimeout(() => stopRecording(), SPEAK_TIMEOUT_MS)
  }

  function handleStopSpeaking(): void {
    stopRecording()
  }

  function setDraft(text: string): void {
    const next = [...draftsRef.current]
    next[index] = text
    draftsRef.current = next
    setDrafts(next)
  }

  function goNext(): void {
    // Commit first — navigating away mid-recording used to discard the answer.
    stopRecording()
    if (index < PRACTICE_QUESTIONS.length - 1) {
      setIndex((i) => i + 1)
    } else {
      handleSubmit()
    }
  }

  function goBack(): void {
    stopRecording()
    if (index > 0) setIndex((i) => i - 1)
  }

  async function handleSubmit(): Promise<void> {
    // draftsRef, not drafts — see the ref's declaration.
    const answers = PRACTICE_QUESTIONS.map((question, i) => ({ question, answer: draftsRef.current[i] ?? '' }))
    const answered = answers.filter((a) => a.answer.trim().length > 0)
    if (answered.length === 0) {
      toast.error('Answer at least one question before finishing.')
      return
    }
    setSubmitting(true)
    try {
      const result = await window.sarathi.submitPracticeAnswers(profileId, answers)
      if (!result.ok || !result.profile) {
        toast.error(result.error ?? 'Failed to learn from your practice answers.')
        return
      }
      setResultText(result.profile.speakingStyleProfile)
      onComplete(result.profile)
    } finally {
      setSubmitting(false)
    }
  }

  const answeredCount = drafts.filter((d) => d.trim().length > 0).length

  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center bg-black/40"
      // Inline, not backdrop-blur-sm — see index.css's .elevation-3 comment.
      style={{ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
    >
      <div
        className="flex max-h-[85%] w-[90%] max-w-sm flex-col rounded-2xl border border-black/10 bg-white/95 p-4 shadow-2xl"
        style={{ backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' }}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-neutral-900">
            <Sparkles size={15} /> Practice & Learn My Style
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-neutral-500 hover:bg-black/5">
            <X size={16} />
          </button>
        </div>

        {resultText ? (
          <div className="space-y-3">
            <p className="text-sm text-neutral-700">
              Here's what Sarathi concluded about <span className="font-medium">{profileName}</span>'s speaking style
              from your practice answers:
            </p>
            <div className="max-h-56 overflow-y-auto rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs leading-relaxed text-emerald-900">
              {resultText}
            </div>
            <button
              onClick={onClose}
              className="w-full rounded-lg bg-neutral-900 py-2 text-sm font-medium text-white transition hover:bg-neutral-700"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-neutral-500">
              Question {index + 1} of {PRACTICE_QUESTIONS.length} · {answeredCount} answered
            </p>
            <p className="text-sm font-medium text-neutral-800">{PRACTICE_QUESTIONS[index]}</p>

            <TextArea
              rows={5}
              placeholder="Type your answer, or speak it below..."
              value={drafts[index]}
              onChange={(e) => setDraft(e.target.value)}
            />

            {/* Visible proof it's listening. Without this the mic looked dead
                even when transcription was working — nothing appeared until
                the recording was stopped and committed. */}
            {recording && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-2">
                <p className="mb-0.5 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-amber-700">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
                  Listening
                </p>
                <p className="text-xs leading-snug text-amber-900">
                  {livePreview || 'Start speaking — your words will appear here.'}
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={recording ? handleStopSpeaking : handleSpeak}
              className={`flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                recording ? 'bg-red-500/10 text-red-600 hover:bg-red-500/20' : 'bg-black/5 text-neutral-700 hover:bg-black/10'
              }`}
            >
              {recording ? <Square size={12} /> : <Mic size={12} />}
              {recording ? 'Stop speaking' : 'Speak this answer instead'}
            </button>
            {recordError && <p className="text-[11px] text-red-600">{recordError}</p>}

            <div className="flex gap-2 pt-1">
              <button
                onClick={goBack}
                disabled={index === 0 || submitting}
                className="flex-1 rounded-lg border border-black/10 py-2 text-sm text-neutral-600 hover:bg-black/5 disabled:opacity-40"
              >
                Back
              </button>
              <button
                onClick={goNext}
                disabled={submitting}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-neutral-900 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50"
              >
                {submitting ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : index < PRACTICE_QUESTIONS.length - 1 ? (
                  <>
                    Next <ChevronRight size={14} />
                  </>
                ) : (
                  'Finish & learn my style'
                )}
              </button>
            </div>
            <p className="text-center text-[11px] text-neutral-400">
              Skip any question by leaving it blank and pressing Next.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
