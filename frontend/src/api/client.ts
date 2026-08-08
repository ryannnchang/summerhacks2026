import { getUserId } from '../lib/session'
import type {
  Drop,
  Group,
  GroupDetail,
  LeaderboardEntry,
  MapData,
  Member,
  Mural,
  Submission,
  User,
} from '../types'

const BASE = '/api'

/**
 * Auth seam.
 *
 * The API identifies callers with an `X-User-Id` header — hackathon-grade, the client just
 * says who it is. The id is whatever `/auth` last stored; with nothing stored, group / drop /
 * submission calls 401 and the router bounces the visitor back to the auth screen.
 */
function authHeader(): Record<string, string> {
  const id = getUserId()
  return id === null ? {} : { 'X-User-Id': String(id) }
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  for (const [key, value] of Object.entries(authHeader())) headers.set(key, value)
  if (init.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }

  const res = await fetch(`${BASE}${path}`, { ...init, headers })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      if (typeof body.detail === 'string') detail = body.detail
      else if (Array.isArray(body.detail)) detail = body.detail[0]?.msg ?? detail
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(detail, res.status)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

const json = (body: unknown) => JSON.stringify(body)

export const api = {
  // users
  signUp: (username: string, displayName?: string) =>
    request<User>('/users', {
      method: 'POST',
      body: json({ username, display_name: displayName || null }),
    }),
  lookupUser: (username: string) =>
    request<User>(`/users/by-username/${encodeURIComponent(username)}`),
  /** Finds or creates the backend account behind a Google identity. Idempotent. */
  linkUser: (supabaseUid: string, username: string, displayName: string) =>
    request<User>('/users/link', {
      method: 'POST',
      body: json({ supabase_uid: supabaseUid, username, display_name: displayName }),
    }),
  me: () => request<User>('/users/me'),

  // groups
  listGroups: () => request<Group[]>('/groups'),
  createGroup: (name: string) => request<Group>('/groups', { method: 'POST', body: json({ name }) }),
  joinGroup: (joinCode: string) =>
    request<Group>('/groups/join', {
      method: 'POST',
      body: json({ join_code: joinCode.toUpperCase() }),
    }),
  getGroup: (groupId: number) => request<GroupDetail>(`/groups/${groupId}`),
  addMember: (groupId: number, username: string) =>
    request<Member>(`/groups/${groupId}/members/${encodeURIComponent(username)}`, {
      method: 'POST',
    }),
  removeMember: (groupId: number, userId: number) =>
    request<void>(`/groups/${groupId}/members/${userId}`, { method: 'DELETE' }),

  // leaderboard — one ranking, two views. 'global' is public; 'friends' needs auth.
  leaderboard: (scope: 'global' | 'friends' = 'global') =>
    request<LeaderboardEntry[]>(`/leaderboard?scope=${scope}`),

  // drops — global, one at a time. The clock is public.
  currentDrop: () => request<Drop>('/drops/current'),
  listDrops: () => request<Drop[]>('/drops'),
  triggerDrop: () => request<Drop>('/drops/trigger', { method: 'POST' }),

  // submissions
  submitGrass: (dropId: number, photo: File, coords?: { latitude: number; longitude: number }) => {
    const form = new FormData()
    form.append('photo', photo)
    if (coords) {
      form.append('latitude', String(coords.latitude))
      form.append('longitude', String(coords.longitude))
    }
    return request<Submission>(`/drops/${dropId}/submissions`, { method: 'POST', body: form })
  },
  dropSubmissions: (dropId: number) => request<Submission[]>(`/drops/${dropId}/submissions`),
  mySubmissions: () => request<Submission[]>('/users/me/submissions'),

  // mural
  mural: (limit?: number) => request<Mural>(`/mural${limit ? `?limit=${limit}` : ''}`),

  // map (public — works without auth)
  mapPatches: (sinceHours?: number) =>
    request<MapData>(`/map/patches${sinceHours ? `?since_hours=${sinceHours}` : ''}`),
}

export function dropSocketUrl(): string {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${location.host}${BASE}/ws/drops`
}
