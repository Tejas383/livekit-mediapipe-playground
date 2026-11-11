import type { AnalyzerChoice } from '../posture/analyzer'
import type { ExerciseId } from '../posture/exercises'
import type { Delegate } from './createLandmarker'
import type { FrameOutput } from './processFrame'

/**
 * Messages between the main thread and the pose worker.
 *
 * Each union member has a `type` field — a "discriminated union". Checking
 * `msg.type` in a switch lets TypeScript know exactly which fields exist.
 */
export type MainToWorker =
  /** Load the model. Must be sent first. */
  | {
      type: 'init'
      delegate: Delegate
      modelPath: string
      handModelPath: string
      analyzer: AnalyzerChoice
      exercise: ExerciseId
    }
  /** Primary path: a stream of camera frames, transferred to the worker once. */
  | { type: 'stream'; readable: ReadableStream<VideoFrame> }
  /** Fallback path: one frame at a time, as an ImageBitmap. */
  | { type: 'frame'; bitmap: ImageBitmap }

export type WorkerToMain =
  /** Model loaded; `delegate` is what actually loaded (GPU may fall back to CPU). */
  | { type: 'ready'; delegate: Delegate }
  /** One processed frame: landmarks + posture events + timings. */
  | ({ type: 'result' } & FrameOutput)
  | { type: 'error'; message: string }
