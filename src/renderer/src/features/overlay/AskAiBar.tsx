import { useState } from 'react'
import { Send, Loader2 } from 'lucide-react'
import { useSessionStore } from '../../stores/session-store'
import { askAiAndAddCard } from './ask-ai'

export function AskAiBar(): React.JSX.Element {
  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const form = useSessionStore((s) => s.form)

  async function handleAsk(): Promise<void> {
    const trimmed = question.trim()
    if (!trimmed || asking) return

    setAsking(true)
    setError(null)
    setQuestion('')

    const result = await askAiAndAddCard(trimmed, form)
    if (result.error) setError(result.error)

    setAsking(false)
  }

  return (
    <div className="border-t border-[var(--bg-edge)] p-2">
      {error && <p className="mb-1.5 px-1 text-xs text-[var(--danger)]">{error}</p>}
      <div className="flex items-center gap-2">
        <input
          aria-label="Question for AI"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAsk()
          }}
          placeholder="Type a question to test Ask AI…"
          className="min-w-0 flex-1 rounded-lg border border-[var(--bg-edge)] bg-[var(--state-layer)] px-3 py-2 text-sm text-[var(--text-hi)] placeholder:text-[var(--text-mid)] outline-none focus:border-[var(--bg-edge)]"
        />
        <button
          onClick={handleAsk}
          disabled={asking || !question.trim()}
          className="flex shrink-0 items-center whitespace-nowrap gap-1.5 rounded-lg bg-[var(--state-layer)] px-3 py-2 text-sm font-medium text-[var(--text-hi)] transition hover:bg-[var(--state-layer)] disabled:opacity-40"
        >
          {asking ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          Ask AI
        </button>
      </div>
    </div>
  )
}
