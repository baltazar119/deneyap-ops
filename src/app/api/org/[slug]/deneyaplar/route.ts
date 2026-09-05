import { NextRequest, NextResponse } from 'next/server'
import { orgYetkiCoz } from '@/lib/server/apiAuth'
import { ilGecerliMi } from '@/lib/iller'
import type { Deneyap } from '@/types/database'

export const dynamic = 'force-dynamic'

/**
 * DENEYAP birimleri — TEK YAZMA YOLU.
 *
 * Okuma RLS üzerinden istemciden de yapılabilir (`useDeneyaplar`), ama yazma
 * buradan geçer: ad çakışması, il doğrulaması ve "il değiştirilemez" kuralı
 * kullanıcıya anlaşılır Türkçe hata olarak dönsün diye. DB kısıtları yine de
 * son savunma hattı olarak duruyor — bu uç onların yerine geçmiyor, önüne
 * geçiyor.
 */

/**
 * Migration 060 henüz uygulanmamış mı?
 *
 * İKİ KOD birden kontrol ediliyor: PostgREST kendi şema önbelleğinden
 * baktığı için `PGRST205` döndürüyor (ölçüldü), doğrudan SQL yolunda ise
 * Postgres'in `42P01` ("relation does not exist") kodu gelir. Yalnızca
 * 42P01'e bakan bir kontrol bu ekranda hiç tetiklenmez ve kullanıcı
 * sebebini söylemeyen genel bir hata görür.
 */
function tabloYokMu(error: { code?: string } | null): boolean {
  return error?.code === 'PGRST205' || error?.code === '42P01'
}

const TABLO_YOK_MESAJI =
  "DENEYAP tablosu henüz oluşturulmamış. Supabase > SQL Editor'da " +
  'supabase/uygula/faz3_deneyap.sql dosyasını çalıştırın.'

function metin(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t : null
}

/** GET — org'un DENEYAP'ları + her birinin açık görev sayısı. */
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const y = await orgYetkiCoz(req, { slug: params.slug, gerekli: 'uye' })
  if (!y.ok) return y.res
  const { org, admin } = y.yetki

  const { data: deneyaplar, error } = await admin
    .from('deneyaplar')
    .select('*')
    .eq('organization_id', org.id)
    .order('il')
    .order('ad')

  if (error) {
    if (tabloYokMu(error)) {
      return NextResponse.json({ error: TABLO_YOK_MESAJI, migrationGerekli: true }, { status: 503 })
    }
    console.error('[deneyaplar GET]', error)
    return NextResponse.json({ error: 'DENEYAP listesi alınamadı.' }, { status: 500 })
  }

  // Açık görev sayısı: kapatma kararını verirken "burada hâlâ iş var mı"
  // sorusunun cevabı gerekiyor.
  const { data: acikGorevler } = await admin
    .from('tasks')
    .select('deneyap_id')
    .eq('organization_id', org.id)
    .neq('status', 'done')
    .not('deneyap_id', 'is', null)

  const sayilar: Record<string, number> = {}
  for (const g of (acikGorevler ?? []) as { deneyap_id: string }[]) {
    sayilar[g.deneyap_id] = (sayilar[g.deneyap_id] ?? 0) + 1
  }

  return NextResponse.json({ deneyaplar: deneyaplar ?? [], acikGorevSayilari: sayilar })
}

