import { useEffect, useState } from 'react'
import { Plus, Trash2, ChevronUp, ChevronDown, GripVertical, FileUp, FileDown } from 'lucide-react'
import { toast } from 'sonner'
import { usePrompterStore, type Slide } from '../prompter/prompter-store'

/** `# Heading` starts a new slide; everything until the next heading is its
 *  body. Text before the first heading becomes an "Introduction" slide. */
function parseSlidesFromText(text: string): Slide[] {
  const lines = text.split('\n')
  const slides: Slide[] = []
  let current: { title: string; body: string[] } | null = null

  for (const line of lines) {
    const heading = line.match(/^#{1,6}\s+(.*)/)
    if (heading) {
      if (current) slides.push({ id: crypto.randomUUID(), title: current.title, body: current.body.join('\n').trim() })
      current = { title: heading[1].trim(), body: [] }
    } else {
      if (!current) current = { title: 'Introduction', body: [] }
      current.body.push(line)
    }
  }
  if (current) slides.push({ id: crypto.randomUUID(), title: current.title, body: current.body.join('\n').trim() })

  return slides.length > 0 ? slides : [{ id: crypto.randomUUID(), title: 'Slide 1', body: text.trim() }]
}

/** Inverse of parseSlidesFromText — round-trips back into the same
 *  `# Title` heading format the importer understands. */
function slidesToMarkdown(slides: Slide[]): string {
  return slides.map((s) => `# ${s.title || 'Untitled'}\n\n${s.body}`).join('\n\n')
}

export function SlideBuilder(): React.JSX.Element {
  const { slides, addSlide, updateSlide, removeSlide, reorderSlide, setSlides } = usePrompterStore()
  const [selectedId, setSelectedId] = useState<string | null>(slides[0]?.id ?? null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    if (selectedId && slides.some((s) => s.id === selectedId)) return
    setSelectedId(slides[0]?.id ?? null)
  }, [slides, selectedId])

  const selected = slides.find((s) => s.id === selectedId) ?? null

  function handleAdd(): void {
    const slide: Slide = { id: crypto.randomUUID(), title: `Slide ${slides.length + 1}`, body: '' }
    addSlide(slide)
    setSelectedId(slide.id)
  }

  function moveSelected(direction: -1 | 1): void {
    if (!selected) return
    const index = slides.findIndex((s) => s.id === selected.id)
    const target = index + direction
    if (target < 0 || target >= slides.length) return
    reorderSlide(index, target)
  }

  function handleDeleteSelected(): void {
    if (!selected) return
    removeSlide(selected.id)
  }

  async function handleImport(): Promise<void> {
    setImporting(true)
    try {
      const result = await window.sarathi.importSlideSource()
      if (result.cancelled) return
      if (result.error) {
        toast.error(result.error)
        return
      }
      // .pptx comes back as real slide-by-slide structure — use it directly.
      if (result.slides && result.slides.length > 0) {
        const withIds = result.slides.map((s) => ({ id: crypto.randomUUID(), title: s.title, body: s.body }))
        setSlides(withIds)
        toast.success(`Imported ${withIds.length} slide${withIds.length === 1 ? '' : 's'} from ${result.fileName}`)
        return
      }
      // PDF/DOCX/TXT/MD come back as flat text — split on headings as before.
      if (result.text) {
        const parsed = parseSlidesFromText(result.text)
        setSlides(parsed)
        toast.success(`Imported ${parsed.length} slide${parsed.length === 1 ? '' : 's'} from ${result.fileName}`)
      }
    } finally {
      setImporting(false)
    }
  }

  async function handleExport(): Promise<void> {
    if (slides.length === 0) {
      toast.error('Add at least one slide before exporting.')
      return
    }
    setExporting(true)
    try {
      const markdown = slidesToMarkdown(slides)
      const result = await window.sarathi.exportSlides(markdown, 'slides.md')
      if (result.cancelled) return
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(`Saved ${slides.length} slide${slides.length === 1 ? '' : 's'} to ${result.filePath}`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <div className="w-full sm:w-44 shrink-0 space-y-1">
        <div className="max-h-52 space-y-1 overflow-y-auto pr-1">
          {slides.map((slide, index) => (
            <div
              key={slide.id}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIndex !== null && dragIndex !== index) reorderSlide(dragIndex, index)
                setDragIndex(null)
              }}
              onClick={() => setSelectedId(slide.id)}
              className={`group flex cursor-pointer items-center gap-1 rounded-lg border px-2 py-1.5 text-xs transition ${
                slide.id === selectedId
                  ? 'border-indigo-200 bg-[var(--accent-container)] text-[var(--accent)]'
                  : 'border-[var(--bg-edge)] bg-[var(--state-layer)] text-[var(--text-mid)] hover:bg-[var(--state-layer)]'
              }`}
            >
              <GripVertical size={12} className="shrink-0 text-[var(--text-mid)]" />
              <span className="flex-1 truncate">
                {index + 1}. {slide.title || 'Untitled'}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  removeSlide(slide.id)
                }}
                className="shrink-0 text-[var(--text-mid)] opacity-0 hover:text-[var(--danger)] group-hover:opacity-100"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          {slides.length === 0 && <p className="px-1 py-2 text-xs text-[var(--text-mid)]">No slides yet.</p>}
        </div>
        <div className="flex gap-1 pt-1">
          <button
            onClick={handleAdd}
            aria-label="Add slide" title="Add slide"
            className="flex-1 rounded-lg border border-[var(--bg-edge)] bg-[var(--bg-surface)] min-h-10 py-1 text-[var(--text-mid)] transition hover:bg-[var(--state-layer)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
          >
            <Plus size={18} className="mx-auto" />
          </button>
          <button
            onClick={handleDeleteSelected}
            disabled={!selected}
            aria-label="Delete slide" title="Delete slide"
            className="flex-1 rounded-lg border border-[var(--bg-edge)] bg-[var(--bg-surface)] min-h-10 py-1 text-[var(--text-mid)] transition hover:bg-red-50 hover:text-[var(--danger)] disabled:opacity-40 disabled:hover:bg-[var(--bg-surface)] disabled:hover:text-[var(--text-mid)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--danger)]/40"
          >
            <Trash2 size={18} className="mx-auto" />
          </button>
          <button
            onClick={() => moveSelected(-1)}
            disabled={!selected}
            aria-label="Move up" title="Move up"
            className="flex-1 rounded-lg border border-[var(--bg-edge)] bg-[var(--bg-surface)] min-h-10 py-1 text-[var(--text-mid)] transition hover:bg-[var(--state-layer)] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
          >
            <ChevronUp size={18} className="mx-auto" />
          </button>
          <button
            onClick={() => moveSelected(1)}
            disabled={!selected}
            aria-label="Move down" title="Move down"
            className="flex-1 rounded-lg border border-[var(--bg-edge)] bg-[var(--bg-surface)] min-h-10 py-1 text-[var(--text-mid)] transition hover:bg-[var(--state-layer)] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
          >
            <ChevronDown size={18} className="mx-auto" />
          </button>
        </div>
        <div className="flex gap-1">
          <button
            onClick={handleImport}
            disabled={importing}
            aria-label="Import from file" title="Import from file"
            className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-[var(--bg-edge)] bg-[var(--bg-surface)] min-h-10 py-1 text-xs text-[var(--text-mid)] transition hover:bg-[var(--state-layer)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
          >
            <FileUp size={12} />
            {importing ? 'Importing…' : 'Import'}
          </button>
          <button
            onClick={handleExport}
            disabled={exporting || slides.length === 0}
            aria-label="Export slides to a Markdown file" title="Export slides to a Markdown file"
            className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-[var(--bg-edge)] bg-[var(--bg-surface)] min-h-10 py-1 text-xs text-[var(--text-mid)] transition hover:bg-[var(--state-layer)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
          >
            <FileDown size={12} />
            {exporting ? 'Saving…' : 'Export'}
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-2">
        {selected ? (
          <>
            <input
              value={selected.title}
              onChange={(e) => updateSlide(selected.id, { title: e.target.value })}
              aria-label="Slide title" placeholder="Slide title"
              className="w-full rounded-lg border border-[var(--bg-edge)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-sm font-medium text-[var(--text-hi)] focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
            <textarea
              value={selected.body}
              onChange={(e) => updateSlide(selected.id, { body: e.target.value })}
              aria-label="Slide content" placeholder="Speaker notes / content for this slide…"
              rows={6}
              className="w-full resize-none rounded-lg border border-[var(--bg-edge)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-sm text-[var(--text-hi)] focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </>
        ) : (
          <div className="flex h-full min-h-[140px] items-center justify-center rounded-lg border-2 border-dashed border-[var(--bg-edge)] text-xs text-[var(--text-mid)]">
            Add a slide to get started
          </div>
        )}
      </div>
    </div>
  )
}
