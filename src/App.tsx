import { config, isLivekitConfigured } from './config'

function App() {
  return (
    <main className="app">
      <h1>LiveKit MediaPipe Playground</h1>
      <p>Phase 0 shell — room join and video grid arrive in Phase 1.</p>

      <dl className="status">
        <dt>LiveKit URL</dt>
        <dd>{isLivekitConfigured ? config.livekitUrl : 'not set (add VITE_LIVEKIT_URL to .env.local)'}</dd>
        <dt>Token</dt>
        <dd>{config.livekitToken ? 'provided via env' : 'none'}</dd>
        <dt>Sandbox token server</dt>
        <dd>{config.livekitSandboxId ? 'configured' : 'none'}</dd>
      </dl>
    </main>
  )
}

export default App
