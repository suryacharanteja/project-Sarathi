import type { WebContents } from 'electron'

export function safeSend(webContents: WebContents, channel: string, ...args: unknown[]): void {
  if (!webContents.isDestroyed()) {
    webContents.send(channel, ...args)
  }
}
