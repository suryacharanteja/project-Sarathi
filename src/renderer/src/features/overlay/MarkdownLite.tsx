function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={`${keyPrefix}-${i}`} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      )
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={`${keyPrefix}-${i}`} className="rounded bg-white/10 px-1 py-0.5 font-mono text-[0.85em]">
          {part.slice(1, -1)}
        </code>
      )
    }
    return <span key={`${keyPrefix}-${i}`}>{part}</span>
  })
}

/** Minimal markdown: paragraphs, bullet lists, bold/inline-code — no external deps. */
export function MarkdownLite({ text }: { text: string }): React.JSX.Element {
  const lines = text.split('\n')
  const blocks: React.ReactNode[] = []
  let listBuffer: string[] = []

  const flushList = (key: string): void => {
    if (listBuffer.length > 0) {
      blocks.push(
        <ul key={key} className="list-disc space-y-1 pl-5">
          {listBuffer.map((item, i) => (
            <li key={i}>{renderInline(item, `${key}-${i}`)}</li>
          ))}
        </ul>
      )
      listBuffer = []
    }
  }

  lines.forEach((line, i) => {
    const trimmed = line.trim()
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      listBuffer.push(trimmed.slice(2))
      return
    }
    flushList(`list-${i}`)
    if (trimmed.length === 0) return
    blocks.push(
      <p key={`p-${i}`} className="leading-relaxed">
        {renderInline(trimmed, `p-${i}`)}
      </p>
    )
  })
  flushList('list-end')

  return <div className="space-y-2 text-sm text-neutral-200">{blocks}</div>
}
