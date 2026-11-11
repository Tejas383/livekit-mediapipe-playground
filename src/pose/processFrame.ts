import type { HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision'
import type { PostureAnalyzer, PostureEvent } from '../posture/types'
import type { Hand2D, PoseFrame } from '../types/pose'
import { createTimestamper, toHands, toPoseFrame } from './createLandmarker'

/** Everything produced for one camera frame. Plain data, so it can be posted from the worker. */
export interface FrameOutput {
  frame: PoseFrame
  /** Detected hands, or null when the hand model isn't running (exercise doesn't need it). */
  hands: Hand2D[] | null
  /** Events from the posture analyzer for this frame ([] if none or analysis is off). */
  events: PostureEvent[]
  /** Pose + hand model time (ms). */
  inferenceMs: number
  analysisMs: number
}

/**
 * One frame's pipeline: pose detection (+ hand detection if `handLandmarker`
 * is given) → posture analysis.
 * Used by the worker and by the main-thread baseline engine, so both behave
 * the same.
 */
export function createFrameProcessor(
  landmarker: PoseLandmarker,
  handLandmarker: HandLandmarker | null,
  analyzer: PostureAnalyzer | null,
) {
  const nextTimestamp = createTimestamper()
  let analyzerErrors = 0

  return (source: TexImageSource, width: number, height: number): FrameOutput => {
    const timestamp = nextTimestamp()

    const t0 = performance.now()
    const result = landmarker.detectForVideo(source, timestamp)
    // Same frame, same timestamp: each MediaPipe task keeps its own timeline.
    const hands = handLandmarker ? toHands(handLandmarker.detectForVideo(source, timestamp)) : null
    const t1 = performance.now()
    const frame = toPoseFrame(result.landmarks, width, height)

    let events: PostureEvent[] = []
    if (analyzer) {
      try {
        events = analyzer.analyze({ ...frame, timestamp, hands })
      } catch (err) {
        // A bug in the analyzer must not stop pose detection. Log the first
        // error, then only occasionally (this runs ~30×/s).
        if (analyzerErrors++ % 300 === 0) console.error(`[posture] analyze() threw (${analyzerErrors}×)`, err)
      }
    }

    return { frame, hands, events, inferenceMs: t1 - t0, analysisMs: analyzer ? performance.now() - t1 : 0 }
  }
}
