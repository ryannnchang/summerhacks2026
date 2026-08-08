/**
 * Persisted session, the counterpart to the design mock's `lib/storage.ts`.
 *
 * The mock stored a made-up `{ name, groupCode }`. Here we store the two things
 * the real API actually needs: the user id that goes out as `X-User-Id`, and
 * whichever group the bottom-nav tabs are currently looking at.
 */

const USER_ID_KEY = 'cg_user_id'
const GROUP_ID_KEY = 'cg_group_id'

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

export const getActiveGroupId = (): number | null => readNumber(GROUP_ID_KEY)
export const setActiveGroupId = (id: number | null): void => writeNumber(GROUP_ID_KEY, id)

export function clearSession(): void {
  setUserId(null)
  setActiveGroupId(null)
}
