/**
 * Google Drive admin utilities — sunucu tarafında kullanılır.
 * Her workspace kendi Drive bağlantısını yönetir (organization_id bazlı).
 */

import { createClient } from '@supabase/supabase-js'

const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID!
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!

export function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json()
  return data.access_token || null
}

/**
 * Drive token'ını döndürür. Token'lar user_id bazlıdır (organization_id kolonu yoktur).
 * orgId parametresi artık yalnızca uyumluluk için alınır; token araması her zaman user_id bazlı yapılır.
 */
export async function getAdminToken(orgId?: string): Promise<{
  token: string
  folderId: string | null
  adminId: string
} | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getSupabaseAdmin() as any

  let tokenRow: Record<string, string> | null = null

  const adminId = process.env.DRIVE_ADMIN_USER_ID
  if (adminId) {
    const { data } = await db.from('drive_tokens').select('*').eq('user_id', adminId).maybeSingle()
    tokenRow = data
    // Fallback: DRIVE_ADMIN_USER_ID token'ı yoksa en son güncellenen token'ı kullan
    if (!tokenRow) {
      const { data: fallback } = await db
        .from('drive_tokens')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      tokenRow = fallback
    }
  } else {
    const { data } = await db
      .from('drive_tokens')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    tokenRow = data
  }

  if (!tokenRow) return null

  // access_token yoksa (daha önce temizlenmiş olabilir) → refresh dene veya null dön
  if (!tokenRow.access_token) {
    if (!tokenRow.refresh_token) return null   // ikisi de yok → bağlantı kurulmamış
    // Refresh token var → yenilemeyi dene
    const newToken = await refreshAccessToken(tokenRow.refresh_token)
    if (!newToken) return null
    const newExpiry = new Date(Date.now() + 3600 * 1000).toISOString()
    await db.from('drive_tokens').update({ access_token: newToken, expiry: newExpiry, updated_at: new Date().toISOString() }).eq('user_id', tokenRow.user_id)
    return { token: newToken, folderId: tokenRow.folder_id ?? null, adminId: tokenRow.user_id }
  }

  let accessToken = tokenRow.access_token
  const expiry = new Date(tokenRow.expiry)

  // Token süresi doluyorsa yenile
  const expiryMs = expiry.getTime()
  const tokenExpired = isNaN(expiryMs) || expiryMs - Date.now() < 60_000

  if (tokenExpired) {
    if (!tokenRow.refresh_token) {
      // Refresh token yok — sadece null dön, DB'yi temizleme
      return null
    }
    const newToken = await refreshAccessToken(tokenRow.refresh_token)
    if (!newToken) {
      // Refresh başarısız — sadece null dön, DB'yi temizleme (bağlantı korunur)
      return null
    }

    const newExpiry = new Date(Date.now() + 3600 * 1000).toISOString()
    await db.from('drive_tokens').update({ access_token: newToken, expiry: newExpiry, updated_at: new Date().toISOString() }).eq('user_id', tokenRow.user_id)

    accessToken = newToken
  }

  return { token: accessToken, folderId: tokenRow.folder_id ?? null, adminId: tokenRow.user_id }
}

/** Drive'da klasör oluşturur; başarılı olursa ID'yi, hata alırsa null döndürür */
async function createDriveFolder(accessToken: string, name: string): Promise<string | null> {
  try {
    const res = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        mimeType: 'application/vnd.google-apps.folder',
      }),
    })
    if (!res.ok) {
      console.error('[createDriveFolder] Drive hata:', res.status, await res.text())
      return null
    }
    const folder = await res.json()
    return folder.id ?? null
  } catch (err) {
    console.error('[createDriveFolder] exception:', err)
    return null
  }
}

/**
 * Workspace'e ait Drive klasörünü döndürür.
 * Yoksa workspace adıyla oluşturur ve token satırına kaydeder.
 * Klasör ID alınamazsa null döndürür — upload root'a gider.
 */
export async function getOrCreateFolder(
  accessToken: string,
  adminId: string,
  orgId?: string,
  orgName?: string,
): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getSupabaseAdmin() as any

  // user_id bazlı ara
  let tokenRow: { folder_id?: string } | null = null
  const { data } = await db.from('drive_tokens').select('folder_id').eq('user_id', adminId).maybeSingle()
  tokenRow = data

  if (tokenRow?.folder_id) return tokenRow.folder_id

  // Klasör oluştur — workspace adı veya fallback
  const folderName = orgName || 'DENEYAP Dosyaları'
  const folderId = await createDriveFolder(accessToken, folderName)

  // Klasör ID'yi kaydet
  if (folderId) {
    await db.from('drive_tokens')
      .update({ folder_id: folderId, updated_at: new Date().toISOString() })
      .eq('user_id', adminId)
  }

  return folderId  // null olabilir — upload root'a gider
}
