import { useState, type SubmitEvent } from 'react'
import { config } from '../config'
import { canUseMediaDevices } from './media'
import { describeToken, fetchSandboxToken, type JoinDetails } from './token'

type Mode = 'token' | 'sandbox'

interface JoinFormProps {
  onJoin: (details: JoinDetails) => void
}

/**
 * Collects connection details. Two modes:
 * - token:   server URL + pre-generated token (prefilled from .env.local)
 * - sandbox: room + identity, token fetched from LiveKit Cloud's sandbox server
 */
export function JoinForm({ onJoin }: JoinFormProps) {
  const sandboxAvailable = config.livekitSandboxId.length > 0
  const [mode, setMode] = useState<Mode>('token')

  const [serverUrl, setServerUrl] = useState(config.livekitUrl)
  const [token, setToken] = useState(config.livekitToken)

  const [roomName, setRoomName] = useState('playground')
  const [identity, setIdentity] = useState(() => `user-${Math.random().toString(36).slice(2, 7)}`)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const tokenInfo = describeToken(token)

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    if (mode === 'token') {
      if (!serverUrl.trim() || !token.trim()) {
        setError('Server URL and token are both required.')
        return
      }
      if (!tokenInfo) {
        setError('That token could not be decoded — check it was pasted completely.')
        return
      }
      if (tokenInfo.expired) {
        setError('This token has expired. Generate a new one with `lk token create`.')
        return
      }
      onJoin({ serverUrl: serverUrl.trim(), token: token.trim() })
      return
    }

    setBusy(true)
    try {
      onJoin(await fetchSandboxToken(config.livekitSandboxId, roomName.trim(), identity.trim()))
    } catch (err) {
      setError(`Sandbox token request failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="join-form" onSubmit={handleSubmit}>
      <h1>LiveKit MediaPipe Playground</h1>
      <p className="muted">Join a room to start a video session.</p>

      {!canUseMediaDevices() && (
        <p className="error" role="alert">
          Camera and microphone are blocked: this page isn't on HTTPS or localhost. You can still join,
          but only to watch.
        </p>
      )}

      {sandboxAvailable && (
        <div className="segmented" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'token'} onClick={() => setMode('token')}>
            Token
          </button>
          <button type="button" role="tab" aria-selected={mode === 'sandbox'} onClick={() => setMode('sandbox')}>
            Sandbox
          </button>
        </div>
      )}

      {mode === 'token' ? (
        <>
          <label>
            Server URL
            <input
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="wss://your-project.livekit.cloud"
              spellCheck={false}
            />
          </label>
          <label>
            Access token
            <textarea
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste a token from `lk token create`"
              rows={4}
              spellCheck={false}
            />
          </label>
          {tokenInfo && (
            <dl className="token-info">
              <dt>Identity</dt>
              <dd>{tokenInfo.identity ?? '—'}</dd>
              <dt>Room</dt>
              <dd>{tokenInfo.room ?? '—'}</dd>
              <dt>Expires</dt>
              <dd className={tokenInfo.expired ? 'danger' : undefined}>
                {tokenInfo.expiresAt?.toLocaleString() ?? '—'}
                {tokenInfo.expired && ' (expired)'}
              </dd>
            </dl>
          )}
          <p className="hint">
            Testing with a second tab? Each participant needs its own identity — the same identity in
            two tabs kicks the first one out.
          </p>
        </>
      ) : (
        <>
          <label>
            Room
            <input value={roomName} onChange={(e) => setRoomName(e.target.value)} required />
          </label>
          <label>
            Identity
            <input value={identity} onChange={(e) => setIdentity(e.target.value)} required />
          </label>
        </>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <button type="submit" className="primary" disabled={busy}>
        {busy ? 'Getting token…' : 'Join room'}
      </button>
    </form>
  )
}
