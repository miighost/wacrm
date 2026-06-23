import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

// Singleton instance — one client shared across the whole browser session.
// Creating multiple clients causes auth-lock contention ("Lock was released
// because another request stole it") and intermittent fetch failures.
let browserClient: SupabaseClient | undefined

export function createClient() {
  if (browserClient) return browserClient

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    console.error('Supabase client env variables are missing.')
    // Fallback to empty strings so it doesn't crash on import/init but shows errors on fetch
    browserClient = createBrowserClient('', '')
  } else {
    browserClient = createBrowserClient(url, anonKey)
  }

  return browserClient
}

