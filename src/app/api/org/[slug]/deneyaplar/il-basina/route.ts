import { NextRequest, NextResponse } from 'next/server'
import { orgYetkiCoz } from '@/lib/server/apiAuth'
import { ilGecerliMi } from '@/lib/iller'
import { trFold } from '@/lib/turkce'

export const dynamic = 'force-dynamic'

/**
 * "İl başına bir DENEYAP oluştur" — ONAYLI araç.
 *
 * Mevcut veriyi taşımak için KÖR MIGRATION yazılmadı: `il` ≠ DENEYAP. Altı
 * DENEYAP'lı bir il için tek uydurma kayıt üretmek yanlış veri olurdu ve
 * kimse bunu fark etmezdi. Bunun yerine kullanıcı önce ne olacağını görüyor
 * (`GET` = önizleme), sonra onaylıyor (`POST` = uygula).
 *
 * Araç yalnızca görevlerde FİİLEN kullanılan illeri baz alır ve o il için
 * zaten bir DENEYAP varsa atlar. Görevleri BAĞLAMAZ — sadece kayıtları
 * oluşturur; hangi görevin hangi DENEYAP'a ait olduğu insan kararıdır.
 */

async function analizEt(admin: ReturnType<typeof Object>, orgId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any

  const [{ data: gorevler }, { data: mevcutlar }] = await Promise.all([
    db.from('tasks').select('il').eq('organization_id', orgId).not('il', 'is', null),
    db.from('deneyaplar').select('id, ad, il').eq('organization_id', orgId),
  ])

  const varOlanIller = new Set(
    ((mevcutlar ?? []) as { il: string }[]).map(d => trFold(d.il)),
  )
  const varOlanAdlar = new Set(
    ((mevcutlar ?? []) as { ad: string }[]).map(d => trFold(d.ad)),
  )

  const sayac = new Map<string, number>()
  for (const g of (gorevler ?? []) as { il: string | null }[]) {
    if (!g.il) continue
    // "Genel Merkez" gibi birimler il değil — DENEYAP olamaz, atlanır.
    if (!ilGecerliMi(g.il)) continue
    sayac.set(g.il, (sayac.get(g.il) ?? 0) + 1)
  }

  const olusturulacak: { il: string; ad: string; gorevSayisi: number }[] = []
  const atlanacak: { il: string; neden: string }[] = []

  for (const [il, gorevSayisi] of sayac) {
    if (varOlanIller.has(trFold(il))) {
      atlanacak.push({ il, neden: 'Bu ilde zaten bir DENEYAP var' })
      continue
    }
    const ad = `${il} DENEYAP`
    if (varOlanAdlar.has(trFold(ad))) {
      atlanacak.push({ il, neden: `"${ad}" adı zaten kullanılıyor` })
      continue
    }
    olusturulacak.push({ il, ad, gorevSayisi })
  }

  olusturulacak.sort((a, b) => b.gorevSayisi - a.gorevSayisi)
  return { olusturulacak, atlanacak }
}

/** GET — önizleme. Hiçbir şey yazmaz. */
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const y = await orgYetkiCoz(req, { slug: params.slug, gerekli: 'yazma' })
  if (!y.ok) return y.res
  return NextResponse.json(await analizEt(y.yetki.admin, y.yetki.org.id))
}

/** POST — uygula. Önizlemeyi yeniden hesaplar; istemciden gelen listeye güvenmez. */
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const y = await orgYetkiCoz(req, { slug: params.slug, gerekli: 'yazma' })
  if (!y.ok) return y.res
  const { org, admin, user } = y.yetki

  // İstemci "şunları oluştur" diyemiyor: sunucu listeyi kendi çıkarıyor.
  // Aksi halde onay ekranında görülenden farklı kayıtlar oluşabilirdi.
  const { olusturulacak } = await analizEt(admin, org.id)
  if (olusturulacak.length === 0) {
    return NextResponse.json({ olusturulan: 0, deneyaplar: [] })
  }

  const { data, error } = await admin
    .from('deneyaplar')
    .insert(olusturulacak.map(o => ({
      organization_id: org.id,
      ad: o.ad,
      il: o.il,
      notlar: 'İl başına bir DENEYAP aracıyla oluşturuldu.',
      created_by: user.id,
    })))
    .select()

  if (error) {
    console.error('[deneyaplar il-basina POST]', error)
    return NextResponse.json({ error: 'DENEYAP kayıtları oluşturulamadı.' }, { status: 500 })
  }

  return NextResponse.json({ olusturulan: data?.length ?? 0, deneyaplar: data ?? [] })
}
