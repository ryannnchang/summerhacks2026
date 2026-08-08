import type { User as SupabaseUser } from '@supabase/supabase-js'

import { ApiError, api } from '../api/client'
import type { User } from '../types'

/**
 * Derives the backend username for a Supabase account.
 *
 * The suffix is the point. Two Google accounts can share an email local-part
 * (ryan@gmail.com, ryan@outlook.com), and without it the second person to sign in
 * would be handed the first person's backend account. Keying off the Supabase uid
 * makes this unique per identity and stable across logins.
 *
 * Backend constraint is /^[a-zA-Z0-9_.-]+$/, 2-32 chars — 23 + 1 + 8 fits.
 */
export function usernameFor(user: SupabaseUser): string {
  const local = (user.email ?? '').split('@')[0] ?? ''
  const cleaned = local.replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 23) || 'player'
  return `${cleaned}-${user.id.replace(/-/g, '').slice(0, 8)}`
}

function displayNameFor(user: SupabaseUser): string {
  const meta = user.user_metadata ?? {}
  const named = [meta.full_name, meta.name, meta.preferred_username].find(
    (value): value is string => typeof value === 'string' && value.trim().length > 0,
  )
  return (named ?? user.email?.split('@')[0] ?? 'Player').slice(0, 64)
}

/**
 * Finds or creates the FastAPI user row backing a Supabase identity.
 *
 * The backend still authenticates with `X-User-Id`, so every Supabase account needs
 * a corresponding integer id. Replace this whole module once the backend verifies
 * Supabase JWTs directly.
 */
export async function linkBackendUser(user: SupabaseUser): Promise<User> {
  const username = usernameFor(user)

  const existing = await api.lookupUser(username).catch((err: unknown) => {
    if (err instanceof ApiError && err.status === 404) return null
    throw err
  })
  if (existing) return existing

  return api.signUp(username, displayNameFor(user))
}
