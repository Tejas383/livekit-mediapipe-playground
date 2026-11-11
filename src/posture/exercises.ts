/**
 * The exercises the user can pick. Each entry says which models it needs,
 * which analyzer runs its rules, and what the on-screen panel calls things.
 *
 * Worker-safe (plain data + analyzer factories): imported by the pose worker.
 */
import { createFistAnalyzer } from './fistAnalyzer'
import { createSquatAnalyzer } from './squatAnalyzer'
import type { PostureAnalyzer } from './types'

export type ExerciseId = 'squat' | 'fist'

export interface Exercise {
  id: ExerciseId
  /** Button text. */
  label: string
  /** Load the hand model (extra ~8 MB download, extra inference per frame). */
  needsHands: boolean
  createAnalyzer: () => PostureAnalyzer
  /** Panel wording. */
  hud: {
    countLabel: string
    holdLabel: string
    /** Shown on framing.lost. */
    framingHint: string
  }
}

export const EXERCISES: Record<ExerciseId, Exercise> = {
  squat: {
    id: 'squat',
    label: 'Squats',
    needsHands: false,
    createAnalyzer: createSquatAnalyzer,
    hud: {
      countLabel: 'Squats',
      holdLabel: 'Hold',
      framingHint: 'Step back: shoulders, hips and knees must be visible',
    },
  },
  fist: {
    id: 'fist',
    label: 'Fist clench',
    needsHands: true,
    createAnalyzer: createFistAnalyzer,
    hud: {
      countLabel: 'Fists',
      holdLabel: 'Squeeze',
      framingHint: 'Show your hand to the camera',
    },
  },
}

export const EXERCISE_IDS = Object.keys(EXERCISES) as ExerciseId[]

export const DEFAULT_EXERCISE: ExerciseId = 'squat'
