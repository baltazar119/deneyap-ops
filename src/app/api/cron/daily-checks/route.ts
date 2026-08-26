import { NextRequest, NextResponse } from 'next/server'
import { cronYetkili } from '@/lib/cronAuth'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'
import { renderInstantEmail } from '@/lib/emailTemplates'

export const dynamic = 'force-dynamic'
export const maxDuration = 60  // Vercel Pro: 60s, Hobby: 10s (en azından açık olsun)

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://deneyap-ops.vercel.app'

function todayKey() {
  return new Date().toISOString().slice(0, 10) // YYYY-MM-DD
}

/** DB'ye bildirim ekler ve e-postayı gönderir.
 *  Döner: 'inserted' | 'skipped' | string (hata mesajı) */
async function notify(
  admin: ReturnType<typeof getAdmin>,
  params: {
    user_id: string
    type: 'task' | 'sprint' | 'system'
    event_type: string
    title: string
    description?: string
    link?: string
    entity_key: string
    org_id?: string
  },
  emailResults: Array<{ user_id: string; reason: string }>
): Promise<'inserted' | 'skipped' | string> {
  // Cooldown: aynı entity_key için bildirim gittiyse atla
  const { count, error: countErr } = await admin
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', params.user_id)
    .eq('entity_key', params.entity_key)

  if (countErr) {
    console.error('[notify] cooldown check error:', countErr.message)
    // Hata olsa bile devam et — cooldown'u atlıyoruz
  } else if ((count ?? 0) > 0) {
    return 'skipped'
  }

  const { error: insertErr } = await admin.from('notifications').insert({
    user_id:         params.user_id,
    type:            params.type,
    event_type:      params.event_type,
    title:           params.title,
    description:     params.description ?? null,
    link:            params.link ?? null,
    entity_key:      params.entity_key,
    is_read:         false,
    organization_id: params.org_id ?? null,
  })
  if (insertErr) {
    console.error('[notify] insert error:', insertErr.message, { user_id: params.user_id, event_type: params.event_type, entity_key: params.entity_key })
    return insertErr.message
  }

  // E-posta gönder — direkt, HTTP hop olmadan
  try {
    // 1. Kullanıcı emailini al
    const { data: authUser } = await admin.auth.admin.getUserById(params.user_id)
    const userEmail = authUser?.user?.email
    if (!userEmail) {
      emailResults.push({ user_id: params.user_id, reason: 'user_not_found' })
      return 'inserted'
    }

    // 2. Email tercihleri kontrolü
    const { data: prefs } = await admin
      .from('email_preferences')
      .select('email_enabled, frequency')
      .eq('user_id', params.user_id)
      .maybeSingle()

    if (prefs?.email_enabled === false) {
      emailResults.push({ user_id: params.user_id, reason: 'email_disabled' })
      return 'inserted'
    }
    if (prefs?.frequency && prefs.frequency !== 'instant') {
      emailResults.push({ user_id: params.user_id, reason: 'queued_for_digest' })
      return 'inserted'
    }

    // 3. Email cooldown (10 dk)
    if (params.entity_key) {
      const { data: recentLog } = await admin
        .from('email_log')
        .select('id')
        .eq('user_id', params.user_id)
        .eq('event_type', params.event_type)
        .eq('entity_key', params.entity_key)
        .gte('sent_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
        .limit(1)
        .maybeSingle()

      if (recentLog) {
        emailResults.push({ user_id: params.user_id, reason: 'cooldown' })
        return 'inserted'
      }
    }

    // 4. Email gönder
    const link = params.link
      ? (params.link.startsWith('http') ? params.link : `${APP_URL}${params.link}`)
      : null
    const html = renderInstantEmail({
      title:       params.title,
      appUrl:      APP_URL,
      description: params.description ?? null,
      link,
      actorName:   null,
      eventType:   params.event_type as Parameters<typeof renderInstantEmail>[0]['eventType'],
    })
    const sent = await sendEmail(userEmail, params.title, html)
    if (sent) {
      await admin.from('email_log').insert({
        user_id:    params.user_id,
        event_type: params.event_type,
        entity_key: params.entity_key,
      })
    } else {
      emailResults.push({ user_id: params.user_id, reason: 'smtp_error' })
    }
  } catch (e) {
    emailResults.push({ user_id: params.user_id, reason: String(e) })
  }

  return 'inserted'
}

export async function GET(req: NextRequest) {
  /* ── Güvenlik ──────────────────────────────────────────────────────────── */
  if (!cronYetkili(req)) {
    return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 401 })
  }

  const admin = getAdmin()
  const today = todayKey()
  const now   = new Date()

  let taskOverdueCount    = 0
  let taskDueSoonCount    = 0
  let sprintEndingCount   = 0
  let memberOverloadCount = 0
  let skippedCount        = 0
  const errors: string[]                                  = []
  const emailResults: Array<{ user_id: string; reason: string }> = []

  /* ── Organizasyonları ve otomasyon ayarlarını çek ─────────────────────── */
  const { data: orgs } = await admin
    .from('organizations')
    .select('id, slug')

  if (!orgs?.length) {
    return NextResponse.json({ ok: true, message: 'Org yok' })
  }

  for (const org of orgs) {
    // Org'un otomasyon ayarlarını al (yoksa default: hepsi true, eşik 5)
    const { data: autoSettings } = await admin
      .from('automation_settings')
      .select('*')
      .eq('organization_id', org.id)
      .maybeSingle()

    const settings = autoSettings ?? {
      task_overdue:          true,
      task_due_soon:         true,
      sprint_ending_soon:    true,
      meeting_notifications: true,
      member_overload:       true,
      overload_threshold:    5,
    }

    // Org owner/admin listesi — birden fazla kontrol için önce çek
    const { data: orgAdmins } = await admin
      .from('organization_members')
      .select('user_id')
      .eq('organization_id', org.id)
      .in('role', ['owner', 'admin'])

    const adminIds = (orgAdmins ?? []).map(m => m.user_id)

    /* ── 1. Gecikmiş görevler (task_overdue) ──────────────────────────── */
    if (settings.task_overdue) {
      const { data: overdueTasks } = await admin
        .from('tasks')
        .select('id, title, assignee_id, organization_id')
        .eq('organization_id', org.id)
        .neq('status', 'done')
        .not('assignee_id', 'is', null)
        .lt('due_date', now.toISOString().slice(0, 10)) // bugünden önce

      for (const task of overdueTasks ?? []) {
        if (!task.assignee_id) continue

        // Bildirim alacak kişiler: assignee + org owner/adminler (tekrar etmesin)
        const recipients = Array.from(new Set([task.assignee_id, ...adminIds]))

        for (const uid of recipients) {
          const isAssignee = uid === task.assignee_id
          const r = await notify(admin, {
            user_id:    uid,
            type:       'task',
            event_type: 'task_overdue',
            title:      isAssignee
              ? `"${task.title}" görevinin süresi doldu`
              : `Ekip üyesinin görevi gecikti: "${task.title}"`,
            description: isAssignee
              ? 'Görevin bitiş tarihi geçti, lütfen güncelle.'
              : 'Atanan üyenin görevi teslim tarihini aştı.',
            link:       `/org/${org.slug}/tasks`,
            entity_key: `task:${task.id}:overdue:${today}:${uid}`,
            org_id:     org.id,
          }, emailResults)
          if (r === 'inserted') taskOverdueCount++
          else if (r === 'skipped') skippedCount++
          else errors.push(`task_overdue:${task.id}:${uid}: ${r}`)
        }
      }
    }

    /* ── 2. Yarın biten görevler (task_due_soon) ──────────────────────── */
    if (settings.task_due_soon) {
      const tomorrow = new Date(now)
      tomorrow.setDate(tomorrow.getDate() + 1)

      const { data: dueSoonTasks } = await admin
        .from('tasks')
        .select('id, title, assignee_id')
        .eq('organization_id', org.id)
        .neq('status', 'done')
        .not('assignee_id', 'is', null)
        .gte('due_date', now.toISOString().slice(0, 10))
        .lte('due_date', tomorrow.toISOString().slice(0, 10))

      for (const task of dueSoonTasks ?? []) {
        if (!task.assignee_id) continue
        const recipients = Array.from(new Set([task.assignee_id, ...adminIds]))
        for (const uid of recipients) {
          const isAssignee = uid === task.assignee_id
          const r = await notify(admin, {
            user_id:    uid,
            type:       'task',
            event_type: 'task_due_soon',
            title:      isAssignee
              ? `"${task.title}" görevi yarın bitiyor`
              : `Ekip üyesinin görevi yarın bitiyor: "${task.title}"`,
            description: 'Görev bitiş tarihi 24 saat içinde.',
            link:       `/org/${org.slug}/tasks`,
            entity_key: `task:${task.id}:due_soon:${today}:${uid}`,
            org_id:     org.id,
          }, emailResults)
          if (r === 'inserted') taskDueSoonCount++
          else if (r === 'skipped') skippedCount++
          else errors.push(`task_due_soon:${task.id}:${uid}: ${r}`)
        }
      }
    }

    /* ── 3. Sprint bitiş uyarısı (sprint_ending_soon) ────────────────── */
    if (settings.sprint_ending_soon) {
      const twoDaysLater = new Date(now)
      twoDaysLater.setDate(twoDaysLater.getDate() + 2)

      const { data: endingSprints } = await admin
        .from('sprints')
        .select('id, name')
        .eq('organization_id', org.id)
        .eq('is_active', true)
        .gte('end_date', now.toISOString().slice(0, 10))
        .lte('end_date', twoDaysLater.toISOString().slice(0, 10))

      if (endingSprints?.length) {
        // Org'daki tüm üyeleri al
        const { data: members } = await admin
          .from('organization_members')
          .select('user_id')
          .eq('organization_id', org.id)

        for (const sprint of endingSprints) {
          for (const member of members ?? []) {
            const r = await notify(admin, {
              user_id:    member.user_id,
              type:       'sprint',
              event_type: 'sprint_ending_soon',
              title:      `"${sprint.name}" sprinti 2 gün içinde bitiyor`,
              description: 'Sprint tamamlanmamış görevleri kontrol edin.',
              link:       `/org/${org.slug}/tasks`,
              entity_key: `sprint:${sprint.id}:ending_soon:${today}:${member.user_id}`,
              org_id:     org.id,
            }, emailResults)
            if (r === 'inserted') sprintEndingCount++
            else if (r === 'skipped') skippedCount++
            else errors.push(`sprint_ending:${sprint.id}: ${r}`)
          }
        }
      }
    }

    /* ── 4. Aşırı görev yükü (member_overloaded) ─────────────────────── */
    if (settings.member_overload) {
      const threshold = settings.overload_threshold ?? 5

      // 'doing' durumundaki görevleri assignee'ye göre say
      const { data: doingTasks } = await admin
        .from('tasks')
        .select('assignee_id')
        .eq('organization_id', org.id)
        .eq('status', 'doing')
        .not('assignee_id', 'is', null)

      if (doingTasks?.length) {
        // Assignee başına say
        const countMap: Record<string, number> = {}
        for (const t of doingTasks) {
          if (t.assignee_id) {
            countMap[t.assignee_id] = (countMap[t.assignee_id] ?? 0) + 1
          }
        }

        // Eşiği geçenleri bul
        const overloaded = Object.entries(countMap).filter(([, c]) => c > threshold)

        if (overloaded.length) {
          // Org adminlerini al
          const { data: admins } = await admin
            .from('organization_members')
            .select('user_id, profiles(full_name)')
            .eq('organization_id', org.id)
            .in('role', ['owner', 'admin'])

          // Yüklü üyelerin isimlerini al
          const overloadedIds = overloaded.map(([id]) => id)
          const { data: overloadedProfiles } = await admin
            .from('profiles')
            .select('id, full_name')
            .in('id', overloadedIds)

          const nameMap = Object.fromEntries(
            (overloadedProfiles ?? []).map(p => [p.id, p.full_name ?? 'Bir üye'])
          )

          for (const [userId, taskCount] of overloaded) {
            for (const adminMember of admins ?? []) {
              const r = await notify(admin, {
                user_id:    adminMember.user_id,
                type:       'system',
                event_type: 'member_overloaded',
                title:      `${nameMap[userId]} aşırı görev yüklendi (${taskCount} aktif görev)`,
                description: `Eşik: ${threshold} görev. Görev dağılımını gözden geçirin.`,
                link:       `/org/${org.slug}/tasks`,
                entity_key: `member:${userId}:overloaded:${today}:${adminMember.user_id}`,
                org_id:     org.id,
              }, emailResults)
              if (r === 'inserted') memberOverloadCount++
              else if (r === 'skipped') skippedCount++
              else errors.push(`member_overload:${userId}: ${r}`)
            }
          }
        }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    date: today,
    results: {
      task_overdue:    taskOverdueCount,
      task_due_soon:   taskDueSoonCount,
      sprint_ending:   sprintEndingCount,
      member_overload: memberOverloadCount,
      skipped:         skippedCount,
    },
    errors,
    email_failures: emailResults,
  })
}
