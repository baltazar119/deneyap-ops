/**
 * Kullanıcı rolünü ve avatar URL'sini sessionStorage'da önbelleğe alır.
 * Tab kapatılınca otomatik temizlenir.
 * Rol ve avatar nadiren değiştiğinden sayfa geçişlerinde DB çağrısını ortadan kaldırır.
 */

const ROLE_PREFIX   = 'deneyap_role_v2_'   // v2: avatar'ı da içeren cache
const AVATAR_PREFIX = 'deneyap_avatar_'

// ── Rol ──────────────────────────────────────────────────────────────────────

export function getCachedRole(userId: string): string | null {
  try { return sessionStorage.getItem(ROLE_PREFIX + userId) } catch { return null }
}

export function setCachedRole(userId: string, role: string) {
  try { sessionStorage.setItem(ROLE_PREFIX + userId, role) } catch {}
}

// ── Avatar URL ────────────────────────────────────────────────────────────────

export function getCachedAvatarUrl(userId: string): string | null {
  try { return sessionStorage.getItem(AVATAR_PREFIX + userId) } catch { return null }
}

export function setCachedAvatarUrl(userId: string, url: string | null) {
  try {
    if (url) {
      sessionStorage.setItem(AVATAR_PREFIX + userId, url)
    } else {
      sessionStorage.removeItem(AVATAR_PREFIX + userId)
    }
  } catch {}
}

// ── Temizle ───────────────────────────────────────────────────────────────────

export function clearRoleCache() {
  try {
    Object.keys(sessionStorage)
      .filter(k => k.startsWith('deneyap_role_') || k.startsWith(AVATAR_PREFIX))
      .forEach(k => sessionStorage.removeItem(k))
  } catch {}
}

// ── Org-scoped cache (OrgContext tarafından kullanılır) ───────────────────────

const ORG_CACHE_PREFIX = 'deneyap_org_'

export interface OrgCacheEntry {
  orgRole: string
  plan: string
  orgId: string
}

export function getCachedOrgSession(userId: string, slug: string): OrgCacheEntry | null {
  try {
    const raw = sessionStorage.getItem(`${ORG_CACHE_PREFIX}${userId}_${slug}`)
    return raw ? JSON.parse(raw) as OrgCacheEntry : null
  } catch { return null }
}

export function setCachedOrgSession(userId: string, slug: string, data: OrgCacheEntry) {
  try {
    sessionStorage.setItem(`${ORG_CACHE_PREFIX}${userId}_${slug}`, JSON.stringify(data))
  } catch {}
}

/** Logout veya workspace değiştirme sırasında tüm cache'i temizle */
export function clearAllCache(userId?: string) {
  try {
    Object.keys(sessionStorage)
      .filter(k =>
        (k.startsWith('deneyap_role_') || k.startsWith(AVATAR_PREFIX) ||
         k.startsWith(ORG_CACHE_PREFIX) || k.startsWith('deneyap_org_v2_')) &&
        (!userId || k.includes(userId))
      )
      .forEach(k => sessionStorage.removeItem(k))
  } catch {}
}
