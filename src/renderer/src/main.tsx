import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

window.onerror = (_message, _source, _lineno, _colno, error) => {
  console.error('[Sarathi] Uncaught error:', error)
}

window.onunhandledrejection = (event) => {
  console.error('[Sarathi] Unhandled promise rejection:', event.reason)
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
