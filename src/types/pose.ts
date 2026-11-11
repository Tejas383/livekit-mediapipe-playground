/** One body landmark in normalized image coordinates (0..1 of the frame width/height). */
export interface PoseLandmark2D {
  x: number
  y: number
  /** Model's confidence (0..1) that this point is visible in the frame. */
  visibility: number
}

/** One detected hand: 21 landmarks in normalized image coordinates (MediaPipe hand order). */
export interface Hand2D {
  /** The PERSON's hand ('Left' = their left), valid because frames aren't mirrored. */
  handedness: 'Left' | 'Right'
  /** Confidence of the handedness label (0..1). */
  score: number
  /** 21 points, x/y normalized 0..1. Hand landmarks have no visibility value. */
  landmarks: { x: number; y: number }[]
}

/** A pose as shared between participants. 33 landmarks in MediaPipe's index order. */
export interface PoseFrame {
  /** Sender's video resolution — needed to keep the aspect ratio when drawing. */
  width: number
  height: number
  /** null = sender's camera is running but no person was detected. */
  landmarks: PoseLandmark2D[] | null
}
