import type { PoseFrame } from '../types/pose'
import type { Delegate } from './createLandmarker'

/**
 * Messages between the main thread and the pose worker.
 *
 * Each union member has a `type` field — a "discriminated union". Checking
 * `msg.type` in a switch lets TypeScript know exactly which fields exist.
 */
export type MainToWorker =
  /** Load the model. Must be sent first. */
  | { type: 'init'; delegate: Delegate; modelPath: string }
  /** Primary path: a stream of camera frames, transferred to the worker once. */
  | { type: 'stream'; readable: ReadableStream<VideoFrame> }
  /** Fallback path: one frame at a time, as an ImageBitmap. */
  | { type: 'frame'; bitmap: ImageBitmap }

export type WorkerToMain =
  /** Model loaded; `delegate` is what actually loaded (GPU may fall back to CPU). */
  | { type: 'ready'; delegate: Delegate }
  /** One processed frame. */
  | { type: 'result'; frame: PoseFrame; inferenceMs: number }
  | { type: 'error'; message: string }
