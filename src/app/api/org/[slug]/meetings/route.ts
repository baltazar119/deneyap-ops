import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getGcalToken, createCalendarEvent } from '@/lib/googleCalendar'
import { sendEmail } from '@/lib/email'
import { renderInstantEmail } from '@/lib/emailTemplates'

export const dynamic = 'force-dynamic'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

/** Toplantıları listele (org üyelerine açık) */
export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseAdmin() as any
  const filter   = req.nextUrl.searchParams.get('filter') || 'upcoming'

  // org_id bul
  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .eq('slug', params.slug)
    .single()

  if (!org) return NextResponse.json({ error: 'Org bulunamadı' }, { status: 404 })

  const now = new Date().toISOString()
  let query = supabase
    .from('meetings')
    .select('*')
    .eq('organization_id', org.id)
    .order('start_time', { ascending: filter !== 'past' })

  if (filter === 'upcoming') query = query.gte('end_time', now)
  else if (filter === 'past') query = query.lt('end_time', now)

  const { data: meetings, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (!meetings?.length) return NextResponse.json({ meetings: [] })

  // Katılımcıları ve profillerini çek
  const meetingIds = meetings.map((m: { id: string }) => m.id)
  const { data: attendees } = await supabase
    .from('meeting_attendees')
    .select('meeting_id, user_id')
    .in('meeting_id', meetingIds)

  const userIds = [...new Set((attendees || []).map((a: { user_id: string }) => a.user_id))]
  const { data: profiles } = userIds.length
    ? await supabase.from('profiles').select('id, full_name, avatar_url').in('id', userIds)
    : { data: [] }

  const { data: authUsers } = userIds.length
    ? await supabase.auth.admin.listUsers()
    : { data: { users: [] } }

  const profileMap = Object.fromEntries((profiles || []).map((p: { id: string; full_name: string | null; avatar_url: string | null }) => [p.id, p]))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const emailMap = Object.fromEntries((authUsers?.users || []).map((u: any) => [u.id, u.email]))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = meetings.map((m: any) => ({
    ...m,
    attendees: (attendees || [])
      .filter((a: { meeting_id: string }) => a.meeting_id === m.id)
      .map((a: { user_id: string }) => ({
        user_id:    a.user_id,
        full_name:  profileMap[a.user_id]?.full_name  ?? null,
        avatar_url: profileMap[a.user_id]?.avatar_url ?? null,
        email:      emailMap[a.user_id] ?? '',
      })),
  }))

  return NextResponse.json({ meetings: result })
}

