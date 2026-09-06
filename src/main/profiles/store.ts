import { app } from 'electron'
import { randomUUID } from 'crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { Profile } from '../../shared/profile-types'
import { profileSchema } from '../../shared/schemas'

function profilesRootDir(): string {
  return join(app.getPath('userData'), 'profiles')
}

function profileDir(id: string): string {
  return join(profilesRootDir(), id)
}

function metadataPath(id: string): string {
  return join(profileDir(id), 'metadata.json')
}

export function createProfile(name: string, resumeText: string): Profile {
  const id = randomUUID()
  const timestamp = new Date().toISOString()
  const profile: Profile = {
    id,
    name,
    resumeText,
    speakingStyleProfile: null,
    speakingStyleGeneratedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp
  }

  mkdirSync(profileDir(id), { recursive: true })
  writeFileSync(metadataPath(id), JSON.stringify(profile, null, 2), 'utf-8')

  return profile
}

export function updateProfileSpeakingStyle(id: string, styleText: string): Profile | null {
  const existing = getProfile(id)
  if (!existing) return null

  const updated: Profile = {
    ...existing,
    speakingStyleProfile: styleText,
    speakingStyleGeneratedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
  writeFileSync(metadataPath(id), JSON.stringify(updated, null, 2), 'utf-8')
  return updated
}

export function listProfiles(): Profile[] {
  const root = profilesRootDir()
  if (!existsSync(root)) {
    return []
  }

  const profiles: Profile[] = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const file = metadataPath(entry.name)
    if (!existsSync(file)) continue
    try {
      const raw = JSON.parse(readFileSync(file, 'utf-8'))
      const parsed = profileSchema.safeParse(raw)
      if (parsed.success) {
        profiles.push(parsed.data)
      }
    } catch {
      // skip corrupt/partial profile directories
    }
  }

  return profiles.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function getProfile(id: string): Profile | null {
  const file = metadataPath(id)
  if (!existsSync(file)) return null
  try {
    const raw = JSON.parse(readFileSync(file, 'utf-8'))
    const parsed = profileSchema.safeParse(raw)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
