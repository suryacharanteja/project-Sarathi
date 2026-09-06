import type { ShortcutId, ShortcutTriggeredEvent } from '@shared/ipc-contract'

/**
 * Both of Electron's OS-level global-hotkey mechanisms (globalShortcut/
 * RegisterHotKey, then uiohook-napi's raw SetWindowsHookEx-based hook) were
 * proven dead on this machine — confirmed via a controlled test firing
 * genuine low-level synthetic keypresses (Win32 keybd_event) directly at the
 * hook, which received zero events regardless of key or app focus. Disabling
 * Windows Defender's real-time protection didn't change that either, so
 * whatever is silently swallowing the hook isn't Defender. Rather than keep
 * guessing at more OS-level mechanisms that hit the same dead API surface,
 * this uses the one thing already proven to work end-to-end on this exact
 * machine: a plain in-window `keydown` listener, same as the card-navigation
 * Ctrl+Arrow shortcut. Tradeoff, made knowingly: this only fires while
 * Sarathi's own window has OS focus, unlike a true global hotkey.
 */

type Listener = (event: ShortcutTriggeredEvent) => void

const listeners = new Set<Listener>()

function emit(id: ShortcutId): void {
  for (const listener of listeners) listener({ id })
}

export function onShortcutTriggered(callback: Listener): () => void {
  listeners.add(callback)
  return () => listeners.delete(callback)
}

const KEY_BINDINGS: Record<string, ShortcutId> = {
  a: 'manual-capture-toggle',
  c: 'follow-up-code',
  f: 'follow-up-pseudocode',
  q: 'interviewer-question',
  x: 'screenshot-capture',
  s: 'follow-up-voice',
  z: 'follow-up-complexity',
  r: 'reask-relisten'
}

let plusHeld = false

/**
 * Call once, for the lifetime of the overlay session. Ctrl+Plus+<key> is
 * checked as three actual signals: e.ctrlKey (native modifier state) AND a
 * manually-tracked "is the +/= key currently held" flag (since ctrlKey alone
 * says nothing about a third key) AND the mapped letter/digit itself.
 */
export function initLocalShortcuts(): () => void {
  function onKeyDown(e: KeyboardEvent): void {
    if (e.code === 'Equal' || e.code === 'NumpadAdd') {
      plusHeld = true
      return
    }
    if (!e.ctrlKey || !plusHeld) return

    const id = KEY_BINDINGS[e.key.toLowerCase()]
    if (id) {
      e.preventDefault()
      emit(id)
    }
  }

  function onKeyUp(e: KeyboardEvent): void {
    if (e.code === 'Equal' || e.code === 'NumpadAdd') {
      plusHeld = false
    }
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  return () => {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
  }
}
