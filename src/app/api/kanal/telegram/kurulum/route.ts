import { NextRequest, NextResponse } from 'next/server'
import { cronYetkili } from '@/lib/cronAuth'
import { telegramCagir } from '@/lib/kanal/telegram'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/kanal/telegram/kurulum  (CRON_SECRET korumalı)
 *
 * Telegram'a webhook adresini bildirir. Deploy sonrası bir kez çağrılır.
 * Gizli anahtar da burada set edilir; webhook her istekte onu doğrular.
 */
export async function POST(req: NextRequest) {
  if (!cronYetkili(req)) {
    return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  }
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: 'TELEGRAM_BOT_TOKEN ve TELEGRAM_WEBHOOK_SECRET tanımlı olmalı.' },
      { status: 400 },
    )
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://deneyap-ops.vercel.app'
  const url = `${appUrl}/api/kanal/telegram/webhook`

  const sonuc = await telegramCagir('setWebhook', {
    url,
    secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: true,
  })

  if (!sonuc.ok) {
    return NextResponse.json({ error: sonuc.hata }, { status: 502 })
  }
  return NextResponse.json({ ok: true, webhook: url })
}
