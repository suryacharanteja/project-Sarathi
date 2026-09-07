import { useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

const MIN_SCALE = 0.5
const MAX_SCALE = 2.0

export function PdfViewerPanel({
  filePath,
  onProgress
}: {
  filePath: string
  /** Reports page/total up whenever they change — this component's paging
   *  state is local, but OverlayTopBar (outside it) needs it too. */
  onProgress?: (page: number, total: number) => void
}): React.JSX.Element {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [pageNum, setPageNum] = useState(1)
  const [scale, setScale] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null)

  // Load the document whenever a new file is picked
  useEffect(() => {
    let cancelled = false
    setDoc(null)
    setError(null)
    setPageNum(1)
    window.sarathi.readDocumentBytes(filePath).then((result) => {
      if (cancelled) return
      if (result.error || !result.data) {
        setError(result.error ?? 'Could not read the PDF file.')
        return
      }
      pdfjsLib.getDocument({ data: result.data }).promise.then(
        (loaded) => {
          if (cancelled) return
          setDoc(loaded)
        },
        (err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to parse PDF.')
        }
      )
    })
    return () => {
      cancelled = true
    }
  }, [filePath])

  const totalPages = doc?.numPages ?? 0

  useEffect(() => {
    if (totalPages > 0) onProgress?.(pageNum, totalPages)
  }, [pageNum, totalPages, onProgress])

  // Render the current page — lazy, on demand, only the page in view
  useEffect(() => {
    if (!doc) return
    let cancelled = false
    doc.getPage(pageNum).then(async (page) => {
      if (cancelled) return
      const canvas = canvasRef.current
      const context = canvas?.getContext('2d')
      if (!canvas || !context) return
      const viewport = page.getViewport({ scale })
      canvas.width = viewport.width
      canvas.height = viewport.height
      renderTaskRef.current?.cancel()
      const task = page.render({ canvasContext: context, viewport, canvas })
      renderTaskRef.current = task
      try {
        await task.promise
      } catch {
        // Superseded by a newer render (page/scale changed mid-flight) — ignore
      }
    })
    return () => {
      cancelled = true
    }
  }, [doc, pageNum, scale])

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.target !== document.body) return
      if (e.code === 'ArrowRight') {
        e.preventDefault()
        setPageNum((p) => Math.min(p + 1, totalPages || p))
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault()
        setPageNum((p) => Math.max(p - 1, 1))
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault()
        setScale((s) => Math.min(MAX_SCALE, +(s + 0.1).toFixed(2)))
      } else if (e.key === '-') {
        e.preventDefault()
        setScale((s) => Math.max(MIN_SCALE, +(s - 0.1).toFixed(2)))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [totalPages])

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span className="text-base italic text-red-400">{error}</span>
      </div>
    )
  }

  if (!doc) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span className="text-base italic text-neutral-600">Loading PDF…</span>
      </div>
    )
  }

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <div className="flex flex-1 items-center justify-center overflow-auto bg-neutral-900 px-4 py-4">
        <canvas ref={canvasRef} className="shadow-lg" />
      </div>
      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-white/10 px-4 py-2">
        <button
          onClick={() => setPageNum((p) => Math.max(p - 1, 1))}
          disabled={pageNum <= 1}
          className="rounded px-2 py-1 text-xs text-neutral-400 transition hover:text-neutral-100 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
        >
          ← Previous
        </button>
        <span className="select-none text-xs text-neutral-500">
          Page {pageNum} / {totalPages} · {Math.round(scale * 100)}%
        </span>
        <button
          onClick={() => setPageNum((p) => Math.min(p + 1, totalPages))}
          disabled={pageNum >= totalPages}
          className="rounded px-2 py-1 text-xs text-neutral-400 transition hover:text-neutral-100 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
        >
          Next →
        </button>
      </div>
      <div className="h-1 w-full shrink-0 bg-white/5">
        <div
          className="h-full bg-[var(--accent)] transition-all duration-300"
          style={{ width: `${totalPages ? (pageNum / totalPages) * 100 : 0}%` }}
        />
      </div>
    </div>
  )
}
