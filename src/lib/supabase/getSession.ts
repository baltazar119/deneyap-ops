import { supabase } from './client'
import type { Session } from '@supabase/supabase-js'
import { getCachedRole, setCachedRole, getCachedAvatarUrl, setCachedAvatarUrl } from '@/lib/roleCache'

/**
 * Supabase session'ı localStorage'dan yükler (network çağrısı yok).
 */
export async function waitForSession(): Promise<Session | null> {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

/**
 * Session + kullanıcı rolü + avatar URL'sini tek seferde döndürür.
 * Rol ve avatar ilk seferinde DB'den çekilir, sonraki çağrılarda sessionStorage cache'inden okunur.
 */
export async function getSessionAndRole(): Promise<{
  userId: string
  email: string
  role: string
  avatarUrl: string | null
  session: Session
} | null> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null

  const userId = session.user.id

  // Cache hit
  const cachedRole = getCachedRole(userId)
  if (cachedRole) {
    const cachedAvatar = getCachedAvatarUrl(userId)
    return { userId, email: session.user.email ?? '', role: cachedRole, avatarUrl: cachedAvatar, session }
  }

  // Cache miss → rol + avatar birlikte çek
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, avatar_url')
    .eq('id', userId)
    .single()

  const role      = profile?.role       ?? 'member'
  const avatarUrl = profile?.avatar_url ?? null

  setCachedRole(userId, role)
  setCachedAvatarUrl(userId, avatarUrl)

  return { userId, email: session.user.email ?? '', role, avatarUrl, session }
}
