// Dev token helper — mirror of game-server's AuthService.makeDevToken.
// Phase 2: replace with Entra ID token from Teams SSO.
export function makeDevToken(userId: string, displayName: string): string {
  const json = JSON.stringify({ userId, displayName });
  // browser-safe base64
  const b64 = typeof window === 'undefined'
    ? Buffer.from(json, 'utf8').toString('base64')
    : btoa(unescape(encodeURIComponent(json)));
  return 'dev:' + b64;
}

export const GAME_SERVER_URL =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_GAME_SERVER_URL) ||
  'http://localhost:3001';
