import { GridLayout, ParticipantTile, useTracks } from '@livekit/components-react'
import { Track } from 'livekit-client'

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
      <ParticipantTile />
    </GridLayout>
  )
}
