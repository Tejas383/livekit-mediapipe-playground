import type { PoseFrame, PoseLandmark2D } from '../types/pose'

/**
 * Binary format for sending a pose over a LiveKit data packet.
 *
 * Binary instead of JSON: 33 landmarks as JSON is ~2.5 KB, which is above
 * LiveKit's recommended 1300-byte limit for lossy packets (bigger packets get
 * fragmented). This layout is 7 + 33 × 12 = 403 bytes.
 *
 *   byte 0      version (1)
 *   byte 1      landmark count (0 = no person detected)
 *   bytes 2–3   video width   (uint16)
 *   bytes 4–5   video height  (uint16)
 *   byte 6      reserved
 *   then per landmark: x, y, visibility as float32 (12 bytes)
 *
 * All multi-byte numbers are little-endian.
 */
export const POSE_TOPIC = 'pose'

const VERSION = 1
const HEADER_BYTES = 7
const BYTES_PER_LANDMARK = 12

export function encodePose(frame: PoseFrame): Uint8Array<ArrayBuffer> {
  const count = frame.landmarks?.length ?? 0
  const buffer = new ArrayBuffer(HEADER_BYTES + count * BYTES_PER_LANDMARK)
  const view = new DataView(buffer)

  view.setUint8(0, VERSION)
  view.setUint8(1, count)
  view.setUint16(2, frame.width, true)
  view.setUint16(4, frame.height, true)

  frame.landmarks?.forEach((lm, i) => {
    const offset = HEADER_BYTES + i * BYTES_PER_LANDMARK
    view.setFloat32(offset, lm.x, true)
    view.setFloat32(offset + 4, lm.y, true)
    view.setFloat32(offset + 8, lm.visibility, true)
  })

  return new Uint8Array(buffer)
}

/** Returns null for packets that aren't a pose this version understands. */
export function decodePose(bytes: Uint8Array): PoseFrame | null {
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
    width: view.getUint16(2, true),
    height: view.getUint16(4, true),
    landmarks: count > 0 ? landmarks : null,
  }
}
