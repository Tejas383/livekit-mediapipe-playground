/**
 * Browsers only expose camera/mic (`navigator.mediaDevices`) in a secure
 * context: HTTPS or localhost. A phone opening http://192.168.x.x gets none.
 */
export function canUseMediaDevices(): boolean {
  return window.isSecureContext && typeof navigator.mediaDevices?.getUserMedia === 'function'
}
