const FIT_PADDING = 32
export const MAX_OUTPUT_SCALE = 2

export function getFitPageScale(
  viewerWidth: number,
  viewerHeight: number,
  pageWidth: number,
  pageHeight: number
): number {
  if (viewerWidth <= 0 || viewerHeight <= 0 || pageWidth <= 0 || pageHeight <= 0) return 1

  const availableWidth = Math.max(1, viewerWidth - FIT_PADDING)
  const availableHeight = Math.max(1, viewerHeight - FIT_PADDING)
  return Math.min(4, Math.max(0.25, Math.min(availableWidth / pageWidth, availableHeight / pageHeight)))
}

export function getPdfOutputScale(devicePixelRatio: number): number {
  return Math.min(MAX_OUTPUT_SCALE, Math.max(1, devicePixelRatio || 1))
}
