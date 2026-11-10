import { decodeTokenPayload, TokenSource } from 'livekit-client'

/** Everything needed to connect to a LiveKit room. */
export interface JoinDetails {
  serverUrl: string
  token: string
}

/** Human-readable info decoded from a token's (unverified) JWT payload. */
export interface TokenInfo {
  identity?: string
  room?: string
  expiresAt?: Date
  expired: boolean
  canPublish: boolean
}

/**
 * Decode a LiveKit access token for display purposes only.
 * This does NOT verify the signature — the server does that on connect.
 * Returns null when the string isn't a decodable JWT.
 */
export function describeToken(token: string): TokenInfo | null {
  if (!token.trim()) return null
  try {
    const payload = decodeTokenPayload(token.trim())
    const expiresAt = payload.exp ? new Date(payload.exp * 1000) : undefined
    return {
      identity: payload.sub,
      room: payload.video?.room,
      expiresAt,
      expired: expiresAt ? expiresAt.getTime() < Date.now() : false,
      canPublish: payload.video?.canPublish ?? true,
    }
  } catch {
    return null
  }
}

/**
 * Get a token from LiveKit Cloud's sandbox token server (dev only).
 * The sandbox response also carries the server URL, so no URL is needed.
 */
export async function fetchSandboxToken(
  sandboxId: string,
  roomName: string,
  identity: string,
): Promise<JoinDetails> {
  const source = TokenSource.sandboxTokenServer(sandboxId)
  const res = await source.fetch({
    roomName,
    participantIdentity: identity,
    participantName: identity,
  })
  return { serverUrl: res.serverUrl, token: res.participantToken }
}
