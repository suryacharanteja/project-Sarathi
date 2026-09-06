import { useState } from 'react'
import { Toaster } from 'sonner'
import { CreateSessionScreen } from './features/session/CreateSessionScreen'
import { OverlayHUD } from './features/overlay/OverlayHUD'
import { MinimizedBubble } from './components/ui/minimized-bubble'
import { ResizeHandles } from './components/ui/resize-handles'

export default function App(): React.JSX.Element {
  const [screen, setScreen] = useState<'session' | 'overlay'>('session')
  const [minimized, setMinimized] = useState(false)

  function handleMinimize(): void {
    window.sarathi.windowMinimize()
    setMinimized(true)
  }

  function handleRestore(): void {
    window.sarathi.windowRestore()
    setMinimized(false)
  }

  function handleClose(): void {
    window.sarathi.windowClose()
  }

  function handleHome(): void {
    setScreen('session')
  }

  return (
    <div className={`h-screen bg-transparent ${minimized ? '' : 'p-2'}`}>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#1a1a1a',
            color: '#e5e5e5',
            border: '1px solid rgba(255,255,255,0.1)'
          }
        }}
      />

      {!minimized && <ResizeHandles />}

      {/* Overlay HUD keeps running (audio/transcription) underneath the bubble while minimized. */}
      {screen === 'overlay' && (
        <div style={{ display: minimized ? 'none' : 'block', height: '100%' }}>
          <OverlayHUD onHome={handleHome} onMinimize={handleMinimize} onClose={handleClose} />
        </div>
      )}
      {screen === 'session' && !minimized && (
        <CreateSessionScreen onCreate={() => setScreen('overlay')} onMinimize={handleMinimize} />
      )}

      {minimized && (
        <div className="flex h-full w-full items-center justify-center">
          <MinimizedBubble onRestore={handleRestore} />
        </div>
      )}
    </div>
  )
}
