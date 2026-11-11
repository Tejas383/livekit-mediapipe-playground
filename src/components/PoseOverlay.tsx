import { useRoomContext } from '@livekit/components-react'
import { useRef } from 'react'
import { drawPose } from '../pose/drawPose'
import { encodePose, POSE_TOPIC } from '../pose/poseWire'
import { usePoseDetection, type PoseStats } from '../pose/usePoseDetection'
import type { PoseFrame } from '../types/pose'

/** How often landmarks are sent to other participants. Detection itself runs at camera rate. */
const SEND_INTERVAL_MS = 1000 / 15

interface PoseOverlayProps {
  /** The local participant's camera track. */
  track: MediaStreamTrack
}

/**
 * LOCAL participant: detects the pose on your own camera, draws it on your
 * tile, and broadcasts the landmarks so everyone else can draw it on theirs
 * (see RemotePoseOverlay).
 */
export function PoseOverlay({ track }: PoseOverlayProps) {
  const room = useRoomContext()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const lastSentRef = useRef(0)

  const stats = usePoseDetection(track, (frame: PoseFrame) => {
    if (canvasRef.current) drawPose(canvasRef.current, frame.landmarks, frame.width, frame.height)

    const now = performance.now()
    if (now - lastSentRef.current >= SEND_INTERVAL_MS) {
      lastSentRef.current = now
      // Lossy = sent once, no retransmission. A lost pose is fine: a newer one
      // is ~66 ms behind it, and stale data arriving late would be worse.
      room.localParticipant
        .publishData(encodePose(frame), { reliable: false, topic: POSE_TOPIC })
        .catch((err) => console.warn('[pose] publishData failed', err))
    }
  })

  return (
    <>
      <canvas ref={canvasRef} className="pose-overlay pose-overlay-local" aria-hidden="true" />
      <PoseStatsBadge stats={stats} />
    </>
  )
}

function PoseStatsBadge({ stats }: { stats: PoseStats }) {
  let text: string
  if (stats.status === 'loading') text = 'Pose: loading model…'
  else if (stats.status === 'error') text = `Pose error: ${stats.error}`
  else
    text =
      `Pose ${stats.engine}/${stats.delegate} · ${stats.fps.toFixed(0)} fps · ` +
      `${stats.inferenceMs.toFixed(1)} ms · UI ${stats.uiMaxFrameMs.toFixed(0)} ms`

  return (
    <div
      className={`pose-stats pose-stats-${stats.status}`}
      title="engine/delegate · results per second · ms per detection · longest main-thread frame (UI smoothness). Change with ?pose=worker|worker-bitmap|main&delegate=GPU|CPU"
    >
      {text}
    </div>
  )
}
