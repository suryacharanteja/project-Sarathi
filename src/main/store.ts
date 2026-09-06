import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { type AppSettings, defaultAppSettings } from '../shared/ipc-contract'
import { appSettingsSchema } from '../shared/schemas'

const API_KEY_FIELDS: (keyof AppSettings)[] = [
  'geminiApiKey',
  'assemblyAiApiKey',
  'openaiApiKey',
  'openCodeGoApiKey',
  'openCodeZenApiKey',
  'deepseekApiKey'
]

function settingsFilePath(): string {
  return join(app.getPath('userData'), 'Sarathi-settings.json')
}

function canEncrypt(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

function encryptValue(value: string | null): string | null {
  if (!value || !canEncrypt()) return value
  return safeStorage.encryptString(value).toString('base64')
}

function decryptValue(value: string | null): string | null {
  if (!value || !canEncrypt()) return value
  try {
    return safeStorage.decryptString(Buffer.from(value, 'base64'))
  } catch {
    return value
  }
}

function isEncrypted(value: string | null): boolean {
  if (!value) return false
  try {
    Buffer.from(value, 'base64')
    return value.length > 20 && !/^[a-zA-Z0-9_-]+$/.test(value)
  } catch {
    return false
  }
}

export function readSettings(): AppSettings {
  const filePath = settingsFilePath()
  if (!existsSync(filePath)) {
    return { ...defaultAppSettings }
  }
  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf-8'))
    const parsed = appSettingsSchema.safeParse(raw)
    const settings = parsed.success ? parsed.data : { ...defaultAppSettings }

    let needsMigration = false
    for (const field of API_KEY_FIELDS) {
      const val = settings[field]
      if (typeof val === 'string' && val.length > 0) {
        if (isEncrypted(val)) {
          ;(settings as Record<string, unknown>)[field] = decryptValue(val)
        } else if (canEncrypt()) {
          needsMigration = true
        }
      }
    }

    if (needsMigration) {
      writeSettings(settings)
    }

    return settings
  } catch {
    return { ...defaultAppSettings }
  }
}

export function writeSettings(settings: AppSettings): void {
  const toWrite = { ...settings }
  for (const field of API_KEY_FIELDS) {
    ;(toWrite as Record<string, unknown>)[field] = encryptValue(settings[field])
  }
  writeFileSync(settingsFilePath(), JSON.stringify(toWrite, null, 2), 'utf-8')
}
