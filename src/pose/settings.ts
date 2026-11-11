import type { AnalyzerChoice } from '../posture/analyzer'
import type { Delegate } from './createLandmarker'

/**
 * Where pose detection runs:
 * - worker:        Web Worker fed by a VideoFrame stream (MediaStreamTrackProcessor). Default.
 * - worker-bitmap: Web Worker fed one ImageBitmap at a time from the main thread.
 * - main:          on the main thread (the Phase 2 baseline).
 */
export type PoseEngine = 'worker' | 'worker-bitmap' | 'main'

const ENGINES: PoseEngine[] = ['worker', 'worker-bitmap', 'main']

const ANALYZERS: AnalyzerChoice[] = ['default', 'sample', 'off']

/**
 * Picked from the URL so the engines can be compared without code changes:
 *   https://localhost:5173/?pose=main&delegate=CPU&analyzer=sample
 */
export function readPoseSettings(): { engine: PoseEngine; delegate: Delegate; analyzer: AnalyzerChoice } {
  const params = new URLSearchParams(window.location.search)
  const engine = params.get('pose') as PoseEngine | null
  const delegate = params.get('delegate')?.toUpperCase()
  const analyzer = params.get('analyzer') as AnalyzerChoice | null
  return {
    engine: engine && ENGINES.includes(engine) ? engine : 'worker',
    delegate: delegate === 'CPU' ? 'CPU' : 'GPU',
    analyzer: analyzer && ANALYZERS.includes(analyzer) ? analyzer : 'default',
  }
}
