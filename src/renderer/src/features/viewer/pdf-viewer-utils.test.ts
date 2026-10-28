import assert from 'node:assert/strict'
import test from 'node:test'

import { getFitPageScale, getPdfOutputScale } from './pdf-viewer-utils.ts'

test('PDF fit-page scale fills the available viewer without cropping the page', () => {
  assert.equal(getFitPageScale(700, 600, 300, 400), 1.42)
  assert.ok(Math.abs(getFitPageScale(400, 700, 600, 800) - 0.6133) < 0.001)
})

test('PDF fit-page scale stays bounded and handles an unmeasured viewer', () => {
  assert.equal(getFitPageScale(8000, 8000, 100, 100), 4)
  assert.equal(getFitPageScale(0, 0, 600, 800), 1)
})

test('PDF output scale keeps at least native resolution and caps memory usage', () => {
  assert.equal(getPdfOutputScale(1), 1)
  assert.equal(getPdfOutputScale(1.5), 1.5)
  assert.equal(getPdfOutputScale(3), 2)
})
