import { NextRequest, NextResponse } from 'next/server'
import { orgYetkiCoz } from '@/lib/server/apiAuth'

export const dynamic = 'force-dynamic'

/** GET — bir formun gönderimleri ve gelen cevapları. */
export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string; id: string } },
) {
  const y = await orgYetkiCoz(req, { slug: params.slug, gerekli: 'uye' })
  if (!y.ok) return y.res
  const { org, admin } = y.yetki

  const { data: form, error: formHatasi } = await admin
    .from('formlar')
    .select('*')
    .eq('id', params.id)
    .eq('organization_id', org.id)
    .maybeSingle()

  if (formHatasi) {
    console.error('[form yanitlar]', formHatasi)
    return NextResponse.json({ error: 'Form alınamadı.' }, { status: 500 })
  }
  if (!form) return NextResponse.json({ error: 'Form bulunamadı.' }, { status: 404 })

  const { data: gonderimler } = await admin
    .from('form_gonderimleri')
    .select('*')
    .eq('form_id', params.id)
    .eq('organization_id', org.id)
    .order('created_at', { ascending: false })

  const gonderimIdleri = (gonderimler ?? []).map((g: { id: string }) => g.id)
  const { data: yanitlar } = gonderimIdleri.length
    ? await admin.from('form_yanitlari').select('*').in('gonderim_id', gonderimIdleri)
    : { data: [] }

  return NextResponse.json({ form, gonderimler: gonderimler ?? [], yanitlar: yanitlar ?? [] })
}
