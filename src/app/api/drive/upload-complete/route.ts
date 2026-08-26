import { NextRequest, NextResponse } from 'next/server'
import { getAdminToken, getSupabaseAdmin } from '@/lib/driveAdmin'

export const dynamic = 'force-dynamic'

/**
 * POST /api/drive/upload-complete
 *
 * Tarayıcı Drive'a dosyayı yükledikten sonra çağrılır.
 * İzinleri ayarlar, org_files tablosuna kaydeder, task_file_links ekler.
 *
 * Body: {
 *   driveFileId: string
 *   driveWebViewLink?: string
 *   fileName: string
 *   fileSize?: number
 *   mimeType?: string
 *   orgId: string
 *   taskId?: string
 *   userId: string
 *   category?: string
 *   description?: string
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const {
      driveFileId, driveWebViewLink,
      fileName, fileSize, mimeType,
      orgId, taskId, userId,
      category, description,
    } = await req.json()

    if (!driveFileId || !orgId) {
      return NextResponse.json({ error: 'driveFileId ve orgId gerekli.' }, { status: 400 })
    }

    // Workspace'e ait token'ı al
    const tokenData = await getAdminToken(orgId || undefined)
    if (!tokenData) {
      return NextResponse.json({ error: 'Drive token bulunamadı. Bu workspace için Drive bağlantısını kur.' }, { status: 401 })
    }

    const { token: accessToken, adminId } = tokenData

    // Dosyayı "link ile herkes okuyabilir" yap
    await fetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}/permissions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    })

    // org_files tablosuna kaydet
    const db = getSupabaseAdmin()
    const driveUrl = driveWebViewLink || `https://drive.google.com/file/d/${driveFileId}/view`

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: orgFileRow, error: insertErr } = await (db as any)
      .from('org_files')
      .insert({
        organization_id: orgId,
        uploaded_by: userId || adminId,
        drive_file_id: driveFileId,
        file_name: fileName,
        file_size: fileSize ? Number(fileSize) : null,
        mime_type: mimeType || null,
        drive_url: driveUrl,
        category: category || 'genel',
        description: description || null,
      })
      .select('id')
      .single()

    if (insertErr) {
      console.error('[upload-complete] org_files insert error:', insertErr)
      return NextResponse.json(
        { error: `Veritabanı kaydı başarısız: ${insertErr.message}` },
        { status: 500 }
      )
    }

    // Göreve otomatik bağla
    if (orgFileRow?.id && taskId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: linkErr } = await (db as any).from('task_file_links').insert({
        org_file_id: orgFileRow.id,
        task_id: taskId,
        linked_by: userId || adminId,
      })
      if (linkErr) {
        console.error('[upload-complete] task_file_links error:', linkErr)
        // Dosya kaydedildi, sadece bağlantı kurulamadı — başarıyla dön
      }
    }

    return NextResponse.json({
      success: true,
      file: { id: driveFileId, name: fileName, url: driveUrl },
    })
  } catch (err) {
    console.error('[upload-complete] error:', err)
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 })
  }
}
