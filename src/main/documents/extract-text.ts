import { readFileSync } from 'fs'
import { extname } from 'path'
import { PDFParse } from 'pdf-parse'
import mammoth from 'mammoth'

const UNSUPPORTED_TEXT = '[Text could not be extracted from this file.]'

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
