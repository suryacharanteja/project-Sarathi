import { useRef, useState, useCallback, useEffect } from 'react'
import { FileText, Settings, FlipHorizontal, Play, Upload } from 'lucide-react'
import { toast } from 'sonner'
import type { LlmProvider } from '@shared/session-types'
import { useSessionStore } from '../../stores/session-store'
import { usePrompterStore } from '../prompter/prompter-store'
import { Toggle } from '../../components/ui/toggle'
import { Dropdown } from '../../components/ui/dropdown'
import { SettingsModal } from '../settings/SettingsModal'
import { TitleBar } from '../../components/ui/title-bar'

const PROVIDER_LABELS: Record<LlmProvider, string> = {
  gemini: 'Gemini',
  openai: 'OpenAI',
  'opencode-go': 'OpenCode Go',
  'opencode-zen': 'OpenCode Zen (Free)',
  deepseek: 'DeepSeek'
}

const PROVIDER_MODELS: Record<LlmProvider, { value: string; label: string }[]> = {
  gemini: ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.5-pro'].map((m) => ({ value: m, label: m })),
  openai: ['gpt-4o', 'gpt-4o-mini'].map((m) => ({ value: m, label: m })),
  'opencode-go': [{ value: 'grok-4.5', label: 'Grok 4.5' }],
  'opencode-zen': [{ value: 'big-pickle', label: 'Big Pickle (Free)' }],
  deepseek: [
    { value: 'deepseek-chat', label: 'DeepSeek Chat' },
    { value: 'deepseek-reasoner', label: 'DeepSeek Reasoner' }
  ]
}

const API_KEY_FOR_PROVIDER: Record<LlmProvider, string> = {
  gemini: 'geminiApiKey',
  openai: 'openaiApiKey',
  'opencode-go': 'openCodeGoApiKey',
  'opencode-zen': 'openCodeZenApiKey',
  deepseek: 'deepseekApiKey'
}

