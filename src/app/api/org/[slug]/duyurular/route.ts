import { NextRequest, NextResponse } from 'next/server'
import { orgYetkiCoz, type OrgYetki } from '@/lib/server/apiAuth'
import { duyuruHedefliyorMu } from '@/lib/duyuru'
import type { Duyuru, OrgRole } from '@/types/database'

export const dynamic = 'force-dynamic'

/**
 * Duyuru yönetimi — owner/admin (kullanıcı kararı: "Merkez Operasyon +
 * Koordinatör").
 */

const ONEMLER = ['kritik', 'onemli', 'normal'] as const

function metin(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t : null
}

/** Hedef dizileri: yalnızca metin, tekilleştirilmiş, boş elemansız. */
function dizi(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return [...new Set(v.filter((x): x is string => typeof x === 'string' && x.trim() !== ''))]
}

function tabloYokMu(e: { code?: string } | null): boolean {
  return e?.code === 'PGRST205' || e?.code === '42P01'
}

const TABLO_YOK =
  "Duyuru tabloları henüz oluşturulmamış. Supabase > SQL Editor'da " +
  'supabase/migrations/062_duyurular.sql dosyasını çalıştırın.'

/** GET — org'un tüm duyuruları (taslaklar dahil). Yönetim ekranı için. */
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const y = await orgYetkiCoz(req, { slug: params.slug, gerekli: 'yazma' })
  if (!y.ok) return y.res
  const { org, admin } = y.yetki

  const { data, error } = await admin
    .from('duyurular')
    .select('*')
    .eq('organization_id', org.id)
    .order('created_at', { ascending: false })

  if (error) {
    if (tabloYokMu(error)) {
      return NextResponse.json({ error: TABLO_YOK, migrationGerekli: true }, { status: 503 })
    }
    console.error('[duyurular GET]', error)
    return NextResponse.json({ error: 'Duyurular alınamadı.' }, { status: 500 })
  }

  // Okundu sayısı: "kaç kişiye ulaştı" yönetim ekranında görünmeli.
  const { data: okunanlar } = await admin
    .from('duyuru_okundu')
    .select('duyuru_id')
    .in('duyuru_id', (data ?? []).map((d: { id: string }) => d.id))

  const okunmaSayilari: Record<string, number> = {}
  for (const o of (okunanlar ?? []) as { duyuru_id: string }[]) {
    okunmaSayilari[o.duyuru_id] = (okunmaSayilari[o.duyuru_id] ?? 0) + 1
  }

  return NextResponse.json({ duyurular: data ?? [], okunmaSayilari })
}

function govdedenAlanlar(govde: Record<string, unknown>) {
  const onem = metin(govde.onem) ?? 'normal'
  return {
    baslik: metin(govde.baslik),
    icerik: metin(govde.icerik),
    onem: (ONEMLER as readonly string[]).includes(onem) ? onem : 'normal',
    hedef_roller: dizi(govde.hedef_roller),
    hedef_iller: dizi(govde.hedef_iller),
    hedef_deneyap_ids: dizi(govde.hedef_deneyap_ids),
    yayinda: govde.yayinda === true,
    baslangic_at: metin(govde.baslangic_at),
    bitis_at: metin(govde.bitis_at),
  }
}

/** POST — yeni duyuru. Yayına alınırsa hedef kitleye bildirim gider. */
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const y = await orgYetkiCoz(req, { slug: params.slug, gerekli: 'yazma' })
  if (!y.ok) return y.res
  const { org, admin, user } = y.yetki

  const alanlar = govdedenAlanlar(await req.json().catch(() => ({})))
  if (!alanlar.baslik) return NextResponse.json({ error: 'Başlık zorunlu.' }, { status: 400 })
  if (!alanlar.icerik) return NextResponse.json({ error: 'İçerik zorunlu.' }, { status: 400 })

  const { data, error } = await admin
    .from('duyurular')
    .insert({ ...alanlar, organization_id: org.id, created_by: user.id })
    .select()
    .single()

  if (error) {
    if (tabloYokMu(error)) {
      return NextResponse.json({ error: TABLO_YOK, migrationGerekli: true }, { status: 503 })
    }
    console.error('[duyurular POST]', error)
    return NextResponse.json({ error: 'Duyuru oluşturulamadı.' }, { status: 500 })
  }

  const duyuru = data as Duyuru
  if (duyuru.yayinda) await hedefKitleyeBildir(y.yetki, duyuru)

  return NextResponse.json({ duyuru }, { status: 201 })
}

