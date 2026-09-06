import { NextRequest, NextResponse } from 'next/server'
import { orgYetkiCoz } from '@/lib/server/apiAuth'
import { tanimDogrula } from '@/lib/form/dogrula'
import type { Form } from '@/lib/form/tipler'

export const dynamic = 'force-dynamic'

/**
 * Form tanımları.
 *
 * OLUŞTURMA her org üyesine açık (kullanıcı kararı: İl Sorumlusu da form
 * hazırlayabilsin). DÜZENLEME/SİLME yalnızca formun sahibinde ya da
 * yöneticide — bir İl Sorumlusu başkasının formunu değiştirememeli. Aynı
 * kural RLS'te de var; buradaki kontrol kullanıcıya anlaşılır mesaj vermek
 * için.
 */

const ONCELIKLER = ['critical', 'high', 'normal', 'low']
const ERISIMLER = ['uyeler', 'baglanti']
const ATANAN_KAYNAKLARI = ['gonderen', 'yanitlayan', 'sabit']

function metin(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t : null
}

function tabloYokMu(e: { code?: string } | null): boolean {
  return e?.code === 'PGRST205' || e?.code === '42P01'
}

const TABLO_YOK =
  "Form tabloları henüz oluşturulmamış. Supabase > SQL Editor'da " +
  'supabase/migrations/066_formlar.sql dosyasını çalıştırın.'

/** GET — org'un formları + gönderim/yanıt sayıları. */
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const y = await orgYetkiCoz(req, { slug: params.slug, gerekli: 'uye' })
  if (!y.ok) return y.res
  const { org, admin } = y.yetki

  const { data, error } = await admin
    .from('formlar')
    .select('*')
    .eq('organization_id', org.id)
    .order('created_at', { ascending: false })

  if (error) {
    if (tabloYokMu(error)) {
      return NextResponse.json({ error: TABLO_YOK, migrationGerekli: true }, { status: 503 })
    }
    console.error('[formlar GET]', error)
    return NextResponse.json({ error: 'Formlar alınamadı.' }, { status: 500 })
  }

  const { data: gonderimler } = await admin
    .from('form_gonderimleri')
    .select('form_id, durum')
    .eq('organization_id', org.id)

  const sayilar: Record<string, { gonderim: number; yanit: number }> = {}
  for (const g of (gonderimler ?? []) as { form_id: string; durum: string }[]) {
    const s = sayilar[g.form_id] ?? { gonderim: 0, yanit: 0 }
    s.gonderim++
    if (g.durum === 'yanitlandi') s.yanit++
    sayilar[g.form_id] = s
  }

  return NextResponse.json({ formlar: data ?? [], sayilar })
}

function govdeAlanlari(govde: Record<string, unknown>) {
  const erisim = metin(govde.erisim) ?? 'uyeler'
  const oncelik = metin(govde.sonraki_gorev_oncelik) ?? 'normal'
  const kaynak = metin(govde.sonraki_gorev_atanan_kaynak) ?? 'gonderen'
  const terminGun = Number(govde.sonraki_gorev_termin_gun)

  return {
    baslik: metin(govde.baslik),
    aciklama: metin(govde.aciklama),
    erisim: ERISIMLER.includes(erisim) ? erisim : 'uyeler',
    yayinda: govde.yayinda === true,
    sonraki_gorev_aktif: govde.sonraki_gorev_aktif === true,
    sonraki_gorev_baslik: metin(govde.sonraki_gorev_baslik),
    sonraki_gorev_aciklama: metin(govde.sonraki_gorev_aciklama),
    sonraki_gorev_oncelik: ONCELIKLER.includes(oncelik) ? oncelik : 'normal',
    sonraki_gorev_tur: metin(govde.sonraki_gorev_tur) ?? 'other',
    sonraki_gorev_termin_gun:
      Number.isFinite(terminGun) && terminGun >= 0 ? Math.min(Math.floor(terminGun), 365) : null,
    sonraki_gorev_atanan_kaynak: ATANAN_KAYNAKLARI.includes(kaynak) ? kaynak : 'gonderen',
    sonraki_gorev_atanan_id: kaynak === 'sabit' ? metin(govde.sonraki_gorev_atanan_id) : null,
  }
}

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const y = await orgYetkiCoz(req, { slug: params.slug, gerekli: 'uye' })
  if (!y.ok) return y.res
  const { org, admin, user } = y.yetki

  const govde = await req.json().catch(() => ({}))
  const alanlar = govdeAlanlari(govde)
  if (!alanlar.baslik) return NextResponse.json({ error: 'Form başlığı zorunlu.' }, { status: 400 })

  const { alanlar: sorular, hatalar } = tanimDogrula(govde.alanlar)
  if (hatalar.length) {
    return NextResponse.json({ error: hatalar[0].mesaj, hatalar }, { status: 400 })
  }
  // Sonraki görev açıksa başlığı da olmalı; yoksa başlıksız görev üretirdi.
  if (alanlar.sonraki_gorev_aktif && !alanlar.sonraki_gorev_baslik) {
    return NextResponse.json({ error: 'Sonraki görev açıkken başlık şablonu zorunlu.' }, { status: 400 })
  }

  const { data, error } = await admin
    .from('formlar')
    .insert({ ...alanlar, alanlar: sorular, organization_id: org.id, created_by: user.id })
    .select()
    .single()

  if (error) {
    if (tabloYokMu(error)) {
      return NextResponse.json({ error: TABLO_YOK, migrationGerekli: true }, { status: 503 })
    }
    console.error('[formlar POST]', error)
    return NextResponse.json({ error: 'Form oluşturulamadı.' }, { status: 500 })
  }
  return NextResponse.json({ form: data as Form }, { status: 201 })
}

