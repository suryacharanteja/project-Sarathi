import type { ReactNode } from 'react'

export function FieldLabel({ icon, children }: { icon?: ReactNode; children: ReactNode }): React.JSX.Element {
  return (
    <div className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-[var(--text-hi)]">
      {icon}
      <span>{children}</span>
    </div>
  )
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>): React.JSX.Element {
  return (
    <input
      {...props}
      className="w-full rounded-lg border border-[var(--bg-edge)] bg-[var(--state-layer)] px-3 py-2 text-sm text-[var(--text-hi)] placeholder:text-[var(--text-mid)] outline-none transition focus:border-[var(--bg-edge)] focus:bg-[var(--bg-surface)]"
    />
  )
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>): React.JSX.Element {
  return (
    <textarea
      {...props}
      className="w-full resize-y rounded-lg border border-[var(--bg-edge)] bg-[var(--state-layer)] px-3 py-2 text-sm text-[var(--text-hi)] placeholder:text-[var(--text-mid)] outline-none transition focus:border-[var(--bg-edge)] focus:bg-[var(--bg-surface)]"
    />
  )
}
