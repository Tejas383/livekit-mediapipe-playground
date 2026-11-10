/**
 * Puts the MediaPipe runtime files where the browser can load them:
 *   public/mediapipe/wasm/    <- copied from node_modules/@mediapipe/tasks-vision/wasm
 *   public/mediapipe/models/  <- pose model downloaded from Google's model storage
 *
 * Serving these ourselves (instead of from a CDN) keeps the wasm version in
 * lockstep with the installed npm package and works offline after the first run.
 * The folder is gitignored; this runs automatically before `dev` and `build`.
 */
import { copyFile, mkdir, readdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const wasmSrc = join(root, 'node_modules/@mediapipe/tasks-vision/wasm')
const outDir = join(root, 'public/mediapipe')
const wasmOut = join(outDir, 'wasm')
const modelOut = join(outDir, 'models')

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

async function copyWasm() {
  await mkdir(wasmOut, { recursive: true })
  for (const file of await readdir(wasmSrc)) {
    const from = join(wasmSrc, file)
    const to = join(wasmOut, file)
    // Re-copy when missing or when the package was upgraded (size differs).
    if ((await sizeOf(from)) !== (await sizeOf(to))) {
      await copyFile(from, to)
      console.log(`[mediapipe] copied wasm/${file}`)
    }
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

await copyWasm()
await downloadModels()
