import {
  ConnectionStateToast,
  ControlBar,
  LiveKitRoom,
  RoomAudioRenderer,
  RoomName,
  useConnectionState,
} from '@livekit/components-react'
import { ConnectionError, ConnectionErrorReason, DisconnectReason, MediaDeviceFailure } from 'livekit-client'
import { useState } from 'react'
import { canUseMediaDevices } from './media'
import { ParticipantGrid } from './ParticipantGrid'
import type { JoinDetails } from './token'

interface RoomViewProps {
  details: JoinDetails
  /** Called when the session ends; `message` explains why if it wasn't a normal leave. */
  onLeave: (message?: string) => void
}

export function RoomView({ details, onLeave }: RoomViewProps) {
  // Without HTTPS/localhost the browser hides camera + mic, so join view-only
  // instead of failing.
  const [mediaAllowed] = useState(canUseMediaDevices)
  const [deviceError, setDeviceError] = useState<string | null>(
    mediaAllowed
      ? null
      : "Camera and microphone are unavailable because this page isn't served over HTTPS (or localhost). You've joined view-only.",
  )

  function handleError(err: Error) {
    if (err instanceof ConnectionError) {
      // Cancelled = we aborted the connect ourselves (e.g. leaving mid-connect). Not a real failure.
      if (err.reason === ConnectionErrorReason.Cancelled) return
      onLeave(`Couldn't connect: ${err.message}`)
      return
    }
    // Anything else (e.g. publishing camera/mic failed) is non-fatal: stay in the room, show it.
    setDeviceError(err.message)
  }

  return (
    <LiveKitRoom
      serverUrl={details.serverUrl}
      token={details.token}
      connect
      audio={mediaAllowed}
      video={mediaAllowed}
      data-lk-theme="default"
      className="room"
      onDisconnected={(reason) => onLeave(describeDisconnect(reason))}
      onError={handleError}
      onMediaDeviceFailure={(failure, kind) => setDeviceError(describeDeviceFailure(failure, kind))}
    >
      <header className="room-header">
        <RoomName className="room-name" />
        <ConnectionBadge />
      </header>

      {deviceError && (
        <div className="banner" role="alert">
          {deviceError}
          <button type="button" onClick={() => setDeviceError(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      <div className="room-stage">
        <ParticipantGrid />
      </div>

      {/* Plays every remote participant's audio. Without it you'd see but not hear them. */}
      <RoomAudioRenderer />
      <ControlBar
        controls={{ microphone: mediaAllowed, camera: mediaAllowed, screenShare: false, chat: false }}
      />
      <ConnectionStateToast />
    </LiveKitRoom>
  )
}

function ConnectionBadge() {
  const state = useConnectionState()
  return <span className={`badge badge-${state}`}>{state}</span>
}

function describeDisconnect(reason?: DisconnectReason): string | undefined {
  switch (reason) {
    case undefined:
    case DisconnectReason.CLIENT_INITIATED:
      return undefined // normal "Leave"
    case DisconnectReason.DUPLICATE_IDENTITY:
      return 'Disconnected: someone else joined with the same identity (another tab using the same token?).'
    case DisconnectReason.PARTICIPANT_REMOVED:
      return 'Disconnected: you were removed from the room.'
    case DisconnectReason.ROOM_DELETED:
      return 'Disconnected: the room was closed.'
    case DisconnectReason.SERVER_SHUTDOWN:
      return 'Disconnected: the server shut down. Try rejoining.'
    default:
      return `Disconnected (${DisconnectReason[reason] ?? reason}).`
  }
}

function describeDeviceFailure(failure?: MediaDeviceFailure, kind?: MediaDeviceKind): string {
  const device = kind === 'audioinput' ? 'microphone' : kind === 'videoinput' ? 'camera' : 'camera/microphone'
  switch (failure) {
    case MediaDeviceFailure.PermissionDenied:
      return `Permission to use the ${device} was denied. Allow it in the browser's site settings, then rejoin.`
    case MediaDeviceFailure.NotFound:
      return `No ${device} was found.`
    case MediaDeviceFailure.DeviceInUse:
      return `The ${device} is in use by another app.`
    default:
      return `Couldn't access the ${device}.`
  }
}
