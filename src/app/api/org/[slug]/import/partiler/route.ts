import { NextRequest, NextResponse } from 'next/server'
import { orgYetkiCoz } from '@/lib/server/apiAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** GET /api/org/[slug]/import/partiler → içe aktarma geçmişi */
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const y = await orgYetkiCoz(req, { slug: params.slug, gerekli: 'yazma' })
  if (!y.ok) return y.res
  const { yetki } = y

  const { data: partiler } = await yetki.admin
    .from('import_batches')
    .select('id, dosya_adi, durum, satir_sayisi, olusturulan, guncellenen, atlanan, hatali, created_at, uygulandi_at, geri_alindi_at, created_by')
    .eq('organization_id', yetki.org.id)
    .neq('durum', 'onizleme')       // yarım kalmış önizlemeler geçmişte görünmesin
    .order('created_at', { ascending: false })
    .limit(30)

  const kullaniciIds = [...new Set((partiler ?? []).map((p: { created_by: string }) => p.created_by))]
  const { data: profiller } = kullaniciIds.length
    ? await yetki.admin.from('profiles').select('id, full_name').in('id', kullaniciIds)
    : { data: [] }

  const adlar = Object.fromEntries(
    (profiller ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name]),
  )

  return NextResponse.json({
    partiler: (partiler ?? []).map((p: Record<string, unknown>) => ({
      ...p,
      olusturanAd: adlar[p.created_by as string] ?? null,
      // 30 günden eski partiler RPC tarafından reddediliyor; butonu da gizleyelim
      geriAlinabilir:
        (p.durum === 'tamamlandi' || p.durum === 'kismi') &&
        !!p.uygulandi_at &&
        Date.now() - new Date(p.uygulandi_at as string).getTime() < 30 * 24 * 60 * 60 * 1000,
    })),
  })
}
