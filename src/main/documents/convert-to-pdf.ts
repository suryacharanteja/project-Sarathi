import { spawn } from 'child_process'
import { existsSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { basename, extname, join } from 'path'

/** Common install locations, checked when `soffice`/`libreoffice` isn't
 *  already on PATH — LibreOffice's own installer doesn't always add itself
 *  to PATH on Windows. */
const CANDIDATE_PATHS = [
  'soffice',
  'libreoffice',
  'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  '/Applications/LibreOffice.app/Contents/MacOS/soffice',
  '/usr/bin/soffice',
  '/usr/bin/libreoffice',
  '/snap/bin/libreoffice'
]

let cachedSofficePath: string | null = null

function commandExistsOnPath(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = spawn(command, ['--version'], { stdio: 'ignore' })
    probe.on('error', () => resolve(false))
    probe.on('close', (code) => resolve(code === 0))
  })
}

/** A found path is cached for the process lifetime — checking every call
 *  would mean a spawn attempt (for the bare "soffice"/"libreoffice" PATH
 *  candidates) on every single PPTX/DOCX pick. A "not found" result is
 *  deliberately NOT cached: LibreOffice may get installed after the app is
 *  already running, and re-probing on the next attempt is cheap enough
 *  that failing users shouldn't need to restart the app to recover. */
export async function findSofficePath(): Promise<string | null> {
  if (cachedSofficePath) return cachedSofficePath

  for (const candidate of CANDIDATE_PATHS) {
    const isBareCommand = candidate === 'soffice' || candidate === 'libreoffice'
    if (isBareCommand ? await commandExistsOnPath(candidate) : existsSync(candidate)) {
      cachedSofficePath = candidate
      return candidate
    }
  }
  return null
}

export async function isLibreOfficeAvailable(): Promise<boolean> {
  return (await findSofficePath()) !== null
}

/** Converts PPTX/DOCX (or anything LibreOffice can open) to a PDF in a
 *  fresh temp directory, so it can be shown via the existing PdfViewerPanel
 *  — the same pixel-exact renderer already used for real PDFs, rather than
 *  a reconstructed-from-text approximation. */
export async function convertToPdf(filePath: string): Promise<{ pdfPath?: string; error?: string }> {
  const soffice = await findSofficePath()
  if (!soffice) {
    return {
      error:
        'LibreOffice is required to show this file exactly as it looks, but it isn\u2019t installed. ' +
        'Install it free from libreoffice.org, then try again.'
    }
  }

  const outDir = mkdtempSync(join(tmpdir(), 'sarathi-convert-'))

  return new Promise((resolve) => {
    const proc = spawn(soffice, ['--headless', '--convert-to', 'pdf', '--outdir', outDir, filePath])
    let stderr = ''
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    proc.on('error', (error) => {
      resolve({ error: `Failed to launch LibreOffice: ${error.message}` })
    })
    proc.on('close', (code) => {
      if (code !== 0) {
        resolve({ error: `LibreOffice conversion failed (exit code ${code}).${stderr ? ` ${stderr.trim()}` : ''}` })
        return
      }
      const pdfPath = join(outDir, `${basename(filePath, extname(filePath))}.pdf`)
      if (!existsSync(pdfPath)) {
        resolve({ error: 'LibreOffice did not produce a PDF file.' })
        return
      }
      resolve({ pdfPath })
    })
  })
}
