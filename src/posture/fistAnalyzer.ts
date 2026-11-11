/**
 * Fist rules: counts how many times the user makes a fist, and how long each
 * fist is held. Uses the hand model (21 points per hand), not the pose model.
 *
 * OPENNESS SIGNAL — per hand, averaged over the 4 fingers (thumb ignored):
 *
 *     openness = mean( |tip − wrist| / |knuckle − wrist| )      (pixels)
 *
 *   open hand ≈ 1.7–2.0   (fingertips far beyond the knuckles)
 *   fist      ≈ 0.8–1.1   (fingertips curled back to the palm)
 *
 * It's a ratio, so it doesn't depend on how close the hand is to the camera.
 * Works best with the palm or back of the hand facing the camera.
 *
 * STATE MACHINE per hand (gaps between thresholds = hysteresis):
 *
 *   waiting ──(open)──► open ──(openness ≤ fistEnter)──► fist      FIST COUNTED, hold starts
 *   fist ──(openness ≥ fistExit)──► releasing                      hold ends (hold.completed if long enough)
 *   releasing ──(openness ≤ fistEnter)──► fist                     re-clenched before opening: hold resumes, NOT counted again
 *   releasing ──(openness ≥ openEnter)──► open                     armed for the next fist
 *
 * Starts in `waiting`, so a hand that appears already clenched isn't counted
 * until it has opened once. Each hand (Left/Right) is tracked separately; the
 * fist count is the total of both.
 */
import { HAND } from './landmarks'
import type { PostureAnalyzer, PostureEvent, PostureInput } from './types'
import type { Hand2D } from '../types/pose'

/** All tunables in one place. Starting values — tune them with real hands. */
export const FIST_RULES = {
  /** Exponential moving average weight of the newest sample (0..1, higher = less smoothing). */
  smoothing: 0.5,

  /** Openness thresholds (fingertip distance / knuckle distance from the wrist). */
  openEnter: 1.55, // at/above: hand is open (arms the next fist)
  fistExit: 1.35, // above: the fist is being released
  fistEnter: 1.2, // at/below: hand is a fist

  /** Ignore hands smaller than this (palm size in px) — too far away to judge. */
  minPalmPx: 20,

  /** Two fists from the same hand closer together than this are treated as one (noise). */
  minFistIntervalMs: 300,

  /** Fist held at least this long → hold.completed when released. */
  minHoldMs: 1000,
  holdTargetMs: 0,

  /** A hand that disappears for this long is reset (must open again before it counts). */
  handLostAfterMs: 500,

  /** Framing: no hands for this long → framing.lost; hands back for this long → framing.restored. */
  framingLostAfterMs: 500,
  framingRestoredAfterMs: 300,

  /** activity.progress interval. Also sent immediately when a hold starts or ends. */
  progressIntervalMs: 1000,
} as const

const FINGERS = [
  [HAND.INDEX_MCP, HAND.INDEX_TIP],
  [HAND.MIDDLE_MCP, HAND.MIDDLE_TIP],
  [HAND.RING_MCP, HAND.RING_TIP],
  [HAND.PINKY_MCP, HAND.PINKY_TIP],
] as const

/** Openness of one hand, or null if it's too small to judge. Computed in pixels. */
export function handOpenness(hand: Hand2D, width: number, height: number): number | null {
  const p = hand.landmarks.map(({ x, y }) => ({ x: x * width, y: y * height }))
  const wrist = p[HAND.WRIST]
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)

  if (dist(wrist, p[HAND.MIDDLE_MCP]) < FIST_RULES.minPalmPx) return null

  let sum = 0
  for (const [mcp, tip] of FINGERS) {
    const knuckle = dist(wrist, p[mcp])
    if (knuckle < 1) return null
    sum += dist(wrist, p[tip]) / knuckle
  }
  return sum / FINGERS.length
}

type Phase = 'waiting' | 'open' | 'fist' | 'releasing'

interface HandState {
  phase: Phase
  smoothed: number | null
  lastSeenAt: number
  lastFistAt: number
  holdStartedAt: number | null
}

