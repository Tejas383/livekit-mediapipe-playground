import { DrawingUtils, PoseLandmarker, type PoseLandmarkerResult } from '@mediapipe/tasks-vision'
import { useRef } from 'react'
import { usePoseDetection, type PoseStats } from '../pose/usePoseDetection'

interface PoseOverlayProps {
  /** The camera track to analyse (the local participant's, in Phase 2). */
  track: MediaStreamTrack
}

/**
 * Draws the detected skeleton on a <canvas> stacked on top of a LiveKit video tile.
 *
 * Alignment trick: the canvas is sized to the video's real resolution and
 * styled exactly like LiveKit's <video> (same object-fit and the same mirror
 * flip for the local camera). Landmarks are normalized 0..1, so multiplying by
 * the canvas size puts each point on the right pixel — the browser then scales
 * and crops the canvas the same way it scales and crops the video.
 */
export function PoseOverlay({ track }: PoseOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef<{ ctx: CanvasRenderingContext2D; utils: DrawingUtils } | null>(null)

  const stats = usePoseDetection(track, (result, video) => {
    const canvas = canvasRef.current
    if (canvas) draw(canvas, drawingRef, result, video)
  })

  return (
    <>
      <canvas ref={canvasRef} className="pose-overlay" aria-hidden="true" />
      <PoseStatsBadge stats={stats} />
    </>
  )
}

function draw(
  canvas: HTMLCanvasElement,
  drawingRef: { current: { ctx: CanvasRenderingContext2D; utils: DrawingUtils } | null },
  result: PoseLandmarkerResult,
  video: HTMLVideoElement,
) {
  const { videoWidth: w, videoHeight: h } = video
  if (!w || !h) return

  // Match the canvas's pixel grid to the video's resolution (changes rarely,
  // e.g. when the camera or simulcast layer changes).
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
  }
  // Mirror LiveKit's CSS: portrait video is letterboxed (contain), landscape is cropped (cover).
  canvas.style.objectFit = h > w ? 'contain' : 'cover'

  if (!drawingRef.current) {
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    drawingRef.current = { ctx, utils: new DrawingUtils(ctx) }
  }
  const { ctx, utils } = drawingRef.current

  ctx.clearRect(0, 0, w, h)
  const lineWidth = Math.max(2, w / 320) // scale with resolution so it looks the same at 480p and 1080p

  for (const landmarks of result.landmarks) {
    utils.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS, { color: '#22d3ee', lineWidth })
    utils.drawLandmarks(landmarks, { color: '#f472b6', fillColor: '#f472b6', radius: lineWidth * 1.2, lineWidth: 1 })
  }
}

function PoseStatsBadge({ stats }: { stats: PoseStats }) {
  let text: string
  if (stats.status === 'loading') text = 'Pose: loading model…'
  else if (stats.status === 'error') text = `Pose error: ${stats.error}`
  else text = `Pose ${stats.delegate} · ${stats.fps.toFixed(0)} fps · ${stats.inferenceMs.toFixed(1)} ms`

  return (
    <div className={`pose-stats pose-stats-${stats.status}`} title="Main-thread pose detection (Phase 2 baseline)">
      {text}
    </div>
  )
}