/** Yeni toplantı oluştur */
export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseAdmin() as any

  const authHeader = req.headers.get('authorization') || ''
  const token      = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const body = await req.json()
  const { title, description, start_time, end_time, attendee_ids, useGcal, meet_type } = body
  let { manual_meet_link } = body

  if (!title || !start_time || !end_time) {
    return NextResponse.json({ error: 'Başlık, başlangıç ve bitiş saati zorunlu' }, { status: 400 })
  }

  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .eq('slug', params.slug)
    .single()
  if (!org) return NextResponse.json({ error: 'Org bulunamadı' }, { status: 404 })

  // Default to Jitsi unless user explicitly chose in-person (meet_type === 'none') or GCal
  if (!useGcal && !manual_meet_link && meet_type !== 'none') {
    const rand = Array.from({ length: 10 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('')
    manual_meet_link = `https://meet.jit.si/deneyap-${rand}`
  }

  // Google Calendar entegrasyonu
  let googleMeetLink: string | null = manual_meet_link || null
  let calendarEventId: string | null = null

  if (useGcal) {
    const accessToken = await getGcalToken(user.id, org.id)
    if (!accessToken) {
      return NextResponse.json(
        { error: 'Google hesabı bağlı değil. Lütfen önce Google hesabınızı bağlayın.' },
        { status: 400 }
      )
    }
    try {
      // Katılımcı e-postalarını çek
      let attendeeEmails: string[] = []
      if (attendee_ids?.length) {
        const { data: authUsersData } = await supabase.auth.admin.listUsers()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        attendeeEmails = (authUsersData?.users || [])
          .filter((u: { id: string }) => attendee_ids.includes(u.id))
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((u: any) => u.email)
          .filter(Boolean)
      }

      const result = await createCalendarEvent(accessToken, {
        title,
        description:     description || null,
        startTime:       start_time,
        endTime:         end_time,
        attendeeEmails,
      })
      googleMeetLink  = result.meetLink
      calendarEventId = result.calendarEventId
    } catch (err) {
      console.error('[Meetings POST] GCal error:', err)
      return NextResponse.json({ error: 'Google Meet oluşturulamadı. Lütfen tekrar deneyin.' }, { status: 500 })
    }
  }

  // meetings tablosuna ekle
  const { data: meeting, error: insertErr } = await supabase
    .from('meetings')
    .insert({
      organization_id:          org.id,
      created_by:               user.id,
      title,
      description:              description || null,
      start_time,
      end_time,
      google_meet_link:         googleMeetLink,
      google_calendar_event_id: calendarEventId,
    })
    .select()
    .single()

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  // Katılımcıları ekle
  if (attendee_ids?.length) {
    const attendeeRows = attendee_ids.map((uid: string) => ({
      meeting_id: meeting.id,
      user_id:    uid,
    }))
    await supabase.from('meeting_attendees').insert(attendeeRows)
  }

  // Tüm org üyelerine bildirim + mail gönder (oluşturan hariç)
  const { data: actorProfile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle()
  const actorName = actorProfile?.full_name ?? 'Bir kullanıcı'

  const { data: orgMembers } = await supabase
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', org.id)
    .neq('user_id', user.id)

  const startFormatted = new Date(start_time).toLocaleString('tr-TR', {
    day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit',
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const notifRows = (orgMembers || []).map((m: any) => ({
    user_id:         m.user_id,
    type:            'system',
    event_type:      'meeting_created',
    title:           `${actorName} "${title}" toplantısı oluşturdu`,
    description:     startFormatted,
    actor_id:        user.id,
    actor_name:      actorName,
    link:            `/org/${params.slug}/meetings`,
    is_read:         false,
    organization_id: org.id,
  }))

  if (notifRows.length) {
    const { error: notifErr } = await supabase.from('notifications').insert(notifRows)
    if (notifErr) console.error('[Meetings POST] Notification insert error:', notifErr)

    // Katılımcı e-postalarını al (bildirim için)
    const { data: memberAuthUsers } = await supabase.auth.admin.listUsers()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const memberEmailMap = Object.fromEntries((memberAuthUsers?.users || []).map((u: any) => [u.id, u.email]))

    // E-posta gönder — doğrudan, HTTP round-trip yok
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://deneyap-ops.vercel.app'
    for (const row of notifRows) {
      const userEmail = memberEmailMap[row.user_id]
      if (!userEmail) continue
      try {
        // email_preferences kontrolü
        const { data: prefs } = await supabase
          .from('email_preferences')
          .select('email_enabled, frequency')
          .eq('user_id', row.user_id)
          .maybeSingle()
        if (prefs?.email_enabled === false) continue
        if (prefs?.frequency && prefs.frequency !== 'instant') continue

        const html = renderInstantEmail({
          title:       row.title,
          appUrl,
          description: row.description ?? null,
          link:        row.link ?? null,
          actorName:   row.actor_name ?? null,
          eventType:   row.event_type,
        })
        await sendEmail(userEmail, row.title, html)
      } catch (emailErr) {
        console.error('[Meetings POST] Email send error for', row.user_id, emailErr)
      }
    }
  }

  // Aynı zamanda uygulama takviminde de görünsün
  try {
    const startDate = new Date(start_time)
    const startSlot = startDate.getHours() * 2 + Math.floor(startDate.getMinutes() / 30)
    const endDate   = new Date(end_time)
    const endSlot   = endDate.getHours() * 2 + Math.floor(endDate.getMinutes() / 30)

    await supabase.from('calendar_events').insert({
      title:           `🎥 ${title}`,
      organization_id: org.id,
      created_by:      user.id,
      event_date:      start_time.slice(0, 10),
      is_all_day:      false,
      start_slot:      Math.min(startSlot, 47),
      end_slot:        Math.min(endSlot,   47),
      notes:           description || null,
    })
  } catch (err) {
    console.error('[Meetings POST] calendar_events insert error:', err)
  }

  return NextResponse.json({ meeting }, { status: 201 })
}
