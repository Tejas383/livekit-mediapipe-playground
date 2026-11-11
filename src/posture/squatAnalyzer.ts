/**
 * Squat rules: counts reps and measures how long the user holds the bottom
 * (squat) position.
 *
 * DEPTH SIGNAL — "hip height above the knee, in torso lengths":
 *
 *     depth = (knee.y − hip.y) / |shoulder − hip|        (pixels; y grows downwards)
 *
 *   standing tall  ≈ 0.8–1.0   (thigh is roughly as long as the torso)
 *   parallel squat ≈ 0.0–0.2   (hip has dropped to knee height)
 *
 * Why not the knee angle (WP-04's example uses it)? The knee angle only shows
 * up from a SIDE camera. From the front — the usual laptop-webcam setup — the
 * hip drops straight down toward the knee and the 2D angle barely changes.
 * The hip-height signal works from the front and the side, and it doesn't
 * need the ankles/feet to be in frame.
 *
 * STATE MACHINE (thresholds have gaps between them = hysteresis, so noise
 * around a threshold can't flip the state back and forth):
 *
 *   waiting ──(stand tall)──► top ──(depth < topExit)──► descending
 *   descending ──(depth ≤ bottomEnter)──► bottom          (hold timer starts)
 *   descending ──(depth ≥ topEnter)──► top               (shallow_depth error if it dipped below `partial`)
 *   bottom ──(depth ≥ bottomExit)──► ascending            (hold ends → hold.completed if long enough)
 *   ascending ──(depth ≤ bottomEnter)──► bottom          (sank back down: hold resumes)
 *   ascending ──(depth ≥ topEnter)──► top                (REP COUNTED → rep.completed)
 *
 * Starts in `waiting` so a user who appears mid-squat isn't counted until
 * they've stood up once.
 */
import { LANDMARK } from './landmarks'
import type { PostureAnalyzer, PostureEvent, PostureInput } from './types'

/** All tunables in one place. Starting values — tune them with real recordings. */
export const SQUAT_RULES = {
  /** Landmarks below this visibility are ignored (MediaPipe's 0..1 confidence). */
  minVisibility: 0.5,

  /** Smoothing: exponential moving average weight of the newest sample (0..1, higher = less smoothing). */
  smoothing: 0.35,

  /** Depth thresholds (torso lengths of hip-above-knee). */
  topEnter: 0.7, // at/above: standing tall
  topExit: 0.6, // below: the descent has started
  partial: 0.5, // dipped below this but never reached the bottom → shallow_depth
  bottomEnter: 0.3, // at/below: in the squat position
  bottomExit: 0.38, // above: leaving the squat position

  /** A full rep (start of descent → standing again) shorter than this is treated as noise. */
  minRepMs: 800,

  /** Time in the bottom position that counts as a "hold" (hold.completed is emitted). */
  minHoldMs: 1000,
  /** Reported as `targetMs` in hold.completed. 0 = no target. */
  holdTargetMs: 0,

  /** Framing hysteresis: lost after this long without usable landmarks, restored after this long with them. */
  framingLostAfterMs: 500,
  framingRestoredAfterMs: 300,

  /** activity.progress interval (WP-04: 1 Hz). Also sent immediately when a hold starts or ends. */
  progressIntervalMs: 1000,
} as const

type Phase = 'waiting' | 'top' | 'descending' | 'bottom' | 'ascending'

/**
 * Depth for one body side, or null if that side isn't visible enough.
 * Also returns a weight (visibility) so the two sides can be blended.
 */
function sideDepth(input: PostureInput, shoulderIdx: number, hipIdx: number, kneeIdx: number) {
  const lm = input.landmarks
  if (!lm) return null
  const s = lm[shoulderIdx]
  const h = lm[hipIdx]
  const k = lm[kneeIdx]
  const visibility = Math.min(s.visibility, h.visibility, k.visibility)
  if (visibility < SQUAT_RULES.minVisibility) return null

  // Pixels: normalized x and y have different scales on non-square video.
  const sx = s.x * input.width
  const sy = s.y * input.height
  const hx = h.x * input.width
  const hy = h.y * input.height
  const ky = k.y * input.height

  const torso = Math.hypot(sx - hx, sy - hy)
  if (torso < 1) return null
  return { depth: (ky - hy) / torso, weight: visibility }
}

