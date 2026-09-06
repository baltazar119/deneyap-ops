import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { orgYetkiCoz, type OrgYetki } from '@/lib/server/apiAuth'
import { rateLimit } from '@/lib/rateLimit'
import { tabloOku, TabloHatasi, LIMITLER } from '@/lib/import/tabloOku'
import { otomatikEsle, eksikZorunluAlanlar, type Esleme } from '@/lib/import/columnMap'
import { satirIsle, type UyeOzeti, type IsleSecenekleri } from '@/lib/import/satirIsle'
import type { DeneyapAdayi } from '@/lib/import/normalize'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * POST /api/org/[slug]/import/onizleme
 *
 * Dosyayı ayrıştırır, doğrular ve sonucu `import_rows`'a yazar —
 * ama `tasks` tablosuna HİÇBİR ŞEY yazmaz.
 *
 * Satırların kalıcı olarak saklanması bilinçli: `uygula` adımı dosyayı
 * yeniden ayrıştırmaz, doğrudan bu satırları kullanır. Böylece kullanıcının
 * önizlemede onayladığı veri ile yazılan veri bit bit aynı olur.
 */

const ONIZLEME_SATIR_SINIRI = 500

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const y = await orgYetkiCoz(req, { slug: params.slug, gerekli: 'yazma' })
  if (!y.ok) return y.res
  const { yetki } = y

  const rl = await rateLimit(`import:onizleme:${yetki.user.id}`, 30, 10 * 60 * 1000)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Çok fazla deneme. Birkaç dakika sonra tekrar deneyin.' }, { status: 429 })
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Dosya alınamadı. Dosya çok büyük olabilir.' }, { status: 413 })
  }

  const dosya = form.get('dosya')
  if (!(dosya instanceof File)) {
    return NextResponse.json({ error: 'Dosya bulunamadı.' }, { status: 400 })
  }
  if (dosya.size > LIMITLER.dosyaBoyutu) {
    return NextResponse.json({
      error: `Dosya çok büyük (${Math.round(dosya.size / 1024 / 1024)} MB). Üst sınır ${LIMITLER.dosyaBoyutu / 1024 / 1024} MB.`,
    }, { status: 413 })
  }

  const sayfa        = (form.get('sayfa') as string) || undefined
  const baslikSatiri = Number(form.get('baslikSatiri')) || 1
  const eslemeGiris  = jsonCoz<Esleme>(form.get('esleme'))
  const secenekler   = jsonCoz<IsleSecenekleri & { mod?: string }>(form.get('secenekler')) ?? {}

  const buf = new Uint8Array(await dosya.arrayBuffer())

  /* ── Dosyayı oku ──────────────────────────────────────────────────────── */
  let tablo
  try {
    tablo = await tabloOku(dosya.name, buf, { sayfa, baslikSatiri })
  } catch (e) {
    const mesaj = e instanceof TabloHatasi ? e.message : 'Dosya okunamadı.'
    return NextResponse.json({ error: mesaj }, { status: 400 })
  }

  /* ── Sütun eşlemesi ───────────────────────────────────────────────────── */
  const { data: onceki } = await yetki.admin
    .from('import_column_presets')
    .select('esleme')
    .eq('organization_id', yetki.org.id)
    .maybeSingle()

  const oneriler = otomatikEsle(tablo.basliklar, (onceki?.esleme as Esleme) ?? undefined)
  const esleme: Esleme = eslemeGiris
    ?? Object.fromEntries(oneriler.map(o => [o.sutun, o.alan]))

  const eksikler = eksikZorunluAlanlar(esleme)

  /* ── Üyeler (sorumlu eşleme için) ─────────────────────────────────────── */
  const uyeler = await uyeleriGetir(yetki)

  /* ── DENEYAP'lar (birim eşleme için) ──────────────────────────────────── */
  // Kapatılmışlar da çekilir: geçmiş veri aktarılırken kapalı bir birimin
  // adı BİREBİR yazılmışsa normDeneyap onu kabul eder (yakın yazımla değil).
  const deneyaplar = await deneyaplariGetir(yetki)

  /* ── Satırları işle ───────────────────────────────────────────────────── */
  const islenmis = tablo.satirlar.map(ham =>
    satirIsle(ham, esleme, uyeler, { ...secenekler, deneyaplar }))

  // Dosya içinde aynı anahtarın tekrarı — ikincisi birincisini ezerdi
  const gorulen = new Set<string>()
  const dosyaIciTekrar: number[] = []
  islenmis.forEach((r, i) => {
    if (r.hatalar.length) return
    if (gorulen.has(r.eslestirmeAnahtari)) dosyaIciTekrar.push(tablo.satirNolari[i])
    else gorulen.add(r.eslestirmeAnahtari)
  })

  /* ── Mevcut görevlerle eşleşme ────────────────────────────────────────── */
  const disAnahtarlar = islenmis.map(r => r.normalize?.external_key).filter(Boolean) as string[]
  const parmakIzleri  = islenmis.filter(r => !r.normalize?.external_key).map(r => r.eslestirmeAnahtari)

  const mevcutAnahtarlar = new Set<string>()
  if (disAnahtarlar.length) {
    const { data } = await yetki.admin.from('tasks')
      .select('external_key').eq('organization_id', yetki.org.id).in('external_key', disAnahtarlar)
    ;(data ?? []).forEach((t: { external_key: string }) => mevcutAnahtarlar.add(t.external_key))
  }
  if (parmakIzleri.length) {
    const { data } = await yetki.admin.from('tasks')
      .select('import_fingerprint').eq('organization_id', yetki.org.id).in('import_fingerprint', parmakIzleri)
    ;(data ?? []).forEach((t: { import_fingerprint: string }) => mevcutAnahtarlar.add(t.import_fingerprint))
  }

  /* ── Aynı dosya daha önce yüklendi mi ─────────────────────────────────── */
  const hash = createHash('sha256').update(buf).digest('hex')
  const { data: oncekiParti } = await yetki.admin
    .from('import_batches')
    .select('id, created_at, olusturulan, guncellenen')
    .eq('organization_id', yetki.org.id)
    .eq('dosya_hash', hash)
    .eq('durum', 'tamamlandi')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  /* ── Partiyi kaydet ───────────────────────────────────────────────────── */
  const gecerli = islenmis.filter(r => !r.hatalar.length).length
  const hatali  = islenmis.length - gecerli

  const { data: parti, error: partiHata } = await yetki.admin
    .from('import_batches')
    .insert({
      organization_id: yetki.org.id,
      created_by: yetki.user.id,
      kaynak: dosya.name.toLowerCase().endsWith('.csv') ? 'csv' : 'excel',
      dosya_adi: dosya.name,
      dosya_boyutu: dosya.size,
      dosya_hash: hash,
      esleme,
      secenekler,
      durum: 'onizleme',
      satir_sayisi: islenmis.length,
      hatali,
    })
    .select('id')
    .single()

  if (partiHata || !parti) {
    console.error('[import/onizleme] parti kaydedilemedi:', partiHata)
    return NextResponse.json({ error: 'İçe aktarma başlatılamadı.' }, { status: 500 })
  }

  const satirKayitlari = islenmis.map((r, i) => ({
    batch_id: parti.id,
    satir_no: tablo.satirNolari[i],
    ham: tablo.satirlar[i] as Record<string, unknown>,
    normalize_veri: r.normalize,
    eslesme_anahtari: r.eslestirmeAnahtari,
    eylem: r.hatalar.length ? 'hatali' : 'bekliyor',
    hatalar: r.hatalar,
    uyarilar: r.uyarilar,
  }))

  // 1000'lik yığınlar — PostgREST tek istekte çok satırda zorlanıyor
  for (let i = 0; i < satirKayitlari.length; i += 1000) {
    const { error } = await yetki.admin.from('import_rows').insert(satirKayitlari.slice(i, i + 1000))
    if (error) {
      console.error('[import/onizleme] satır kaydı hatası:', error)
      await yetki.admin.from('import_batches').delete().eq('id', parti.id)
      return NextResponse.json({ error: 'Satırlar kaydedilemedi.' }, { status: 500 })
    }
  }

  /* ── Yanıt ────────────────────────────────────────────────────────────── */
  const eslesen = islenmis.filter(r => !r.hatalar.length && mevcutAnahtarlar.has(r.eslestirmeAnahtari)).length

  // Tanınmayan DENEYAP adları — önizlemede "Oluştur / Eşleştir / Yok say"
  // paneline kaynaklık eder. Satırlar bu yüzden REDDEDİLMEZ.
  // Ada karşılık: kaç satırda geçtiği + o satırlardan çıkan il önerisi.
  // İl önerisi olmadan kullanıcı her DENEYAP için ili elle seçmek zorunda
  // kalır; dosyada il sütunu varsa cevap zaten elimizde.
  const taninmayanDeneyaplar = new Map<string, { adet: number; onerilenIl: string | null }>()
  islenmis.forEach(r => {
    if (!r.yeniDeneyapAdi) return
    const mevcut = taninmayanDeneyaplar.get(r.yeniDeneyapAdi)
    const ilAdayi = r.normalize?.il ?? null
    if (mevcut) {
      mevcut.adet += 1
      if (!mevcut.onerilenIl && ilAdayi) mevcut.onerilenIl = ilAdayi
    } else {
      taninmayanDeneyaplar.set(r.yeniDeneyapAdi, { adet: 1, onerilenIl: ilAdayi })
    }
  })

  const eslesmeyenSorumlular = new Map<string, number>()
  islenmis.forEach(r => {
    if (r.eslesmeyenSorumlu) {
      eslesmeyenSorumlular.set(r.eslesmeyenSorumlu, (eslesmeyenSorumlular.get(r.eslesmeyenSorumlu) ?? 0) + 1)
    }
  })

  const varsayimlar = [...tablo.varsayimlar]
  varsayimlar.push('Tarihler gün.ay.yıl olarak okundu (03.04.2026 = 3 Nisan 2026).')
  varsayimlar.push(
    disAnahtarlar.length
      ? 'Eşleştirme "Kod / Referans" sütununa göre yapılıyor.'
      : 'Eşleştirme "Görev Başlığı + İl" ikilisine göre yapılıyor — bunlardan biri değişirse yeni görev oluşur.',
  )

  return NextResponse.json({
    batchId: parti.id,
    dosya: {
      ad: dosya.name,
      satirSayisi: islenmis.length,
      sayfalar: tablo.sayfalar,
      secilenSayfa: tablo.secilenSayfa,
    },
    basliklar: tablo.basliklar,
    esleme,
    oneriler,
    eksikZorunlu: eksikler.map(a => a.label),
    varsayimlar,
    oncekiYukleme: oncekiParti
      ? { tarih: oncekiParti.created_at, batchId: oncekiParti.id }
      : null,
    ozet: {
      toplam: islenmis.length,
      gecerli,
      hatali,
      uyarili: islenmis.filter(r => !r.hatalar.length && r.uyarilar.length).length,
      eslesen,
      yeni: gecerli - eslesen,
      dosyaIciTekrar: dosyaIciTekrar.length,
    },
    eslesmeyenSorumlular: [...eslesmeyenSorumlular.entries()].map(([ham, adet]) => ({ ham, adet })),
    taninmayanDeneyaplar: [...taninmayanDeneyaplar.entries()]
      .map(([ad, v]) => ({ ad, adet: v.adet, onerilenIl: v.onerilenIl }))
      .sort((a, b) => b.adet - a.adet),
    satirlar: islenmis.slice(0, ONIZLEME_SATIR_SINIRI).map((r, i) => ({
      satirNo: tablo.satirNolari[i],
      ham: tablo.satirlar[i],
      normalize: r.normalize,
      hatalar: r.hatalar,
      uyarilar: r.uyarilar,
      eslesiyor: !r.hatalar.length && mevcutAnahtarlar.has(r.eslestirmeAnahtari),
      belirsizSorumlu: r.belirsizSorumlu,
    })),
    satirKirpildi: islenmis.length > ONIZLEME_SATIR_SINIRI,
  })
}

/* ── Yardımcılar ─────────────────────────────────────────────────────────── */

function jsonCoz<T>(v: FormDataEntryValue | null): T | undefined {
  if (typeof v !== 'string' || !v.trim()) return undefined
  try { return JSON.parse(v) as T } catch { return undefined }
}

async function deneyaplariGetir(yetki: OrgYetki): Promise<DeneyapAdayi[]> {
  const { data } = await yetki.admin
    .from('deneyaplar')
    .select('id, ad, il, kod, aktif')
    .eq('organization_id', yetki.org.id)

  return (data ?? []) as DeneyapAdayi[]
}

async function uyeleriGetir(yetki: OrgYetki): Promise<UyeOzeti[]> {
  const { data: uyelikler } = await yetki.admin
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', yetki.org.id)

  const ids = (uyelikler ?? []).map((u: { user_id: string }) => u.user_id)
  if (!ids.length) return []

  const { data: profiller } = await yetki.admin
    .from('profiles')
    .select('id, full_name, email')
    .in('id', ids)

  return (profiller ?? []).map((p: { id: string; full_name: string | null; email: string | null }) => ({
    id: p.id, adSoyad: p.full_name, email: p.email,
  }))
}
