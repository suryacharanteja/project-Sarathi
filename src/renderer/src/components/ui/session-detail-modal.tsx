import { useEffect, useState } from 'react'
import { Briefcase, FileText, Mic, Radio, X } from 'lucide-react'
import type { SessionSummary } from '@shared/ipc-contract'
import type { TranscriptMessage } from '@shared/transcript-types'

export function SessionDetailModal({
  sessionId,
  onClose
}: {
  sessionId: string
  onClose: () => void
}): React.JSX.Element {
  const [session, setSession] = useState<SessionSummary | null>(null)
  const [transcript, setTranscript] = useState<TranscriptMessage[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([window.sarathi.getSession(sessionId), window.sarathi.getSessionTranscript(sessionId)])
      .then(([sessionResult, transcriptResult]) => {
        setSession(sessionResult)
        setTranscript(transcriptResult)
      })
      .finally(() => setLoading(false))
  }, [sessionId])

  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center bg-black/30"
      // Inline, not backdrop-blur-sm — see index.css's .elevation-3 comment.
      style={{ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
    >
      <div
        className="flex max-h-[85%] w-[90%] max-w-sm flex-col rounded-2xl border border-[var(--bg-edge)] bg-[var(--bg-surface)] p-4 shadow-2xl"
        style={{ backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' }}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-[var(--text-hi)]">
            <Briefcase size={15} /> {session?.form.company || 'Session details'}
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-[var(--text-mid)] hover:bg-[var(--state-layer)]">
            <X size={16} />
          </button>
        </div>

        {loading ? (
          <p className="py-4 text-center text-sm text-[var(--text-mid)]">Loading…</p>
        ) : !session ? (
          <p className="py-4 text-center text-sm text-[var(--text-mid)]">Session not found.</p>
        ) : (
          <div className="flex-1 space-y-3 overflow-y-auto">
            <p className="text-xs text-[var(--text-mid)]">{new Date(session.createdAt).toLocaleString()}</p>

            {session.form.jobDescription && (
              <div>
                <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-[var(--text-mid)]">
                  <FileText size={12} /> Job Description
                </div>
                <p className="text-sm text-[var(--text-hi)]">{session.form.jobDescription}</p>
              </div>
            )}

            <div>
              <p className="mb-1.5 text-xs font-medium text-[var(--text-mid)]">Transcript</p>
              {!session.form.saveTranscript ? (
                <p className="text-sm text-[var(--text-mid)]">
                  Save Transcript was off for this session — no transcript was saved.
                </p>
              ) : !transcript || transcript.length === 0 ? (
                <p className="text-sm text-[var(--text-mid)]">No transcript was saved for this session.</p>
              ) : (
                <div className="space-y-2">
                  {transcript.map((message) => (
                    <div key={message.id} className="flex items-start gap-1.5 text-sm text-[var(--text-hi)]">
                      {message.source === 'system' ? (
                        <Radio size={12} className="mt-1 shrink-0 text-[var(--text-mid)]" />
                      ) : (
                        <Mic size={12} className="mt-1 shrink-0 text-[var(--text-mid)]" />
                      )}
                      <span>{message.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
