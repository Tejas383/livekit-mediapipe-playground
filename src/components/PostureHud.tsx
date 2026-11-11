import { useEffect, useState } from 'react'
import type { Exercise } from '../posture/exercises'
import type { HudState } from './postureHudState'

const NOTICE_MS = 2500

interface PostureHudProps {
  state: HudState
  /** Exercise-specific wording ("Squats" / "Fists", …). */
  labels: Exercise['hud']
  onNoticeExpired: () => void
}

export function PostureHud({ state, labels, onNoticeExpired }: PostureHudProps) {
  // Clear the notice a few seconds after it appears.
  useEffect(() => {
    if (!state.notice) return
    const id = setTimeout(onNoticeExpired, NOTICE_MS)
    return () => clearTimeout(id)
  }, [state.notice, onNoticeExpired])

  return (
    <div className="posture-hud" aria-live="polite">
      <div className="posture-hud-stat">
        <span className="posture-hud-label">{labels.countLabel}</span>
        <span className="posture-hud-value">{state.reps}</span>
      </div>
      <div className="posture-hud-stat">
        <span className="posture-hud-label">{labels.holdLabel}</span>
        {state.holdStartedAt !== null ? (
          <LiveHold startedAt={state.holdStartedAt} />
        ) : (
          <span className="posture-hud-value posture-hud-muted">
            {state.lastHoldMs !== null ? `${(state.lastHoldMs / 1000).toFixed(1)} s` : '–'}
          </span>
        )}
        {state.holdStartedAt === null && state.lastHoldMs !== null && <span className="posture-hud-label">last</span>}
      </div>
      {!state.framed && <div className="posture-hud-notice">{labels.framingHint}</div>}
      {state.framed && state.notice && <div className="posture-hud-notice">{state.notice}</div>}
    </div>
  )
}

/** Ticking timer, only mounted while a hold is in progress (so nothing re-renders otherwise). */
function LiveHold({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(() => performance.now())
  useEffect(() => {
    const id = setInterval(() => setNow(performance.now()), 100)
    return () => clearInterval(id)
  }, [])
  return <span className="posture-hud-value posture-hud-live">{(Math.max(0, now - startedAt) / 1000).toFixed(1)} s</span>
}
