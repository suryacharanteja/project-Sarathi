import { useEffect, useState } from 'react'
import {
  MessageCircle,
  Star,
  ListChecks,
  Code2,
  Lightbulb,
  Clock,
  Database,
  Copy,
  Check,
  Plus,
  Mic,
  Repeat,
  Square,
  Camera,
  X,
  Layers
} from 'lucide-react'
import { toast } from 'sonner'
import type { AnswerCard, FollowUpEntry } from '@shared/transcript-types'
import type { ShortcutId } from '@shared/ipc-contract'
import { QUESTION_TYPE_LABELS, QUESTION_TYPE_FRAMEWORK_NAMES, type QuestionType } from '@shared/question-frameworks'
import { MarkdownLite } from './MarkdownLite'
import { useSessionStore } from '../../stores/session-store'
import { useOverlayStore } from '../../stores/overlay-store'
import { Tooltip } from '../../components/ui/tooltip'
import { reAskCard, askFollowUp } from './ask-ai'
import { onShortcutTriggered } from './local-shortcuts'

/**
 * No free-text box here on purpose: typing a sentence into a floating window
 * mid-interview is a visible behavioral tell even though the overlay's
 * content itself is hidden from screen capture. These canned asks cover the
 * realistic set of things someone wants appended, each reachable via a
 * single click OR a silent global shortcut that needs no mouse movement away
 * from the shared coding editor at all. Anything open-ended goes through
 * voice instead (the Speak chip below) rather than typing.
 */
/**
 * Pseudocode has two legitimate shapes, and which one is right depends
 * entirely on the question. The previous single template described an
 * ALGORITHM and was applied to every question type — so a strategy question
 * ("how would you handle 0.1% fraud rate?") came back as a fake function
 * signature with invented parameters, and the real substance (SMOTE vs class
 * weighting, PR-AUC, threshold tuning) got laundered away into meaningless
 * ALL_CAPS macros like REMOVE_LEAKAGE_AND_BAD_ROWS(). The model was obeying
 * us exactly; the template was simply wrong for four of the five types.
 */
const PSEUDOCODE_COMMON = `Do NOT use real syntax from any language: no semicolons, no curly braces, no language keywords like def/function/int/let/var, no "==" or "&&". Put this in the CODE section with language "pseudocode".`

/** Real algorithms: CAPS control flow is a recognised textbook/exam style. */
const PSEUDOCODE_ALGORITHMIC = `Give the solution as industry-standard algorithmic pseudocode — NOT real code, and not vague prose. Follow this exact convention:
- Start with a one-line comment stating the goal (e.g. "// Reverses a singly linked list in place").
- Only add a NAME(params) header line if the question actually describes a function; otherwise start straight at the steps.
- Use CAPITALIZED keywords for control flow and I/O: IF, ELSE IF, ELSE, WHILE, FOR, RETURN, PRINT.
- Write assignments plainly: "prev = NULL", never "SET prev = NULL". There is no SET keyword.
- Indent nested blocks consistently (one level per block) so the structure is visible at a glance.
- Use short, meaningful variable names — no single-letter names unless conventional (i, j for loop counters).
- Keep it complete and finite — every branch and loop must terminate, no dangling steps.
- Keep it SHORT — the candidate has to write this out live. Add a brief comment on the 1-2 key steps so they can explain the logic aloud as they write it.
- ${PSEUDOCODE_COMMON}`

/** Strategy/design/concept questions: the named technique IS the answer. */
const PSEUDOCODE_PIPELINE = `Give the solution as a numbered execution pipeline — the concrete steps you would actually carry out, in order. This question is not an algorithm, so do NOT invent a function signature for it. Follow this exact convention:
- Start with a one-line comment stating the goal (e.g. "// Handle 0.1% fraud rate without wrecking precision").
- Number the top-level steps 1., 2., 3. ... and indent sub-points beneath them with "- ".
- Name the REAL techniques, tools, metrics and parameters at every step — e.g. "class_weight='balanced'", "SMOTE (train split only)", "PR-AUC", "time-based split". The specific named technique IS the answer.
- NEVER invent an ALL_CAPS macro name as a stand-in for a concept (no DO_THE_THING(data), no REMOVE_BAD_ROWS(data)) — write what the step actually does, concretely.
- Where a real choice exists, state the options and which you'd pick, briefly.
- Call out what NOT to do when it's a common trap (e.g. "NOT accuracy — misleading at 0.1% base rate").
- No function header, no parameter list, no SET keyword.
- ${PSEUDOCODE_COMMON}`

