import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'

import { extractPptxSlides } from './extract-pptx.ts'

/**
 * A .pptx is a ZIP of OOXML — these fixtures build a minimal but real one
 * (jszip, matching what pdfjs-dist/mammoth-adjacent tooling produces) to
 * exercise the two genuinely tricky pieces of extract-pptx.ts:
 *   1. slide order comes from presentation.xml + its rels, not slideN.xml
 *      filenames — a deck reordered in PowerPoint keeps its old filenames.
 *   2. title detection falls back to "first shape with text" when there's
 *      no explicit <p:ph type="title"> placeholder.
 * Confirmed against the real app via Playwright during Phase development;
 * this is the permanent regression version of that same check.
 *
 * Run with: npm run test:pptx
 */

async function buildPptx(dir: string, fileName: string): Promise<string> {
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
</Types>`

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`

  // Deliberately lists slide2 before slide1 — proves the parser follows
  // presentation order, not slideN.xml filename order.
  const presentationXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldIdLst>
    <p:sldId id="257" r:id="rId3"/>
    <p:sldId id="256" r:id="rId2"/>
  </p:sldIdLst>
</p:presentation>`

  const presentationRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/>
</Relationships>`

  // slide1.xml: explicit title placeholder + a two-paragraph body.
  const slide1Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp>
      <p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
      <p:txBody><a:p><a:r><a:t>Q3 Roadmap</a:t></a:r></a:p></p:txBody>
    </p:sp>
    <p:sp>
      <p:nvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>
      <p:txBody>
        <a:p><a:r><a:t>Ship the new billing system</a:t></a:r></a:p>
        <a:p><a:r><a:t>Expand to EU region</a:t></a:r></a:p>
      </p:txBody>
    </p:sp>
  </p:spTree></p:cSld>
</p:sld>`

  // slide2.xml: NO title placeholder — first shape's text must become the title.
  const slide2Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp>
      <p:nvSpPr><p:nvPr/></p:nvSpPr>
      <p:txBody><a:p><a:r><a:t>Team Updates</a:t></a:r></a:p></p:txBody>
    </p:sp>
    <p:sp>
      <p:nvSpPr><p:nvPr/></p:nvSpPr>
      <p:txBody><a:p><a:r><a:t>Design team finished the new onboarding flow.</a:t></a:r></a:p></p:txBody>
    </p:sp>
  </p:spTree></p:cSld>
</p:sld>`

  const zip = new JSZip()
  zip.file('[Content_Types].xml', contentTypes)
  zip.folder('_rels')!.file('.rels', rootRels)
  const ppt = zip.folder('ppt')!
  ppt.file('presentation.xml', presentationXml)
  ppt.folder('_rels')!.file('presentation.xml.rels', presentationRels)
  ppt.folder('slides')!.file('slide1.xml', slide1Xml)
  ppt.folder('slides')!.file('slide2.xml', slide2Xml)

  const buf = await zip.generateAsync({ type: 'nodebuffer' })
  const filePath = join(dir, fileName)
  writeFileSync(filePath, buf)
  return filePath
}

test('extractPptxSlides follows presentation.xml order, not slideN.xml filename order', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'sarathi-pptx-test-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const filePath = await buildPptx(dir, 'deck.pptx')

  const slides = await extractPptxSlides(filePath)

  assert.equal(slides.length, 2)
  // slide2.xml ("Team Updates") is listed first in presentation.xml despite
  // its filename sorting after slide1.xml.
  assert.equal(slides[0].title, 'Team Updates')
  assert.equal(slides[1].title, 'Q3 Roadmap')
})

test('extractPptxSlides uses the explicit title placeholder when present', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'sarathi-pptx-test-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const filePath = await buildPptx(dir, 'deck.pptx')

  const slides = await extractPptxSlides(filePath)
  const roadmap = slides.find((s) => s.title === 'Q3 Roadmap')

  assert.ok(roadmap)
  // Single \n joins paragraphs within one shape; \n\n only separates
  // different shapes (see the "Team Updates" slide's two-shape case).
  assert.equal(roadmap.body, 'Ship the new billing system\nExpand to EU region')
})

test('extractPptxSlides falls back to the first shape with text when there is no title placeholder', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'sarathi-pptx-test-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const filePath = await buildPptx(dir, 'deck.pptx')

  const slides = await extractPptxSlides(filePath)
  const teamUpdates = slides.find((s) => s.title === 'Team Updates')

  assert.ok(teamUpdates)
  assert.equal(teamUpdates.body, 'Design team finished the new onboarding flow.')
})

async function buildSingleSlidePptx(dir: string, slideXml: string): Promise<string> {
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>'
  )
  zip.folder('ppt')!.folder('slides')!.file('slide1.xml', slideXml)
  const buf = await zip.generateAsync({ type: 'nodebuffer' })
  const filePath = join(dir, 'deck.pptx')
  writeFileSync(filePath, buf)
  return filePath
}

test('extractPptxSlides wraps bold runs in ** — the same convention SlideCarouselPanel renders as real bold', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'sarathi-pptx-test-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))

  // A single run split into plain / bold / plain segments — the realistic
  // shape PowerPoint produces when only part of a sentence is bolded.
  const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp>
      <p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
      <p:txBody><a:p><a:r><a:t>Launch Plan</a:t></a:r></a:p></p:txBody>
    </p:sp>
    <p:sp>
      <p:nvSpPr><p:nvPr/></p:nvSpPr>
      <p:txBody><a:p>
        <a:r><a:t xml:space="preserve">Ship by </a:t></a:r>
        <a:r><a:rPr b="1"/><a:t>Friday</a:t></a:r>
        <a:r><a:t xml:space="preserve"> or escalate.</a:t></a:r>
      </a:p></p:txBody>
    </p:sp>
  </p:spTree></p:cSld>
</p:sld>`

  const filePath = await buildSingleSlidePptx(dir, slideXml)
  const slides = await extractPptxSlides(filePath)

  assert.equal(slides.length, 1)
  assert.equal(slides[0].title, 'Launch Plan')
  assert.equal(slides[0].body, 'Ship by **Friday** or escalate.')
})

test('extractPptxSlides does not bold a non-bold run', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'sarathi-pptx-test-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))

  const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp>
      <p:nvSpPr><p:nvPr/></p:nvSpPr>
      <p:txBody><a:p><a:r><a:rPr b="0"/><a:t>Plain text, not bold.</a:t></a:r></a:p></p:txBody>
    </p:sp>
  </p:spTree></p:cSld>
</p:sld>`

  const filePath = await buildSingleSlidePptx(dir, slideXml)
  const slides = await extractPptxSlides(filePath)

  assert.equal(slides[0].title, 'Plain text, not bold.')
})
