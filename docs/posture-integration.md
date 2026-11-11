# Posture logic integration

How to plug your team's posture logic (rules engine) into the playground.

The contract follows the **WP-04 frontend handover** (sections 3, 5 and 7, ticket FE-06): the engine receives 2D landmarks for each frame and returns **events** named after the `bb.metrics` messages. It runs **inside the pose Web Worker**.

## Where it runs

```
camera ──► pose worker:  detectForVideo()  ──►  analyzer.analyze(input)  ──► postMessage({ frame, events, … })
                                                       ▲ your code                        │
                                                                                         ▼
                                                              main thread: draws skeleton, logs events
                                                              (Phase 6: HUD shows them)
```

- `analyze()` is called **once per pose result**, at roughly the camera frame rate (often ~30/s).
- With `?pose=main` (the baseline engine), the same code runs on the main thread instead. Nothing changes for you.
- A **new analyzer instance is created for each camera session**: when the camera is turned off and on, the worker is recreated, so you start with fresh state.

## Current engine: squat rules

`src/posture/squatAnalyzer.ts` is the active engine (the `default` analyzer). It counts squat reps and measures how long the user holds the squat position.

**Depth signal:** `depth = (knee.y − hip.y) / torso length` in pixels, which is "how far the hip is above the knee, in torso lengths". It's about 0.8–1.0 standing and about 0–0.2 at parallel. Both body sides are blended, weighted by visibility. It only needs **shoulders, hips and knees**, so the feet can be out of frame, and it works with a **front or side** camera. The knee angle used in the WP-04 example only works from the side.

| Event | When |
|---|---|
| `rep.completed` `{ set: 1, rep, tempoMs, errors: [] }` | standing → squat position → standing, taking at least `minRepMs` |
| `hold.completed` `{ set: 1, holdMs, targetMs }` | leaving the squat position after being in it for at least `minHoldMs` |
| `activity.progress` `{ reps, holdMs }` | every second, **and immediately when a hold starts or ends** (so the on-screen timer starts and stops right away). `holdMs` is the **current** hold (0 when not in the squat position). |
| `posture.error` `{ code: 'shallow_depth', severity: 'low', rep }` | went down past `partial` but stood back up without reaching the squat position (no rep counted) |
| `framing.lost` / `framing.restored` | shoulders, hips or knees not usable for 0.5 s / usable again for 0.3 s. A rep in progress is discarded. |

- **Hold time** is all the time the hips are below the squat-position line (`bottomEnter`), including the end of the descent and the start of the ascent. A 2 s pause therefore reports about 2.5 s.
- Counting starts only after the user has **stood up once**, so appearing mid-squat doesn't count.
- `set` is always 1 (there are no sets yet).

All thresholds are in `SQUAT_RULES` at the top of the file (`topEnter`, `bottomEnter`, `minHoldMs` and so on). They're **starting values**: tune them with real people and camera setups.

## Current engine: fist clench

`src/posture/fistAnalyzer.ts` counts how many times the user makes a fist and how long each fist is held. It uses MediaPipe's **Hand Landmarker** (21 points per hand) instead of the pose model, because the pose model has no finger joints. The hand model (`hand_landmarker.task`, about 8 MB) is loaded **only for exercises that set `needsHands`**.

**Openness signal** (per hand, in pixels): `mean(|tip − wrist| / |knuckle − wrist|)` over index, middle, ring and pinky. It's about 1.9 for an open hand and about 0.9 for a fist. It's a ratio, so the distance from the camera doesn't matter. It works best with the palm or the back of the hand facing the camera.

| Event | When |
|---|---|
| `rep.completed` `{ set: 1, rep, errors: [] }` | an open hand closes into a fist (`rep` = total fists, both hands) |
| `hold.completed` `{ set: 1, holdMs, targetMs }` | a fist held at least `minHoldMs` (1 s) is released |
| `activity.progress` `{ reps, holdMs }` | every second and on squeeze start/end. `holdMs` = the longest current squeeze. |
| `framing.lost` / `framing.restored` | no hand for 0.5 s / hands back for 0.3 s |

