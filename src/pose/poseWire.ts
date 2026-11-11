import type { PoseFrame, PoseLandmark2D } from '../types/pose'

/**
 * Binary format for sending a pose over a LiveKit data packet.
 *
 * Binary instead of JSON: 33 landmarks as JSON is ~2.5 KB, which is above
 * LiveKit's recommended 1300-byte limit for lossy packets (bigger packets get
 * fragmented). This layout is 18 + 33 × 12 = 414 bytes.
 *
 *   byte 0       version (2)
 *   byte 1       landmark count (0 = no person detected)
 *   bytes 2–3    video width   (uint16)
 *   bytes 4–5    video height  (uint16)
 *   bytes 6–9    sequence number (uint32) — increases by 1 per packet sent
 *   bytes 10–17  sender timestamp (float64, ms since epoch, sender's clock)
 *   then per landmark: x, y, visibility as float32 (12 bytes)
 *
 * All multi-byte numbers are little-endian.
 *
 * Why sequence + timestamp: lossy packets have no ordering guarantee, so an
 * older pose can arrive after a newer one. The receiver uses `seq` to drop
 * those. `sentAt` is the sender's wall-clock time — fine for logging/latency
 * estimates, but different devices' clocks aren't perfectly in sync, so it's
 * not used for ordering.
 */
export const POSE_TOPIC = 'pose'

const VERSION = 2
const HEADER_BYTES = 18
const BYTES_PER_LANDMARK = 12

/** Packet metadata that travels alongside the pose. */
export interface PosePacketMeta {
  seq: number
  sentAt: number
}

export interface DecodedPosePacket extends PosePacketMeta {
  frame: PoseFrame
}

// Module-level, so it keeps counting across camera off/on (component
// remounts). Starting again from 0 would look "older" to receivers.
let nextSeq = 0

/** Next sequence number for an outgoing packet (wraps at 2^32). */
export function nextPoseSeq(): number {
  const seq = nextSeq
  nextSeq = (nextSeq + 1) >>> 0
  return seq
}

export function encodePose(frame: PoseFrame, meta: PosePacketMeta): Uint8Array<ArrayBuffer> {
  const count = frame.landmarks?.length ?? 0
  const buffer = new ArrayBuffer(HEADER_BYTES + count * BYTES_PER_LANDMARK)
  const view = new DataView(buffer)

  view.setUint8(0, VERSION)
  view.setUint8(1, count)
  view.setUint16(2, frame.width, true)
  view.setUint16(4, frame.height, true)
  view.setUint32(6, meta.seq, true)
  view.setFloat64(10, meta.sentAt, true)

  frame.landmarks?.forEach((lm, i) => {
    const offset = HEADER_BYTES + i * BYTES_PER_LANDMARK
    view.setFloat32(offset, lm.x, true)
    view.setFloat32(offset + 4, lm.y, true)
    view.setFloat32(offset + 8, lm.visibility, true)
  })

  return new Uint8Array(buffer)
}

/** Returns null for packets that aren't a pose this version understands. */
export function decodePose(bytes: Uint8Array): DecodedPosePacket | null {
  if (bytes.byteLength < HEADER_BYTES) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint8(0) !== VERSION) return null

  const count = view.getUint8(1)
  if (bytes.byteLength < HEADER_BYTES + count * BYTES_PER_LANDMARK) return null

  const landmarks: PoseLandmark2D[] = []
  for (let i = 0; i < count; i++) {
    const offset = HEADER_BYTES + i * BYTES_PER_LANDMARK
    landmarks.push({
      x: view.getFloat32(offset, true),
      y: view.getFloat32(offset + 4, true),
      visibility: view.getFloat32(offset + 8, true),
    })
  }

  return {
    seq: view.getUint32(6, true),
    sentAt: view.getFloat64(10, true),
    frame: {
      width: view.getUint16(2, true),
      height: view.getUint16(4, true),
      landmarks: count > 0 ? landmarks : null,
    },
  }
}

/**
 * True if `seq` is newer than `lastSeq`, allowing for uint32 wrap-around.
 * (Serial-number arithmetic: the difference, read as a signed 32-bit number,
 * is positive when `seq` comes after `lastSeq`.)
 */
export function isNewerSeq(seq: number, lastSeq: number): boolean {
  return ((seq - lastSeq) | 0) > 0
}
