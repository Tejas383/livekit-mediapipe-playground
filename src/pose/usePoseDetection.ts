import { useEffect, useEffectEvent, useState } from 'react'
import type { PoseFrame } from '../types/pose'
import type { Delegate } from './createLandmarker'
import {
  startMainThreadEngine,
  startWorkerBitmapEngine,
  startWorkerStreamEngine,
  type EngineCallbacks,
} from './engines'
import { readPoseSettings, type PoseEngine } from './settings'

export interface PoseStats {
  status: 'loading' | 'running' | 'error'
  engine: PoseEngine
  delegate?: Delegate
  /** Pose results per second. */
  fps: number
  /** Average time inside detectForVideo (ms) — on whichever thread runs it. */
  inferenceMs: number
  /**
   * Longest main-thread frame in the last window (ms). ~16 ms at 60 Hz means a
   * smooth UI; big values mean something blocked the main thread.
   */
  uiMaxFrameMs: number
  error?: string
}

const STATS_INTERVAL_MS = 500
const settings = readPoseSettings()

/**
 * Runs pose detection on a camera track with the engine chosen in the URL
 * (default: Web Worker). Every result goes to `onResult` directly — not React
 * state — so drawing doesn't re-render components 30×/s. Only the summarized
 * stats go through React state.
 */
export function usePoseDetection(
  track: MediaStreamTrack | undefined,
  onResult: (frame: PoseFrame) => void,
): PoseStats {
  const [stats, setStats] = useState<PoseStats>({
    status: 'loading',
    engine: settings.engine,
    fps: 0,
    inferenceMs: 0,
    uiMaxFrameMs: 0,
  })

  // Calls the latest `onResult` without making it an effect dependency
  // (otherwise the engine would restart on every render).
  const emitResult = useEffectEvent(onResult)

  useEffect(() => {
    if (!track) return

    let delegate: Delegate | undefined
    let failed = false
    let frames = 0
    let inferenceTotal = 0
    let uiMax = 0
    let lastRaf = performance.now()
    let windowStart = performance.now()

    // Measures main-thread smoothness independently of the engine.
    let rafId = requestAnimationFrame(function measure(now) {
      uiMax = Math.max(uiMax, now - lastRaf)
      lastRaf = now
      rafId = requestAnimationFrame(measure)
    })

    const timer = setInterval(() => {
      if (failed) return
      const elapsed = performance.now() - windowStart
      if (delegate) {
        setStats({
          status: 'running',
          engine: settings.engine,
          delegate,
          fps: (frames * 1000) / elapsed,
          inferenceMs: frames ? inferenceTotal / frames : 0,
          uiMaxFrameMs: uiMax,
        })
      }
      frames = 0
      inferenceTotal = 0
      uiMax = 0
      windowStart = performance.now()
    }, STATS_INTERVAL_MS)

    const callbacks: EngineCallbacks = {
      onReady: (d) => (delegate = d),
      onResult: (frame, ms) => {
        frames++
        inferenceTotal += ms
        emitResult(frame)
      },
      onError: (message) => {
        failed = true
        console.error('[pose]', message)
        setStats((s) => ({ ...s, status: 'error', error: message }))
      },
    }

    const start =
      settings.engine === 'main'
        ? startMainThreadEngine
        : settings.engine === 'worker-bitmap'
          ? startWorkerBitmapEngine
          : startWorkerStreamEngine
    const stop = start(track, settings.delegate, callbacks)

    return () => {
      stop()
      clearInterval(timer)
      cancelAnimationFrame(rafId)
    }
  }, [track])

  return stats
}
