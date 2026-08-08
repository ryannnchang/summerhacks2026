import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy frontend/.env.example to ' +
      'frontend/.env.local and fill them in, then restart the dev server.',
  )
}

/**
 * Supabase owns identity; the FastAPI backend still owns the game data.
 * `lib/backendUser.ts` bridges a signed-in Google account to a backend user row.
 */
export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // The OAuth redirect comes back with tokens in the URL fragment; let the
    // client consume them and then clean the address bar.
    detectSessionInUrl: true,
  },
})
