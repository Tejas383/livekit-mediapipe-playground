import { useContext } from 'react'
import { ExerciseContext } from '../livekit/exerciseContext'
import { EXERCISE_IDS, EXERCISES } from '../posture/exercises'

/** One button per exercise. Picking one restarts detection with that exercise's rules. */
export function ExercisePicker() {
  const { exercise, setExercise } = useContext(ExerciseContext)

  return (
    <div className="exercise-picker" role="group" aria-label="Exercise">
      {EXERCISE_IDS.map((id) => (
        <button key={id} type="button" aria-pressed={exercise === id} onClick={() => setExercise(id)}>
          {EXERCISES[id].label}
        </button>
      ))}
    </div>
  )
}
