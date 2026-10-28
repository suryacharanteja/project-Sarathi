import { Check } from 'lucide-react'
import { Tooltip } from './tooltip'

export function Toggle({
  checked,
  onChange,
  label,
  hint
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  hint?: string
}): React.JSX.Element {
  const button = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-12 items-center gap-2 rounded text-sm text-[var(--text-hi)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
    >
      <span
        className={`flex h-4 w-4 items-center justify-center rounded border transition ${
          checked ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-[var(--bg-edge)] bg-[var(--bg-surface)]'
        }`}
      >
        {checked && <Check size={12} strokeWidth={3} />}
      </span>
      {label}
    </button>
  )

  return hint ? <Tooltip label={hint}>{button}</Tooltip> : button
}
