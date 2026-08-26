import { NextRequest, NextResponse } from 'next/server'
import { getAdminToken, getOrCreateFolder, getSupabaseAdmin, refreshAccessToken } from '@/lib/driveAdmin'

export const dynamic = 'force-dynamic'

/**
 * POST /api/drive/upload-session
 *
 * Google Drive "resumable upload" session'ı başlatır.
 * Tarayıcı dosyayı Vercel üzerinden DEĞİL, doğrudan Drive'a yükleyecek.
 * Vercel 4.5MB limiti bu şekilde aşılır.
 *
 * Body: { fileName: string, mimeType: string, orgId: string }
 * Response: { uploadUri: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { fileName, mimeType, orgId } = await req.json()

    if (!fileName) {
      return NextResponse.json({ error: 'fileName gerekli.' }, { status: 400 })
    }

    // Workspace'e ait token'ı al
    const tokenData = await getAdminToken(orgId || undefined)
    if (!tokenData) {
      return NextResponse.json(
        { error: 'Drive henüz bağlanmamış. Yönetici bu workspace için Drive bağlantısını kurmalı.' },
        { status: 401 }
      )
    }

    const { token: accessToken, adminId } = tokenData

    // Workspace adını DB'den çek
    let orgName: string | undefined
    if (orgId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = getSupabaseAdmin() as any
      const { data: orgRow } = await db
        .from('organizations')
        .select('name')
        .eq('id', orgId)
        .single()
      orgName = orgRow?.name || undefined
    }

    // Workspace klasörünü al veya oluştur (null dönebilir — kök dizine yükle)
    const folderId = await getOrCreateFolder(accessToken, adminId, orgId || undefined, orgName)

    // Drive resumable upload session başlat
    const fileMetadata: Record<string, unknown> = { name: fileName }
    if (folderId) fileMetadata.parents = [folderId]

    const initRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files' +
      '?uploadType=resumable&fields=id,name,size,mimeType,webViewLink',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Upload-Content-Type': mimeType || 'application/octet-stream',
        },
        body: JSON.stringify(fileMetadata),
      }
    )

    if (!initRes.ok) {
      const errText = await initRes.text()
      console.error('[upload-session] Drive hata:', initRes.status, errText)

      // 401 → access token geçersiz; refresh_token ile yeni token dene, sonra tekrar dene
      if (initRes.status === 401) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db2 = getSupabaseAdmin() as any
        const filter = orgId
          ? db2.from('drive_tokens').select('refresh_token').eq('organization_id', orgId).maybeSingle()
          : db2.from('drive_tokens').select('refresh_token').eq('user_id', tokenData.adminId).maybeSingle()
        const { data: tokenRow2 } = await filter

        if (tokenRow2?.refresh_token) {
          const newAccessToken = await refreshAccessToken(tokenRow2.refresh_token)
          if (newAccessToken) {
            // DB'yi güncelle
            const newExpiry = new Date(Date.now() + 3600 * 1000).toISOString()
            const updateFilter = orgId
              ? db2.from('drive_tokens').update({ access_token: newAccessToken, expiry: newExpiry, updated_at: new Date().toISOString() }).eq('organization_id', orgId)
              : db2.from('drive_tokens').update({ access_token: newAccessToken, expiry: newExpiry, updated_at: new Date().toISOString() }).eq('user_id', tokenData.adminId)
            await updateFilter

            // Yeni token ile tekrar dene
            const retryRes = await fetch(
              'https://www.googleapis.com/upload/drive/v3/files' +
              '?uploadType=resumable&fields=id,name,size,mimeType,webViewLink',
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${newAccessToken}`,
                  'Content-Type': 'application/json',
                  'X-Upload-Content-Type': mimeType || 'application/octet-stream',
                },
                body: JSON.stringify(fileMetadata),
              }
            )
            if (retryRes.ok) {
              const retryUri = retryRes.headers.get('Location')
              if (retryUri) return NextResponse.json({ uploadUri: retryUri })
            }
          }
        }

        // Refresh veya retry de başarısız → token'ı temizle
        const clearFilter = orgId
          ? db2.from('drive_tokens').update({ access_token: null, refresh_token: null, folder_id: null }).eq('organization_id', orgId)
          : db2.from('drive_tokens').update({ access_token: null, refresh_token: null, folder_id: null }).eq('user_id', tokenData.adminId)
        await clearFilter
        return NextResponse.json(
          { error: 'Drive bağlantısı geçersiz veya süresi dolmuş. Lütfen Drive\'ı yeniden bağlayın.', needsReconnect: true },
          { status: 401 }
        )
      }

      let detail = ''
      try { detail = JSON.parse(errText)?.error?.message || '' } catch { /* ignore */ }
      return NextResponse.json(
        { error: `Drive upload session oluşturulamadı${detail ? ': ' + detail : '.'}` },
        { status: 500 }
      )
    }

    const uploadUri = initRes.headers.get('Location')
    if (!uploadUri) {
      return NextResponse.json({ error: 'Upload URI alınamadı.' }, { status: 500 })
    }

    return NextResponse.json({ uploadUri })
  } catch (err) {
    console.error('[upload-session] error:', err)
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 })
  }
}
