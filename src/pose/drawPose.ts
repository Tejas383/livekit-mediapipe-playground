import { DrawingUtils, PoseLandmarker } from '@mediapipe/tasks-vision'
import type { PoseLandmark2D } from '../types/pose'

// One DrawingUtils per canvas, created on first draw. A WeakMap entry is
// dropped automatically when its canvas is garbage-collected.
const drawers = new WeakMap<HTMLCanvasElement, { ctx: CanvasRenderingContext2D; utils: DrawingUtils }>()

/**
 * Draws a skeleton on a canvas that is stacked over a LiveKit video tile.
 *
 * The canvas is given the video's resolution and styled like LiveKit's
 * <video> (see .pose-overlay in index.css). Landmarks are normalized 0..1, so
 * they land on the right pixels, and the browser crops/scales the canvas the
 * same way it crops/scales the video.
 *
 * Pass `landmarks = null` to clear the canvas.
 */
export function drawPose(
  canvas: HTMLCanvasElement,
  landmarks: PoseLandmark2D[] | null,
  width: number,
  height: number,
) {
  if (!width || !height) return

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }
  // Same rule LiveKit uses: portrait video is letterboxed (contain), landscape is cropped (cover).
  canvas.style.objectFit = height > width ? 'contain' : 'cover'

  let drawer = drawers.get(canvas)
  if (!drawer) {
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    drawer = { ctx, utils: new DrawingUtils(ctx) }
    drawers.set(canvas, drawer)
  }
  const { ctx, utils } = drawer

  ctx.clearRect(0, 0, width, height)
  if (!landmarks) return

  // MediaPipe's drawing helpers expect a z value; 2D landmarks don't have one.
  const points = landmarks.map((lm) => ({ ...lm, z: 0 }))
  const lineWidth = Math.max(2, width / 320) // looks the same at 480p and 1080p

  utils.drawConnectors(points, PoseLandmarker.POSE_CONNECTIONS, { color: '#22d3ee', lineWidth })
  utils.drawLandmarks(points, { color: '#f472b6', fillColor: '#f472b6', radius: lineWidth * 1.2, lineWidth: 1 })
}
