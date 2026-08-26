import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { sendEmail } from '@/lib/email'
import { renderInstantEmail } from '@/lib/emailTemplates'
import type { NotificationEvent, OrgRole } from '@/types/database'
import { rateLimit, getClientIp } from '@/lib/rateLimit'

const sendEmailSchema = z.object({
  user_id:     z.string().uuid('Geçersiz kullanıcı ID'),
  type:        z.string().optional(),
  event_type:  z.string().min(1, 'event_type gerekli') as z.ZodType<NotificationEvent>,
  title:       z.string().min(1).max(200).trim(),
  description: z.string().max(1000).nullable().optional(),
  actor_name:  z.string().max(100).nullable().optional(),
  link:        z.string().nullable().optional().or(z.literal('').transform(() => null)),
  entity_key:  z.string().max(200).nullable().optional(),
})

/* ── Sistem event'leri (her role için izinli) ────────────────────────────── */
const SYSTEM_EVENTS: NotificationEvent[] = [
  'task_due_soon', 'sprint_ending_soon',
  'meeting_created', 'meeting_cancelled', 'meeting_reminder',
  'member_overloaded',
]

/* ── Rol bazlı izin tablosu ──────────────────────────────────────────────── */
const ROLE_ALLOWED: Record<OrgRole, NotificationEvent[]> = {
  owner:      ['task_assigned', 'task_status_changed', 'task_overdue', 'review_reply', 'mention', 'annotation_resolved', 'new_version', 'sprint_changed', ...SYSTEM_EVENTS],
  admin:      ['task_assigned', 'task_status_changed', 'task_overdue', 'review_reply', 'mention', 'annotation_resolved', 'new_version', 'sprint_changed', ...SYSTEM_EVENTS],
  member:     ['task_assigned', 'task_status_changed', 'task_overdue', 'mention', 'sprint_changed', 'task_due_soon', 'sprint_ending_soon', 'meeting_created', 'meeting_cancelled', 'meeting_reminder'],
  consultant: ['review_reply', 'annotation_resolved', 'meeting_created', 'meeting_cancelled', 'meeting_reminder'],
}

/* ── Event → preference field ────────────────────────────────────────────── */
const EVENT_TO_PREF: Partial<Record<NotificationEvent, string>> = {
  task_assigned:       'task_assigned',
  task_status_changed: 'task_assigned',
  task_overdue:        'task_assigned',
  task_due_soon:       'task_assigned',
  mention:             'mention',
  review_reply:        'review_reply',
  annotation_resolved: 'annotation_resolved',
  sprint_changed:      'sprint_changed',
  sprint_ending_soon:  'sprint_changed',
  new_version:         'new_version',
  // meeting ve member_overloaded → email_enabled kontrolü yeterli
}

export async function POST(req: NextRequest) {
  // Rate limit: IP başına 30 e-posta / dakika
  const ip = getClientIp(req)
  const rl = await rateLimit(`send-email:${ip}`, 30, 60 * 1000)
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, reason: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    )
  }

  /* ── Bearer token doğrulama ────────────────────────────────────────────── */
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) {
    return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 401 })
  }

  /* ── Dahili servis çağrısı mı? (CRON_SECRET ile yapılan server-to-server) ─ */
  const isInternal = !!(process.env.CRON_SECRET && token === process.env.CRON_SECRET)

  try {
    let raw: unknown
    try { raw = await req.json() } catch {
      return NextResponse.json({ ok: false, reason: 'invalid_body' }, { status: 400 })
    }

    const parsed = sendEmailSchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ ok: false, reason: 'invalid_params', detail: parsed.error.issues[0].message }, { status: 400 })
    }

    const { user_id, event_type, title, description, actor_name, link, entity_key } = parsed.data

    /* ── Service role client ─────────────────────────────────────────────── */
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    /* ── Token doğrulama (dahili çağrılar atlar) ─────────────────────────── */
    if (!isInternal) {
      const { data: { user: tokenUser }, error: tokenError } = await admin.auth.getUser(token)
      if (tokenError || !tokenUser || tokenUser.id !== user_id) {
        return NextResponse.json({ ok: false, reason: 'forbidden' }, { status: 403 })
      }
    }

    /* 1. Kullanıcı bilgileri ──────────────────────────────────────────────── */
    const { data: authUser } = await admin.auth.admin.getUserById(user_id)
    const userEmail = authUser?.user?.email
    if (!userEmail) {
      return NextResponse.json({ ok: false, reason: 'user_not_found' })
    }

    /* 2. email_preferences ───────────────────────────────────────────────── */
    const { data: prefs } = await admin
      .from('email_preferences')
      .select('*')
      .eq('user_id', user_id)
      .single()

    if (prefs && prefs.email_enabled === false) {
      return NextResponse.json({ ok: false, reason: 'email_disabled' })
    }

    /* 3. Frekans kontrolü ────────────────────────────────────────────────── */
    if (prefs?.frequency && prefs.frequency !== 'instant') {
      return NextResponse.json({ ok: false, reason: 'queued_for_digest' })
    }

    /* 4. Rol + izin kontrolü (dahili çağrılar atlar) ─────────────────────── */
    if (!isInternal) {
      const { data: profile } = await admin
        .from('profiles')
        .select('role')
        .eq('id', user_id)
        .single() as { data: { role: OrgRole } | null }

      const role = (profile?.role ?? 'member') as OrgRole
      if (!ROLE_ALLOWED[role]?.includes(event_type)) {
        return NextResponse.json({ ok: false, reason: 'role_not_allowed' })
      }
    }

    /* 5. Toggle kontrolü ─────────────────────────────────────────────────── */
    const prefField = EVENT_TO_PREF[event_type]
    if (prefField && prefs?.[prefField] === false) {
      return NextResponse.json({ ok: false, reason: 'event_type_disabled' })
    }

    /* 6. Cooldown (10 dakika) ────────────────────────────────────────────── */
    if (entity_key) {
      const { data: recentLog } = await admin
        .from('email_log')
        .select('id')
        .eq('user_id', user_id)
        .eq('event_type', event_type)
        .eq('entity_key', entity_key)
        .gte('sent_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
        .limit(1)
        .single()

      if (recentLog) {
        return NextResponse.json({ ok: false, reason: 'cooldown' })
      }
    }

    /* 7. Maili gönder ─────────────────────────────────────────────────────── */
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const html = renderInstantEmail({
      title, appUrl,
      description: description ?? null,
      link: link ?? null,
      actorName: actor_name ?? null,
      eventType: event_type,
    })

    const sent = await sendEmail(userEmail, title, html)
    if (!sent) {
      return NextResponse.json({ ok: false, reason: 'smtp_error' }, { status: 500 })
    }

    /* 8. Gönderim kaydı ──────────────────────────────────────────────────── */
    await admin.from('email_log').insert({
      user_id,
      event_type,
      entity_key: entity_key ?? null,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[send-email] error:', err)
    return NextResponse.json({ ok: false, reason: 'server_error' }, { status: 500 })
  }
}
