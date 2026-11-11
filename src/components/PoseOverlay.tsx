import { useRoomContext } from '@livekit/components-react'
import { useCallback, useReducer, useRef } from 'react'
import { drawPose } from '../pose/drawPose'
import { encodePose, nextPoseSeq, POSE_TOPIC } from '../pose/poseWire'
import { usePoseDetection, type PoseStats } from '../pose/usePoseDetection'
import { EXERCISES, type ExerciseId } from '../posture/exercises'
import type { PostureEvent } from '../posture/types'
import type { Hand2D, PoseFrame } from '../types/pose'
import { PostureHud } from './PostureHud'
import { hudReducer, initialHud } from './postureHudState'

/** How often landmarks are sent to other participants. Detection itself runs at camera rate. */
const SEND_INTERVAL_MS = 1000 / 15

interface PoseOverlayProps {
  /** The local participant's camera track. */
  track: MediaStreamTrack
  /** Which exercise's rules to run (picked with the header buttons). */
  exercise: ExerciseId
}

/**
 * LOCAL participant: detects the pose on your own camera, draws it on your
 * tile, and broadcasts the landmarks so everyone else can draw it on theirs
 * (see RemotePoseOverlay).
 */
export function PoseOverlay({ track, exercise }: PoseOverlayProps) {
  const room = useRoomContext()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const lastSentRef = useRef(0)

  // Reps / hold counters. Updated only when the analyzer emits events (~1/s),
  // not on every frame, so the HUD re-renders rarely.
  const [hud, dispatchHud] = useReducer(hudReducer, initialHud)
  // Stable function (dispatch never changes), so the HUD's notice timer isn't reset on every render.
  const clearNotice = useCallback(() => dispatchHud({ type: 'clearNotice' }), [])

  const stats = usePoseDetection(track, exercise, (frame: PoseFrame, hands: Hand2D[] | null, events: PostureEvent[]) => {
    if (events.length > 0) {
      for (const event of events) console.info('[posture]', event.type, event.data)
      dispatchHud({ type: 'events', events, now: performance.now() })
    }

    if (canvasRef.current) drawPose(canvasRef.current, frame.landmarks, frame.width, frame.height, hands)

    const now = performance.now()
    if (now - lastSentRef.current >= SEND_INTERVAL_MS) {
      lastSentRef.current = now
      // Lossy = sent once, no retransmission. A lost pose is fine: a newer one
      // is ~66 ms behind it, and stale data arriving late would be worse.
      room.localParticipant
        .publishData(encodePose(frame, { seq: nextPoseSeq(), sentAt: Date.now() }), {
          reliable: false,
          topic: POSE_TOPIC,
        })
        .catch((err) => console.warn('[pose] publishData failed', err))
    }
  })

  return (
    <>
      <canvas ref={canvasRef} className="pose-overlay pose-overlay-local" aria-hidden="true" />
      <PoseStatsBadge stats={stats} />
      {stats.analyzer !== 'off' && stats.status === 'running' && (
        <PostureHud state={hud} labels={EXERCISES[exercise].hud} onNoticeExpired={clearNotice} />
      )}
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
      `${stats.inferenceMs.toFixed(1)} ms · UI ${stats.uiMaxFrameMs.toFixed(0)} ms` +
      (stats.analyzer === 'off'
        ? ' · analysis off'
        : ` · ${stats.analyzer === 'sample' ? 'sample ' : ''}analysis ${stats.analysisMs.toFixed(2)} ms, ` +
          `${stats.eventsPerSec.toFixed(1)} ev/s`)

  return (
    <div
      className={`pose-stats pose-stats-${stats.status}`}
      title="engine/delegate · results per second · ms per detection · longest main-thread frame (UI smoothness) · posture analysis ms per frame and events per second. Change with ?pose=worker|worker-bitmap|main&delegate=GPU|CPU&analyzer=default|sample|off"
    >
      {text}
    </div>
  )
}
