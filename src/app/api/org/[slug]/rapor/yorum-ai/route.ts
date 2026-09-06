import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'
import { aiYetkiCoz } from '@/lib/server/apiAuth'
import { AI_DAILY_LIMITS } from '@/lib/featureGate'
import { raporVerisi } from '@/lib/rapor/veri'
import { donemCoz, type DonemAnahtari } from '@/lib/rapor/donem'
import { riskGorebilirMi } from '@/lib/roller'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Rapor yorumunu AI ile derinleştirir — İSTEĞE BAĞLI katman.
 *
 * Kural tabanlı yorumlar (lib/yorum) her zaman ekranda. Bu uç yalnızca
 * onların üstüne bir bağlam ekler. Hata, kota aşımı veya anahtar yokluğu
 * durumunda ekran BOZULMAZ; yalnızca bu kart gelmez.
 *
 * İKİ GÜVENLİK KURALI:
 *
 * 1. SUNUCU VERİYİ YENİDEN HESAPLAR. İstemciden gelen sayıya asla güvenilmez;
 *    aksi halde biri gövdeye istediği rakamı koyup AI'ya istediği yorumu
 *    söyletebilirdi.
 *
 * 2. AI'YA ROL KAPSAMI UYGULANMIŞ VERİ GİDER. `raporVerisi` zaten
 *    `raporKapsami` ile süzüyor; Yetkili Yönetici için kişi adları veride
 *    hiç yok, dolayısıyla prompt'a da giremez.
 */

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  let govde: { donem?: string; orgId?: string } = {}
  try { govde = await req.json() } catch { /* boş gövde kabul */ }

  // Rapor yorumu hiçbir şey YAZMIYOR; salt okunur roller de kullanabilmeli.
  // Bilinçli yetki genişletmesi — bkz. apiAuth.ts:aiYetkiCoz
  const y = await aiYetkiCoz(req, govde.orgId, { gerekli: 'uye' })
  if (!y.ok) return y.res
  const { userId, orgId, yetki, admin } = y

    // riskGorebilirMi: owner+admin+viewer+member. Il Sorumlusu da kendi ilinin
  // raporunu aliyor, dolayisiyla yorumunu da alabilmeli. Danisman haric.
  if (!riskGorebilirMi(yetki.rol)) {
    return NextResponse.json({ error: 'Bu rol rapor yorumu alamaz.' }, { status: 403 })
  }

  /* ── Kota ── */
  const gunBasi = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z')
  const { count } = await admin
    .from('ai_usage_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('action', 'rapor_yorum')
    .gte('created_at', gunBasi.toISOString())

  if ((count ?? 0) >= AI_DAILY_LIMITS.raporYorum) {
    return NextResponse.json(
      { error: `Günlük yorum limitine ulaşıldı (${AI_DAILY_LIMITS.raporYorum}/gün).` },
      { status: 429 },
    )
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'AI yapılandırılmamış.' }, { status: 503 })
  }

  /* ── Veri: SUNUCUDA yeniden hesaplanır ── */
  const donem = donemCoz((govde.donem ?? 'bu-ay') as DonemAnahtari)
  const v = await raporVerisi(yetki, donem)

  const baglam = {
    donem: v.meta.donem.etiket,
    kapsam: v.meta.kapsamEtiketi,
    kpi: v.kpi,
    iller: v.ilKirilimi.slice(0, 10).map(i => ({
      il: i.il, toplam: i.toplam, tamamlanan: i.tamamlanan, geciken: i.geciken, oran: i.oran,
    })),
    egilim: v.trend?.noktalar.slice(-12).map(n => ({
      donem: n.etiket, acik: n.acik, geciken: n.geciken, tamamlanan: n.tamamlanan,
    })) ?? [],
    karsilastirma: v.trend?.karsilastirma ?? null,
    // Kural tabanlı yorumlar prompt'a giriyor ki AI onlarla ÇELİŞMESİN
    mevcutYorumlar: v.yorum?.maddeler.map(m => m.cumle) ?? [],
  }

  const prompt = `Sen bir operasyon analistisin. Aşağıdaki DENEYAP OYS rapor verisini yorumla.

VERİ:
${JSON.stringify(baglam, null, 2)}

KURALLAR — hepsine uy:
- YALNIZCA verilen sayıları kullan. Yeni sayı UYDURMA, hesaplama yapma.
- "Mevcut yorumlar" listesindeki tespitlerle ÇELİŞME; onların üstüne bağlam ekle.
- Verilmeyen bir kişi ya da il adı KULLANMA.
- En fazla 4 madde. Her madde tek cümle, en fazla 25 kelime.
- Türkçe yaz. Emir kipinden kaçın, gözlem ve öneri dili kullan.
- Elinde yeterli veri yoksa az madde üret; doldurmak için madde uydurma.

YALNIZCA bu JSON'u döndür:
{"maddeler": ["<madde 1>", "<madde 2>"]}`

  try {
    const ai = new GoogleGenAI({ apiKey })
    const sonuc = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { temperature: 0.3, responseMimeType: 'application/json', maxOutputTokens: 800 },
    })

    const ham = (sonuc.text ?? '').trim()
    const eslesme = ham.match(/\{[\s\S]*\}/)
    if (!eslesme) {
      return NextResponse.json({ error: 'AI yanıtı işlenemedi.' }, { status: 422 })
    }

    const cozulen = JSON.parse(eslesme[0]) as { maddeler?: unknown }
    const maddeler = Array.isArray(cozulen.maddeler)
      ? cozulen.maddeler.map(String).filter(x => x.trim()).slice(0, 4)
      : []

    if (!maddeler.length) {
      return NextResponse.json({ error: 'AI ek bir yorum üretmedi.' }, { status: 422 })
    }

    await admin.from('ai_usage_logs').insert({
      user_id: userId, organization_id: orgId, action: 'rapor_yorum',
    })

    return NextResponse.json({ maddeler })
  } catch (err) {
    console.error('[rapor/yorum-ai] hata:', err)
    const mesaj = err instanceof Error ? err.message : ''
    if (mesaj.includes('RESOURCE_EXHAUSTED') || mesaj.includes('quota')) {
      return NextResponse.json({ error: 'AI kotası doldu, birkaç dakika sonra deneyin.' }, { status: 429 })
    }
    return NextResponse.json({ error: 'AI yorumu alınamadı.' }, { status: 500 })
  }
}
