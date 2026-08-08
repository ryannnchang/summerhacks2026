/**
 * Persisted session.
 *
 * Just the backend user id, which goes out as `X-User-Id`. There is no active
 * group any more — drops are global, so a group only filters the leaderboard.
 */

const USER_ID_KEY = 'cg_user_id'

function readNumber(key: string): number | null {
  const raw = window.localStorage.getItem(key)
  if (!raw) return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

function writeNumber(key: string, value: number | null): void {
  if (value === null) window.localStorage.removeItem(key)
  else window.localStorage.setItem(key, String(value))
}

export const getUserId = (): number | null => readNumber(USER_ID_KEY)
export const setUserId = (id: number | null): void => writeNumber(USER_ID_KEY, id)

export function clearSession(): void {
  setUserId(null)
}

/**
 * Where to land after signing in.
 *
 * Google OAuth is a full page navigation away and back, so router state doesn't
 * survive it. sessionStorage does.
 */
const RETURN_TO_KEY = 'cg_return_to'

export function setReturnTo(path: string): void {
  window.sessionStorage.setItem(RETURN_TO_KEY, path)
}

export function takeReturnTo(): string | null {
  const path = window.sessionStorage.getItem(RETURN_TO_KEY)
  window.sessionStorage.removeItem(RETURN_TO_KEY)
  // Only same-app paths, never an absolute URL someone stuffed in there.
  return path && path.startsWith('/') && !path.startsWith('//') ? path : null
}