/**
 * `undefined` = frameworks disabled in Answer Preferences, or nothing
 * detected. Falling back to the algorithmic form is what caused this bug, so
 * hand the model both shapes plus the selection rule instead.
 */
function pseudocodeInstruction(questionType?: QuestionType): string {
  if (questionType === 'coding') return PSEUDOCODE_ALGORITHMIC
  if (questionType) return PSEUDOCODE_PIPELINE
  return `${PSEUDOCODE_ALGORITHMIC}

BUT if this question is not a concrete algorithm/data-structure problem (e.g. it asks how you'd approach, design, choose between, or execute something), ignore the convention above and use this one instead:

${PSEUDOCODE_PIPELINE}`
}

/** A function instruction is resolved against the card's detected question
 *  type at send time — only Pseudocode needs this; the rest are literals. */
type ChipInstruction = string | ((questionType?: QuestionType) => string)

function resolveInstruction(instruction: ChipInstruction, questionType?: QuestionType): string {
  return typeof instruction === 'function' ? instruction(questionType) : instruction
}

const FOLLOW_UP_CHIPS: { label: string; instruction: ChipInstruction; shortcutId: ShortcutId; hint: string }[] = [
  {
    label: '+ Code',
    instruction:
      'Add the code for this. The candidate has to TYPE this live in an interview, so give the shortest correct solution — the optimal approach, but no helper classes, no extra abstraction, and no imports or boilerplate unless genuinely required to run. Include 1-2 brief comments marking the key steps so they can explain what they are writing as they type it.',
    shortcutId: 'follow-up-code',
    hint: 'Ctrl+Plus+C'
  },
  {
    label: '+ Pseudocode',
    instruction: pseudocodeInstruction,
    shortcutId: 'follow-up-pseudocode',
    hint: 'Ctrl+Plus+F'
  },
  {
    label: '+ Complexity',
    instruction: 'Add the time and space complexity for this.',
    shortcutId: 'follow-up-complexity',
    hint: 'Ctrl+Plus+Z'
  }
]

const QUESTION_TYPE_ICONS: Record<QuestionType, React.JSX.Element> = {
  behavioral: <Star size={10} />,
  theoretical: <Lightbulb size={10} />,
  scenario: <ListChecks size={10} />,
  coding: <Code2 size={10} />,
  'system-design': <Layers size={10} />
}

interface AnswerBody {
  answer: string
  keySteps?: string[]
  code?: { language: string; content: string }
  explanation?: string
  timeComplexity?: string
  spaceComplexity?: string
  /** Only present on the primary card (never on follow-up entries, which
   *  don't use the framework sentinel format) — see answer-parser.ts. */
  frameworkSections?: { label: string; body: string }[]
}