export async function PATCH(req: NextRequest, { params }: { params: { slug: string } }) {
  const y = await orgYetkiCoz(req, { slug: params.slug, gerekli: 'uye' })
  if (!y.ok) return y.res
  const { org, admin, user, rol } = y.yetki

  const govde = await req.json().catch(() => ({}))
  const id = metin(govde.id)
  if (!id) return NextResponse.json({ error: 'Form id gerekli.' }, { status: 400 })

  const { data: mevcut } = await admin
    .from('formlar')
    .select('id, created_by')
    .eq('id', id)
    .eq('organization_id', org.id)
    .maybeSingle()
  if (!mevcut) return NextResponse.json({ error: 'Form bulunamadı.' }, { status: 404 })

  const yonetici = rol === 'owner' || rol === 'admin'
  if ((mevcut as { created_by: string | null }).created_by !== user.id && !yonetici) {
    return NextResponse.json({ error: 'Bu formu yalnızca oluşturan kişi veya yönetici düzenleyebilir.' }, { status: 403 })
  }

  const alanlar = govdeAlanlari(govde)
  if (!alanlar.baslik) return NextResponse.json({ error: 'Form başlığı zorunlu.' }, { status: 400 })
  const { alanlar: sorular, hatalar } = tanimDogrula(govde.alanlar)
  if (hatalar.length) return NextResponse.json({ error: hatalar[0].mesaj, hatalar }, { status: 400 })
  if (alanlar.sonraki_gorev_aktif && !alanlar.sonraki_gorev_baslik) {
    return NextResponse.json({ error: 'Sonraki görev açıkken başlık şablonu zorunlu.' }, { status: 400 })
  }

  const { data, error } = await admin
    .from('formlar')
    .update({ ...alanlar, alanlar: sorular })
    .eq('id', id)
    .eq('organization_id', org.id)
    .select()
    .single()

  if (error) {
    console.error('[formlar PATCH]', error)
    return NextResponse.json({ error: 'Form güncellenemedi.' }, { status: 500 })
  }
  return NextResponse.json({ form: data as Form })
}

export async function DELETE(req: NextRequest, { params }: { params: { slug: string } }) {
  const y = await orgYetkiCoz(req, { slug: params.slug, gerekli: 'uye' })
  if (!y.ok) return y.res
  const { org, admin, user, rol } = y.yetki

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Form id gerekli.' }, { status: 400 })

  const { data: mevcut } = await admin
    .from('formlar')
    .select('id, created_by')
    .eq('id', id)
    .eq('organization_id', org.id)
    .maybeSingle()
  if (!mevcut) return NextResponse.json({ error: 'Form bulunamadı.' }, { status: 404 })

  const yonetici = rol === 'owner' || rol === 'admin'
  if ((mevcut as { created_by: string | null }).created_by !== user.id && !yonetici) {
    return NextResponse.json({ error: 'Bu formu yalnızca oluşturan kişi veya yönetici silebilir.' }, { status: 403 })
  }

  // Gönderimler ve yanıtlar cascade ile gider — bu yüzden onay ekranında
  // "cevaplar da silinecek" uyarısı gösteriliyor.
  const { error } = await admin.from('formlar').delete().eq('id', id).eq('organization_id', org.id)
  if (error) {
    console.error('[formlar DELETE]', error)
    return NextResponse.json({ error: 'Form silinemedi.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
