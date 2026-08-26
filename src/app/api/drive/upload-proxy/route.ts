import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

/**
 * POST /api/drive/upload-proxy?uploadUri=<encoded>
 *
 * Tarayıcı → bu endpoint → Google Drive (PUT)
 * CORS sorununu ortadan kaldırır.
 * X-Content-Range başlığı varsa Google'a Content-Range olarak iletilir — chunked upload desteği.
 *
 * Yanıt:
 *   { partial: true, nextByte: N }  → chunk kabul edildi, devam et (Google 308)
 *   { id, name, ... }               → yükleme tamamlandı (Google 200)
 *   hata durumunda HTTP 4xx/5xx
 */
export async function POST(req: NextRequest) {
  const uploadUri = req.nextUrl.searchParams.get('uploadUri')
  if (!uploadUri) {
    return NextResponse.json({ error: 'uploadUri parametresi gerekli.' }, { status: 400 })
  }

  const contentType  = req.headers.get('content-type')  || 'application/octet-stream'
  // X-Content-Range başlığını Content-Range olarak Google'a ilet
  const contentRange = req.headers.get('x-content-range')

  const driveHeaders: Record<string, string> = { 'Content-Type': contentType }
  if (contentRange) driveHeaders['Content-Range'] = contentRange

  try {
    const driveRes = await fetch(uploadUri, {
      method: 'PUT',
      headers: driveHeaders,
      body: req.body,
      // @ts-expect-error duplex gerekli: streaming request body için
      duplex: 'half',
    })

    // 308 = chunk kabul edildi, daha fazlası bekleniyor
    if (driveRes.status === 308) {
      const range     = driveRes.headers.get('Range') || ''
      const nextByte  = range ? parseInt(range.split('-')[1]) + 1 : 0
      return NextResponse.json({ partial: true, nextByte })
    }

    const text = await driveRes.text()
    let data: Record<string, unknown>
    try { data = JSON.parse(text) } catch { data = {} }

    return NextResponse.json(data, { status: driveRes.status })
  } catch (err) {
    console.error('[upload-proxy] error:', err)
    return NextResponse.json({ error: 'Proxy hatası: ' + String(err) }, { status: 500 })
  }
}
