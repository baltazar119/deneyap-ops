import { NextRequest, NextResponse } from 'next/server'
import { orgYetkiCoz } from '@/lib/server/apiAuth'
import { sablonUret } from '@/lib/import/sablon'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** GET /api/org/[slug]/import/sablon → doldurulmaya hazır .xlsx */
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const y = await orgYetkiCoz(req, { slug: params.slug, gerekli: 'yazma' })
  if (!y.ok) return y.res
  const { yetki } = y

  const { data: uyelikler } = await yetki.admin
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', yetki.org.id)

  const ids = (uyelikler ?? []).map((u: { user_id: string }) => u.user_id)
  const { data: profiller } = ids.length
    ? await yetki.admin.from('profiles').select('full_name, email').in('id', ids)
    : { data: [] }

  // Aktif DENEYAP adları — şablondaki açılır liste bunlarla dolar.
  // Kullanıcı listeden seçerse eşleşme oranı ~%100 olur; şablonun asıl
  // değeri bu (üye e-postalarında olduğu gibi).
  const { data: deneyaplar } = await yetki.admin
    .from('deneyaplar')
    .select('ad')
    .eq('organization_id', yetki.org.id)
    .eq('aktif', true)

  const buf = await sablonUret({
    orgAd: yetki.org.name,
    deneyaplar: (deneyaplar ?? []).map((d: { ad: string }) => d.ad),
    uyeler: (profiller ?? []).map((p: { full_name: string | null; email: string | null }) => ({
      adSoyad: p.full_name, email: p.email,
    })),
  })

  // ASCII filename + RFC 5987 filename* — Türkçe karakterli ad aksi halde bozulur
  const ad = 'DENEYAP-gorev-sablonu.xlsx'
  return new NextResponse(Buffer.from(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition':
        `attachment; filename="${ad}"; filename*=UTF-8''DENEYAP-g%C3%B6rev-%C5%9Fablonu.xlsx`,
      'Cache-Control': 'no-store',
    },
  })
}
