/**
 * Pose detection Web Worker. Runs MediaPipe off the main thread, so the UI
 * never freezes during inference.
 *
 * Loading notes (found in the Phase 3 spike):
 * - In a module worker MediaPipe can't use importScripts, so it falls back to
 *   `import()`. That only works with the ES-module build of the wasm loader
 *   (`vision_wasm_module_internal.js`).
 * - Those files are imported with `?url` from node_modules. Serving them from
 *   /public fails in dev: Vite refuses to `import()` files from /public.
 */
import type { PoseLandmarker } from '@mediapipe/tasks-vision'
import wasmLoaderPath from '@mediapipe/tasks-vision/vision_wasm_module_internal.js?url'
import wasmBinaryPath from '@mediapipe/tasks-vision/vision_wasm_module_internal.wasm?url'
import { createPoseLandmarker, createTimestamper, toPoseFrame } from './createLandmarker'
import type { MainToWorker, WorkerToMain } from './protocol'

// Our tsconfig uses the DOM lib, where `self` is a Window. Describe the worker
// side we actually use instead of pulling in the conflicting WebWorker lib.
const worker = self as unknown as {
  postMessage(msg: WorkerToMain): void
  onmessage: ((e: MessageEvent<MainToWorker>) => void) | null
  ModuleFactory?: unknown
}

let landmarker: PoseLandmarker | null = null
const nextTimestamp = createTimestamper()

function detect(source: VideoFrame | ImageBitmap, width: number, height: number) {
  if (!landmarker) return
  const start = performance.now()
  const result = landmarker.detectForVideo(source, nextTimestamp())
  const inferenceMs = performance.now() - start
  worker.postMessage({ type: 'result', frame: toPoseFrame(result.landmarks, width, height), inferenceMs })
}

/** Primary path: pull frames from the transferred stream, one at a time. */
async function consume(readable: ReadableStream<VideoFrame>) {
  const reader = readable.getReader()
  for (;;) {
    // Waiting here IS the backpressure: while we're busy detecting, the
    // processor (maxBufferSize: 1) drops older frames instead of queueing them.
    const { value: frame, done } = await reader.read()
    if (done) return
    try {
      detect(frame, frame.displayWidth, frame.displayHeight)
    } finally {
      // VideoFrames hold camera/GPU memory. If they aren't closed, the camera
      // stalls after a few frames.
      frame.close()
    }
  }
}

worker.onmessage = async (e) => {
  const msg = e.data
  try {
    switch (msg.type) {
      case 'init': {
        // Keep our own reference to the factory so createPoseLandmarker can
        // restore it before a fallback attempt.
        const factory = (await import(/* @vite-ignore */ wasmLoaderPath)).default
        const loaded = await createPoseLandmarker(
          { wasmLoaderPath, wasmBinaryPath },
          msg.delegate,
          msg.modelPath,
          () => (worker.ModuleFactory = factory),
        )
        landmarker = loaded.landmarker
        worker.postMessage({ type: 'ready', delegate: loaded.delegate })
        break
      }
      case 'stream':
        await consume(msg.readable)
        break
      case 'frame':
        try {
          detect(msg.bitmap, msg.bitmap.width, msg.bitmap.height)
        } finally {
          msg.bitmap.close()
        }
        break
    }
  } catch (err) {
    worker.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
