import { useEffect, useState } from 'react'
import { X, KeyRound, Check } from 'lucide-react'
import type { AppSettings } from '@shared/ipc-contract'
import { defaultAppSettings } from '@shared/ipc-contract'
import { LLM_FALLBACK_ORDER, type LlmProvider } from '@shared/session-types'
import { TextInput } from '../../components/ui/field-shell'
import { TranscriptionSettings } from './TranscriptionSettings'

const KEY_FIELDS: { key: keyof AppSettings; label: string; placeholder: string }[] = [
  { key: 'geminiApiKey', label: 'Gemini API Key', placeholder: 'AIza...' },
  { key: 'openaiApiKey', label: 'OpenAI API Key', placeholder: 'sk-...' },
  { key: 'openCodeGoApiKey', label: 'OpenCode Go API Key', placeholder: '...' },
  { key: 'openCodeZenApiKey', label: 'OpenCode Zen API Key', placeholder: '...' },
  { key: 'deepseekApiKey', label: 'DeepSeek API Key', placeholder: 'sk-...' },
  { key: 'assemblyAiApiKey', label: 'AssemblyAI API Key', placeholder: '...' }
]

const PROVIDER_LABELS: Record<LlmProvider, string> = {
  gemini: 'Gemini',
  openai: 'OpenAI',
  'opencode-go': 'OpenCode Go',
  'opencode-zen': 'OpenCode Zen',
  deepseek: 'DeepSeek'
}

const PROVIDER_KEY_FIELD: Record<LlmProvider, keyof AppSettings> = {
  gemini: 'geminiApiKey',
  openai: 'openaiApiKey',
  'opencode-go': 'openCodeGoApiKey',
  'opencode-zen': 'openCodeZenApiKey',
  deepseek: 'deepseekApiKey'
}

/** Mirrors main/ipc.ts's candidate-building logic exactly (primary first if
 *  configured, then LLM_FALLBACK_ORDER) so what the user sees here is the
 *  literal chain a real request would use — not a guess at it. */
function describeFallbackChain(settings: AppSettings): string {
  const configured = LLM_FALLBACK_ORDER.filter((p) => Boolean(settings[PROVIDER_KEY_FIELD[p]]))
  if (configured.length === 0) return 'No LLM provider configured yet — add at least one key above.'
  if (configured.length === 1) {
    return `Only ${PROVIDER_LABELS[configured[0]]} is configured — no automatic fallback if it fails. Add another provider's key to enable failover.`
  }
  return `Automatic fallback order: ${configured.map((p) => PROVIDER_LABELS[p]).join(' → ')}`
}

export function SettingsModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [settings, setSettings] = useState<AppSettings>(defaultAppSettings)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.sarathi
      .getSettings()
      .then(setSettings)
      .finally(() => setLoading(false))
  }, [])

  async function handleSave(): Promise<void> {
    const next = await window.sarathi.setSettings(settings)
    setSettings(next)
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }

  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center bg-black/30"
      // Inline, not backdrop-blur-sm — this Tailwind/Lightning CSS build
      // silently drops the unprefixed backdrop-filter (see index.css's
      // .elevation-3 comment); inline styles bypass CSS-file processing.
      style={{ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
    >
      <div
        className="flex max-h-[85vh] w-[90%] max-w-sm flex-col rounded-2xl border border-black/10 bg-white/95 shadow-2xl"
        style={{ backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' }}
      >
        <div className="flex items-center justify-between p-4 pb-3">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-neutral-900">
            <KeyRound size={15} /> Settings
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-neutral-500 hover:bg-black/5">
            <X size={16} />
          </button>
        </div>

        {loading ? (
          <p className="py-4 text-center text-sm text-neutral-500">Loading…</p>
        ) : (
          <div className="space-y-3 overflow-y-auto px-4 pb-4">
            {KEY_FIELDS.map(({ key, label, placeholder }) => (
              <div key={key}>
                <label className="mb-1 block text-xs font-medium text-neutral-600">{label}</label>
                <TextInput
                  type="password"
                  placeholder={placeholder}
                  value={settings[key] ?? ''}
                  // Trimmed at entry — nothing downstream (schema, storage)
                  // ever cleaned this up, so a stray double-paste or trailing
                  // newline persisted silently forever and could quietly
                  // break auth for that provider with no visible cause.
                  onChange={(e) => setSettings((s) => ({ ...s, [key]: e.target.value.trim() }))}
                />
              </div>
            ))}

            <p className="rounded-md bg-black/[0.03] px-2.5 py-2 text-[11px] leading-snug text-neutral-600">
              {describeFallbackChain(settings)}
            </p>

            <TranscriptionSettings settings={settings} onChange={(patch) => setSettings((s) => ({ ...s, ...patch }))} />

            <button
              onClick={handleSave}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-neutral-900 py-2 text-sm font-medium text-white transition hover:bg-neutral-700"
            >
              {saved ? (
                <>
                  <Check size={14} /> Saved
                </>
              ) : (
                'Save'
              )}
            </button>
            <p className="text-center text-[11px] text-neutral-400">
              Stored locally on this device, never leaves your machine except to call the provider you configure.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
