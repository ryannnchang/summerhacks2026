import type { User as SupabaseUser } from '@supabase/supabase-js'

import { api } from '../api/client'
import type { User } from '../types'

/**
 * Derives the backend username for a Supabase account.
 *
 * The suffix is the point. Two Google accounts can share an email local-part
 * (ryan@gmail.com, ryan@outlook.com), and without it the second person to sign in
 * would be handed the first person's backend account.
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
 * Claims the backend account behind a Supabase identity.
 *
 * The backend keys game data on integer user ids and the leaderboard on the
 * Supabase uuid, so it needs both. `/users/link` is idempotent and also creates
 * the `players` row — which is why the leaderboard works whether or not the
 * `on_auth_user_created` trigger is installed in Supabase.
 */
export async function linkBackendUser(user: SupabaseUser): Promise<User> {
  return api.linkUser(user.id, usernameFor(user), displayNameFor(user), user.email ?? null)
}
