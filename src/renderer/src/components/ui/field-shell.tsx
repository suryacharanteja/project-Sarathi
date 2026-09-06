import type { ReactNode } from 'react'

export function FieldLabel({ icon, children }: { icon?: ReactNode; children: ReactNode }): React.JSX.Element {
  return (
    <div className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-neutral-700">
      {icon}
      <span>{children}</span>
    </div>
  )
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>): React.JSX.Element {
  return (
    <input
      {...props}
      className="w-full rounded-lg border border-black/10 bg-black/[0.03] px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none transition focus:border-black/25 focus:bg-white"
    />
  )
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>): React.JSX.Element {
  return (
    <textarea
      {...props}
      className="w-full resize-y rounded-lg border border-black/10 bg-black/[0.03] px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none transition focus:border-black/25 focus:bg-white"
    />
  )
}