- Each hand (Left/Right) is tracked separately. A hand must **open** before its next fist counts. Re-clenching after a partial release, or a hand that appears already clenched, doesn't count.
- Thresholds are in `FIST_RULES` (`openEnter`, `fistExit`, `fistEnter`, …).

## Exercises and the buttons

The room header has one button per exercise in `src/posture/exercises.ts`. Each entry defines:

```ts
{ id, label, needsHands, createAnalyzer, hud: { countLabel, holdLabel, framingHint } }
```

Pressing a button **restarts detection** with that exercise: a new worker, the models it needs, a fresh analyzer, and counters back to 0. **To add an exercise**, write an analyzer and add an entry to `EXERCISES`. The button and the panel wording come from the entry.

`PostureInput.hands` is `Hand2D[]` (21 × `{x, y}` plus `handedness` and `score`) when the exercise has `needsHands`, otherwise `null`. Handedness refers to the person's own hand, because frames aren't mirrored. Hand point indices are in `HAND` in `src/posture/landmarks.ts`.

## Plugging in your engine

1. Implement `PostureAnalyzer` (from `src/posture/types.ts`) anywhere in `src/posture/`, for example `src/posture/myEngine.ts`:

   ```ts
   import type { PostureAnalyzer, PostureEvent } from './types'

   export function createMyEngine(): PostureAnalyzer {
     // state lives in this closure (or a class): counters, smoothing buffers, current phase…
     return {
       analyze(input) {
         const events: PostureEvent[] = []
         // …your logic…
         return events
       },
     }
   }
   ```

2. Change **one line** in `src/posture/analyzer.ts`:

   ```ts
   default:
     return createMyEngine() // was: createPlaceholderAnalyzer()
   ```

## Rules for code in `src/posture/`

Your code is bundled into a **Web Worker**, so:

