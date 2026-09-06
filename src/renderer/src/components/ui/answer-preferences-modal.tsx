import { useEffect, useState } from 'react'
import { X, MessageSquare, ChevronDown, Sparkles } from 'lucide-react'
import type { AnswerFormat, AnswerPreferences } from '@shared/session-types'
import type { Profile } from '@shared/profile-types'
import { QUESTION_TYPES, QUESTION_TYPE_LABELS, QUESTION_TYPE_FRAMEWORK_NAMES, type QuestionType } from '@shared/question-frameworks'
import { Dropdown } from './dropdown'
import { TextInput } from './field-shell'
import { Toggle } from './toggle'
import { PracticeInterviewModal } from './practice-interview-modal'

/**
 * Static, hand-written illustrative examples — not a live LLM call. The
 * point is a free, instant "here's roughly what this looks like" preview
 * while choosing which frameworks to allow, not a real generated answer.
 */
const FRAMEWORK_PREVIEWS: Record<QuestionType, { question: string; example: string }> = {
  behavioral: {
    question: '"Tell me about a time you disagreed with a teammate."',
    example:
      'A teammate and I disagreed on whether to build a new feature as a microservice. I was responsible for the backend architecture, so I proposed we build it inside the existing service but keep it in its own module. I walked through our actual traffic numbers to make the case, and we agreed on that middle path. It shipped two weeks faster than a full microservice split would have, and I now default to "start simple, isolate for later" on similar calls.'
  },
  theoretical: {
    question: '"What is the difference between precision and recall?"',
    example:
      'Precision measures how many of the positive predictions were actually correct; recall measures how many actual positives were found. On a fraud-screening project I worked on, we optimized for recall because missing a real fraud case was far costlier than a false alarm. Precision is TP/(TP+FP), recall is TP/(TP+FN). Which one to prioritize comes down to whether false positives or false negatives cost you more in your specific case.'
  },
  scenario: {
    question: '"How would you roll out a risky schema migration?"',
    example:
      "First I'd clarify — is this a required-column change on a live table, or something safer? Assuming live traffic and no downtime allowed, the real constraints are lock time and rollback safety. I'd consider a big-bang migration versus an expand-contract approach. I'd go with expand-contract: add the new column nullable, backfill in batches, then cut over. The main risk is the backfill job falling behind under load, so I'd monitor lag and throttle it if needed."
  },
  coding: {
    question: '"Reverse a linked list."',
    example:
      "To restate: given a singly linked list, return it reversed in place. Edge cases: empty list, one node. For example, 1→2→3 becomes 3→2→1. The approach is three pointers — prev, current, next — walking the list once, O(n) time, O(1) space. [code follows in its own section]. Walking through 1→2→3 by hand confirms it produces 3→2→1 correctly, including the two edge cases."
  },
  'system-design': {
    question: '"Design a URL shortener."',
    example:
      'Requirements: high read-to-write ratio, low-latency redirects, links that don\'t expire by default. Core entities are a short code mapped to a long URL, plus click metadata. Architecture: a write path that generates a short code and stores the mapping, a read path fronted by a cache since reads dominate. For scale, the redirect path is the hot path, so it\'s cached aggressively and kept stateless behind a load balancer. For monitoring, I\'d track cache hit rate and redirect latency as the two numbers that would tell me first if something\'s wrong.'
  }
}

const TONE_OPTIONS: { value: AnswerPreferences['tone']; label: string; hint: string }[] = [
  { value: 'conversational', label: 'Conversational', hint: 'Sounds natural if read aloud — the safest default for a live call.' },
  { value: 'formal', label: 'Formal', hint: 'More structured phrasing — fits senior/executive-style interviews.' },
  { value: 'concise', label: 'Concise', hint: 'Plain, no-frills word choice — pairs well with the Bullet Points format.' }
]

const FORMAT_OPTIONS: { value: AnswerFormat; label: string; hint: string }[] = [
  {
    value: 'full-script',
    label: 'Full script',
    hint: 'A complete word-for-word script you can read or say verbatim.'
  },
  {
    value: 'script-bullets',
    label: 'Script + bullets',
    hint: 'One full opening sentence, then concise supporting bullets for the rest.'
  },
  {
    value: 'bullets',
    label: 'Bullet points',
    hint: "Short bullets in your own words — meant to glance at and paraphrase aloud, not read verbatim."
  }
]

const SENIORITY_OPTIONS: { value: AnswerPreferences['seniority']; label: string; hint: string }[] = [
  { value: 'junior', label: 'Junior', hint: 'Simpler framing, fewer assumed fundamentals.' },
  { value: 'mid', label: 'Mid-level', hint: 'Assumes solid working experience.' },
  { value: 'senior', label: 'Senior', hint: 'Leans on tradeoffs, architecture, and ownership language.' }
]

