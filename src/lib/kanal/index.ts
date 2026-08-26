import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { telegramKanali } from './telegram'
import { whatsappKanali } from './whatsapp'
import type { Kanal, KanalAdi, KanalMesaji, GonderimSonucu } from './tipler'

export * from './tipler'
export { telegramKanali } from './telegram'

/**
 * Kanal yönlendiricisi.
 *
 * Kullanıcının bağlı kanallarına gönderir. E-posta bu listede DEĞİL: onun
 * kendi tercih/cooldown boru hattı var (api/send-email) ve son çare olarak
 * her zaman devrede. Buradaki kanallar e-postaya EK'tir, alternatifi değil.
 */

const KANALLAR: Record<Exclude<KanalAdi, 'eposta'>, Kanal> = {
  telegram: telegramKanali,
  whatsapp: whatsappKanali,
}

export interface KanalGonderimSonucu {
  gonderilen: KanalAdi[]
  basarisiz: { kanal: KanalAdi; hata: string }[]
  /** Kullanıcının hiç bağlı kanalı yok — e-posta tek yol */
  baglantiYok: boolean
}

/**
 * Kullanıcının bağlı kanallarına mesaj gönderir.
 *
 * @param cooldownAnahtari Verilirse aynı olay için son 10 dk'da gönderim
 *   yapıldıysa atlanır. E-postadaki entity_key mantığının aynısı.
 */
export async function kanallaraGonder(
  db: SupabaseClient,
  p: {
    userId: string
    orgId: string
    orgSlug: string
    mesaj: KanalMesaji
    cooldownAnahtari?: string
  },
): Promise<KanalGonderimSonucu> {
  const sonuc: KanalGonderimSonucu = { gonderilen: [], basarisiz: [], baglantiYok: false }

  const { data: baglantilar } = await db
    .from('channel_links')
    .select('kanal, harici_id')
    .eq('user_id', p.userId)
    .eq('organization_id', p.orgId)
    .eq('aktif', true)

  if (!baglantilar?.length) {
    sonuc.baglantiYok = true
    return sonuc
  }

  if (p.cooldownAnahtari) {
    const esik = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    const { data: son } = await db
      .from('channel_log')
      .select('id')
      .eq('user_id', p.userId)
      .eq('entity_key', p.cooldownAnahtari)
      .gte('sent_at', esik)
      .limit(1)
      .maybeSingle()
    if (son) return sonuc   // yakın zamanda gönderilmiş, tekrar etme
  }

  for (const b of baglantilar as { kanal: KanalAdi; harici_id: string }[]) {
    const kanal = KANALLAR[b.kanal as Exclude<KanalAdi, 'eposta'>]
    if (!kanal || !kanal.destekleniyor()) continue

    let r: GonderimSonucu
    try {
      r = await kanal.gonder(
        { userId: p.userId, orgId: p.orgId, orgSlug: p.orgSlug, adres: b.harici_id },
        p.mesaj,
      )
    } catch (e) {
      r = { ok: false, hata: e instanceof Error ? e.message : 'bilinmeyen hata' }
    }

    if (r.ok) sonuc.gonderilen.push(b.kanal)
    else if (!r.yapilandirilmamis) sonuc.basarisiz.push({ kanal: b.kanal, hata: r.hata ?? '' })

    await db.from('channel_log').insert({
      user_id: p.userId,
      kanal: b.kanal,
      olay_tipi: p.mesaj.aciliyet,
      entity_key: p.cooldownAnahtari ?? null,
      durum: r.ok ? 'gonderildi' : 'hatali',
      hata: r.ok ? null : (r.hata ?? null),
    })
  }

  return sonuc
}
