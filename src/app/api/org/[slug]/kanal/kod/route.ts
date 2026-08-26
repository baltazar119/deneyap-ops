import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { orgYetkiCoz } from '@/lib/server/apiAuth'
import { rateLimit } from '@/lib/rateLimit'
import { telegramCagir } from '@/lib/kanal/telegram'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/org/[slug]/kanal/kod  { kanal: 'telegram' }
 * Tek kullanımlık bağlantı kodu üretir ve bot derin bağlantısını döner.
 *
 * GET  → kullanıcının bu org'daki bağlı kanalları
 * DELETE ?kanal=telegram → bağlantıyı kaldırır
 */

const TTL_DK = 10

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const y = await orgYetkiCoz(req, { slug: params.slug, gerekli: 'uye' })
  if (!y.ok) return y.res
  const { yetki } = y

  const rl = await rateLimit(`kanal:kod:${yetki.user.id}`, 10, 15 * 60 * 1000)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Çok fazla deneme. Biraz sonra tekrar deneyin.' }, { status: 429 })
  }

  if (!process.env.TELEGRAM_BOT_TOKEN) {
    return NextResponse.json({ error: 'Telegram botu yapılandırılmamış.' }, { status: 503 })
  }

  // Bot kullanıcı adını API'den öğren — env'de ayrıca tutmaya gerek yok
  const me = await telegramCagir<{ username: string }>('getMe', {})
  if (!me.ok || !me.sonuc?.username) {
    return NextResponse.json({ error: 'Bot bilgisi alınamadı.' }, { status: 502 })
  }

  const kod = randomBytes(9).toString('base64url')   // 12 karakter, URL güvenli
  const expires = new Date(Date.now() + TTL_DK * 60 * 1000).toISOString()

  const { error } = await yetki.admin.from('channel_link_codes').insert({
    kod,
    user_id: yetki.user.id,
    organization_id: yetki.org.id,
    kanal: 'telegram',
    expires_at: expires,
  })
  if (error) {
    console.error('[kanal/kod] kod kaydedilemedi:', error)
    return NextResponse.json({ error: 'Kod üretilemedi.' }, { status: 500 })
  }

  return NextResponse.json({
    kod,
    botKullaniciAdi: me.sonuc.username,
    derinBaglanti: `https://t.me/${me.sonuc.username}?start=${kod}`,
    gecerlilikDakika: TTL_DK,
  })
}

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const y = await orgYetkiCoz(req, { slug: params.slug, gerekli: 'uye' })
  if (!y.ok) return y.res
  const { yetki } = y

  const { data } = await yetki.admin
    .from('channel_links')
    .select('kanal, gorunen_ad, aktif, created_at')
    .eq('user_id', yetki.user.id)
    .eq('organization_id', yetki.org.id)

  return NextResponse.json({
    baglantilar: data ?? [],
    telegramHazir: !!process.env.TELEGRAM_BOT_TOKEN,
  })
}

export async function DELETE(req: NextRequest, { params }: { params: { slug: string } }) {
  const y = await orgYetkiCoz(req, { slug: params.slug, gerekli: 'uye' })
  if (!y.ok) return y.res
  const { yetki } = y

  const kanal = new URL(req.url).searchParams.get('kanal') ?? 'telegram'
  const { error } = await yetki.admin
    .from('channel_links')
    .delete()
    .eq('user_id', yetki.user.id)
    .eq('organization_id', yetki.org.id)
    .eq('kanal', kanal)

  if (error) return NextResponse.json({ error: 'Bağlantı kaldırılamadı.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
