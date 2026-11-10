/**
 * Frontend config, read from Vite env vars (see `.env.example`).
 *
 * Only public values belong here. The LiveKit API secret must NEVER be
 * exposed to the frontend — anything prefixed with `VITE_` ends up in the
 * built JS bundle.
 */
export const config = {
  /** LiveKit Cloud websocket URL, e.g. wss://<project>.livekit.cloud */
  livekitUrl: import.meta.env.VITE_LIVEKIT_URL ?? '',
  /** Optional pre-generated access token (from `lk token create`). */
  livekitToken: import.meta.env.VITE_LIVEKIT_TOKEN ?? '',
  /** Optional LiveKit Cloud sandbox token server ID (dev only). */
  livekitSandboxId: import.meta.env.VITE_LIVEKIT_SANDBOX_ID ?? '',
} as const

export const isLivekitConfigured = config.livekitUrl.length > 0
