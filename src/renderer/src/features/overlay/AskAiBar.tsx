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
    <div className="border-t border-white/10 p-2">
      {error && <p className="mb-1.5 px-1 text-xs text-red-400">{error}</p>}
      <div className="flex items-center gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAsk()
          }}
          placeholder="Type a question to test Ask AI…"
          className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 outline-none focus:border-white/25"
        />
        <button
          onClick={handleAsk}
          disabled={asking || !question.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/25 disabled:opacity-40"
        >
          {asking ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          Ask AI
        </button>
      </div>
    </div>
  )
}
