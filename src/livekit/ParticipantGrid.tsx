import { GridLayout, isTrackReference, ParticipantTile, useTrackRefContext, useTracks } from '@livekit/components-react'
import { Track } from 'livekit-client'
import { PoseOverlay } from '../components/PoseOverlay'

/**
 * One tile per participant's camera. `withPlaceholder` keeps a tile for
 * participants whose camera is off, so everyone stays visible.
 */
export function ParticipantGrid() {
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }], {
    onlySubscribed: false,
  })

  return (
    <GridLayout tracks={tracks} className="participant-grid">
      <PoseTile />
    </GridLayout>
  )
}

/**
 * GridLayout renders this once per track, providing that track via context.
 * It's a normal LiveKit tile, plus a pose overlay on the LOCAL camera only
 * (Phase 2 processes just your own video; remote participants come in Phase 4).
 */
function PoseTile() {
  const trackRef = useTrackRefContext()

  const localCameraTrack =
    isTrackReference(trackRef) && trackRef.participant.isLocal && !trackRef.publication.isMuted
      ? trackRef.publication.track?.mediaStreamTrack
      : undefined

  return (
    <div className="pose-tile">
      <ParticipantTile />
      {localCameraTrack && <PoseOverlay track={localCameraTrack} />}
    </div>
  )
}
