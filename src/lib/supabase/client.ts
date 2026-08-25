import { createBrowserClient } from '@supabase/ssr'

// createBrowserClient stores session in cookies (not localStorage),
// so Next.js middleware can read the session on the server side.
// Fallback values prevent build-time crash when .env.local is absent.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase = createBrowserClient<any>(supabaseUrl, supabaseAnonKey)