/** POST — yeni DENEYAP. */
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const y = await orgYetkiCoz(req, { slug: params.slug, gerekli: 'yazma' })
  if (!y.ok) return y.res
  const { org, admin, user } = y.yetki

  const govde = await req.json().catch(() => ({}))
  const ad = metin(govde.ad)
  const il = metin(govde.il)

  if (!ad) return NextResponse.json({ error: 'DENEYAP adı zorunlu.' }, { status: 400 })
  // İl gerçek bir il olmalı: harita ve il kırılımı buna göre topluyor,
  // "Genel Merkez" gibi birimler DENEYAP olamaz.
  if (!il || !ilGecerliMi(il)) {
    return NextResponse.json({ error: 'Geçerli bir il seçilmeli.' }, { status: 400 })
  }

  const { data, error } = await admin
    .from('deneyaplar')
    .insert({
      organization_id: org.id,
      ad, il,
      ilce:   metin(govde.ilce),
      kod:    metin(govde.kod),
      adres:  metin(govde.adres),
      notlar: metin(govde.notlar),
      created_by: user.id,
    })
    .select()
    .single()

  if (error) {
    // 23505 = unique ihlali → 060'taki (organization_id, tr_fold(ad)) kısıtı
    if (error.code === '23505') {
      return NextResponse.json(
        { error: `"${ad}" adında bir DENEYAP zaten var.` },
        { status: 409 },
      )
    }
    if (tabloYokMu(error)) {
      return NextResponse.json({ error: TABLO_YOK_MESAJI, migrationGerekli: true }, { status: 503 })
    }
    console.error('[deneyaplar POST]', error)
    return NextResponse.json({ error: 'DENEYAP oluşturulamadı.' }, { status: 500 })
  }

  return NextResponse.json({ deneyap: data as Deneyap }, { status: 201 })
}

/** PATCH — düzenleme ve açma/kapatma. `il` DEĞİŞTİRİLEMEZ. */
export async function PATCH(req: NextRequest, { params }: { params: { slug: string } }) {
  const y = await orgYetkiCoz(req, { slug: params.slug, gerekli: 'yazma' })
  if (!y.ok) return y.res
  const { org, admin } = y.yetki

  const govde = await req.json().catch(() => ({}))
  const id = metin(govde.id)
  if (!id) return NextResponse.json({ error: 'DENEYAP id gerekli.' }, { status: 400 })

  // Kayıt bu org'a mı ait — çapraz-org düzenlemeyi burada kesiyoruz.
  const { data: mevcut } = await admin
    .from('deneyaplar')
    .select('id, il')
    .eq('id', id)
    .eq('organization_id', org.id)
    .maybeSingle()

  if (!mevcut) return NextResponse.json({ error: 'DENEYAP bulunamadı.' }, { status: 404 })

  // DB trigger'ı da engelliyor (061); buradaki kontrol kullanıcıya
  // gerekçesiyle birlikte anlaşılır bir mesaj vermek için.
  const yeniIl = metin(govde.il)
  if (yeniIl && yeniIl !== (mevcut as { il: string }).il) {
    return NextResponse.json({
      error: 'DENEYAP\'ın ili değiştirilemez. Yanlışsa bu DENEYAP\'ı kapatıp doğru ille yenisini açın — il değişikliği Excel içe aktarma parmak izini bozar ve aynı dosya tekrar yüklendiğinde kopya görev oluşturur.',
    }, { status: 400 })
  }

  const guncelleme: Record<string, unknown> = {}
  if (govde.ad !== undefined) {
    const ad = metin(govde.ad)
    if (!ad) return NextResponse.json({ error: 'DENEYAP adı boş olamaz.' }, { status: 400 })
    guncelleme.ad = ad
  }
  for (const alan of ['ilce', 'kod', 'adres', 'notlar'] as const) {
    if (govde[alan] !== undefined) guncelleme[alan] = metin(govde[alan])
  }
  if (typeof govde.aktif === 'boolean') guncelleme.aktif = govde.aktif

  if (Object.keys(guncelleme).length === 0) {
    return NextResponse.json({ error: 'Değişiklik yok.' }, { status: 400 })
  }

  const { data, error } = await admin
    .from('deneyaplar')
    .update(guncelleme)
    .eq('id', id)
    .eq('organization_id', org.id)
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Bu adda bir DENEYAP zaten var.' }, { status: 409 })
    }
    console.error('[deneyaplar PATCH]', error)
    return NextResponse.json({ error: 'DENEYAP güncellenemedi.' }, { status: 500 })
  }

  return NextResponse.json({ deneyap: data as Deneyap })
}

// DELETE BİLEREK YOK: kayıt silinmiyor, PATCH ile `aktif: false` yapılıyor.
// Kapatılan DENEYAP'a bağlı görevlerin geçmişi korunmalı.
