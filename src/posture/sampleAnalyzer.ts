import type { PostureAnalyzer, PostureEvent } from './types'

const PROGRESS_INTERVAL_MS = 1000
const FAKE_ERROR_INTERVAL_MS = 4000
const FAKE_REP_INTERVAL_MS = 3000

/**
 * TEST SCAFFOLDING ONLY — emits FAKE events so the pipeline and the Phase 6
 * UI can be tested before the real engine exists. It contains no posture
 * rules: reps and errors are on a timer, not derived from the body.
 *
 * Select it with ?analyzer=sample in the URL.
 */
export function createSampleAnalyzer(): PostureAnalyzer {
  let inFrame: boolean | null = null
  let lastProgress = -Infinity
  let lastError = -Infinity
  let lastRep = -Infinity
  let reps = 0

  return {
    analyze(input) {
      const events: PostureEvent[] = []
      const t = input.timestamp
      const personVisible = input.landmarks !== null

      if (personVisible !== inFrame) {
        if (inFrame !== null) events.push({ type: personVisible ? 'framing.restored' : 'framing.lost', data: {} })
        inFrame = personVisible
        // Restart the fake timers when the person comes back.
        lastRep = lastError = t
      }

      if (personVisible && t - lastRep >= FAKE_REP_INTERVAL_MS) {
        lastRep = t
        reps++
        events.push({ type: 'rep.completed', data: { set: 1, rep: reps, romDeg: 90, tempoMs: 2000, errors: [] } })
      }

      if (personVisible && t - lastError >= FAKE_ERROR_INTERVAL_MS) {
        lastError = t
        events.push({ type: 'posture.error', data: { code: 'sample_error', severity: 'medium', rep: reps } })
      }

      if (t - lastProgress >= PROGRESS_INTERVAL_MS) {
        lastProgress = t
        events.push({ type: 'activity.progress', data: { reps, holdMs: 0 } })
      }

      return events
    },
  }
}
