import { useEffect, useId, useRef, useState } from 'react'
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
  const listId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [active, setActive] = useState(0)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const current = options.find((o) => o.value === value)

  useEffect(() => {
    if (open) rootRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]')[active]?.focus()
  }, [open, active])

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent): void {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); triggerRef.current?.focus() }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative inline-block" onKeyDown={(event) => {
      if (event.key === 'Tab') { setOpen(false); return }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Escape'].includes(event.key)) return
      event.preventDefault(); event.stopPropagation()
      if (event.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); return }
      if (!open) { setActive(Math.max(0, options.findIndex((o) => o.value === value))); setOpen(true); return }
      setActive((index) => event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
        : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length)
    }}>
      <button
        type="button"
        ref={triggerRef} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined}
        aria-label={current?.label ?? value}
        onClick={() => { setActive(Math.max(0, options.findIndex((o) => o.value === value))); setOpen((v) => !v) }}
        className={`flex items-center gap-1.5 rounded-lg border border-[var(--bg-edge)] bg-[var(--state-layer)] px-3 py-1.5 text-sm text-[var(--text-hi)] transition hover:bg-[var(--state-layer)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 ${className}`}
      >
        {current?.label ?? value}
        <ChevronDown size={14} className="text-[var(--text-mid)]" />
      </button>
      {open && (
        <ul
          role="listbox" id={listId} aria-label="Options"
          className="absolute left-0 top-full z-50 mt-1 max-h-56 w-max min-w-full overflow-y-auto rounded-lg border border-[var(--bg-edge)] bg-[var(--bg-surface)] py-1 text-sm text-[var(--text-hi)] shadow-xl"
        >
          {options.map((option, index) => (
            <li key={option.value}>
              <button
                type="button"
                role="option"
                tabIndex={index === active ? 0 : -1}
                aria-selected={option.value === value}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                  triggerRef.current?.focus()
                }}
                className={`block w-full whitespace-nowrap px-3 py-1.5 text-left transition hover:bg-[var(--state-layer)] focus-visible:outline-none focus-visible:bg-[var(--state-layer)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]/40 ${
                  option.value === value ? 'bg-[var(--state-layer)] font-medium' : ''
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
