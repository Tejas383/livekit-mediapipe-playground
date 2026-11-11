/**
 * THE PLUG-IN POINT for your team's posture logic (rules engine).
 *
 * Exercises (and their rules) are registered in ./exercises.ts — add a new
 * exercise there, not here.
 *
 * This module is imported by the pose Web Worker (and by the main-thread
 * baseline engine), so everything it imports must be worker-safe: no DOM,
 * `window`, React or LiveKit. See docs/posture-integration.md.
 */
import { EXERCISES, type ExerciseId } from './exercises'
import { createSampleAnalyzer } from './sampleAnalyzer'
import type { PostureAnalyzer } from './types'

/**
 * Which analyzer to run, picked from the URL (?analyzer=...):
 * - default: the rules for the exercise picked with the buttons (squats, fist clench, …)
 * - sample:  fake events for testing the pipeline/UI
 * - off:     no analysis at all
 */
export type AnalyzerChoice = 'default' | 'sample' | 'off'

/**
 * Creates one analyzer instance. A new one is created per camera session and
 * whenever the user switches exercise.
 */
export function createPostureAnalyzer(choice: AnalyzerChoice, exercise: ExerciseId): PostureAnalyzer | null {
  switch (choice) {
    case 'off':
      return null
    case 'sample':
      return createSampleAnalyzer()
    default:
      return EXERCISES[exercise].createAnalyzer()
  }
}

/** Whether the hand model must be loaded for this analyzer + exercise. */
export function needsHandModel(choice: AnalyzerChoice, exercise: ExerciseId): boolean {
  return choice === 'default' && EXERCISES[exercise].needsHands
}
