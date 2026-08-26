import 'server-only'
import { randomBytes, createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * E-postadaki aksiyon düğmeleri için tek kullanımlık token.
 *
 * İki tasarım kararı önemli:
 *
 * 1) Ham token VERİTABANINDA TUTULMAZ, yalnızca SHA-256 özeti. Veritabanı
 *    sızsa bile tokenlar kullanılamaz — parola saklamanın aynı mantığı.
 *
 * 2) Token TEK BAŞINA yetki vermez. Uygulama anında görevin sahibi mi ya da
 *    org yöneticisi mi diye ayrıca bakılır; token çalınsa bile yetki dışı
 *    işlem yapılamaz.
 */

export type Eylem = 'gorev_tamamla' | 'termin_ertele'

/** 7 gün: haftalık rapor döngüsüne uygun, daha uzunu gereksiz risk */
const TTL_MS = 7 * 24 * 60 * 60 * 1000

function ozet(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export interface TokenKaydi {
  id: string
  user_id: string
  organization_id: string
  eylem: Eylem
  hedef_id: string
  yuk: Record<string, unknown>
}

export async function eylemTokenUret(
  db: SupabaseClient,
  p: {
    userId: string
    orgId: string
    eylem: Eylem
    hedefId: string
    yuk?: Record<string, unknown>
  },
): Promise<string | null> {
  const token = randomBytes(32).toString('base64url')
  const { error } = await db.from('email_action_tokens').insert({
    token_hash: ozet(token),
    user_id: p.userId,
    organization_id: p.orgId,
    eylem: p.eylem,
    hedef_id: p.hedefId,
    yuk: p.yuk ?? {},
    expires_at: new Date(Date.now() + TTL_MS).toISOString(),
  })
  if (error) {
    console.error('[eylemToken] üretilemedi:', error.message)
    return null
  }
  return token
}

export type TokenSonuc =
  | { ok: true; kayit: TokenKaydi }
  | { ok: false; sebep: 'gecersiz' | 'suresi_doldu' | 'kullanilmis' }

/** Yalnızca DOĞRULAR — tüketmez. Onay ekranı bunu kullanır. */
export async function eylemTokenDogrula(
  db: SupabaseClient,
  token: string,
): Promise<TokenSonuc> {
  const { data } = await db
    .from('email_action_tokens')
    .select('id, user_id, organization_id, eylem, hedef_id, yuk, expires_at, kullanildi_at')
    .eq('token_hash', ozet(token))
    .maybeSingle()

  if (!data) return { ok: false, sebep: 'gecersiz' }
  if (data.kullanildi_at) return { ok: false, sebep: 'kullanilmis' }
  if (new Date(data.expires_at) < new Date()) return { ok: false, sebep: 'suresi_doldu' }

  return {
    ok: true,
    kayit: {
      id: data.id,
      user_id: data.user_id,
      organization_id: data.organization_id,
      eylem: data.eylem as Eylem,
      hedef_id: data.hedef_id,
      yuk: (data.yuk ?? {}) as Record<string, unknown>,
    },
  }
}

/**
 * Tokenı ATOMİK olarak tüketir.
 *
 * `kullanildi_at is null` koşullu UPDATE: iki istek aynı anda gelirse
 * yalnızca biri satırı döndürür, diğeri boş alır. Önce okuyup sonra
 * yazsaydık ikisi de geçerdi.
 */
export async function eylemTokenTuket(
  db: SupabaseClient,
  id: string,
  ip: string,
): Promise<boolean> {
  const { data } = await db
    .from('email_action_tokens')
    .update({ kullanildi_at: new Date().toISOString(), kullanan_ip: ip })
    .eq('id', id)
    .is('kullanildi_at', null)
    .select('id')
    .maybeSingle()

  return !!data
}