export function CreateSessionScreen({
  onCreate,
  onMinimize
}: {
  onCreate?: () => void
  onMinimize?: () => void
}): React.JSX.Element {
  const { form, setField } = useSessionStore()
  const {
    scriptText,
    scriptFileName,
    scrollSpeed,
    fontSize,
    mirrorFlip,
    aiListenerEnabled,
    setScriptText,
    setScrollSpeed,
    setFontSize,
    setMirrorFlip,
    setAiListenerEnabled
  } = usePrompterStore()

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [hasApiKey, setHasApiKey] = useState(true)
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.sarathi.getSettings().then((settings) => {
      const key = settings[API_KEY_FOR_PROVIDER[form.provider] as keyof typeof settings]
      setHasApiKey(!!key)
    })
  }, [form.provider])

  function handleProviderChange(provider: LlmProvider): void {
    setField('provider', provider)
    setField('model', PROVIDER_MODELS[provider][0].value)
  }

  async function handleBrowse(): Promise<void> {
    setLoading(true)
    try {
      const result = await window.sarathi.extractResumeFromFile()
      if (result.cancelled) return
      if (result.error || !result.text) {
        toast.error(result.error ?? 'Could not extract text from file.')
        return
      }
      setScriptText(result.text.trim(), result.fileName)
      toast.success(`Loaded: ${result.fileName}`)
    } finally {
      setLoading(false)
    }
  }

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext === 'txt') {
      setLoading(true)
      file.text().then((text) => {
        if (!text.trim()) { toast.error('File appears empty.'); return }
        setScriptText(text.trim(), file.name)
        toast.success(`Loaded: ${file.name}`)
      }).catch(() => toast.error('Failed to read file.')).finally(() => setLoading(false))
    } else {
      // PDF/DOCX need the main-process parsers — open file picker instead
      toast.info('For PDF/DOCX, use the Browse button — drag-and-drop only works with .txt files.')
    }
  }, [])

  function handleStart(): void {
    if (!scriptText.trim()) {
      toast.error('Please load a script before starting.')
      return
    }
    if (aiListenerEnabled && !hasApiKey) {
      toast.error(`No ${PROVIDER_LABELS[form.provider]} API key set. Open Settings, or disable AI Listener.`)
      return
    }
    window.sarathi
      .createSession({
        ...form,
        sessionType: 'regular-call',
        company: 'Webinar',
        jobDescription: scriptText.slice(0, 500),
        autoAnswer: aiListenerEnabled,
        saveTranscript: false,
        profileId: null,
        documentIds: [],
        extraContext: '',
        outputLanguage: 'English'
      })
      .then((result) => {
        if (!result.ok) {
          toast.error((result as { ok: false; error: string }).error)
          return
        }
        onCreate?.()
      })
  }

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden rounded-2xl border border-black/10 bg-white/95 text-neutral-900 shadow-2xl backdrop-blur-xl">
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}

      <TitleBar
        onMinimize={onMinimize ?? (() => window.sarathi.windowMinimize())}
        onClose={() => window.sarathi.windowClose()}
      >
        <button
          onClick={() => setSettingsOpen(true)}
          className="rounded-full p-1.5 text-neutral-500 transition hover:bg-black/5 hover:text-neutral-900"
          title="Settings"
        >
          <Settings size={16} />
        </button>
      </TitleBar>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {/* Hero */}
        <div className="text-center pt-1 pb-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-indigo-100 mb-2">
            <svg viewBox="0 0 512 512" className="w-7 h-7" xmlns="http://www.w3.org/2000/svg">
              <circle cx="256" cy="256" r="220" stroke="#6366f1" strokeWidth="28" fill="none"/>
              <g stroke="#6366f1" strokeWidth="16" strokeLinecap="round">
                <line x1="256" y1="56" x2="256" y2="456"/>
                <line x1="56" y1="256" x2="456" y2="256"/>
                <line x1="113" y1="113" x2="399" y2="399"/>
                <line x1="399" y1="113" x2="113" y2="399"/>
              </g>
              <circle cx="256" cy="256" r="52" fill="#6366f1"/>
              <rect x="240" y="230" width="32" height="40" rx="10" fill="white"/>
              <path d="M248 270 Q248 292 256 292 Q264 292 264 270" fill="none" stroke="white" strokeWidth="5" strokeLinecap="round"/>
              <line x1="249" y1="291" x2="263" y2="291" stroke="white" strokeWidth="5" strokeLinecap="round"/>
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-neutral-900">Sarathi</h1>
          <p className="text-sm text-neutral-500">Your AI-powered presentation co-pilot</p>
        </div>

        {/* Script loader */}
        <div>
          <p className="text-xs font-medium text-neutral-500 mb-2 uppercase tracking-wide">Script</p>
          <div
            ref={dropRef}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition ${
              dragging ? 'border-indigo-400 bg-indigo-50' : 'border-black/10 bg-black/[0.02]'
            }`}
          >
            {scriptText ? (
              <>
                <FileText size={22} className="text-indigo-500" />
                <p className="text-sm font-medium text-neutral-700">{scriptFileName ?? 'Script loaded'}</p>
                <p className="text-xs text-neutral-400">{scriptText.length.toLocaleString()} characters</p>
                <button onClick={handleBrowse} className="text-xs text-indigo-500 hover:underline">
                  Replace script
                </button>
              </>
            ) : (
              <>
                <Upload size={22} className="text-neutral-400" />
                <p className="text-sm text-neutral-500">
                  {loading ? 'Loading…' : 'Drop a .txt file here, or browse for PDF/DOCX'}
                </p>
                <button
                  onClick={handleBrowse}
                  disabled={loading}
                  className="mt-1 rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:bg-black/[0.04] disabled:opacity-50"
                >
                  Browse…
                </button>
              </>
            )}
          </div>
        </div>

        {/* Prompter settings */}
        <div>
          <p className="text-xs font-medium text-neutral-500 mb-3 uppercase tracking-wide">Prompter Settings</p>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <label className="text-sm text-neutral-600 w-28 shrink-0">Scroll speed</label>
              <input
                type="range" min={1} max={10} step={1}
                value={scrollSpeed}
                onChange={(e) => setScrollSpeed(Number(e.target.value))}
                className="flex-1 accent-indigo-500"
              />
              <span className="text-xs text-neutral-400 w-4 text-right">{scrollSpeed}</span>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm text-neutral-600 w-28 shrink-0">Font size</label>
              <input
                type="range" min={16} max={72} step={2}
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="flex-1 accent-indigo-500"
              />
              <span className="text-xs text-neutral-400 w-8 text-right">{fontSize}px</span>
            </div>
            <button
              onClick={() => setMirrorFlip(!mirrorFlip)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition ${
                mirrorFlip
                  ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                  : 'border-black/10 bg-black/[0.02] text-neutral-600'
              }`}
            >
              <FlipHorizontal size={14} />
              Mirror flip {mirrorFlip ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>

        {/* AI Listener */}
        <div>
          <p className="text-xs font-medium text-neutral-500 mb-3 uppercase tracking-wide">AI Listener</p>
          <div className="rounded-xl border border-black/10 bg-black/[0.02] p-3 space-y-3">
            <Toggle
              checked={aiListenerEnabled}
              onChange={setAiListenerEnabled}
              label="Audience question detection"
              hint="Listens for audience questions and shows AI answers without interrupting your script"
            />
            {aiListenerEnabled && (
              <div className="flex flex-wrap gap-2 pt-1">
                <Dropdown
                  value={form.provider}
                  onChange={(v) => handleProviderChange(v as LlmProvider)}
                  options={(Object.keys(PROVIDER_LABELS) as LlmProvider[]).map((p) => ({
                    value: p,
                    label: PROVIDER_LABELS[p]
                  }))}
                />
                <Dropdown
                  value={form.model}
                  onChange={(v) => setField('model', v)}
                  options={PROVIDER_MODELS[form.provider]}
                />
              </div>
            )}
            {aiListenerEnabled && !hasApiKey && (
              <p className="text-xs text-amber-600">
                No API key set for {PROVIDER_LABELS[form.provider]}.{' '}
                <button onClick={() => setSettingsOpen(true)} className="underline">
                  Add one in Settings
                </button>
                .
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-black/10 p-3">
        <button
          onClick={handleStart}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700"
        >
          <Play size={15} />
          Start Presenting
        </button>
      </div>
    </div>
  )
}
