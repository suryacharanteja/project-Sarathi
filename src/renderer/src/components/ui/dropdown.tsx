import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

export interface DropdownOption {
  value: string
  label: string
}

/**
 * Replaces the native `<select>` everywhere in this app. A native select's
 * open option list is rendered by the OS as a separate top-level popup —
 * same stealth-breaking class as native `title` tooltips, and NOT covered
 * by setContentProtection. This renders the open list as ordinary page
 * content inside the same window instead.
 */
export function Dropdown({
  value,
  options,
  onChange,
  className = ''
}: {
  value: string
  options: DropdownOption[]
  onChange: (value: string) => void
  className?: string
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const current = options.find((o) => o.value === value)

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent): void {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 rounded-lg border border-black/10 bg-black/[0.02] px-3 py-1.5 text-sm text-neutral-700 outline-none hover:bg-black/[0.06] ${className}`}
      >
        {current?.label ?? value}
        <ChevronDown size={14} className="text-neutral-400" />
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute left-0 top-full z-50 mt-1 max-h-56 w-max min-w-full overflow-y-auto rounded-lg border border-black/10 bg-white py-1 text-sm text-neutral-700 shadow-xl"
        >
          {options.map((option) => (
            <li key={option.value}>
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
                className={`block w-full whitespace-nowrap px-3 py-1.5 text-left hover:bg-black/[0.06] ${
                  option.value === value ? 'bg-black/[0.04] font-medium' : ''
                }`}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
