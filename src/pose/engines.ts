import wasmLoaderPath from '@mediapipe/tasks-vision/vision_wasm_internal.js?url'
import wasmBinaryPath from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url'
import { createPostureAnalyzer, needsHandModel, type AnalyzerChoice } from '../posture/analyzer'
import type { ExerciseId } from '../posture/exercises'
import {
  createHandLandmarker,
  createPoseLandmarker,
  HAND_MODEL_PATH,
  MODEL_PATH,
  type Delegate,
} from './createLandmarker'
import { createFrameProcessor, type FrameOutput } from './processFrame'
import type { MainToWorker, WorkerToMain } from './protocol'

/** What every engine reports back. */
export interface EngineCallbacks {
  onReady: (delegate: Delegate) => void
  onResult: (output: FrameOutput) => void
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

/** What every engine needs besides the track. */
export interface EngineOptions {
  delegate: Delegate
  analyzer: AnalyzerChoice
  exercise: ExerciseId
}

function createWorker(opts: EngineOptions, cb: EngineCallbacks, onReady: () => void): Worker {
  // Vite sees `new URL(..., import.meta.url)` inside `new Worker(...)` and
  // bundles pose.worker.ts (and its imports) as a separate module script.
  const worker = new Worker(new URL('./pose.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent<WorkerToMain>) => {
    const msg = e.data
    if (msg.type === 'ready') {
      cb.onReady(msg.delegate)
      onReady()
    } else if (msg.type === 'result') {
      cb.onResult({
        frame: msg.frame,
        hands: msg.hands,
        events: msg.events,
        inferenceMs: msg.inferenceMs,
        analysisMs: msg.analysisMs,
      })
    }
    else cb.onError(msg.message)
  }
  worker.onerror = (e) => cb.onError(e.message || 'Worker failed to start')
  worker.postMessage({
    type: 'init',
    delegate: opts.delegate,
    modelPath: MODEL_PATH,
    handModelPath: HAND_MODEL_PATH,
    analyzer: opts.analyzer,
    exercise: opts.exercise,
  } satisfies MainToWorker)
  return worker
}

/** ENGINE 1 (default): worker + VideoFrame stream. */
export function startWorkerStreamEngine(track: MediaStreamTrack, opts: EngineOptions, cb: EngineCallbacks): StopEngine {
  if (typeof MediaStreamTrackProcessor === 'undefined') {
    cb.onError('MediaStreamTrackProcessor is not supported in this browser (Chrome only).')
    return () => {}
  }

  // A clone, so stopping our copy can never stop LiveKit's track.
  const clone = track.clone()
  const processor = new MediaStreamTrackProcessor({ track: clone, maxBufferSize: 1 })

  const worker = createWorker(opts, cb, () => {
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
export function startWorkerBitmapEngine(track: MediaStreamTrack, opts: EngineOptions, cb: EngineCallbacks): StopEngine {
  const video = createHiddenVideo(track)
  let ready = false
  let inFlight = false // backpressure: at most one frame at the worker

  const worker = createWorker(
    opts,
    {
      ...cb,
      onResult: (output) => {
        inFlight = false
        cb.onResult(output)
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
export function startMainThreadEngine(track: MediaStreamTrack, opts: EngineOptions, cb: EngineCallbacks): StopEngine {
  const video = createHiddenVideo(track)
  let stopped = false
  let stopLoop = () => {}
  let close = () => {}

  // On the main thread the classic loader works (MediaPipe adds a <script> tag).
  const fileset = { wasmLoaderPath, wasmBinaryPath }
  const load = async () => {
    const pose = await createPoseLandmarker(fileset, opts.delegate, MODEL_PATH)
    const hands = needsHandModel(opts.analyzer, opts.exercise)
      ? await createHandLandmarker(fileset, opts.delegate, HAND_MODEL_PATH)
      : null
    return { ...pose, hands }
  }

  load()
    .then(({ landmarker, hands, delegate: actual }) => {
      if (stopped) {
        landmarker.close()
        hands?.close()
        return
      }
      close = () => {
        landmarker.close()
        hands?.close()
      }
      cb.onReady(actual)
      // Baseline engine: detection AND the exercise rules all run on the main thread.
      const processFrame = createFrameProcessor(landmarker, hands, createPostureAnalyzer(opts.analyzer, opts.exercise))
      stopLoop = onEachVideoFrame(video, () => {
        // Synchronous: the UI is frozen for the duration of this call.
        cb.onResult(processFrame(video, video.videoWidth, video.videoHeight))
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
