import type {
  Drop,
  Group,
  GroupDetail,
  LeaderboardEntry,
  Member,
  Mural,
  Submission,
  User,
} from '../types'

const BASE = '/api'
const USER_KEY = 'touchgrass.userId'

export function getUserId(): number | null {
  const raw = localStorage.getItem(USER_KEY)
  return raw ? Number(raw) : null
}

export function setUserId(id: number | null): void {
  if (id === null) localStorage.removeItem(USER_KEY)
  else localStorage.setItem(USER_KEY, String(id))
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
  const userId = getUserId()
  if (userId) headers.set('X-User-Id', String(userId))
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
  leaderboard: (groupId: number) => request<LeaderboardEntry[]>(`/groups/${groupId}/leaderboard`),

  // drops
  currentDrop: (groupId: number) => request<Drop | null>(`/groups/${groupId}/drops/current`),
  listDrops: (groupId: number) => request<Drop[]>(`/groups/${groupId}/drops`),
  triggerDrop: (groupId: number) =>
    request<Drop>(`/groups/${groupId}/drops/trigger`, { method: 'POST' }),

  // submissions
  submitGrass: (groupId: number, dropId: number, photo: File) => {
    const form = new FormData()
    form.append('photo', photo)
    return request<Submission>(`/groups/${groupId}/drops/${dropId}/submissions`, {
      method: 'POST',
      body: form,
    })
  },
  dropSubmissions: (groupId: number, dropId: number) =>
    request<Submission[]>(`/groups/${groupId}/drops/${dropId}/submissions`),
  mySubmissions: () => request<Submission[]>('/users/me/submissions'),

  // mural
  mural: () => request<Mural>('/mural'),
}

export function groupSocketUrl(groupId: number): string {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${location.host}${BASE}/ws/groups/${groupId}`
}
