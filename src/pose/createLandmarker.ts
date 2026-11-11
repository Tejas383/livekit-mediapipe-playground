import { PoseLandmarker, type NormalizedLandmark } from '@mediapipe/tasks-vision'
import type { PoseFrame } from '../types/pose'

export type Delegate = 'GPU' | 'CPU'

/** Same shape as MediaPipe's (unexported) WasmFileset type. */
export interface WasmFileset {
  wasmLoaderPath: string
  wasmBinaryPath: string
}

export const MODEL_PATH = `${import.meta.env.BASE_URL}mediapipe/models/pose_landmarker_lite.task`

/**
 * Creates a PoseLandmarker, trying the preferred delegate first and falling
 * back to the other one if it fails.
 *
 * `beforeEachAttempt` lets the worker restore `self.ModuleFactory` — MediaPipe
 * deletes it after one use, so a second create (the fallback) would fail.
 */
export async function createPoseLandmarker(
  fileset: WasmFileset,
  preferred: Delegate,
  modelPath: string,
  beforeEachAttempt?: () => void,
): Promise<{ landmarker: PoseLandmarker; delegate: Delegate }> {
  const order: Delegate[] = preferred === 'GPU' ? ['GPU', 'CPU'] : ['CPU', 'GPU']
  let lastError: unknown

  for (const delegate of order) {
    try {
      beforeEachAttempt?.()
      const landmarker = await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: modelPath, delegate },
        // VIDEO mode tracks the pose between frames (faster + smoother than
        // detecting from scratch). Requires strictly increasing timestamps.
        runningMode: 'VIDEO',
        numPoses: 1,
      })
      return { landmarker, delegate }
    } catch (err) {
      console.warn(`[pose] ${delegate} delegate failed`, err)
      lastError = err
    }
  }
  throw lastError
}

/** Converts MediaPipe output to our shared 2D format (drops z and world landmarks). */
export function toPoseFrame(landmarks: NormalizedLandmark[][], width: number, height: number): PoseFrame {
  const pose = landmarks[0]
  return {
    width,
    height,
    landmarks: pose ? pose.map(({ x, y, visibility }) => ({ x, y, visibility })) : null,
  }
}

/** MediaPipe VIDEO mode rejects timestamps that don't increase. */
export function createTimestamper() {
  let last = 0
  return () => (last = Math.max(last + 1, performance.now()))
}
