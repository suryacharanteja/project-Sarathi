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
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2 text-sm text-neutral-700"
    >
      <span
        className={`flex h-4 w-4 items-center justify-center rounded border transition ${
          checked ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-black/20 bg-white'
        }`}
      >
        {checked && <Check size={12} strokeWidth={3} />}
      </span>
      {label}
    </button>
  )

  return hint ? <Tooltip label={hint}>{button}</Tooltip> : button
}