| Do | Don't |
|---|---|
| Pure TypeScript: math, arrays, your own classes | Use `document`, `window`, DOM elements, `localStorage` |
| Keep state in your analyzer instance | Import React, LiveKit, or anything from `src/components` / `src/livekit` |
| Return plain objects (they're copied to the main thread) | Return functions, class instances with methods, or DOM objects |
| Stay fast: `analyze()` is synchronous and runs ~30×/s | `await`/`fetch` inside `analyze()` |

Errors thrown by `analyze()` are caught and logged (`[posture] analyze() threw`), so pose detection keeps running.

## Input: `PostureInput`

```ts
{
  width: number          // video width in px
  height: number         // video height in px
  landmarks: { x, y, visibility }[] | null   // 33 points, or null = no person detected
  timestamp: number      // ms, strictly increasing
}
```

- **`x`, `y`** are **normalized** (0..1) fractions of the frame's width and height. `y` grows **downwards**.
- **`visibility`** (0..1) is MediaPipe's confidence that the point is visible. Treat low values as unreliable.
- **`timestamp`** is `performance.now()`-based (the same clock as MediaPipe's VIDEO mode). Use it for durations such as tempo and holds. It is **not** wall-clock time, and it isn't comparable across devices.
- **No `z`, no world landmarks**: 2D only, by design.

### Coordinates

- **Use pixels for geometry.** Normalized x and y have different scales on a non-square frame (16:9 is common), so convert before computing angles or distances:
  ```ts
  import { LANDMARK, toPixels } from './landmarks'
  const shoulder = toPixels(input, LANDMARK.LEFT_SHOULDER) // { x, y, visibility } in px, or null
  ```
- **Left and right are the person's own.** `LEFT_SHOULDER` is the person's left shoulder. Landmarks are in **unmirrored camera coordinates**: your own tile is *displayed* mirrored (selfie view), but the data is not. On screen, your left shoulder appears on the right of your local tile.
- **Camera angle matters for 2D.** A front-facing camera at about chest height works best. Exercise definitions in WP-04 declare a `cameraAngle` (for example `"side"`), and your engine should take it into account.

### Landmark indices (BlazePose, 33 points)

`src/posture/landmarks.ts` exports these as `LANDMARK.<NAME>`:

| # | Name | # | Name | # | Name |
|---|---|---|---|---|---|
| 0 | NOSE | 11 | LEFT_SHOULDER | 23 | LEFT_HIP |
| 1 | LEFT_EYE_INNER | 12 | RIGHT_SHOULDER | 24 | RIGHT_HIP |
| 2 | LEFT_EYE | 13 | LEFT_ELBOW | 25 | LEFT_KNEE |
| 3 | LEFT_EYE_OUTER | 14 | RIGHT_ELBOW | 26 | RIGHT_KNEE |
| 4 | RIGHT_EYE_INNER | 15 | LEFT_WRIST | 27 | LEFT_ANKLE |
| 5 | RIGHT_EYE | 16 | RIGHT_WRIST | 28 | RIGHT_ANKLE |
| 6 | RIGHT_EYE_OUTER | 17 | LEFT_PINKY | 29 | LEFT_HEEL |
| 7 | LEFT_EAR | 18 | RIGHT_PINKY | 30 | RIGHT_HEEL |
| 8 | RIGHT_EAR | 19 | LEFT_INDEX | 31 | LEFT_FOOT_INDEX |
| 9 | MOUTH_LEFT | 20 | RIGHT_INDEX | 32 | RIGHT_FOOT_INDEX |
| 10 | MOUTH_RIGHT | 21 | LEFT_THUMB | | |
| | | 22 | RIGHT_THUMB | | |

## Output: `PostureEvent[]`

Return the events that happened **in this frame**, or `[]`. The shapes match the WP-04 `bb.metrics` messages **without the envelope**. The sending code adds `v`, `id`, `seq`, `deviceTs` and so on.

| `type` | `data` | When (per WP-04) |
|---|---|---|
| `rep.completed` | `{ set, rep, romDeg?, tempoMs?, errors: string[] }` | a rep finished |
| `hold.completed` | `{ set, holdMs, targetMs }` | a hold finished |
| `posture.error` | `{ code, severity: 'low' \| 'medium' \| 'high', rep? }` | an error condition fired |
| `activity.progress` | `{ reps, holdMs }` | about **1 Hz**, emitted by your engine on its own timer (use `timestamp`) |
| `framing.lost` | `{}` | landmarks fell below your visibility threshold / no person |
| `framing.restored` | `{}` | back in frame |

Exercise definitions (WP-04 section 7) are **inside your engine** for now. The app doesn't load or pass them, because there is no backend in this playground and the doc defines no TypeScript type for them.

> The types in `src/posture/types.ts` are **hand-written and temporary**. WP-04 requires generating them from the published JSON Schemas. Replace them when those exist.

## Testing

Choose the analyzer from the URL, without code changes:

| URL | Analyzer |
|---|---|
| `https://localhost:5173/` | `default`: the rules of the exercise picked with the header buttons (**Squats** or **Fist clench**) |
| `https://localhost:5173/?analyzer=sample` | **fake** events on timers: `framing.lost` / `restored` when you leave or enter the frame, `activity.progress` at 1 Hz, a fake rep every 3 s, a fake `posture.error` every 4 s |
| `https://localhost:5173/?analyzer=off` | no analysis |

It combines with the pose engine options, for example `?pose=main&analyzer=sample`.

What to look at:

- **Stats badge** on your tile: `… · analysis 0.04 ms, 1.0 ev/s`, which is the average `analyze()` time per frame and the events per second.
- **DevTools console**: every event is logged as `[posture] <type> {data}` (`console.info`).
- **Errors in your code**: `[posture] analyze() threw` appears in the console. For a breakpoint inside the worker, open DevTools → Sources and find `pose.worker` under the worker's thread.
