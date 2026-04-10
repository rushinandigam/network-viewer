import { useCallback, useState } from 'react'
import { ManualConnectionsMode } from './components/ManualConnectionsMode'
import { LocalMachineMode } from './components/LocalMachineMode'
import { apiAvailable } from './lib/networkApi'
import './App.css'

type Mode = 'manual' | 'local'

export default function App() {
  const [mode, setMode] = useState<Mode>('manual')
  const [toast, setToast] = useState<string | null>(null)
  const devApis = apiAvailable()

  const copy = useCallback((text: string) => {
    void navigator.clipboard.writeText(text).then(
      () => {
        setToast(`Copied: ${text}`)
        window.setTimeout(() => setToast(null), 2200)
      },
      () => setToast('Could not copy — select manually'),
    )
  }, [])

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__brand">
          <span className="app__logo" aria-hidden>
            ◉
          </span>
          <div>
            <h1 className="app__title">Network viewer</h1>
            <p className="app__subtitle">
              Inspect Mobile Mouse desktop connectivity: manual host probes (like the phone app) or
              local TCP listeners and peers on this Mac/PC (dev server only).
            </p>
          </div>
        </div>
        <div className="app__toolbar">
          <span className={`app__pill ${devApis ? 'app__pill--on' : 'app__pill--warn'}`}>
            {devApis ? 'Dev APIs on' : 'Static build'}
          </span>
        </div>
      </header>

      {!devApis ? (
        <div className="banner banner--error" role="status">
          Run <code>pnpm dev</code> in this folder so <code>/api/*</code> probes and local socket
          listing work. A production <code>vite build</code> has no backend.
        </div>
      ) : null}

      <div className="mode-toggle" role="tablist" aria-label="View mode">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'manual'}
          className={`mode-toggle__btn ${mode === 'manual' ? 'mode-toggle__btn--active' : ''}`}
          onClick={() => setMode('manual')}
        >
          Manual (like mobile)
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'local'}
          className={`mode-toggle__btn ${mode === 'local' ? 'mode-toggle__btn--active' : ''}`}
          onClick={() => setMode('local')}
        >
          This computer
        </button>
      </div>

      {mode === 'manual' ? (
        <ManualConnectionsMode onCopy={copy} />
      ) : devApis ? (
        <LocalMachineMode />
      ) : (
        <p className="empty-hint">Switch to dev server to use local socket view.</p>
      )}

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  )
}
