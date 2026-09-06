import { app, BrowserWindow, dialog } from 'electron'
import { initMain as initLoopbackAudio } from 'electron-audio-loopback'
import { createOverlayWindow } from './windows/overlay'
import { registerIpcHandlers } from './ipc'

// Sets Chromium command-line feature flags for system-audio loopback — must
// run before app.whenReady(), since Chromium reads --enable-features at
// startup. Replaces the old chromeMediaSource:'desktop' getUserMedia hack,
// which frequently "succeeded" with a track that carried no actual audio
// data on Windows — the root cause of system audio silently producing zero
// transcript with no error shown.
initLoopbackAudio()

// Ties every window/process this app spawns to one identity in Windows'
// shell — without it, Task Manager/taskbar grouping falls back to grouping
// by raw executable path, which for an Electron app under certain install
// layouts can render as multiple unlabeled rows instead of one named,
// icon-bearing "Sarathi (n)" group the way any properly-configured desktop
// app (browsers, Slack, etc.) shows up. Must match build.appId in
// package.json, which is what the NSIS installer registers this same ID
// under for the Start Menu shortcut.
if (process.platform === 'win32') {
  app.setAppUserModelId('com.sarathi.app')
}

let overlayWindow: BrowserWindow | null = null

process.on('uncaughtException', (error) => {
  console.error('[Sarathi] Uncaught exception:', error)
  dialog.showErrorBox('Sarathi Error', `An unexpected error occurred:\n${error.message}`)
})

process.on('unhandledRejection', (reason) => {
  console.error('[Sarathi] Unhandled rejection:', reason)
})

const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (overlayWindow) {
      if (overlayWindow.isMinimized()) overlayWindow.restore()
      overlayWindow.show()
      overlayWindow.focus()
    }
  })

  app.whenReady().then(() => {
    overlayWindow = createOverlayWindow({
      defaultWidth: 420,
      defaultHeight: 640,
      minWidth: 360,
      minHeight: 240,
      hideFromScreenCapture: process.env['SARATHI_DEV_VISIBLE'] !== '1',
      launchHidden: false
    })
    registerIpcHandlers(overlayWindow)

    overlayWindow.webContents.on('render-process-gone', (_event, details) => {
      console.error('[Sarathi] Renderer crashed:', details.reason)
      dialog
        .showMessageBox({
          type: 'error',
          title: 'Sarathi',
          message: 'The renderer process crashed.',
          detail: `Reason: ${details.reason}`,
          buttons: ['Restart', 'Quit']
        })
        .then(({ response }) => {
          if (response === 0) {
            overlayWindow?.reload()
          } else {
            app.quit()
          }
        })
    })

    overlayWindow.on('unresponsive', () => {
      console.error('[Sarathi] Window became unresponsive')
      dialog
        .showMessageBox({
          type: 'warning',
          title: 'Sarathi',
          message: 'The window is not responding.',
          buttons: ['Wait', 'Restart']
        })
        .then(({ response }) => {
          if (response === 1) {
            overlayWindow?.reload()
          }
        })
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

}
