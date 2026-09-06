import { useEffect, useState } from 'react'
import { X, User, Plus, Loader2, Upload, Sparkles, Check, History } from 'lucide-react'
import { toast } from 'sonner'
import type { Profile } from '@shared/profile-types'
import type { SpeakingStyleStats } from '@shared/ipc-contract'
import { TextInput, TextArea } from './field-shell'
import { PracticeInterviewModal } from './practice-interview-modal'

export function ProfileModal({
  onSelect,
  onClose
}: {
  onSelect: (id: string, name: string) => void
  onClose: () => void
}): React.JSX.Element {
  const [profiles, setProfiles] = useState<Profile[] | null>(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [resumeText, setResumeText] = useState('')
  const [saving, setSaving] = useState(false)
  const [extracting, setExtracting] = useState(false)

  const [learningProfileId, setLearningProfileId] = useState<string | null>(null)
  /** null = show the Practice-vs-past-interviews choice; 'passive' = the
   *  existing scraped-transcript flow. Practice has its own modal/state. */
  const [learnMode, setLearnMode] = useState<'passive' | null>(null)
  const [showPractice, setShowPractice] = useState(false)
  const [learnStats, setLearnStats] = useState<SpeakingStyleStats | null>(null)
  const [learningBusy, setLearningBusy] = useState(false)
  /** The actual generated text, shown back to the user as visible proof it
   *  worked — not just a success toast they have to take on faith. */
  const [generatedStyleText, setGeneratedStyleText] = useState<string | null>(null)

  useEffect(() => {
    window.sarathi.listProfiles().then(setProfiles)
  }, [])

  async function handleUploadResume(): Promise<void> {
    setExtracting(true)
    try {
      const result = await window.sarathi.extractResumeFromFile()
      if (result.cancelled) return
      if (result.error || !result.text) {
        toast.error(result.error ?? 'Failed to read the selected file.')
        return
      }
      setResumeText(result.text)
    } finally {
      setExtracting(false)
    }
  }

  async function handleCreate(): Promise<void> {
    if (!name.trim()) return
    setSaving(true)
    try {
      const profile = await window.sarathi.createProfile(name.trim(), resumeText)
      onSelect(profile.id, profile.name)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  function openLearnPanel(profile: Profile): void {
    setLearningProfileId(profile.id)
    setLearnMode(null)
    setLearnStats(null)
    setGeneratedStyleText(null)
  }

  async function startPassiveLearn(): Promise<void> {
    if (!learningProfileId) return
    setLearnMode('passive')
    setLearnStats(null)
    const stats = await window.sarathi.learnSpeakingStyleStats(learningProfileId)
    setLearnStats(stats)
  }

  function updateProfileInList(profile: Profile): void {
    setProfiles((prev) => prev?.map((p) => (p.id === profile.id ? profile : p)) ?? prev)
  }

  async function handleGenerateStyle(): Promise<void> {
    if (!learningProfileId) return
    setLearningBusy(true)
    try {
      const result = await window.sarathi.learnSpeakingStyle(learningProfileId)
      if (!result.ok || !result.profile) {
        toast.error(result.error ?? 'Failed to learn speaking style.')
        return
      }
      updateProfileInList(result.profile)
      // Show the actual generated text and keep the panel open — a checkbox
      // ticking on isn't proof it worked; the user reading the real output
      // and judging it for themselves is.
      setGeneratedStyleText(result.profile.speakingStyleProfile)
    } finally {
      setLearningBusy(false)
    }
  }

  const learningProfile = profiles?.find((p) => p.id === learningProfileId) ?? null

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="flex max-h-[85%] w-[90%] max-w-sm flex-col rounded-2xl border border-black/10 bg-white/95 p-4 shadow-2xl backdrop-blur-xl">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-neutral-900">
            <User size={15} />{' '}
            {creating ? 'New Profile' : learningProfile ? 'Learn Speaking Style' : 'Select Profile'}
          </div>
          <button
            onClick={learningProfile ? () => setLearningProfileId(null) : onClose}
            className="rounded-full p-1 text-neutral-500 hover:bg-black/5"
          >
            <X size={16} />
          </button>
        </div>

        {learningProfile && learnMode === null ? (
          <div className="space-y-3">
            <p className="text-sm text-neutral-700">
              How should Sarathi learn <span className="font-medium">{learningProfile.name}</span>'s speaking style?
            </p>
            <button
              onClick={() => setShowPractice(true)}
              className="flex w-full items-center gap-2 rounded-lg border border-black/10 bg-black/[0.02] p-3 text-left hover:bg-black/[0.06]"
            >
              <Sparkles size={16} className="shrink-0 text-neutral-700" />
              <span>
                <span className="block text-sm font-medium text-neutral-800">Practice now (recommended)</span>
                <span className="block text-[11px] text-neutral-500">
                  Answer a few questions deliberately, spoken or typed — higher-quality, verifiable input.
                </span>
              </span>
            </button>
            <button
              onClick={startPassiveLearn}
              className="flex w-full items-center gap-2 rounded-lg border border-black/10 bg-black/[0.02] p-3 text-left hover:bg-black/[0.06]"
            >
              <History size={16} className="shrink-0 text-neutral-700" />
              <span>
                <span className="block text-sm font-medium text-neutral-800">Learn from past interviews</span>
                <span className="block text-[11px] text-neutral-500">
                  Faster, but lower signal — uses fragments of your own speech from past saved sessions.
                </span>
              </span>
            </button>
          </div>
        ) : learningProfile ? (
          <div className="space-y-3">
            {generatedStyleText ? (
              <>
                <p className="text-sm text-neutral-700">
                  Here's what Sarathi concluded about <span className="font-medium">{learningProfile.name}</span>'s
                  speaking style — read it and judge for yourself whether it's accurate:
                </p>
                <div className="max-h-56 overflow-y-auto rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs leading-relaxed text-emerald-900">
                  {generatedStyleText}
                </div>
                <button
                  onClick={() => setLearningProfileId(null)}
                  className="w-full rounded-lg bg-neutral-900 py-2 text-sm font-medium text-white transition hover:bg-neutral-700"
                >
                  Done
                </button>
              </>
            ) : (
              <>
                <p className="text-sm text-neutral-700">
                  Building a style profile for <span className="font-medium">{learningProfile.name}</span> from their
                  own past interview speech (never the interviewer's side).
                </p>
                {learnStats === null ? (
                  <div className="flex justify-center py-4">
                    <Loader2 size={16} className="animate-spin text-neutral-400" />
                  </div>
                ) : learnStats.micCharCount === 0 ? (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-snug text-amber-800">
                    No past sessions with saved transcripts found for this profile. Run an interview with "Save
                    Transcript" enabled first, then come back here.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs leading-snug text-neutral-500">
                      Found {learnStats.sessionCount} past session{learnStats.sessionCount === 1 ? '' : 's'}, ~
                      {learnStats.micCharCount.toLocaleString()} characters of speech
                      {learnStats.micCharCount < 1500 ? ' — on the thin side, but still usable.' : '.'}
                    </p>
                    {learningProfile.speakingStyleGeneratedAt && (
                      <p className="text-[11px] text-neutral-400">
                        Style already learned {new Date(learningProfile.speakingStyleGeneratedAt).toLocaleDateString()}{' '}
                        — generating again replaces it.
                      </p>
                    )}
                  </div>
                )}
                <button
                  onClick={handleGenerateStyle}
                  disabled={!learnStats || learnStats.micCharCount === 0 || learningBusy}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-neutral-900 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50"
                >
                  {learningBusy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  {learningBusy ? 'Learning…' : 'Generate style profile'}
                </button>
              </>
            )}
          </div>
        ) : creating ? (
          <div className="space-y-3">
            <TextInput placeholder="Profile name (e.g. Your Name)" value={name} onChange={(e) => setName(e.target.value)} />
            <button
              onClick={handleUploadResume}
              disabled={extracting}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-black/15 px-3 py-2 text-sm text-neutral-600 hover:bg-black/[0.03] disabled:opacity-50"
            >
              <Upload size={14} /> {extracting ? 'Reading file...' : 'Upload Resume File (PDF/DOCX/TXT)'}
            </button>
            <TextArea
              rows={8}
              maxLength={20000}
              placeholder="...or paste your resume/bio here — skills, past roles, projects. This gets sent as context on every question you ask with this profile selected."
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
            />
            <div className="flex gap-2">
              <button
                onClick={() => setCreating(false)}
                className="flex-1 rounded-lg border border-black/10 py-2 text-sm text-neutral-600 hover:bg-black/5"
              >
                Back
              </button>
              <button
                onClick={handleCreate}
                disabled={!name.trim() || saving}
                className="flex-1 rounded-lg bg-neutral-900 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save & Select'}
              </button>
            </div>
          </div>
        ) : profiles === null ? (
          <div className="flex justify-center py-6">
            <Loader2 size={16} className="animate-spin text-neutral-400" />
          </div>
        ) : (
          <div className="flex-1 space-y-2 overflow-y-auto">
            <button
              onClick={() => setCreating(true)}
              className="flex w-full items-center gap-1.5 rounded-lg border border-dashed border-black/15 px-3 py-2 text-sm text-neutral-600 hover:bg-black/[0.03]"
            >
              <Plus size={14} /> New Profile
            </button>
            {profiles.length === 0 && (
              <p className="py-2 text-center text-sm text-neutral-400">No saved profiles yet.</p>
            )}
            {profiles.map((profile) => (
              <div
                key={profile.id}
                className="flex items-center gap-1 rounded-lg border border-black/10 bg-black/[0.02] pr-1 hover:bg-black/[0.06]"
              >
                <button
                  onClick={() => {
                    onSelect(profile.id, profile.name)
                    onClose()
                  }}
                  className="flex flex-1 items-center gap-1.5 px-3 py-2 text-left text-sm text-neutral-800"
                >
                  <User size={14} className="shrink-0 text-neutral-400" />
                  <span className="flex-1">{profile.name}</span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    openLearnPanel(profile)
                  }}
                  className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium transition ${
                    profile.speakingStyleProfile
                      ? 'text-emerald-600 hover:bg-emerald-50'
                      : 'text-neutral-500 hover:bg-black/5'
                  }`}
                >
                  {profile.speakingStyleProfile ? <Check size={12} /> : <Sparkles size={12} />}
                  {profile.speakingStyleProfile ? 'Style learned' : 'Learn my style'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      {showPractice && learningProfile && (
        <PracticeInterviewModal
          profileId={learningProfile.id}
          profileName={learningProfile.name}
          onClose={() => {
            setShowPractice(false)
            setLearningProfileId(null)
          }}
          onComplete={updateProfileInList}
        />
      )}
    </div>
  )
}
