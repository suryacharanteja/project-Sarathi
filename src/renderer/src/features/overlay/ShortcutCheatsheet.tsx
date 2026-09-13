const SHORTCUTS: { keys: string; action: string; mode: string }[] = [
  { keys: 'Space', action: 'Pause / resume scroll', mode: 'Teleprompter / Doc' },
  { keys: '← / →', action: 'Previous / next slide or page', mode: 'Carousel / PDF' },
  { keys: '+ / =', action: 'Increase font size', mode: 'Text modes' },
  { keys: '-', action: 'Decrease font size', mode: 'Text modes' },
  { keys: '+ / -', action: 'Zoom in / out', mode: 'PDF' },
  { keys: 'Shift + ↑ / ↓', action: 'Increase / decrease scroll speed', mode: 'Teleprompter / Doc' },
  { keys: 'B', action: 'Toggle bookmark at current position', mode: 'Teleprompter / Doc' },
  { keys: 'J / K', action: 'Jump to next / previous bookmark', mode: 'Teleprompter / Doc' },
  { keys: '?', action: 'Toggle this shortcut list', mode: 'All' },
  { keys: 'Ctrl + (hold =) + A', action: 'Toggle manual capture', mode: 'All' },
  { keys: 'Ctrl + (hold =) + C', action: 'Follow-up: request code', mode: 'All' },
  { keys: 'Ctrl + (hold =) + F', action: 'Follow-up: request pseudocode', mode: 'All' },
  { keys: 'Ctrl + (hold =) + Q', action: 'Capture interviewer question', mode: 'All' },
  { keys: 'Ctrl + (hold =) + Z', action: 'Follow-up: complexity analysis', mode: 'All' },
  { keys: 'Ctrl + (hold =) + S', action: 'Follow-up: voice', mode: 'All' },
  { keys: 'Ctrl + (hold =) + R', action: 'Re-ask / re-listen', mode: 'All' },
  { keys: 'Ctrl + (hold =) + X', action: 'Screenshot capture', mode: 'All' }
]

export function ShortcutCheatsheet({ onClose }: { onClose: () => void }): React.JSX.Element {
  return (
    <div
      className="elevation-3 cheatsheet-fade-in absolute inset-0 z-50 flex items-center justify-center bg-black/60"
      // Inline, not a CSS class — see the .elevation-3 comment in index.css.
      style={{ backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)' }}
      onClick={onClose}
    >
      <style>{`
        @keyframes cheatsheetFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes cheatsheetCardIn { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .cheatsheet-fade-in { animation: cheatsheetFadeIn 150ms ease-out; }
        .cheatsheet-card-in { animation: cheatsheetCardIn 150ms ease-out; }
      `}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        className="elevation-2 cheatsheet-card-in max-h-[85%] w-[90%] max-w-lg overflow-y-auto rounded-xl p-4"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-200">Keyboard Shortcuts</h2>
          <button onClick={onClose} className="rounded text-xs text-neutral-500 hover:text-neutral-300 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40">
            Esc or ? to close
          </button>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
          {SHORTCUTS.map((s) => (
            <div key={s.keys + s.action} className="flex flex-col gap-0.5 text-xs">
              <kbd className="w-fit rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-neutral-300">
                {s.keys}
              </kbd>
              <span className="text-neutral-400">
                {s.action} <span className="text-neutral-600">({s.mode})</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
