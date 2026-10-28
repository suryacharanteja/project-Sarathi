import { useEffect, useState } from 'react'
import { Briefcase, Code2, Loader2 } from 'lucide-react'
import type { SessionSummary } from '@shared/ipc-contract'

export function CallSessionsList({ onOpenSession }: { onOpenSession: (id: string) => void }): React.JSX.Element {
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null)

  useEffect(() => {
    window.sarathi.listSessions().then(setSessions)
  }, [])

  if (sessions === null) {
    return (
      <div className="flex flex-1 items-center justify-center text-[var(--text-mid)]">
        <Loader2 size={16} className="animate-spin" />
      </div>
    )
  }

  if (sessions.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-[var(--text-mid)]">
        No call sessions yet.
      </div>
    )
  }

  return (
    <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
      {sessions.map((session) => (
        <div
          key={session.id}
          onClick={() => onOpenSession(session.id)}
          className="flex cursor-default items-center justify-between rounded-lg border border-[var(--bg-edge)] bg-[var(--state-layer)] px-3 py-2.5 transition hover:bg-[var(--state-layer)]"
        >
          <div className="flex items-center gap-2 text-sm text-[var(--text-hi)]">
            {session.form.sessionType === 'interview' ? <Briefcase size={14} /> : <Code2 size={14} />}
            <span className="font-medium">{session.form.company || 'Untitled session'}</span>
          </div>
          <span className="text-xs text-[var(--text-mid)]">
            {new Date(session.createdAt).toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  )
}
