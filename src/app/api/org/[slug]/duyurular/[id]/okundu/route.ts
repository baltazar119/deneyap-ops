import { NextRequest, NextResponse } from 'next/server'
import { orgYetkiCoz } from '@/lib/server/apiAuth'

export const dynamic = 'force-dynamic'

/**
 * POST — duyuruyu bu kullanıcı için okundu işaretler ("Anladım").
 *
 * `user_id` GÖVDEDEN ALINMIYOR, oturumdan geliyor: aksi halde bir kullanıcı
 * başkası adına "okundu" yazıp duyuruyu ondan gizleyebilirdi. RLS'teki
 * `with check (user_id = auth.uid())` de aynı kuralı taşıyor; buradaki
 * admin istemcisi RLS'i baypas ettiği için bu satır tek savunma.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string; id: string } },
) {
  const y = await orgYetkiCoz(req, { slug: params.slug, gerekli: 'uye' })
  if (!y.ok) return y.res
  const { org, admin, user } = y.yetki

  // Duyuru gerçekten bu org'un mu — çapraz-org işaretlemeyi burada kesiyoruz.
  const { data: duyuru } = await admin
    .from('duyurular')
    .select('id')
    .eq('id', params.id)
    .eq('organization_id', org.id)
    .maybeSingle()

  if (!duyuru) return NextResponse.json({ error: 'Duyuru bulunamadı.' }, { status: 404 })

  // Aynı duyuruya iki kez "Anladım" denmesi hata olmamalı (çift tıklama,
  // iki sekme). Birincil anahtar (duyuru_id, user_id) zaten tekilliği
  // garantiliyor; upsert onu çakışmasız hale getiriyor.
  const { error } = await admin
    .from('duyuru_okundu')
    .upsert({ duyuru_id: params.id, user_id: user.id }, { onConflict: 'duyuru_id,user_id' })

  if (error) {
    console.error('[duyuru okundu]', error)
    return NextResponse.json({ error: 'İşaretlenemedi.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