/** Blends the visible sides (weighted by visibility). null = not enough of the body is visible. */
export function squatDepth(input: PostureInput): number | null {
  const sides = [
    sideDepth(input, LANDMARK.LEFT_SHOULDER, LANDMARK.LEFT_HIP, LANDMARK.LEFT_KNEE),
    sideDepth(input, LANDMARK.RIGHT_SHOULDER, LANDMARK.RIGHT_HIP, LANDMARK.RIGHT_KNEE),
  ].filter((s) => s !== null)
  if (sides.length === 0) return null
  const totalWeight = sides.reduce((sum, s) => sum + s.weight, 0)
  return sides.reduce((sum, s) => sum + s.depth * s.weight, 0) / totalWeight
}

export function createSquatAnalyzer(): PostureAnalyzer {
  const R = SQUAT_RULES

  let phase: Phase = 'waiting'
  let smoothed: number | null = null

  let reps = 0
  let repStartedAt = 0 // when the current descent began
  let minDepthThisRep = Infinity

  let holdStartedAt: number | null = null // set while in the bottom position

  // Framing: start as "in frame"; becomes lost only after a sustained gap.
  let framed = true
  let lastUsableAt: number | null = null
  let usableSince: number | null = null

  let lastProgressAt = -Infinity

  /** Abandons the rep in progress (e.g. the person walked out of frame). */
  function resetRep() {
    phase = 'waiting'
    smoothed = null
    minDepthThisRep = Infinity
    holdStartedAt = null
  }

  /** Ends a hold that's in progress; emits hold.completed if it was long enough. */
  function endHold(t: number, events: PostureEvent[]) {
    if (holdStartedAt === null) return
    const holdMs = t - holdStartedAt
    holdStartedAt = null
    if (holdMs >= R.minHoldMs) {
      events.push({ type: 'hold.completed', data: { set: 1, holdMs: Math.round(holdMs), targetMs: R.holdTargetMs } })
    }
  }

  return {
    analyze(input) {
      const events: PostureEvent[] = []
      const t = input.timestamp
      const raw = squatDepth(input)
      // Hold started/ended this frame → report progress now, so a live timer
      // can start/stop immediately instead of up to 1 s late.
      const wasHolding = holdStartedAt !== null

      // ---- Framing (with hysteresis) ----
      if (raw === null) {
        usableSince = null
        if (framed && lastUsableAt !== null && t - lastUsableAt >= R.framingLostAfterMs) {
          framed = false
          events.push({ type: 'framing.lost', data: {} })
          resetRep()
        }
      } else {
        lastUsableAt = t
        usableSince ??= t
        if (!framed && t - usableSince >= R.framingRestoredAfterMs) {
          framed = true
          events.push({ type: 'framing.restored', data: {} })
        }
      }

      // ---- Rep / hold state machine (only with a usable, framed body) ----
      if (raw !== null && framed) {
        smoothed = smoothed === null ? raw : smoothed + R.smoothing * (raw - smoothed)
        const d = smoothed

        switch (phase) {
          case 'waiting':
            if (d >= R.topEnter) phase = 'top'
            break

          case 'top':
            if (d < R.topExit) {
              phase = 'descending'
              repStartedAt = t
              minDepthThisRep = d
            }
            break

          case 'descending':
            minDepthThisRep = Math.min(minDepthThisRep, d)
            if (d <= R.bottomEnter) {
              phase = 'bottom'
              holdStartedAt = t
            } else if (d >= R.topEnter) {
              // Went down a bit and came back up without reaching the squat position.
              if (minDepthThisRep < R.partial) {
                events.push({ type: 'posture.error', data: { code: 'shallow_depth', severity: 'low', rep: reps + 1 } })
              }
              phase = 'top'
            }
            break

          case 'bottom':
            minDepthThisRep = Math.min(minDepthThisRep, d)
            if (d >= R.bottomExit) {
              endHold(t, events)
              phase = 'ascending'
            }
            break

          case 'ascending':
            if (d <= R.bottomEnter) {
              phase = 'bottom' // sank back into the squat; the hold continues as a new segment
              holdStartedAt = t
            } else if (d >= R.topEnter) {
              const tempoMs = t - repStartedAt
              if (tempoMs >= R.minRepMs) {
                reps++
                events.push({
                  type: 'rep.completed',
                  data: { set: 1, rep: reps, tempoMs: Math.round(tempoMs), errors: [] },
                })
              }
              phase = 'top'
            }
            break
        }
      }

      // ---- Progress (≈1 Hz, + on hold start/end): reps so far + the CURRENT hold's duration (0 if not holding) ----
      const holdChanged = wasHolding !== (holdStartedAt !== null)
      if (holdChanged || t - lastProgressAt >= R.progressIntervalMs) {
        lastProgressAt = t
        const holdMs = holdStartedAt !== null ? t - holdStartedAt : 0
        events.push({ type: 'activity.progress', data: { reps, holdMs: Math.round(holdMs) } })
      }

      return events
    },
  }
}
