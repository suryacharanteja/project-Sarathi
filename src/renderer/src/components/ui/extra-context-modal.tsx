import { useState } from 'react'
import { X, MessageSquare } from 'lucide-react'
import { TextArea } from './field-shell'

export function ExtraContextModal({
  initialValue,
  onSave,
  onClose
}: {
  initialValue: string
  onSave: (value: string) => void
  onClose: () => void
}): React.JSX.Element {
  const [value, setValue] = useState(initialValue)

  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center bg-black/30"
      // Inline, not backdrop-blur-sm — see index.css's .elevation-3 comment.
      style={{ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
    >
      <div
        className="w-[90%] max-w-sm rounded-2xl border border-[var(--bg-edge)] bg-[var(--bg-surface)] p-4 shadow-2xl"
        style={{ backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' }}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-[var(--text-hi)]">
            <MessageSquare size={15} /> Extra Context
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-[var(--text-mid)] hover:bg-[var(--state-layer)]">
            <X size={16} />
          </button>
        </div>

        <TextArea
          rows={6}
          maxLength={1000}
          placeholder="Anything else the AI should know when answering — a project you want highlighted, a preferred framing, terminology the interviewer uses, etc."
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <p className="mt-1 text-right text-[11px] text-[var(--text-mid)]">{value.length}/1000</p>

        <button
          onClick={() => {
            onSave(value)
            onClose()
          }}
          className="mt-2 w-full rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
        >
          Save
        </button>
      </div>
    </div>
  )
}
