import { realpathSync } from 'fs'
import type { IpcMainInvokeEvent, WebContents } from 'electron'

/** Paths are granted only by main-process file selection/conversion. */
export function createDocumentAccess(webContents: WebContents) {
  const allowed = new Set<string>()

  function assertSender(event: IpcMainInvokeEvent): void {
    if (webContents.isDestroyed() || event.sender !== webContents || event.senderFrame !== webContents.mainFrame) {
      throw new Error('Unauthorized document request.')
    }
  }

  function grant(filePath: string): string {
    const canonical = realpathSync(filePath)
    allowed.add(canonical)
    return canonical
  }

  function resolve(event: IpcMainInvokeEvent, filePath: unknown): string {
    assertSender(event)
    if (typeof filePath !== 'string') throw new Error('Invalid document path.')
    const canonical = realpathSync(filePath)
    if (!allowed.has(canonical)) {
      throw new Error('Select this document through the file picker before reading it.')
    }
    return canonical
  }

  return { assertSender, grant, resolve }
}
