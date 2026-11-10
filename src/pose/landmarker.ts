import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'

// Served from public/mediapipe (see scripts/setup-mediapipe.mjs).
const base = import.meta.env.BASE_URL
const WASM_PATH = `${base}mediapipe/wasm`
const MODEL_PATH = `${base}mediapipe/models/pose_landmarker_lite.task`

export type Delegate = 'GPU' | 'CPU'

export interface LoadedLandmarker {
  landmarker: PoseLandmarker
  /** Which backend actually loaded — GPU can fail on some machines. */
  delegate: Delegate
}

async function create(): Promise<LoadedLandmarker> {
  // Loads the wasm runtime (the "fileset") once; models are created on top of it.
  const fileset = await FilesetResolver.forVisionTasks(WASM_PATH)

  const build = (delegate: Delegate) =>
    PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_PATH, delegate },
      // VIDEO mode tracks the pose between frames (faster + smoother than
      // detecting from scratch each frame). Requires increasing timestamps.
      runningMode: 'VIDEO',
      numPoses: 1,
    })

  try {
    return { landmarker: await build('GPU'), delegate: 'GPU' }
  } catch (err) {
    console.warn('[pose] GPU delegate failed, falling back to CPU', err)
    return { landmarker: await build('CPU'), delegate: 'CPU' }
  }
}

let shared: Promise<LoadedLandmarker> | null = null

/**
 * Returns one shared PoseLandmarker for the whole app.
 *
 * Loading takes ~1–2 s (35 MB of wasm + model), so it happens once and is
 * reused across re-mounts (camera toggles, React StrictMode double effects).
 * It intentionally lives for the lifetime of the page.
 */
export function getPoseLandmarker(): Promise<LoadedLandmarker> {
  if (!shared) {
    shared = create().catch((err) => {
      shared = null // allow a retry on the next call
      throw err
    })
  }
  return shared
}
