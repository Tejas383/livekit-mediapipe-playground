import type { PoseLandmarkerResult } from '@mediapipe/tasks-vision'
import { useEffect, useEffectEvent, useState } from 'react'
import { getPoseLandmarker, type Delegate } from './landmarker'

export interface PoseStats {
  status: 'loading' | 'running' | 'error'
  delegate?: Delegate
  /** Pose detections per second (≈ processed camera frames per second). */
  fps: number
  /** Average time spent inside detectForVideo, in ms. Blocks the main thread! */
  inferenceMs: number
  error?: string
}

/** How often the stats readout refreshes. Per-frame React updates would be wasteful. */
const STATS_INTERVAL_MS = 500

/**
 * Runs MediaPipe pose detection on a camera track, on the MAIN THREAD.
 * (Phase 2 baseline — Phase 3 moves this into a Web Worker.)
 *
 * Results are delivered through `onResult` on every processed frame instead
 * of React state, so drawing happens without re-rendering components 30×/s.
 * Only the summarized stats go through React state.
 */
export function usePoseDetection(
  track: MediaStreamTrack | undefined,
  onResult: (result: PoseLandmarkerResult, video: HTMLVideoElement) => void,
): PoseStats {
  const [stats, setStats] = useState<PoseStats>({ status: 'loading', fps: 0, inferenceMs: 0 })

  // Always calls the latest `onResult` without making it an effect dependency
  // (otherwise the whole pipeline would restart on every render).
  const emitResult = useEffectEvent(onResult)

  useEffect(() => {
    if (!track) return

    let cancelled = false
    let rafId = 0

    // Our own <video> element, fed directly from the track. It's never added
    // to the page — it only exists so MediaPipe has frames to read. The tile's
    // visible <video> is owned by LiveKit and we leave it alone.
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.srcObject = new MediaStream([track])
    video.play().catch((err) => console.warn('[pose] video.play() failed', err))

    getPoseLandmarker()
      .then(({ landmarker, delegate }) => {
        if (cancelled) return

        let lastVideoTime = -1
        let frames = 0
        let inferenceTotal = 0
        let windowStart = performance.now()

        const loop = () => {
          rafId = requestAnimationFrame(loop)

          // rAF runs at display rate (often 60–120 Hz); the camera is usually
          // 30 fps. Only run inference when the video has a NEW frame.
          if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return
          if (video.currentTime === lastVideoTime) return
          lastVideoTime = video.currentTime

          const start = performance.now()
          // Synchronous: the UI is frozen for the duration of this call.
          const result = landmarker.detectForVideo(video, start)
          inferenceTotal += performance.now() - start
          frames++

          emitResult(result, video)

          const elapsed = performance.now() - windowStart
          if (elapsed >= STATS_INTERVAL_MS) {
            setStats({
              status: 'running',
              delegate,
              fps: (frames * 1000) / elapsed,
              inferenceMs: inferenceTotal / frames,
            })
            frames = 0
            inferenceTotal = 0
            windowStart = performance.now()
          }
        }
        rafId = requestAnimationFrame(loop)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        console.error('[pose] failed to load PoseLandmarker', err)
        setStats({ status: 'error', fps: 0, inferenceMs: 0, error: err instanceof Error ? err.message : String(err) })
      })

    return () => {
      cancelled = true
      cancelAnimationFrame(rafId)
      video.pause()
      // Detach only. Never call track.stop() — the track belongs to LiveKit.
      video.srcObject = null
    }
  }, [track])

  return stats
}