/** PATCH — düzenleme. Taslaktan yayına geçişte bildirim gider. */
export async function PATCH(req: NextRequest, { params }: { params: { slug: string } }) {
  const y = await orgYetkiCoz(req, { slug: params.slug, gerekli: 'yazma' })
  if (!y.ok) return y.res
  const { org, admin } = y.yetki

  const govde = await req.json().catch(() => ({}))
  const id = metin(govde.id)
  if (!id) return NextResponse.json({ error: 'Duyuru id gerekli.' }, { status: 400 })

  const { data: mevcut } = await admin
    .from('duyurular')
    .select('id, yayinda')
    .eq('id', id)
    .eq('organization_id', org.id)
    .maybeSingle()

  if (!mevcut) return NextResponse.json({ error: 'Duyuru bulunamadı.' }, { status: 404 })

  const alanlar = govdedenAlanlar(govde)
  if (!alanlar.baslik) return NextResponse.json({ error: 'Başlık zorunlu.' }, { status: 400 })
  if (!alanlar.icerik) return NextResponse.json({ error: 'İçerik zorunlu.' }, { status: 400 })

  const { data, error } = await admin
    .from('duyurular')
    .update(alanlar)
    .eq('id', id)
    .eq('organization_id', org.id)
    .select()
    .single()

  if (error) {
    console.error('[duyurular PATCH]', error)
    return NextResponse.json({ error: 'Duyuru güncellenemedi.' }, { status: 500 })
  }

  // Bildirim YALNIZCA taslak→yayın geçişinde. Yayındaki bir duyuruda yazım
  // hatası düzeltmek herkese ikinci bir bildirim göndermemeli.
  const duyuru = data as Duyuru
  const oncekiYayinda = (mevcut as { yayinda: boolean }).yayinda
  if (duyuru.yayinda && !oncekiYayinda) await hedefKitleyeBildir(y.yetki, duyuru)

  return NextResponse.json({ duyuru })
}

/** DELETE — duyuruyu siler. Okundu kayıtları cascade ile gider. */
export async function DELETE(req: NextRequest, { params }: { params: { slug: string } }) {
  const y = await orgYetkiCoz(req, { slug: params.slug, gerekli: 'yazma' })
  if (!y.ok) return y.res
  const { org, admin } = y.yetki

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Duyuru id gerekli.' }, { status: 400 })

  const { error } = await admin
    .from('duyurular')
    .delete()
    .eq('id', id)
    .eq('organization_id', org.id)

  if (error) {
    console.error('[duyurular DELETE]', error)
    return NextResponse.json({ error: 'Duyuru silinemedi.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

/**
 * Hedef kitleye bildirim — ORG KAPSAMLI.
 *
 * `lib/notifications.ts:createNotificationForAll` BİLEREK kullanılmıyor: o
 * fonksiyon `profiles` tablosunun tamamını tarıyor ve org filtresi yok, yani
 * duyuru TÜM çalışma alanlarındaki herkese giderdi. Burada alıcılar
 * `organization_members`'tan çekiliyor ve hedefleme kuralı satır satır
 * uygulanıyor.
 */
async function hedefKitleyeBildir(yetki: OrgYetki, duyuru: Duyuru): Promise<void> {
  const { org, admin, user } = yetki

  const { data: uyeler, error } = await admin
    .from('organization_members')
    .select('user_id, role, il, deneyap_id')
    .eq('organization_id', org.id)

  if (error || !uyeler?.length) {
    if (error) console.error('[duyuru bildirim] üyeler alınamadı:', error)
    return
  }

  type Uye = { user_id: string; role: string; il: string | null; deneyap_id: string | null }
  const aliciIdler = (uyeler as Uye[])
    .filter(u => u.user_id !== user.id)   // duyuruyu yazana bildirim gitmez
    .filter(u => duyuruHedefliyorMu(duyuru, {
      role: u.role as OrgRole,
      il: u.il,
      deneyapId: u.deneyap_id,
    }))
    .map(u => u.user_id)

  if (aliciIdler.length === 0) return

  const { error: insertHatasi } = await admin.from('notifications').insert(
    aliciIdler.map(uid => ({
      user_id: uid,
      type: 'system',
      event_type: 'announcement',
      title: 'Yeni Duyuru',
      description: duyuru.baslik,
      actor_id: user.id,
      link: `/org/${org.slug}/duyurular`,
      is_read: false,
      organization_id: org.id,
    })),
  )

  // Bildirim gönderilemezse duyuru yine de yayında kalır: popup zaten
  // bildirimden bağımsız çalışıyor. Sessizce yutmuyoruz, logluyoruz.
  if (insertHatasi) console.error('[duyuru bildirim] insert:', insertHatasi)
}