export function AnswerPreferencesModal({
  value,
  profileId,
  onSave,
  onClose
}: {
  value: AnswerPreferences
  /** The session's currently-selected profile, if any — used only to check
   *  whether "Match my speaking style" has anything to actually apply. */
  profileId: string | null
  onSave: (value: AnswerPreferences) => void
  onClose: () => void
}): React.JSX.Element {
  const [draft, setDraft] = useState<AnswerPreferences>(value)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [expandedPreview, setExpandedPreview] = useState<QuestionType | null>(null)
  const [showPractice, setShowPractice] = useState(false)

  const hasSpeakingStyle = Boolean(profile?.speakingStyleProfile)

  useEffect(() => {
    if (!profileId) {
      setProfile(null)
      return
    }
    window.sarathi.listProfiles().then((profiles) => {
      setProfile(profiles.find((p) => p.id === profileId) ?? null)
    })
  }, [profileId])

  function set<K extends keyof AnswerPreferences>(key: K, val: AnswerPreferences[K]): void {
    setDraft((prev) => ({ ...prev, [key]: val }))
  }

  function toggleFramework(type: QuestionType): void {
    setDraft((prev) => ({
      ...prev,
      enabledFrameworks: prev.enabledFrameworks.includes(type)
        ? prev.enabledFrameworks.filter((t) => t !== type)
        : [...prev.enabledFrameworks, type]
    }))
  }

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="flex max-h-[85%] w-[90%] max-w-sm flex-col rounded-2xl border border-black/10 bg-white/95 p-4 shadow-2xl backdrop-blur-xl">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-neutral-900">
            <MessageSquare size={15} /> Answer Preferences
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-neutral-500 hover:bg-black/5">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto">
          <div>
            <p className="mb-1.5 text-xs font-medium text-neutral-600">Tone</p>
            <Dropdown value={draft.tone} onChange={(v) => set('tone', v as AnswerPreferences['tone'])} options={TONE_OPTIONS} />
            <p className="mt-1 text-[11px] text-neutral-400">{TONE_OPTIONS.find((o) => o.value === draft.tone)?.hint}</p>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium text-neutral-600">Format</p>
            <Dropdown value={draft.format} onChange={(v) => set('format', v as AnswerFormat)} options={FORMAT_OPTIONS} />
            <p className="mt-1 text-[11px] text-neutral-400">{FORMAT_OPTIONS.find((o) => o.value === draft.format)?.hint}</p>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium text-neutral-600">Target Seniority</p>
            <Dropdown
              value={draft.seniority}
              onChange={(v) => set('seniority', v as AnswerPreferences['seniority'])}
              options={SENIORITY_OPTIONS}
            />
            <p className="mt-1 text-[11px] text-neutral-400">
              {SENIORITY_OPTIONS.find((o) => o.value === draft.seniority)?.hint}
            </p>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium text-neutral-600">Preferred Code Language</p>
            <TextInput
              placeholder="Python"
              value={draft.codeLanguage}
              onChange={(e) => set('codeLanguage', e.target.value)}
            />
            <p className="mt-1 text-[11px] text-neutral-400">Used whenever a coding answer is generated.</p>
          </div>

          <div className="space-y-1 border-t border-black/5 pt-3">
            <p className="text-xs font-medium text-neutral-600">Answer Frameworks</p>
            <p className="mb-1 text-[11px] leading-snug text-neutral-400">
              Select which structured frameworks Sarathi is allowed to use, based on the type of question detected.
              Leave none selected to always get a plain, unstructured answer instead.
            </p>
            {QUESTION_TYPES.map((type) => (
              <div key={type} className="rounded-md">
                <div className="flex items-center justify-between gap-2 py-1">
                  <Toggle
                    checked={draft.enabledFrameworks.includes(type)}
                    onChange={() => toggleFramework(type)}
                    label={`${QUESTION_TYPE_LABELS[type]} — ${QUESTION_TYPE_FRAMEWORK_NAMES[type]}`}
                  />
                  <button
                    type="button"
                    onClick={() => setExpandedPreview((cur) => (cur === type ? null : type))}
                    className="flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-neutral-500 hover:bg-black/5"
                  >
                    Preview
                    <ChevronDown
                      size={11}
                      className={`transition-transform ${expandedPreview === type ? 'rotate-180' : ''}`}
                    />
                  </button>
                </div>
                {expandedPreview === type && (
                  <div className="mb-1.5 space-y-1 rounded-md border border-black/10 bg-black/[0.02] p-2 text-[11px] leading-snug">
                    <p className="text-neutral-500">{FRAMEWORK_PREVIEWS[type].question}</p>
                    <p className="text-neutral-700">{FRAMEWORK_PREVIEWS[type].example}</p>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="space-y-3 border-t border-black/5 pt-3">
            <Toggle
              checked={draft.useFillerWords}
              onChange={(v) => set('useFillerWords', v)}
              label="Use filler words"
              hint='Adds a few natural speech patterns like "um" and "so" so answers sound less like a script.'
            />

            <div className="space-y-1.5">
              <Toggle
                checked={draft.matchSpeakingStyle}
                onChange={(v) => set('matchSpeakingStyle', v)}
                label="Match my speaking style"
                hint={
                  hasSpeakingStyle
                    ? 'Writes answers in your own voice, learned from your practice answers.'
                    : 'No speaking style has been learned yet — set one up so this has something to apply.'
                }
              />
              {profileId === null ? (
                <p className="text-[11px] text-neutral-400">
                  Select a profile for this session to set up a speaking style.
                </p>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowPractice(true)}
                    className="flex items-center gap-1 rounded-md bg-black/5 px-2 py-1 text-[11px] font-medium text-neutral-700 transition hover:bg-black/10"
                  >
                    <Sparkles size={11} />
                    {hasSpeakingStyle ? 'Redo practice interview' : 'Set up now'}
                  </button>
                  {hasSpeakingStyle && profile?.speakingStyleGeneratedAt && (
                    <span className="text-[11px] text-neutral-400">
                      Learned {new Date(profile.speakingStyleGeneratedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            onSave(draft)
            onClose()
          }}
          className="mt-3 w-full rounded-lg bg-neutral-900 py-2 text-sm font-medium text-white transition hover:bg-neutral-700"
        >
          Save
        </button>
      </div>
      {showPractice && profile && (
        <PracticeInterviewModal
          profileId={profile.id}
          profileName={profile.name}
          onClose={() => setShowPractice(false)}
          onComplete={setProfile}
        />
      )}
    </div>
  )
}