export function AnswerCardView({ card }: { card: AnswerCard }): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const [editingQuestion, setEditingQuestion] = useState(false)
  const [questionDraft, setQuestionDraft] = useState(card.question)
  const [followUpBusy, setFollowUpBusy] = useState(false)
  const [stagedScreenshots, setStagedScreenshots] = useState<string[]>([])
  const voiceFollowUpCardId = useOverlayStore((s) => s.voiceFollowUpCardId)
  const setVoiceFollowUpCardId = useOverlayStore((s) => s.setVoiceFollowUpCardId)
  const reCaptureCardId = useOverlayStore((s) => s.reCaptureCardId)
  const setReCaptureCardId = useOverlayStore((s) => s.setReCaptureCardId)
  const interviewerQuestionCardId = useOverlayStore((s) => s.interviewerQuestionCardId)
  const setInterviewerQuestionCardId = useOverlayStore((s) => s.setInterviewerQuestionCardId)
  const screenshotQueryCardId = useOverlayStore((s) => s.screenshotQueryCardId)
  const setScreenshotQueryCardId = useOverlayStore((s) => s.setScreenshotQueryCardId)
  const setScreenshotQueryScreenshots = useOverlayStore((s) => s.setScreenshotQueryScreenshots)
  const micStatus = useOverlayStore((s) => s.sttStatus.mic)
  const systemStatus = useOverlayStore((s) => s.sttStatus.system)

  const busy = card.status === 'streaming' || followUpBusy
  const voiceArmedForThisCard = voiceFollowUpCardId === card.id
  const reCaptureArmedForThisCard = reCaptureCardId === card.id
  const interviewerQuestionArmedForThisCard = interviewerQuestionCardId === card.id
  const screenshotQueryArmedForThisCard = screenshotQueryCardId === card.id
  const micReady = micStatus === 'listening'
  const systemReady = systemStatus === 'listening'

  async function sendFollowUp(instruction: string): Promise<void> {
    if (!instruction.trim() || busy) return
    setFollowUpBusy(true)
    await askFollowUp(card.id, instruction.trim(), useSessionStore.getState().form)
    setFollowUpBusy(false)
  }

  function toggleVoiceFollowUp(): void {
    if (busy) return
    setVoiceFollowUpCardId(voiceArmedForThisCard ? null : card.id)
  }

  function toggleReCapture(): void {
    if (busy) return
    setReCaptureCardId(reCaptureArmedForThisCard ? null : card.id)
  }

  // Mirrors toggleVoiceFollowUp/toggleReCapture exactly, just arming the
  // separate interviewer-question mechanism instead — see
  // useLiveTranscription.ts's finalizeInterviewerQuestion for why this is a
  // follow-up (askFollowUp) rather than a replacement (reAskCard).
  function toggleInterviewerQuestion(): void {
    if (busy) return
    setInterviewerQuestionCardId(interviewerQuestionArmedForThisCard ? null : card.id)
  }

  // AnswerCardStack only ever mounts the currently-active card, so leaving
  // this card (navigating away, or a new question becoming active) unmounts
  // it — but reCaptureCardId/voiceFollowUpCardId live in the GLOBAL store and
  // had no cleanup tied to that. Arming Re-listen and then moving on without
  // explicitly disarming left it pointed at this now-invisible card for up to
  // RECAPTURE_MAX_ARM_MS/VOICE_FOLLOWUP_ARM_TIMEOUT_MS (useLiveTranscription.ts)
  // — during which EVERY system-audio transcript was silently diverted into
  // this card's dead buffer instead of reaching auto-detect, while manual
  // capture (a separate, non-exclusive branch) kept working unaffected. This
  // is exactly the "transcript visible, Auto Answer On, manual capture fine,
  // zero auto-cards" symptom reported in UAT. Disarming here reuses the exact
  // same setter the existing safety-ceiling timer already calls — it only
  // makes that disarm happen promptly instead of after the full timeout.
  useEffect(() => {
    return () => {
      const store = useOverlayStore.getState()
      if (store.reCaptureCardId === card.id) store.setReCaptureCardId(null)
      if (store.voiceFollowUpCardId === card.id) store.setVoiceFollowUpCardId(null)
      // Same leak this whole effect exists to prevent, applied proactively to
      // the new interviewer-question mechanism from day one rather than
      // waiting to rediscover it.
      if (store.interviewerQuestionCardId === card.id) store.setInterviewerQuestionCardId(null)
      if (store.screenshotQueryCardId === card.id) store.setScreenshotQueryCardId(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.id])

  // Stages a capture instead of sending it immediately, so a question that
  // doesn't fit in one screen (needs scrolling) can be covered by taking
  // several shots and sending them together — see handleSendScreenshots.
  async function handleScreenshot(): Promise<void> {
    if (busy) return
    const result = await window.sarathi.screenshotCapture()
    if (result.error || !result.dataUrl) {
      toast.error(result.error ?? 'Screenshot capture failed.')
      return
    }
    setStagedScreenshots((prev) => [...prev, result.dataUrl as string])
  }

  function removeStagedScreenshot(index: number): void {
    setStagedScreenshots((prev) => prev.filter((_, i) => i !== index))
  }

  // Typing during a live call defeats the app's whole purpose — this lets the
  // candidate speak what to do with a staged screenshot instead. Reuses the
  // EXISTING mic pipeline (useLiveTranscription.ts already owns the only mic
  // capture instance active during a call) rather than starting a second
  // independent capture — a second capture here would very likely collide
  // with the one already running, the same WebSocket double-start race
  // already found and fixed elsewhere this session.
  //
  // Deliberately its OWN independent arm state (screenshotQueryCardId), not
  // a reuse of voiceFollowUpCardId: reusing that field made this button's
  // armed light also show on the card's separate "Speak" chip, and — more
  // seriously — inherited its toggle-off-CANCELS-and-discards behaviour,
  // which silently threw away the screenshot and the spoken query with zero
  // feedback. Toggle-off HERE finalizes and sends, matching Re-listen/
  // "+ Question".
  function toggleScreenshotQuery(): void {
    if (busy || (stagedScreenshots.length === 0 && !screenshotQueryArmedForThisCard)) return
    if (screenshotQueryArmedForThisCard) {
      setScreenshotQueryCardId(null)
      return
    }
    setScreenshotQueryScreenshots(stagedScreenshots)
    setScreenshotQueryCardId(card.id)
    // Cleared immediately, same as handleSendScreenshots does on click rather
    // than waiting for the async response — the screenshots are now "in
    // flight" attached to the armed Query.
    setStagedScreenshots([])
  }

  async function handleSendScreenshots(): Promise<void> {
    if (busy || stagedScreenshots.length === 0) return
    setFollowUpBusy(true)
    try {
      const instruction =
        stagedScreenshots.length === 1
          ? 'Use the attached screenshot — it may show code, a diagram, or on-screen context — to inform or extend this answer.'
          : 'Use the attached screenshots — successive captures of the same content — to inform or extend this answer.'
      await askFollowUp(card.id, instruction, useSessionStore.getState().form, stagedScreenshots)
      setStagedScreenshots([])
    } finally {
      setFollowUpBusy(false)
    }
  }

  // Shortcuts are a local in-window keydown listener (see local-shortcuts.ts)
  // — they need Sarathi to have OS focus, unlike a true global hotkey, which
  // both Electron's globalShortcut and a raw uiohook-napi hook both proved
  // unable to deliver on this machine (see local-shortcuts.ts for the
  // investigation). AnswerCardStack only ever mounts the currently-active
  // card, so this naturally scopes shortcut handling to whichever card is
  // in view.
  useEffect(() => {
    return onShortcutTriggered(({ id }) => {
      const chip = FOLLOW_UP_CHIPS.find((c) => c.shortcutId === id)
      if (chip) {
        sendFollowUp(resolveInstruction(chip.instruction, card.questionType))
      } else if (id === 'follow-up-voice') {
        toggleVoiceFollowUp()
      } else if (id === 'reask-relisten') {
        toggleReCapture()
      } else if (id === 'interviewer-question') {
        toggleInterviewerQuestion()
      } else if (id === 'screenshot-capture') {
        handleScreenshot()
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    card.id,
    card.status,
    // Explicit: the pseudocode chip picks its convention from this, and it
    // only arrives on aiDone — don't rely on card.status changing with it.
    card.questionType,
    followUpBusy,
    voiceFollowUpCardId,
    reCaptureCardId,
    interviewerQuestionCardId,
    micStatus,
    systemStatus
  ])

  async function handleCopy(): Promise<void> {
    const parts = [card.answer]
    if (card.keySteps?.length) {
      parts.push('\nKey Steps:\n' + card.keySteps.map((s, i) => `${i + 1}. ${s}`).join('\n'))
    }
    if (card.code) {
      parts.push(`\n\`\`\`${card.code.language}\n${card.code.content}\n\`\`\``)
    }
    if (card.explanation) {
      parts.push('\n' + card.explanation)
    }
    try {
      await navigator.clipboard.writeText(parts.join('\n'))
      setCopied(true)
      toast.success('Copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Failed to copy')
    }
  }

  function handleReAsk(): void {
    const corrected = questionDraft.trim()
    if (!corrected || busy) return
    setEditingQuestion(false)
    reAskCard(card.id, corrected, useSessionStore.getState().form)
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-start justify-between gap-2">
        <Section icon={<MessageCircle size={14} />} label="Question">
          {editingQuestion ? (
            <div className="space-y-1.5">
              <textarea
                value={questionDraft}
                onChange={(e) => setQuestionDraft(e.target.value)}
                rows={2}
                className="w-full rounded-md border border-white/15 bg-black/30 p-1.5 text-sm text-neutral-200 outline-none focus:border-white/30"
                autoFocus
              />
              <div className="flex gap-1.5">
                <button
                  onClick={handleReAsk}
                  disabled={busy || !questionDraft.trim()}
                  className="rounded-md bg-white/15 px-2 py-1 text-xs font-medium text-white transition hover:bg-white/25 disabled:opacity-40"
                >
                  Re-ask
                </button>
                <button
                  onClick={() => {
                    setQuestionDraft(card.question)
                    setEditingQuestion(false)
                  }}
                  className="rounded-md px-2 py-1 text-xs text-neutral-400 hover:text-neutral-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-sm text-neutral-300">{card.question}</p>
              {card.questionType && (
                // Purely informational — no onClick, no button, no hover
                // affordance. All framework selection happens ahead of time
                // in Answer Preferences; a live control here would require
                // exactly the mouse movement this app's shortcut system
                // exists to avoid.
                <Tooltip label={`Answered using the ${QUESTION_TYPE_FRAMEWORK_NAMES[card.questionType]} framework`}>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-neutral-400">
                    {QUESTION_TYPE_ICONS[card.questionType]}
                    {QUESTION_TYPE_LABELS[card.questionType]}
                    <span className="text-neutral-600">{QUESTION_TYPE_FRAMEWORK_NAMES[card.questionType]}</span>
                  </span>
                </Tooltip>
              )}
              {card.styledFromProfile && (
                // Same purely-informational treatment as the framework badge
                // — visible, per-answer proof "Match my speaking style"
                // actually applied, closing the "I can't validate this" gap.
                <Tooltip label="Written using your learned speaking style">
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-neutral-400">
                    <Mic size={10} />
                    Styled
                  </span>
                </Tooltip>
              )}
              <div className="flex items-center gap-2">
                {/* Primary correction path: no typing. Arms system-audio
                    capture of the interviewer repeating the question — the
                    natural "can you repeat that?" is already normal
                    interview behavior, unlike typing into an unknown window. */}
                <Tooltip
                  label={
                    reCaptureArmedForThisCard
                      ? 'Listening — press again once the interviewer finishes repeating it'
                      : systemReady
                        ? 'Question captured wrong? Ask the interviewer to repeat it, press this, then press it again when they finish (Ctrl+Plus+R)'
                        : 'Waiting for system audio to connect'
                  }
                >
                  <button
                    onClick={toggleReCapture}
                    disabled={busy || (!systemReady && !reCaptureArmedForThisCard)}
                    className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition disabled:opacity-40 ${
                      reCaptureArmedForThisCard
                        ? 'bg-red-500/20 text-red-300'
                        : 'bg-white/5 text-neutral-400 hover:bg-white/15 hover:text-neutral-200'
                    }`}
                  >
                    {reCaptureArmedForThisCard ? (
                      <>
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />
                        Listening… Stop &amp; Reask
                        <Square size={9} />
                      </>
                    ) : (
                      <>
                        <Repeat size={10} />
                        Re-listen
                        <span className="text-neutral-600">Ctrl+Plus+R</span>
                      </>
                    )}
                  </button>
                </Tooltip>
                {/* Fallback for when the interviewer can't be asked to repeat
                    (e.g. they've moved on) — typed correction, kept but demoted. */}
                <Tooltip label="Fallback: type the correct question yourself">
                  <button
                    onClick={() => {
                      setQuestionDraft(card.question)
                      setEditingQuestion(true)
                    }}
                    className="text-[10px] text-neutral-600 underline decoration-dotted transition hover:text-neutral-400"
                  >
                    Edit manually
                  </button>
                </Tooltip>
              </div>
            </div>
          )}
        </Section>
        <Tooltip label="Copy answer">
          <button
            onClick={handleCopy}
            className="ml-2 shrink-0 rounded-md p-1.5 text-neutral-500 transition hover:bg-white/10 hover:text-neutral-300"
          >
            {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
          </button>
        </Tooltip>
      </div>

      <AnswerBodyView body={card} />

      {card.status === 'streaming' && (
        <div className="flex items-center gap-1.5 text-xs text-neutral-500">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-400" />
          Streaming...
        </div>
      )}

      {card.followUps?.map((entry, i) => <FollowUpBlock key={i} entry={entry} />)}

      {card.pendingFollowUp && <PendingFollowUpBlock pending={card.pendingFollowUp} busy={followUpBusy} />}

      {/* Stays visible while Query is armed even though stagedScreenshots is
          already empty by then (cleared at arm time) — otherwise the whole
          row vanishes with no indicator that a query is still being
          recorded, which was part of the "screenshot disappeared" bug. */}
      {(stagedScreenshots.length > 0 || screenshotQueryArmedForThisCard) && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-white/10 pt-3">
          {screenshotQueryArmedForThisCard ? (
            <Tooltip label="Listening — click Query again to send the screenshot with what you say">
              <button
                onClick={toggleScreenshotQuery}
                disabled={busy}
                className="flex items-center gap-1 rounded-full bg-red-500/20 px-2.5 py-1 text-xs text-red-300 transition disabled:opacity-40"
              >
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />
                Listening…
              </button>
            </Tooltip>
          ) : (
            <>
              {stagedScreenshots.map((dataUrl, i) => (
                <div key={i} className="relative">
                  <img
                    src={dataUrl}
                    alt={`Staged screenshot ${i + 1}`}
                    className="h-12 w-16 rounded border border-white/10 object-cover"
                  />
                  <button
                    onClick={() => removeStagedScreenshot(i)}
                    className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-neutral-900 text-neutral-300 hover:bg-red-500/40 hover:text-red-200"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
              <Tooltip label={`Send ${stagedScreenshots.length} screenshot${stagedScreenshots.length > 1 ? 's' : ''} with this follow-up`}>
                <button
                  onClick={handleSendScreenshots}
                  disabled={busy}
                  className="flex items-center gap-1 rounded-full bg-emerald-500/20 px-2.5 py-1 text-xs text-emerald-300 transition hover:bg-emerald-500/30 disabled:opacity-40"
                >
                  <Check size={11} />
                  Send {stagedScreenshots.length}
                </button>
              </Tooltip>
              {/* Typing during a call defeats the app's purpose — voice a
                  query about the screenshot(s) instead of sending with only
                  the generic default instruction. Labelled "Query", not
                  "Speak" — a different word makes it obvious at a glance
                  that this is a separate mechanism from the card's own
                  "Speak" chip below, not just a different colour. */}
              <Tooltip
                label={
                  micReady
                    ? 'Speak a query about this screenshot, instead of Send'
                    : 'Speak a query about this screenshot — turns your mic on'
                }
              >
                <button
                  onClick={toggleScreenshotQuery}
                  disabled={busy}
                  className="flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1 text-xs text-neutral-300 transition hover:bg-white/15 disabled:opacity-40"
                >
                  <Mic size={11} />
                  Query
                </button>
              </Tooltip>
            </>
          )}
        </div>
      )}

      {card.status !== 'streaming' && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-white/10 pt-3">
          {FOLLOW_UP_CHIPS.slice(0, 2).map((chip) => (
            // No Tooltip here — the shortcut hint is already shown inline
            // (the trailing <span>), so a hover tooltip would be redundant.
            <button
              key={chip.label}
              onClick={() => sendFollowUp(resolveInstruction(chip.instruction, card.questionType))}
              disabled={busy}
              className="flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1 text-xs text-neutral-300 transition hover:bg-white/15 disabled:opacity-40"
            >
              <Plus size={11} />
              {chip.label}
              <span className="text-[10px] text-neutral-600">{chip.hint}</span>
            </button>
          ))}
          {/* Takes the exact slot and shortcut "+ More detail" used to occupy
              — removed per the end-user judgment that a fully framework-
              structured answer rarely needs a generic "elaborate" ask on top.
              Unlike the other chips, this is a toggle (arms system-audio
              capture of the interviewer's next remark), so it can't just fire
              an instruction immediately like the rest of FOLLOW_UP_CHIPS. */}
          <Tooltip
            label={
              interviewerQuestionArmedForThisCard
                ? 'Listening for the interviewer’s question — click to finish (Ctrl+Plus+Q)'
                : 'Capture a cross-question or clarification from the interviewer (Ctrl+Plus+Q)'
            }
          >
            <button
              onClick={toggleInterviewerQuestion}
              disabled={busy}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition disabled:opacity-40 ${
                interviewerQuestionArmedForThisCard
                  ? 'bg-red-500/20 text-red-300'
                  : 'bg-white/5 text-neutral-300 hover:bg-white/15'
              }`}
            >
              {interviewerQuestionArmedForThisCard ? (
                <>
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />
                  Listening…
                </>
              ) : (
                <>
                  <Plus size={11} />
                  + Question
                  <span className="text-[10px] text-neutral-600">Ctrl+Plus+Q</span>
                </>
              )}
            </button>
          </Tooltip>
          {FOLLOW_UP_CHIPS.slice(2).map((chip) => (
            <button
              key={chip.label}
              onClick={() => sendFollowUp(resolveInstruction(chip.instruction, card.questionType))}
              disabled={busy}
              className="flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1 text-xs text-neutral-300 transition hover:bg-white/15 disabled:opacity-40"
            >
              <Plus size={11} />
              {chip.label}
              <span className="text-[10px] text-neutral-600">{chip.hint}</span>
            </button>
          ))}
          <Tooltip label="Capture the screen and stage it as context for this question — click again to add more (e.g. after scrolling), then Send (Ctrl+Plus+X)">
            <button
              onClick={handleScreenshot}
              disabled={busy}
              className="flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1 text-xs text-neutral-300 transition hover:bg-white/15 disabled:opacity-40"
            >
              <Camera size={11} />
              Screenshot{stagedScreenshots.length > 0 ? ` (${stagedScreenshots.length})` : ''}
              <span className="text-[10px] text-neutral-600">Ctrl+Plus+X</span>
            </button>
          </Tooltip>
          <Tooltip
            label={
              voiceArmedForThisCard
                ? 'Listening — click to cancel'
                : micReady
                  ? 'Speak a follow-up (Ctrl+Plus+S)'
                  : 'Speak a follow-up — turns your mic on (Ctrl+Plus+S)'
            }
          >
            <button
              onClick={toggleVoiceFollowUp}
              disabled={busy}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition disabled:opacity-40 ${
                voiceArmedForThisCard
                  ? 'bg-red-500/20 text-red-300'
                  : 'bg-white/5 text-neutral-300 hover:bg-white/15'
              }`}
            >
              {voiceArmedForThisCard ? (
                <>
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />
                  Listening…
                  <X size={11} />
                </>
              ) : (
                <>
                  <Mic size={11} />
                  Speak
                  <span className="text-[10px] text-neutral-600">Ctrl+Plus+S</span>
                </>
              )}
            </button>
          </Tooltip>
        </div>
      )}
    </div>
  )
}

function AnswerBodyView({ body }: { body: AnswerBody }): React.JSX.Element {
  const hasFrameworkSections = Boolean(body.frameworkSections && body.frameworkSections.length > 0)

  return (
    <>
      {hasFrameworkSections ? (
        // Distinct labeled blocks in the framework's own stage names — this
        // IS the visible proof a framework was actually followed, not just
        // claimed. Replaces the generic Answer section, since the model
        // wasn't asked to emit a plain <<<ANSWER>>> when a framework is
        // active (see question-frameworks.ts's frameworkResponseFormat).
        body.frameworkSections!.map((section, i) => (
          <Section key={i} icon={<Star size={14} />} label={section.label}>
            <MarkdownLite text={section.body} />
          </Section>
        ))
      ) : (
        <Section icon={<Star size={14} />} label="Answer">
          <MarkdownLite text={body.answer} />
        </Section>
      )}

      {body.keySteps && body.keySteps.length > 0 && (
        <Section icon={<ListChecks size={14} />} label="Key Steps">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-neutral-200">
            {body.keySteps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </Section>
      )}

      {body.code && (
        <Section icon={<Code2 size={14} />} label="Code">
          <pre className="overflow-x-auto rounded-lg bg-black/60 p-3 font-mono text-xs leading-relaxed text-emerald-200">
            <code>{body.code.content}</code>
          </pre>
        </Section>
      )}

      {body.explanation && (
        <Section icon={<Lightbulb size={14} />} label="Explanation">
          <MarkdownLite text={body.explanation} />
        </Section>
      )}

      {(body.timeComplexity || body.spaceComplexity) && (
        <div className="flex gap-4 text-xs text-neutral-400">
          {body.timeComplexity && (
            <span className="flex items-center gap-1">
              <Clock size={12} /> Time: {body.timeComplexity}
            </span>
          )}
          {body.spaceComplexity && (
            <span className="flex items-center gap-1">
              <Database size={12} /> Space: {body.spaceComplexity}
            </span>
          )}
        </div>
      )}
    </>
  )
}

function FollowUpBlock({ entry }: { entry: FollowUpEntry }): React.JSX.Element {
  const isError = entry.answer.startsWith('⚠️')
  return (
    <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <p className="text-xs font-medium text-neutral-400">↳ {entry.instruction}</p>
      {entry.imageDataUrls && entry.imageDataUrls.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {entry.imageDataUrls.map((url, i) => (
            <img
              key={i}
              src={url}
              alt={`Attached screenshot ${i + 1}`}
              className="max-h-24 w-auto rounded border border-white/10 object-contain"
            />
          ))}
        </div>
      )}
      {isError ? (
        <p className="text-xs text-red-400">{entry.answer}</p>
      ) : (
        <AnswerBodyView body={entry} />
      )}
    </div>
  )
}

function PendingFollowUpBlock({
  pending,
  busy
}: {
  pending: Omit<FollowUpEntry, 'createdAt'>
  busy: boolean
}): React.JSX.Element {
  const isError = pending.answer.startsWith('⚠️')
  return (
    <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <p className="text-xs font-medium text-neutral-400">↳ {pending.instruction}</p>
      {pending.imageDataUrls && pending.imageDataUrls.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {pending.imageDataUrls.map((url, i) => (
            <img
              key={i}
              src={url}
              alt={`Attached screenshot ${i + 1}`}
              className="max-h-24 w-auto rounded border border-white/10 object-contain"
            />
          ))}
        </div>
      )}
      {isError ? (
        <p className="text-xs text-red-400">{pending.answer}</p>
      ) : (
        <>
          <AnswerBodyView body={pending} />
          {busy && (
            <div className="flex items-center gap-1.5 text-xs text-neutral-500">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-400" />
              Adding...
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Section({
  icon,
  label,
  children
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-neutral-500">
        {icon}
        {label}
      </div>
      {children}
    </div>
  )
}
