import { useEffect, useRef, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy, PageViewport } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'
import { getFitPageScale, getPdfOutputScale } from './pdf-viewer-utils'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

const MIN_SCALE = 0.25
const MAX_SCALE = 4.0
const PREFETCH_RADIUS = 1

function prepareCanvas(canvas: HTMLCanvasElement, viewport: PageViewport, outputScale: number): void {
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  canvas.style.width = `${viewport.width / outputScale}px`
  canvas.style.height = `${viewport.height / outputScale}px`
}

function snapshotCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const copy = document.createElement('canvas')
  copy.width = source.width
  copy.height = source.height
  copy.getContext('2d')?.drawImage(source, 0, 0)
  return copy
}

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
  const [fitPage, setFitPage] = useState(true)
  const [outputScale, setOutputScale] = useState(() => getPdfOutputScale(window.devicePixelRatio))
  const [error, setError] = useState<string | null>(null)
  const viewerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Pre-rendered neighbor pages, keyed "page" (cache is scale-specific —
  // cleared whenever scale changes) — lets paging feel instant instead of
  // re-running pdfjs's render pipeline on every navigation.
  const pageCacheRef = useRef<Map<number, HTMLCanvasElement>>(new Map())

  // Load the document whenever a new file is picked
  useEffect(() => {
    let cancelled = false
    setDoc(null)
    setError(null)
    setPageNum(1)
    setScale(1)
    setFitPage(true)
    pageCacheRef.current.clear()
    window.sarathi.readDocumentBytes(filePath).then(
      (result) => {
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
      },
      (err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not read the PDF file.')
      }
    )
    return () => {
      cancelled = true
    }
  }, [filePath])

  const totalPages = doc?.numPages ?? 0

  useEffect(() => {
    if (!doc || !fitPage) return
    let cancelled = false
    const updateFitScale = async (): Promise<void> => {
      const viewer = viewerRef.current
      if (!viewer) return
      const page = await doc.getPage(pageNum)
      if (cancelled) return
      const baseViewport = page.getViewport({ scale: 1 })
      const nextScale = getFitPageScale(viewer.clientWidth, viewer.clientHeight, baseViewport.width, baseViewport.height)
      setScale((current) => (Math.abs(current - nextScale) < 0.005 ? current : nextScale))
    }
    const updateIfActive = (): void => {
      void updateFitScale().catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not size the PDF page.')
      })
    }
    updateIfActive()
    const observer = new ResizeObserver(updateIfActive)
    if (viewerRef.current) observer.observe(viewerRef.current)
    return () => {
      cancelled = true
      observer.disconnect()
    }
  }, [doc, fitPage, pageNum])

  useEffect(() => {
    function updateOutputScale(): void {
      setOutputScale(getPdfOutputScale(window.devicePixelRatio))
    }
    window.addEventListener('resize', updateOutputScale)
    return () => window.removeEventListener('resize', updateOutputScale)
  }, [])

  useEffect(() => {
    if (totalPages > 0 && onProgress) onProgress(pageNum, totalPages)
  }, [pageNum, totalPages, onProgress])

  // Scale changes invalidate every cached bitmap (they're rendered at a
  // fixed resolution) — drop them all rather than let stale entries linger.
  useEffect(() => {
    pageCacheRef.current.clear()
  }, [scale, outputScale])

  // PDF.js renders into a high-resolution backing canvas; CSS dimensions
  // stay in viewer pixels so high-DPI displays do not stretch a blurry bitmap.
  useEffect(() => {
    if (!doc) return
    let cancelled = false
    let currentTask: { cancel: () => void } | null = null
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return

    const cached = pageCacheRef.current.get(pageNum)
    if (cached) {
      canvas.width = cached.width
      canvas.height = cached.height
      canvas.style.width = `${cached.width / outputScale}px`
      canvas.style.height = `${cached.height / outputScale}px`
      context.drawImage(cached, 0, 0)
    } else {
      doc.getPage(pageNum).then(async (page) => {
        if (cancelled) return
        const viewport = page.getViewport({ scale: scale * outputScale })
        prepareCanvas(canvas, viewport, outputScale)
        const task = page.render({ canvasContext: context, viewport })
        currentTask = task
        try {
          await task.promise
        } catch (err) {
          if (!cancelled) setError(err instanceof Error ? err.message : 'Could not render this PDF page.')
          return
        }
        if (cancelled) return
        pageCacheRef.current.set(pageNum, snapshotCanvas(canvas))
      }).catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load this PDF page.')
      })
    }

    // Pre-render current ± PREFETCH_RADIUS in the background — not drawn,
    // just warmed for the next navigation.
    ;(async () => {
      for (let offset = 1; offset <= PREFETCH_RADIUS; offset++) {
        for (const neighbor of [pageNum - offset, pageNum + offset]) {
          if (cancelled) return
          if (neighbor < 1 || neighbor > totalPages || pageCacheRef.current.has(neighbor)) continue
          try {
            const page = await doc.getPage(neighbor)
            if (cancelled) return
            const viewport = page.getViewport({ scale: scale * outputScale })
            const off = document.createElement('canvas')
            prepareCanvas(off, viewport, outputScale)
            const offContext = off.getContext('2d')
            if (!offContext) continue
            await page.render({ canvasContext: offContext, viewport }).promise
            if (cancelled) continue
            pageCacheRef.current.set(neighbor, off)
          } catch {
            // Non-critical — a failed prefetch just means that page renders
            // normally, on demand, when the user actually navigates to it.
          }
        }
      }
      // Bound memory: drop anything outside the current window.
      for (const cachedPage of pageCacheRef.current.keys()) {
        if (Math.abs(cachedPage - pageNum) > PREFETCH_RADIUS) pageCacheRef.current.delete(cachedPage)
      }
    })()

    return () => {
      cancelled = true
      currentTask?.cancel()
    }
  }, [doc, pageNum, scale, outputScale, totalPages])

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
        setFitPage(false)
        setScale((s) => Math.min(MAX_SCALE, +(s + 0.1).toFixed(2)))
      } else if (e.key === '-') {
        e.preventDefault()
        setFitPage(false)
        setScale((s) => Math.max(MIN_SCALE, +(s - 0.1).toFixed(2)))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [totalPages])

  function zoomBy(amount: number): void {
    setFitPage(false)
    setScale((current) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, +(current + amount).toFixed(2))))
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span className="text-base italic text-[var(--danger)]">{error}</span>
      </div>
    )
  }

  if (!doc) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span className="text-base italic text-[var(--text-mid)]">Loading PDF…</span>
      </div>
    )
  }

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-center gap-2 border-b border-[var(--bg-edge)] px-3 py-1">
        <button
          type="button"
          onClick={() => zoomBy(-0.1)}
          disabled={scale <= MIN_SCALE}
          aria-label="Zoom out PDF"
          title="Zoom out"
          className="icon-button min-h-10 min-w-10 disabled:opacity-40"
        >
          <Minus size={16} aria-hidden="true" />
        </button>
        <span data-testid="pdf-zoom" className="min-w-12 text-center text-xs text-[var(--text-mid)]">
          {Math.round(scale * 100)}%
        </span>
        <button
          type="button"
          onClick={() => zoomBy(0.1)}
          disabled={scale >= MAX_SCALE}
          aria-label="Zoom in PDF"
          title="Zoom in"
          className="icon-button min-h-10 min-w-10 disabled:opacity-40"
        >
          <Plus size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => setFitPage(true)}
          data-testid="pdf-fit-page"
          aria-pressed={fitPage}
          className={`rounded-lg px-3 py-1.5 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 ${
            fitPage ? 'bg-[var(--accent-container)] text-[var(--accent)]' : 'text-[var(--text-mid)] hover:bg-[var(--state-layer)] hover:text-[var(--text-hi)]'
          }`}
        >
          Fit page
        </button>
      </div>
      <div
        ref={viewerRef}
        data-testid="pdf-page-viewport"
        className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-[var(--bg-surface)] p-4"
      >
        <canvas ref={canvasRef} data-testid="pdf-page-canvas" className="max-w-none shrink-0 shadow-lg" />
      </div>
      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--bg-edge)] px-4 py-2">
        <button
          onClick={() => setPageNum((p) => Math.max(p - 1, 1))}
          disabled={pageNum <= 1}
          className="rounded px-2 py-1 text-xs text-[var(--text-mid)] transition hover:text-[var(--text-hi)] disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
        >
          ← Previous
        </button>
        <span className="select-none text-xs text-[var(--text-mid)]">
          Page {pageNum} / {totalPages} · {Math.round(scale * 100)}%
        </span>
        <button
          onClick={() => setPageNum((p) => Math.min(p + 1, totalPages))}
          disabled={pageNum >= totalPages}
          className="rounded px-2 py-1 text-xs text-[var(--text-mid)] transition hover:text-[var(--text-hi)] disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
        >
          Next →
        </button>
      </div>
      <div className="h-1 w-full shrink-0 bg-[var(--state-layer)]">
        <div
          className="h-full bg-[var(--accent)] transition-all duration-300"
          style={{ width: `${totalPages ? (pageNum / totalPages) * 100 : 0}%` }}
        />
      </div>
    </div>
  )
}
