import type { Delegate } from './createLandmarker'

/**
 * Where pose detection runs:
 * - worker:        Web Worker fed by a VideoFrame stream (MediaStreamTrackProcessor). Default.
 * - worker-bitmap: Web Worker fed one ImageBitmap at a time from the main thread.
 * - main:          on the main thread (the Phase 2 baseline).
 */
export type PoseEngine = 'worker' | 'worker-bitmap' | 'main'

const ENGINES: PoseEngine[] = ['worker', 'worker-bitmap', 'main']

/**
 * Picked from the URL so the engines can be compared without code changes:
 *   https://localhost:5173/?pose=main&delegate=CPU
 */
export function readPoseSettings(): { engine: PoseEngine; delegate: Delegate } {
  const params = new URLSearchParams(window.location.search)
  const engine = params.get('pose') as PoseEngine | null
  const delegate = params.get('delegate')?.toUpperCase()
  return {
    engine: engine && ENGINES.includes(engine) ? engine : 'worker',
    delegate: delegate === 'CPU' ? 'CPU' : 'GPU',
  }
}
