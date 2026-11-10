import { useRoomContext } from '@livekit/components-react'
import { RoomEvent, type RemoteParticipant } from 'livekit-client'
import { useEffect, useRef, useState } from 'react'
import { drawPose } from '../pose/drawPose'
import { decodePose, POSE_TOPIC } from '../pose/poseWire'

/** Clear the skeleton if the sender goes quiet (camera off, left, tab hidden). */
const STALE_AFTER_MS = 1000
const STATS_INTERVAL_MS = 1000

interface RemotePoseOverlayProps {
  /** Whose pose to draw — the participant this tile belongs to. */
  identity: string
}

/**
 * REMOTE participant: no detection here. Listens for the landmarks that
 * participant broadcasts (see PoseOverlay) and draws them on their tile.
 */
export function RemotePoseOverlay({ identity }: RemotePoseOverlayProps) {
  const room = useRoomContext()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [rate, setRate] = useState<number | null>(null)

  useEffect(() => {
    let lastReceived = 0
    let received = 0
    let last: { width: number; height: number } | null = null

    const onData = (payload: Uint8Array, participant?: RemoteParticipant, _kind?: unknown, topic?: string) => {
      if (topic !== POSE_TOPIC || participant?.identity !== identity) return
      const frame = decodePose(payload)
      if (!frame || !canvasRef.current) return

      lastReceived = performance.now()
      received++
      last = { width: frame.width, height: frame.height }
      drawPose(canvasRef.current, frame.landmarks, frame.width, frame.height)
    }

    // Once a second: update the "updates/s" readout and clear stale skeletons.
    const timer = setInterval(() => {
      setRate((received * 1000) / STATS_INTERVAL_MS)
      received = 0
      if (last && canvasRef.current && performance.now() - lastReceived > STALE_AFTER_MS) {
        drawPose(canvasRef.current, null, last.width, last.height)
        last = null
      }
    }, STATS_INTERVAL_MS)

    room.on(RoomEvent.DataReceived, onData)
    return () => {
      room.off(RoomEvent.DataReceived, onData)
      clearInterval(timer)
    }
  }, [room, identity])

  return (
    <>
      <canvas ref={canvasRef} className="pose-overlay pose-overlay-remote" aria-hidden="true" />
      <div className="pose-stats" title="Landmarks received from this participant over a LiveKit data packet">
        {rate === null ? 'Pose: waiting…' : rate > 0 ? `Pose received · ${rate.toFixed(0)}/s` : 'Pose: no data'}
      </div>
    </>
  )
}
