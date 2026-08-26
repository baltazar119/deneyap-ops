import { NextRequest, NextResponse } from 'next/server'
import { cronYetkili } from '@/lib/cronAuth'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'
import { renderDigestEmail } from '@/lib/emailTemplates'
import type { AppNotification } from '@/types/database'

export async function GET(req: NextRequest) {
  /* ── Cron secret doğrulaması ──────────────────────────────────────────── */
  const { searchParams } = new URL(req.url)
  const type   = searchParams.get('type') as 'daily' | 'weekly' | null

  if (!cronYetkili(req)) {
    return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 401 })
  }

  if (type !== 'daily' && type !== 'weekly') {
    return NextResponse.json({ ok: false, reason: 'invalid_type' }, { status: 400 })
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://deneyap-ops.vercel.app'

  /* ── Hedef frekans ────────────────────────────────────────────────────── */
  const { data: prefsList } = await admin
    .from('email_preferences')
    .select('user_id')
    .eq('email_enabled', true)
    .eq('frequency', type)

  if (!prefsList?.length) {
    return NextResponse.json({ ok: true, sent: 0 })
  }

  /* ── Zaman aralığı ────────────────────────────────────────────────────── */
  const since = new Date(
    Date.now() - (type === 'daily' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000)
  ).toISOString()

  let sent = 0

  for (const pref of prefsList) {
    const { user_id } = pref

    /* Kullanıcı e-postası */
    const { data: authUser } = await admin.auth.admin.getUserById(user_id)
    const userEmail = authUser?.user?.email
    if (!userEmail) continue

    /* Kullanıcı adı */
    const { data: profile } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', user_id)
      .single() as { data: { full_name: string | null } | null }

    /* Bildirimler */
    const { data: notifications } = await admin
      .from('notifications')
      .select('*')
      .eq('user_id', user_id)
      .gte('created_at', since)
      .order('created_at', { ascending: false }) as { data: AppNotification[] | null }

    if (!notifications?.length) continue

    const html = renderDigestEmail({
      userName: profile?.full_name || userEmail.split('@')[0],
      notifications,
      period: type,
      appUrl,
    })

    const subject = type === 'daily'
      ? `DENEYAP Ops — Günlük Özet (${notifications.length} bildirim)`
      : `DENEYAP Ops — Haftalık Özet (${notifications.length} bildirim)`

    const ok = await sendEmail(userEmail, subject, html)
    if (ok) {
      await admin.from('email_log').insert({
        user_id,
        event_type: `${type}_digest`,
        entity_key: 'digest',
      })
      sent++
    }
  }

  return NextResponse.json({ ok: true, sent })
}
