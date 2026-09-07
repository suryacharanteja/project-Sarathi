import { forwardRef } from 'react'

/** Renders mammoth's DOCX→HTML (or the `<pre>`-wrapped TXT/MD) inside the
 *  same scrollable container the teleprompter uses — same ref, same
 *  auto-scroll/pause loop in OverlayHUD, just different content. */
export const DocumentViewerPanel = forwardRef<
  HTMLDivElement,
  { html: string; fontSize: number; mirrorFlip: boolean }
>(function DocumentViewerPanel({ html, fontSize, mirrorFlip }, ref) {
  return (
    <div
      ref={ref}
      className="doc-viewer flex-1 overflow-y-auto overflow-x-hidden px-8 py-6 select-none"
      style={{
        transform: mirrorFlip ? 'scaleX(-1)' : undefined,
        fontSize: `${fontSize}px`,
        lineHeight: 1.5,
        color: '#f5f5f5',
        fontFamily: '"Georgia", serif',
        scrollbarWidth: 'none'
      }}
    >
      <style>{`
        .doc-viewer h1 { font-size: 1.5em; font-weight: 700; margin-bottom: 0.5em; }
        .doc-viewer h2 { font-size: 1.25em; font-weight: 600; margin-bottom: 0.5em; }
        .doc-viewer h3 { font-size: 1.1em; font-weight: 600; margin-bottom: 0.5em; }
        .doc-viewer p { margin-bottom: 0.75em; }
        .doc-viewer ul { list-style: disc; padding-left: 1.5em; margin-bottom: 0.75em; }
        .doc-viewer ol { list-style: decimal; padding-left: 1.5em; margin-bottom: 0.75em; }
        .doc-viewer pre { font-family: inherit; white-space: pre-wrap; word-break: break-word; }
      `}</style>
      <div dangerouslySetInnerHTML={{ __html: html }} />
      {/* Trailing blank space so the last line can scroll fully into view */}
      <div style={{ height: '60vh' }} />
    </div>
  )
})
