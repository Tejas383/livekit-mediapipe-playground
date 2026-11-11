import type { PostureEvent } from '../posture/types'

/**
 * On-screen counters for the local participant, built ONLY from the events
 * the posture analyzer emits — the HUD never looks at landmarks or decides
 * anything about the squat itself.
 */
export interface HudState {
  reps: number
  /** performance.now() at which the current hold started; null = not holding. */
  holdStartedAt: number | null
  /** Duration of the last completed hold (hold.completed), in ms. */
  lastHoldMs: number | null
  /** false after framing.lost until framing.restored. */
  framed: boolean
  /** Short-lived message, e.g. after a posture.error. */
  notice: string | null
}

export const initialHud: HudState = { reps: 0, holdStartedAt: null, lastHoldMs: null, framed: true, notice: null }

export type HudAction = { type: 'events'; events: PostureEvent[]; now: number } | { type: 'clearNotice' }

/** Wording for posture.error codes. Unknown codes fall back to the code itself. */
const ERROR_TEXT: Record<string, string> = {
  shallow_depth: 'Go a little lower',
}

/** Pure function: (old state, events) → new state. Used with React's useReducer. */
export function hudReducer(state: HudState, action: HudAction): HudState {
  if (action.type === 'clearNotice') return { ...state, notice: null }

  let next = state
  for (const e of action.events) {
    switch (e.type) {
      case 'rep.completed':
        // A rep only completes after leaving the squat position, so no hold is running.
        next = { ...next, reps: e.data.rep, holdStartedAt: null }
        break
      case 'hold.completed':
        next = { ...next, lastHoldMs: e.data.holdMs, holdStartedAt: null }
        break
      case 'activity.progress':
        // The engine reports the CURRENT hold once a second. Turn it into a
        // start time so the timer can tick smoothly between reports.
        next = {
          ...next,
          reps: e.data.reps,
          holdStartedAt: e.data.holdMs > 0 ? (next.holdStartedAt ?? action.now - e.data.holdMs) : null,
        }
        break
      case 'posture.error':
        next = { ...next, notice: ERROR_TEXT[e.data.code] ?? e.data.code }
        break
      case 'framing.lost':
        next = { ...next, framed: false, holdStartedAt: null }
        break
      case 'framing.restored':
        next = { ...next, framed: true }
        break
    }
  }
  return next
}
