/**
 * Downloads the MediaPipe pose model into public/mediapipe/models/ (gitignored).
 * Runs automatically before `dev` and `build`; skips files already downloaded.
 *
 * The wasm runtime is NOT copied here: it's imported from node_modules with
 * Vite `?url` imports (see src/pose/pose.worker.ts for why).
 */
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const modelOut = join(root, 'public/mediapipe/models')

const MODELS = {
  'pose_landmarker_lite.task':
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
}

async function sizeOf(path) {
  try {
    return (await stat(path)).size
  } catch {
    return -1
  }
}

async function downloadModels() {
  await mkdir(modelOut, { recursive: true })
  for (const [file, url] of Object.entries(MODELS)) {
    const to = join(modelOut, file)
    if ((await sizeOf(to)) > 0) continue
    console.log(`[mediapipe] downloading ${file} …`)
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Download failed (${res.status}) for ${url}`)
    await writeFile(to, Buffer.from(await res.arrayBuffer()))
    console.log(`[mediapipe] saved models/${file}`)
  }
}

await downloadModels()
