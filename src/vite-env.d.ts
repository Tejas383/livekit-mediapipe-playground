/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LIVEKIT_URL?: string
  readonly VITE_LIVEKIT_TOKEN?: string
  readonly VITE_LIVEKIT_SANDBOX_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
