import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

/** Notları veya durumu güncelle */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { slug: string; id: string } }
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseAdmin() as any

  const authHeader = req.headers.get('authorization') || ''
  const token      = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const body = await req.json()
  const updates: Record<string, unknown> = {}
  if (body.notes             !== undefined) updates.notes             = body.notes
  if (body.status            !== undefined) updates.status            = body.status
  if (body.google_meet_link  !== undefined) updates.google_meet_link  = body.google_meet_link

  if (!Object.keys(updates).length) {
    return NextResponse.json({ error: 'Güncellenecek alan yok' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('meetings')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ meeting: data })
}

/** Toplantıyı sil */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { slug: string; id: string } }
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseAdmin() as any

  const authHeader = req.headers.get('authorization') || ''
  const token      = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  // Silinmeden önce toplantı ve katılımcıları al
  const { data: meeting } = await supabase
    .from('meetings')
    .select('id, title, start_time, organization_id')
    .eq('id', params.id)
    .single()

  const { data: attendees } = await supabase
    .from('meeting_attendees')
    .select('user_id')
    .eq('meeting_id', params.id)

  const { error } = await supabase
    .from('meetings')
    .delete()
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Katılımcılara iptal bildirimi gönder
  if (meeting && attendees?.length) {
    const { data: actorProfile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single()
    const actorName = actorProfile?.full_name ?? 'Bir kullanıcı'

    const startFormatted = new Date(meeting.start_time).toLocaleString('tr-TR', {
      day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit',
    })

    const notifRows = (attendees as { user_id: string }[])
      .filter(a => a.user_id !== user.id)
      .map(a => ({
        user_id:     a.user_id,
        type:        'system',
        event_type:  'meeting_cancelled',
        title:       `"${meeting.title}" toplantısı iptal edildi`,
        description: `Planlanan saat: ${startFormatted}`,
        actor_id:    user.id,
        actor_name:  actorName,
        link:        `/org/${params.slug}/meetings`,
        is_read:     false,
        organization_id: meeting.organization_id ?? null,
      }))

    if (notifRows.length) {
      await supabase.from('notifications').insert(notifRows)

      // Her katılımcıya iptal e-postası gönder (fire-and-forget)
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://tarlis-uygulama.vercel.app'
      for (const row of notifRows) {
        fetch(`${appUrl}/api/send-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.CRON_SECRET}`,
          },
          body: JSON.stringify({
            user_id:    row.user_id,
            event_type: row.event_type,
            title:      row.title,
            description: row.description,
            actor_name:  row.actor_name,
            link:        row.link,
          }),
        }).catch(() => {})
      }
    }
  }

  return NextResponse.json({ ok: true })
}
