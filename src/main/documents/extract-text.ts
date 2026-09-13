import { readFileSync } from 'fs'
import { extname } from 'path'
import { PDFParse } from 'pdf-parse'
import mammoth from 'mammoth'
import { DOMParser } from '@xmldom/xmldom'

export const UNSUPPORTED_TEXT = '[Text could not be extracted from this file.]'

export async function extractText(filePath: string): Promise<string> {
  const ext = extname(filePath).toLowerCase()

  try {
    if (ext === '.txt' || ext === '.md') {
      return readFileSync(filePath, 'utf-8')
    }

    if (ext === '.pdf') {
      const parser = new PDFParse({ data: readFileSync(filePath) })
      try {
        const result = await parser.getText()
        return result.text
      } finally {
        await parser.destroy()
      }
    }

    if (ext === '.docx') {
      const result = await mammoth.extractRawText({ path: filePath })
      return result.value
    }

    return UNSUPPORTED_TEXT
  } catch {
    return UNSUPPORTED_TEXT
  }
}

export const SUPPORTED_DOCUMENT_EXTENSIONS = ['txt', 'md', 'pdf', 'docx']

function inlineText(node: Node): string {
  if (node.nodeType === 3) return node.textContent ?? '' // TEXT_NODE
  if (node.nodeType !== 1) return '' // not an ELEMENT_NODE
  const el = node as Element
  const inner = Array.from(el.childNodes).map(inlineText).join('')
  const tag = el.tagName.toLowerCase()
  // Same lightweight convention MarkdownLite already renders elsewhere in
  // the app, and that SlideCarouselPanel/SlideBuilder now understand too.
  return tag === 'strong' || tag === 'b' ? `**${inner}**` : inner
}

/** DOCX -> the same `# Heading` / `**bold**` plain-text convention the
 *  Slide Builder's heading-based splitter and slide renderer already
 *  understand, instead of mammoth's plain extractRawText() (which drops
 *  every heading boundary and all formatting). Only used for the
 *  Slide-Builder import path — the Document Viewer already gets full
 *  fidelity via getDocumentHtml()'s real convertToHtml() output. */
export async function extractDocxAsFormattedText(filePath: string): Promise<string> {
  const { value: html } = await mammoth.convertToHtml({ path: filePath })
  const doc = new DOMParser({ errorHandler: { warning: () => {}, error: () => {} } }).parseFromString(
    `<root>${html}</root>`,
    'text/xml'
  )
  const root = doc.documentElement
  if (!root) return UNSUPPORTED_TEXT

  const lines: string[] = []
  for (const child of Array.from(root.childNodes)) {
    if (child.nodeType !== 1) continue
    const el = child as Element
    const tag = el.tagName.toLowerCase()
    const headingLevel = /^h([1-6])$/.exec(tag)?.[1]

    if (headingLevel) {
      const text = inlineText(el).trim()
      if (text) lines.push(`${'#'.repeat(Number(headingLevel))} ${text}`, '')
    } else if (tag === 'ul' || tag === 'ol') {
      for (const li of Array.from(el.getElementsByTagName('li'))) {
        const text = inlineText(li).trim()
        if (text) lines.push(`- ${text}`)
      }
      lines.push('')
    } else {
      const text = inlineText(el).trim()
      if (text) lines.push(text, '')
    }
  }
  return lines.join('\n').trim() || UNSUPPORTED_TEXT
}
