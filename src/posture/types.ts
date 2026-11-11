/**
 * Contract between the app and your team's posture logic (rules engine).
 *
 * Shapes follow the WP-04 frontend handover: engine outputs are the
 * `bb.metrics` message types (section 5), without the envelope — the sending
 * code adds `v`, `id`, `seq`, `deviceTs`, … when it publishes them.
 *
 * TEMPORARY: WP-04 requires these to be generated from the published JSON
 * Schemas. Replace this file with generated types once they exist.
 *
 * Runs INSIDE the pose Web Worker — see docs/posture-integration.md.
 */
import type { Hand2D, PoseFrame } from '../types/pose'

/** What the engine receives for every processed camera frame. */
export interface PostureInput extends PoseFrame {
  // Inherited from PoseFrame:
  //   width, height — video resolution in pixels
  //   landmarks     — 33 × { x, y, visibility }, normalized 0..1, BlazePose order; null = no person
  /**
   * Milliseconds, strictly increasing. Same clock as MediaPipe's VIDEO-mode
   * timestamps (performance.now() in the thread doing detection). Use it for
   * durations (tempo, holds); it is not wall-clock time.
   */
  timestamp: number
  /**
   * Detected hands (0–2), or null when the current exercise doesn't use hand
   * tracking (the hand model isn't even loaded then).
   */
  hands: Hand2D[] | null
}

export type Severity = 'low' | 'medium' | 'high'

type NoData = Record<string, never>

/** Engine outputs, named and shaped like the WP-04 bb.metrics messages. */
export type PostureEvent =
  | {
      type: 'rep.completed'
      data: { set: number; rep: number; romDeg?: number; tempoMs?: number; errors: string[] }
    }
  | { type: 'hold.completed'; data: { set: number; holdMs: number; targetMs: number } }
  | { type: 'posture.error'; data: { code: string; severity: Severity; rep?: number } }
  /** WP-04 sends this at 1 Hz — the engine decides when to emit it. */
  | { type: 'activity.progress'; data: { reps: number; holdMs: number } }
  | { type: 'framing.lost'; data: NoData }
  | { type: 'framing.restored'; data: NoData }

/** Every event type name, e.g. 'rep.completed'. */
export type PostureEventType = PostureEvent['type']

export interface PostureAnalyzer {
  /**
   * Called for every pose result (about the camera's frame rate).
   * Must be synchronous and fast. Return [] when nothing happened this frame.
   */
  analyze(input: PostureInput): PostureEvent[]
}
