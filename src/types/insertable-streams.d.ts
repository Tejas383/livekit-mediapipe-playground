/**
 * Chrome's "Breakout Box" API (MediaStreamTrack Insertable Streams).
 * Turns a video MediaStreamTrack into a ReadableStream of VideoFrames.
 *
 * TypeScript's DOM lib doesn't declare it (the spec only exposes it in
 * workers, but Chrome also exposes it on the main thread — which is where we
 * use it, because Chrome does NOT expose it inside dedicated workers).
 */
interface MediaStreamTrackProcessorInit {
  track: MediaStreamTrack
  /** How many frames may queue up before old ones are dropped. */
  maxBufferSize?: number
}

interface MediaStreamTrackProcessor {
  readonly readable: ReadableStream<VideoFrame>
}

declare const MediaStreamTrackProcessor:
  | {
      prototype: MediaStreamTrackProcessor
      new (init: MediaStreamTrackProcessorInit): MediaStreamTrackProcessor
    }
  | undefined
