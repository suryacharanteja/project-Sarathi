import { join } from 'path'
import { BrowserWindow, screen } from 'electron'
import { applyStealth } from './stealth'

export interface OverlayWindowOptions {
  defaultWidth: number
  defaultHeight: number
  minWidth: number
  minHeight: number
  hideFromScreenCapture: boolean
  initialOpacity?: number
  launchHidden: boolean
}

export function createOverlayWindow(options: OverlayWindowOptions): BrowserWindow {
  const { defaultWidth, defaultHeight, minWidth, minHeight, hideFromScreenCapture, launchHidden } = options
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  const x = Math.floor((width - defaultWidth) / 2)
  const y = 40
  const windowOpacity = Number.isFinite(options.initialOpacity) ? (options.initialOpacity as number) : 1

  const overlay = new BrowserWindow({
    width: defaultWidth,
    height: defaultHeight,
    minWidth,
    minHeight,
    maxWidth: width,
    maxHeight: height,
    x,
    y,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, '../preload/index.js'),
      backgroundThrottling: false,
      sandbox: false
    },
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: process.env['SARATHI_DEV_VISIBLE'] !== '1',
    // Native edge-resize is disabled deliberately — Electron/Windows draws
    // its own double-arrow resize cursor for a resizable frameless
    // window's non-client border, which is OS chrome outside the page's
    // control and can't be styled away with CSS. Resize is reimplemented
    // in-DOM instead (see resize-handles.tsx + IPC_CHANNELS.windowResize)
    // so the cursor stays the app's own static default shape throughout.
    resizable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    focusable: true,
    show: false,
    opacity: windowOpacity,
    type: 'toolbar',
    acceptFirstMouse: false,
    disableAutoHideCursor: true,
    enableLargerThanScreen: false,
    hasShadow: false,
    thickFrame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#00000000'
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    overlay.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    overlay.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // 'display-capture' is the permission Chromium gates getDisplayMedia()
  // under — a different permission type from 'media' (which only covers
  // getUserMedia's camera/mic access). System audio capture switched from
  // getUserMedia to getDisplayMedia (electron-audio-loopback) but this
  // handler was never updated to match, so the display-capture request was
  // being silently denied — the app reached "connected" but never actually
  // got a real audio stream.
  const ALLOWED_PERMISSIONS = new Set(['media', 'display-capture'])

  overlay.webContents.session.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission))
  })

  overlay.webContents.session.setPermissionCheckHandler((_webContents, permission) => {
    return ALLOWED_PERMISSIONS.has(permission)
  })

  // Native right-click context menu is a separate OS-level popup, same
  // stealth-breaking class as native title= tooltips — not covered by
  // setContentProtection since Chromium renders it outside the window's
  // own compositor surface.
  overlay.webContents.on('context-menu', (event) => {
    event.preventDefault()
  })

  applyStealth(overlay, hideFromScreenCapture)

  overlay.webContents.on('did-finish-load', () => {
    if (!launchHidden) {
      overlay.showInactive()
    }
  })

  return overlay
}
