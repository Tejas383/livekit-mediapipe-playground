import { useEffect, useEffectEvent, useState } from 'react'
import type { AnalyzerChoice } from '../posture/analyzer'
import type { ExerciseId } from '../posture/exercises'
import type { PostureEvent } from '../posture/types'
import type { Hand2D, PoseFrame } from '../types/pose'
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
  analyzer: AnalyzerChoice
  delegate?: Delegate
  /** Pose results per second. */
  fps: number
  /** Average time inside detectForVideo (ms) — on whichever thread runs it. */
  inferenceMs: number
  /** Average time inside the posture analyzer's analyze() (ms). */
  analysisMs: number
  /** Posture events received per second. */
  eventsPerSec: number
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
  exercise: ExerciseId,
  onResult: (frame: PoseFrame, hands: Hand2D[] | null, events: PostureEvent[]) => void,
): PoseStats {
  const [stats, setStats] = useState<PoseStats>({
    status: 'loading',
    engine: settings.engine,
    analyzer: settings.analyzer,
    fps: 0,
    inferenceMs: 0,
    analysisMs: 0,
    eventsPerSec: 0,
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
    let analysisTotal = 0
    let eventCount = 0
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
          analyzer: settings.analyzer,
          delegate,
          fps: (frames * 1000) / elapsed,
          inferenceMs: frames ? inferenceTotal / frames : 0,
          analysisMs: frames ? analysisTotal / frames : 0,
          eventsPerSec: (eventCount * 1000) / elapsed,
          uiMaxFrameMs: uiMax,
        })
      }
      frames = 0
      inferenceTotal = 0
      analysisTotal = 0
      eventCount = 0
      uiMax = 0
      windowStart = performance.now()
    }, STATS_INTERVAL_MS)

    const callbacks: EngineCallbacks = {
      onReady: (d) => (delegate = d),
      onResult: ({ frame, hands, events, inferenceMs, analysisMs }) => {
        frames++
        inferenceTotal += inferenceMs
        analysisTotal += analysisMs
        eventCount += events.length
        emitResult(frame, hands, events)
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
    // Switching exercise restarts the engine (fresh analyzer, right models loaded).
    const stop = start(track, { delegate: settings.delegate, analyzer: settings.analyzer, exercise }, callbacks)

    return () => {
      stop()
      clearInterval(timer)
      cancelAnimationFrame(rafId)
    }
  }, [track, exercise])

  return stats
}
