import { useState } from 'react'
import { JoinForm } from './livekit/JoinForm'
import { RoomView } from './livekit/RoomView'
import type { JoinDetails } from './livekit/token'

function App() {
  const [details, setDetails] = useState<JoinDetails | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  if (details) {
    return (
      <RoomView
        details={details}
        onLeave={(message) => {
          setNotice(message ?? null)
          setDetails(null)
        }}
      />
    )
  }

  return (
    <main className="app">
      {notice && (
        <div className="banner" role="status">
          {notice}
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}
      <JoinForm
        onJoin={(d) => {
          setNotice(null)
          setDetails(d)
        }}
      />
    </main>
  )
}

export default App
