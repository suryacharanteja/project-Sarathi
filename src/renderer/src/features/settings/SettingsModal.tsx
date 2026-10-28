import { useEffect, useRef, useState } from 'react'
import { X, KeyRound, Check } from 'lucide-react'
import type { AppSettings } from '@shared/ipc-contract'
import { defaultAppSettings } from '@shared/ipc-contract'
import { LLM_FALLBACK_ORDER, type LlmProvider } from '@shared/session-types'
import { TextInput } from '../../components/ui/field-shell'
import { ThemeToggle } from '../../components/ui/theme-toggle'
import { TranscriptionSettings } from './TranscriptionSettings'

const KEY_FIELDS: { key: Extract<keyof AppSettings, `${string}ApiKey`>; label: string; placeholder: string }[] = [
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
  const dialogRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialogRef.current?.focus()
    return () => previous?.focus()
  }, [])
  const [settings, setSettings] = useState<AppSettings>(defaultAppSettings)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.sarathi
      .getSettings()
      .then(setSettings)
      .catch(() => setSaveError('Settings could not be loaded. Close and try again.'))
      .finally(() => setLoading(false))
  }, [])

  async function handleSave(): Promise<void> {
    setSaveError(null)
    setSaved(false)
    try {
      const next = await window.sarathi.setSettings(settings)
      setSettings(next)
      setSaved(true)
      setTimeout(() => setSaved(false), 1800)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Settings could not be saved.')
    }
  }

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/30"
      // Inline, not backdrop-blur-sm — this Tailwind/Lightning CSS build
      // silently drops the unprefixed backdrop-filter (see index.css's
      // .elevation-3 comment); inline styles bypass CSS-file processing.
      style={{ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
    >
      <div
        ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="settings-heading" tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === 'Escape') { event.stopPropagation(); onClose() }
          if (event.key !== 'Tab') return
          const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]'))
            .filter((element) => element.getClientRects().length > 0)
          const first = controls[0], last = controls.at(-1)
          if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) {
            event.preventDefault(); last?.focus()
          } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === event.currentTarget)) {
            event.preventDefault(); first?.focus()
          }
        }}
        className="flex max-h-[85vh] w-[90%] max-w-sm flex-col rounded-2xl border border-[var(--bg-edge)] bg-[var(--bg-surface)] shadow-2xl"
        style={{ backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' }}
      >
        <div className="flex items-center justify-between p-4 pb-3">
          <div id="settings-heading" className="flex items-center gap-1.5 text-sm font-semibold text-[var(--text-hi)]">
            <KeyRound size={15} /> Settings
          </div>
          <div className="flex items-center"><ThemeToggle />
          <button onClick={onClose} aria-label="Close settings" className="icon-button">
            <X size={20} />
          </button></div>
        </div>

        {loading ? (
          <p className="py-4 text-center text-sm text-[var(--text-mid)]">Loading…</p>
        ) : (
          <div className="space-y-3 overflow-y-auto px-4 pb-4">
            {KEY_FIELDS.map(({ key, label, placeholder }) => (
              <div key={key}>
                <label htmlFor={key} className="mb-1 block text-xs font-medium text-[var(--text-mid)]">{label}</label>
                <TextInput
                  id={key}
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

            <p className="rounded-md bg-[var(--state-layer)] px-2.5 py-2 text-[11px] leading-snug text-[var(--text-mid)]">
              {describeFallbackChain(settings)}
            </p>

            <TranscriptionSettings settings={settings} onChange={(patch) => setSettings((s) => ({ ...s, ...patch }))} />

            {saveError && <p role="alert" className="text-xs text-[var(--danger)]">{saveError}</p>}
            <button
              onClick={handleSave}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
            >
              {saved ? (
                <>
                  <Check size={14} /> Saved
                </>
              ) : (
                'Save'
              )}
            </button>
            <p className="text-center text-[11px] text-[var(--text-mid)]">
              Stored locally on this device, never leaves your machine except to call the provider you configure.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
