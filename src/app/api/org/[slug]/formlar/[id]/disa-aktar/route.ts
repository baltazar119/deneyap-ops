import { NextRequest, NextResponse } from 'next/server'
import { orgYetkiCoz } from '@/lib/server/apiAuth'
import { yanitSayfalari, dosyaAdi } from '@/lib/form/disaAktar'
import { satirlariCsv } from '@/lib/rapor/csv'
import type { Form, FormGonderim, FormYanit } from '@/lib/form/tipler'

export const dynamic = 'force-dynamic'

/**
 * GET ?format=xlsx|csv — form cevaplarını indirir.
 *
 * XLSX çok sayfalı: ana sayfa + her tablo sorusu için ayrı sayfa.
 * CSV tek sayfalı olduğu için yalnızca ana sayfayı taşır; arayüz bunu
 * kullanıcıya söylüyor.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string; id: string } },
) {
  const y = await orgYetkiCoz(req, { slug: params.slug, gerekli: 'uye' })
  if (!y.ok) return y.res
  const { org, admin } = y.yetki

  const bicim = new URL(req.url).searchParams.get('format') === 'csv' ? 'csv' : 'xlsx'

  const { data: form } = await admin
    .from('formlar').select('*')
    .eq('id', params.id).eq('organization_id', org.id).maybeSingle()
  if (!form) return NextResponse.json({ error: 'Form bulunamadı.' }, { status: 404 })

  const { data: gonderimler } = await admin
    .from('form_gonderimleri').select('*')
    .eq('form_id', params.id).eq('organization_id', org.id)
    .order('created_at', { ascending: true })

  const idler = (gonderimler ?? []).map((g: { id: string }) => g.id)
  const { data: yanitlar } = idler.length
    ? await admin.from('form_yanitlari').select('*').in('gonderim_id', idler)
    : { data: [] }

  // Kişi adları: aktarımda ham uuid görmek işe yaramaz.
  const kisiIdleri = [...new Set([
    ...(gonderimler ?? []).map((g: { alici_user_id: string | null }) => g.alici_user_id),
    ...(yanitlar ?? []).map((v: { yanitlayan_user_id: string | null }) => v.yanitlayan_user_id),
  ].filter((x): x is string => !!x))]

  const adlar: Record<string, string> = {}
  if (kisiIdleri.length) {
    const { data: profiller } = await admin.from('profiles').select('id, full_name').in('id', kisiIdleri)
    for (const p of (profiller ?? []) as { id: string; full_name: string | null }[]) {
      if (p.full_name) adlar[p.id] = p.full_name
    }
  }

  const sayfalar = yanitSayfalari({
    form: form as Form,
    gonderimler: (gonderimler ?? []) as FormGonderim[],
    yanitlar: (yanitlar ?? []) as FormYanit[],
    adlar,
  })

  const ad = dosyaAdi((form as Form).baslik, bicim)

  if (bicim === 'csv') {
    const ana = sayfalar[0]
    const govde = satirlariCsv(ana.basliklar, ana.satirlar)
    return new NextResponse(govde, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${ad}"`,
      },
    })
  }

  const { formExcelUret } = await import('@/lib/form/excel')
  const bayt = await formExcelUret(sayfalar)
  return new NextResponse(bayt as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${ad}"`,
    },
  })
}
