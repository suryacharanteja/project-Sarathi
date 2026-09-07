import { readFileSync } from 'fs'
import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'

export interface PptxSlide {
  title: string
  body: string
}

function parseXml(xml: string): Document {
  return new DOMParser({ errorHandler: { warning: () => {}, error: () => {} } }).parseFromString(xml, 'text/xml')
}

/** Concatenates every <a:t> run's text within an element, in document order. */
function textOf(el: Element): string {
  const runs = Array.from(el.getElementsByTagName('a:t'))
  return runs.map((r) => r.textContent ?? '').join('')
}

/** One line per <a:p> paragraph, blank paragraphs dropped. */
function paragraphsOf(shape: Element): string {
  const paras = Array.from(shape.getElementsByTagName('a:p'))
  return paras
    .map((p) => textOf(p))
    .filter((t) => t.trim().length > 0)
    .join('\n')
}

function isTitleShape(shape: Element): boolean {
  return Array.from(shape.getElementsByTagName('p:ph')).some((ph) => {
    const type = ph.getAttribute('type')
    return type === 'title' || type === 'ctrTitle'
  })
}

function parseSlideXml(xml: string, index: number): PptxSlide {
  const doc = parseXml(xml)
  const shapes = Array.from(doc.getElementsByTagName('p:sp'))

  const titleShape = shapes.find(isTitleShape)
  const remaining = titleShape ? shapes.filter((s) => s !== titleShape) : shapes.slice()

  let title = titleShape ? paragraphsOf(titleShape) : ''

  // No explicit title placeholder — fall back to the first shape with text.
  if (!title) {
    const firstWithText = remaining.find((s) => paragraphsOf(s).trim().length > 0)
    if (firstWithText) {
      title = paragraphsOf(firstWithText)
      remaining.splice(remaining.indexOf(firstWithText), 1)
    }
  }

  const bodyParts = remaining.map((s) => paragraphsOf(s)).filter((t) => t.trim().length > 0)

  return {
    title: title.trim() || `Slide ${index + 1}`,
    body: bodyParts.join('\n\n')
  }
}

/** Resolves real slide order via presentation.xml + its rels — slide XML
 *  files keep their original name even after being reordered in PowerPoint,
 *  so filename-sorting alone can't be trusted for a reordered deck. */
async function resolveSlideOrder(zip: JSZip): Promise<string[]> {
  const presentationXml = await zip.file('ppt/presentation.xml')?.async('string')
  const relsXml = await zip.file('ppt/_rels/presentation.xml.rels')?.async('string')
  if (!presentationXml || !relsXml) return []

  const relTargets = new Map<string, string>()
  for (const rel of Array.from(parseXml(relsXml).getElementsByTagName('Relationship'))) {
    const id = rel.getAttribute('Id')
    const target = rel.getAttribute('Target')
    if (id && target) relTargets.set(id, target)
  }

  const order: string[] = []
  for (const sldId of Array.from(parseXml(presentationXml).getElementsByTagName('p:sldId'))) {
    const rid = sldId.getAttribute('r:id')
    const target = rid ? relTargets.get(rid) : null
    if (target) order.push(`ppt/${target.replace(/^\.?\//, '')}`)
  }
  return order
}

function fallbackSlideOrder(zip: JSZip): string[] {
  return Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)\.xml$/)?.[1] ?? 0)
      const nb = Number(b.match(/slide(\d+)\.xml$/)?.[1] ?? 0)
      return na - nb
    })
}

export async function extractPptxSlides(filePath: string): Promise<PptxSlide[]> {
  const zip = await JSZip.loadAsync(readFileSync(filePath))

  let slidePaths = await resolveSlideOrder(zip)
  if (slidePaths.length === 0) slidePaths = fallbackSlideOrder(zip)

  const slides: PptxSlide[] = []
  for (let i = 0; i < slidePaths.length; i++) {
    const xml = await zip.file(slidePaths[i])?.async('string')
    if (!xml) continue
    slides.push(parseSlideXml(xml, i))
  }
  return slides
}
