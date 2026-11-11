import { createContext } from 'react'
import { DEFAULT_EXERCISE, type ExerciseId } from '../posture/exercises'

/**
 * The exercise the user picked with the buttons in the room header.
 * Provided by RoomView, read by the local tile's PoseOverlay.
 */
export interface ExerciseContextValue {
  exercise: ExerciseId
  setExercise: (exercise: ExerciseId) => void
}

export const ExerciseContext = createContext<ExerciseContextValue>({
  exercise: DEFAULT_EXERCISE,
  setExercise: () => {},
})
