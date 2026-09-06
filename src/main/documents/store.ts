import { app } from 'electron'
import { randomUUID } from 'crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { join, basename } from 'path'
import type { DocumentRecord } from '../../shared/profile-types'
import { documentRecordSchema } from '../../shared/schemas'
import { extractText } from './extract-text'

function documentsRootDir(): string {
  return join(app.getPath('userData'), 'documents')
}

function documentDir(id: string): string {
  return join(documentsRootDir(), id)
}

function metadataPath(id: string): string {
  return join(documentDir(id), 'metadata.json')
}

export async function createDocument(sourceFilePath: string): Promise<DocumentRecord> {
  const id = randomUUID()
  const fileName = basename(sourceFilePath)
  const sizeBytes = statSync(sourceFilePath).size
  const extractedText = await extractText(sourceFilePath)
  const timestamp = new Date().toISOString()
  const record: DocumentRecord = { id, fileName, extractedText, sizeBytes, createdAt: timestamp }

  mkdirSync(documentDir(id), { recursive: true })
  writeFileSync(metadataPath(id), JSON.stringify(record, null, 2), 'utf-8')

  return record
}

export function listDocuments(): DocumentRecord[] {
  const root = documentsRootDir()
  if (!existsSync(root)) {
    return []
  }

  const documents: DocumentRecord[] = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const file = metadataPath(entry.name)
    if (!existsSync(file)) continue
    try {
      const raw = JSON.parse(readFileSync(file, 'utf-8'))
      const parsed = documentRecordSchema.safeParse(raw)
      if (parsed.success) {
        documents.push(parsed.data)
      }
    } catch {
      // skip corrupt/partial document directories
    }
  }

  return documents.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function getDocument(id: string): DocumentRecord | null {
  const file = metadataPath(id)
  if (!existsSync(file)) return null
  try {
    const raw = JSON.parse(readFileSync(file, 'utf-8'))
    const parsed = documentRecordSchema.safeParse(raw)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
