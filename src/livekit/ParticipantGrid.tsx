import { GridLayout, isTrackReference, ParticipantTile, useTrackRefContext, useTracks } from '@livekit/components-react'
import { Track } from 'livekit-client'
import { useContext } from 'react'
import { PoseOverlay } from '../components/PoseOverlay'
import { RemotePoseOverlay } from '../components/RemotePoseOverlay'
import { ExerciseContext } from './exerciseContext'

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
 * It's a normal LiveKit tile plus a pose overlay:
 * - your own tile: pose is detected here, drawn, and broadcast (PoseOverlay)
 * - other people's tiles: their broadcast landmarks are drawn (RemotePoseOverlay)
 */
function PoseTile() {
  const trackRef = useTrackRefContext()
  const { exercise } = useContext(ExerciseContext)
  const hasVideo = isTrackReference(trackRef) && !trackRef.publication.isMuted

  let overlay = null
  if (hasVideo && trackRef.participant.isLocal) {
    const track = trackRef.publication.track?.mediaStreamTrack
    // key={exercise}: switching exercise remounts the overlay → new worker,
    // new analyzer, counters back to zero.
    if (track) overlay = <PoseOverlay key={exercise} track={track} exercise={exercise} />
  } else if (hasVideo) {
    overlay = <RemotePoseOverlay identity={trackRef.participant.identity} />
  }

  return (
    <div className="pose-tile">
      <ParticipantTile />
      {overlay}
    </div>
  )
}
