import { HandLandmarker, PoseLandmarker, type HandLandmarkerResult, type NormalizedLandmark } from '@mediapipe/tasks-vision'
import type { Hand2D, PoseFrame } from '../types/pose'

export type Delegate = 'GPU' | 'CPU'

/** Same shape as MediaPipe's (unexported) WasmFileset type. */
export interface WasmFileset {
  wasmLoaderPath: string
  wasmBinaryPath: string
}

export const MODEL_PATH = `${import.meta.env.BASE_URL}mediapipe/models/pose_landmarker_lite.task`
export const HAND_MODEL_PATH = `${import.meta.env.BASE_URL}mediapipe/models/hand_landmarker.task`

/**
 * Tries the preferred delegate first and falls back to the other one.
 *
 * `beforeEachAttempt` lets the worker restore `self.ModuleFactory` — MediaPipe
 * deletes it after each task is created, so any second create (a fallback,
 * or a second model like the hand landmarker) would otherwise fail.
 */
async function createWithFallback<T>(
  preferred: Delegate,
  label: string,
  create: (delegate: Delegate) => Promise<T>,
  beforeEachAttempt?: () => void,
): Promise<{ task: T; delegate: Delegate }> {
  const order: Delegate[] = preferred === 'GPU' ? ['GPU', 'CPU'] : ['CPU', 'GPU']
  let lastError: unknown
  for (const delegate of order) {
    try {
      beforeEachAttempt?.()
      return { task: await create(delegate), delegate }
    } catch (err) {
      console.warn(`[${label}] ${delegate} delegate failed`, err)
      lastError = err
    }
  }
  throw lastError
}

export async function createPoseLandmarker(
  fileset: WasmFileset,
  preferred: Delegate,
  modelPath: string,
  beforeEachAttempt?: () => void,
): Promise<{ landmarker: PoseLandmarker; delegate: Delegate }> {
  const { task, delegate } = await createWithFallback(
    preferred,
    'pose',
    (d) =>
      PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: modelPath, delegate: d },
        // VIDEO mode tracks the pose between frames (faster + smoother than
        // detecting from scratch). Requires strictly increasing timestamps.
        runningMode: 'VIDEO',
        numPoses: 1,
      }),
    beforeEachAttempt,
  )
  return { landmarker: task, delegate }
}

/** Hand model: only created for exercises that need hands. */
export async function createHandLandmarker(
  fileset: WasmFileset,
  preferred: Delegate,
  modelPath: string,
  beforeEachAttempt?: () => void,
): Promise<HandLandmarker> {
  const { task } = await createWithFallback(
    preferred,
    'hands',
    (d) =>
      HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: modelPath, delegate: d },
        runningMode: 'VIDEO',
        numHands: 2,
      }),
    beforeEachAttempt,
  )
  return task
}

/** Converts MediaPipe hand output to our 2D format. */
export function toHands(result: HandLandmarkerResult): Hand2D[] {
  return result.landmarks.map((points, i) => {
    const category = result.handedness[i]?.[0]
    return {
      handedness: category?.categoryName === 'Left' ? 'Left' : 'Right',
      score: category?.score ?? 0,
      landmarks: points.map(({ x, y }) => ({ x, y })),
    }
  })
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
