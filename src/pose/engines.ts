import wasmLoaderPath from '@mediapipe/tasks-vision/vision_wasm_internal.js?url'
import wasmBinaryPath from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url'
import type { PoseFrame } from '../types/pose'
import { createPoseLandmarker, createTimestamper, MODEL_PATH, toPoseFrame, type Delegate } from './createLandmarker'
import type { MainToWorker, WorkerToMain } from './protocol'

/** What every engine reports back. */
export interface EngineCallbacks {
  onReady: (delegate: Delegate) => void
  onResult: (frame: PoseFrame, inferenceMs: number) => void
  onError: (message: string) => void
}

/** Every engine returns a function that stops it and releases everything it created. */
export type StopEngine = () => void

/**
 * A <video> fed directly from the track. Never added to the page — it only
 * exists so frames can be read from it. The tile's visible <video> belongs to
 * LiveKit and we leave it alone.
 */
function createHiddenVideo(track: MediaStreamTrack): HTMLVideoElement {
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.srcObject = new MediaStream([track])
  video.play().catch((err) => console.warn('[pose] video.play() failed', err))
  return video
}

function releaseVideo(video: HTMLVideoElement) {
  video.pause()
  video.srcObject = null // detach only — never stop LiveKit's track
}

/**
 * Calls `onNewFrame` once per NEW camera frame. requestAnimationFrame runs at
 * display rate (60–120 Hz) but the camera is usually 30 fps, so frames are
 * de-duplicated by the video's currentTime.
 */
function onEachVideoFrame(video: HTMLVideoElement, onNewFrame: () => void): () => void {
  let rafId = 0
  let lastTime = -1
  const loop = () => {
    rafId = requestAnimationFrame(loop)
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.currentTime === lastTime) return
    lastTime = video.currentTime
    onNewFrame()
  }
  rafId = requestAnimationFrame(loop)
  return () => cancelAnimationFrame(rafId)
}

function createWorker(delegate: Delegate, cb: EngineCallbacks, onReady: () => void): Worker {
  // Vite sees `new URL(..., import.meta.url)` inside `new Worker(...)` and
  // bundles pose.worker.ts (and its imports) as a separate module script.
  const worker = new Worker(new URL('./pose.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent<WorkerToMain>) => {
    const msg = e.data
    if (msg.type === 'ready') {
      cb.onReady(msg.delegate)
      onReady()
    } else if (msg.type === 'result') cb.onResult(msg.frame, msg.inferenceMs)
    else cb.onError(msg.message)
  }
  worker.onerror = (e) => cb.onError(e.message || 'Worker failed to start')
  worker.postMessage({ type: 'init', delegate, modelPath: MODEL_PATH } satisfies MainToWorker)
  return worker
}

/** ENGINE 1 (default): worker + VideoFrame stream. */
export function startWorkerStreamEngine(track: MediaStreamTrack, delegate: Delegate, cb: EngineCallbacks): StopEngine {
  if (typeof MediaStreamTrackProcessor === 'undefined') {
    cb.onError('MediaStreamTrackProcessor is not supported in this browser (Chrome only).')
    return () => {}
  }

  // A clone, so stopping our copy can never stop LiveKit's track.
  const clone = track.clone()
  const processor = new MediaStreamTrackProcessor({ track: clone, maxBufferSize: 1 })

  const worker = createWorker(delegate, cb, () => {
    // Transfer the stream: ownership moves to the worker (it's no longer
    // usable here). Frames then flow camera → worker without touching the
    // main thread at all.
    const msg: MainToWorker = { type: 'stream', readable: processor.readable }
    worker.postMessage(msg, [processor.readable])
  })

  return () => {
    worker.terminate()
    clone.stop() // ends the stream and releases the camera reference
  }
}

/** ENGINE 2 (comparison): worker, fed one ImageBitmap per frame from the main thread. */
export function startWorkerBitmapEngine(track: MediaStreamTrack, delegate: Delegate, cb: EngineCallbacks): StopEngine {
  const video = createHiddenVideo(track)
  let ready = false
  let inFlight = false // backpressure: at most one frame at the worker

  const worker = createWorker(
    delegate,
    {
      ...cb,
      onResult: (frame, ms) => {
        inFlight = false
        cb.onResult(frame, ms)
      },
    },
    () => (ready = true),
  )

  const stopLoop = onEachVideoFrame(video, () => {
    if (!ready || inFlight) return // drop this frame rather than queue it
    inFlight = true
    // createImageBitmap copies the current video frame (on the main thread).
    createImageBitmap(video)
      .then((bitmap) => {
        const msg: MainToWorker = { type: 'frame', bitmap }
        worker.postMessage(msg, [bitmap]) // transfer, not copy
      })
      .catch(() => (inFlight = false))
  })

  return () => {
    stopLoop()
    worker.terminate()
    releaseVideo(video)
  }
}

/** ENGINE 3 (Phase 2 baseline): everything on the main thread. */
export function startMainThreadEngine(track: MediaStreamTrack, delegate: Delegate, cb: EngineCallbacks): StopEngine {
  const video = createHiddenVideo(track)
  let stopped = false
  let stopLoop = () => {}
  let close = () => {}

  // On the main thread the classic loader works (MediaPipe adds a <script> tag).
  createPoseLandmarker({ wasmLoaderPath, wasmBinaryPath }, delegate, MODEL_PATH)
    .then(({ landmarker, delegate: actual }) => {
      if (stopped) return landmarker.close()
      close = () => landmarker.close()
      cb.onReady(actual)
      const nextTimestamp = createTimestamper()
      stopLoop = onEachVideoFrame(video, () => {
        const start = performance.now()
        // Synchronous: the UI is frozen for the duration of this call.
        const result = landmarker.detectForVideo(video, nextTimestamp())
        cb.onResult(toPoseFrame(result.landmarks, video.videoWidth, video.videoHeight), performance.now() - start)
      })
    })
    .catch((err: unknown) => cb.onError(err instanceof Error ? err.message : String(err)))

  return () => {
    stopped = true
    stopLoop()
    close()
    releaseVideo(video)
  }
}