export function createFistAnalyzer(): PostureAnalyzer {
  const R = FIST_RULES
  const hands = new Map<Hand2D['handedness'], HandState>()
  let fists = 0

  let framed = true
  let lastHandAt: number | null = null
  let handsSince: number | null = null
  let lastProgressAt = -Infinity

  const isHolding = () => [...hands.values()].some((h) => h.holdStartedAt !== null)

  function endHold(h: HandState, t: number, events: PostureEvent[]) {
    if (h.holdStartedAt === null) return
    const holdMs = t - h.holdStartedAt
    h.holdStartedAt = null
    if (holdMs >= R.minHoldMs) {
      events.push({ type: 'hold.completed', data: { set: 1, holdMs: Math.round(holdMs), targetMs: R.holdTargetMs } })
    }
  }

  function step(h: HandState, openness: number, t: number, events: PostureEvent[]) {
    h.smoothed = h.smoothed === null ? openness : h.smoothed + R.smoothing * (openness - h.smoothed)
    const o = h.smoothed

    switch (h.phase) {
      case 'waiting':
        if (o >= R.openEnter) h.phase = 'open'
        break
      case 'open':
        if (o <= R.fistEnter) {
          h.phase = 'fist'
          h.holdStartedAt = t
          if (t - h.lastFistAt >= R.minFistIntervalMs) {
            h.lastFistAt = t
            fists++
            events.push({ type: 'rep.completed', data: { set: 1, rep: fists, errors: [] } })
          }
        }
        break
      case 'fist':
        if (o >= R.fistExit) {
          endHold(h, t, events)
          h.phase = 'releasing'
        }
        break
      case 'releasing':
        if (o <= R.fistEnter) {
          h.phase = 'fist' // clenched again without opening fully: same fist, hold resumes
          h.holdStartedAt = t
        } else if (o >= R.openEnter) {
          h.phase = 'open'
        }
        break
    }
  }

  return {
    analyze(input: PostureInput) {
      const events: PostureEvent[] = []
      const t = input.timestamp
      const wasHolding = isHolding()
      const visible = input.hands ?? []

      // ---- Per-hand state machines (hands matched by Left/Right) ----
      const seen = new Set<Hand2D['handedness']>()
      for (const hand of visible) {
        if (seen.has(hand.handedness)) continue // two hands with the same label: keep the first
        seen.add(hand.handedness)
        const openness = handOpenness(hand, input.width, input.height)
        if (openness === null) continue

        let h = hands.get(hand.handedness)
        if (!h) {
          h = { phase: 'waiting', smoothed: null, lastSeenAt: t, lastFistAt: -Infinity, holdStartedAt: null }
          hands.set(hand.handedness, h)
        }
        h.lastSeenAt = t
        step(h, openness, t, events)
      }

      // Hands that have been missing too long start over (must open again).
      for (const [side, h] of hands) {
        if (t - h.lastSeenAt >= R.handLostAfterMs) {
          endHold(h, t, events)
          hands.delete(side)
        }
      }

      // ---- Framing ----
      if (seen.size === 0) {
        handsSince = null
        if (framed && lastHandAt !== null && t - lastHandAt >= R.framingLostAfterMs) {
          framed = false
          events.push({ type: 'framing.lost', data: {} })
        }
      } else {
        lastHandAt = t
        handsSince ??= t
        if (!framed && t - handsSince >= R.framingRestoredAfterMs) {
          framed = true
          events.push({ type: 'framing.restored', data: {} })
        }
      }

      // ---- Progress (≈1 Hz, + immediately on hold start/end) ----
      const holding = isHolding()
      if (holding !== wasHolding || t - lastProgressAt >= R.progressIntervalMs) {
        lastProgressAt = t
        let holdMs = 0
        for (const h of hands.values()) if (h.holdStartedAt !== null) holdMs = Math.max(holdMs, t - h.holdStartedAt)
        events.push({ type: 'activity.progress', data: { reps: fists, holdMs: Math.round(holdMs) } })
      }

      return events
    },
  }
}
