/**
 * Google Calendar API yardımcısı
 * Drive token yönetimi ile aynı pattern — token expiry kontrolü + otomatik refresh
 */

import { createClient } from '@supabase/supabase-js'

const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID!
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

/** Geçerli access_token'ı döner; süresi dolmuşsa otomatik refresh yapar */
export async function getGcalToken(userId: string, orgId: string): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseAdmin() as any

  let { data: token } = await supabase
    .from('gcal_tokens')
    .select('user_id, access_token, refresh_token, expiry')
    .eq('user_id', userId)
    .eq('organization_id', orgId)
    .maybeSingle()

  // Bu kullanıcı kendi hesabını hiç bağlamamışsa, aynı çalışma alanında
  // başka birinin bağladığı Google hesabını kullan — Drive token'ları için
  // zaten uygulanan "workspace'in paylaşılan bağlantısı" mimarisiyle
  // tutarlı (bkz. src/lib/driveAdmin.ts). Böylece bir yetkili bir kez
  // bağlanınca workspace'teki diğer tüm üyeler (demo hesaplar dahil)
  // ayrıca bağlanmadan Google Meet oluşturabilir.
  if (!token) {
    const { data: paylasilan } = await supabase
      .from('gcal_tokens')
      .select('user_id, access_token, refresh_token, expiry')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    token = paylasilan
  }

  if (!token) return null
  const sahipUserId = token.user_id as string

  // Token hâlâ geçerliyse (60s buffer) direkt dön
  const expiry = token.expiry ? new Date(token.expiry).getTime() : 0
  if (expiry > Date.now() + 60_000) return token.access_token

  // Refresh gerekiyor
  if (!token.refresh_token) return null

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: token.refresh_token,
      grant_type:    'refresh_token',
    }),
  })

  const data = await res.json()
  if (!data.access_token) {
    console.error('[GCal] Token refresh başarısız:', data)
    return null
  }

  const newExpiry = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString()

  await supabase
    .from('gcal_tokens')
    .update({ access_token: data.access_token, expiry: newExpiry })
    .eq('user_id', sahipUserId)
    .eq('organization_id', orgId)

  return data.access_token
}

export interface GcalEventInput {
  title: string
  description: string | null
  startTime: string  // ISO 8601
  endTime: string    // ISO 8601
  attendeeEmails: string[]
}

export interface GcalEventResult {
  meetLink: string | null
  calendarEventId: string
  htmlLink: string
}

/** Google Calendar'da etkinlik oluştur + Meet linki al */
export async function createCalendarEvent(
  accessToken: string,
  event: GcalEventInput
): Promise<GcalEventResult> {
  const requestId = crypto.randomUUID()

  const body = {
    summary:     event.title,
    description: event.description || undefined,
    start: { dateTime: event.startTime, timeZone: 'Europe/Istanbul' },
    end:   { dateTime: event.endTime,   timeZone: 'Europe/Istanbul' },
    conferenceData: {
      createRequest: {
        requestId,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    },
    attendees: event.attendeeEmails.map(email => ({ email })),
  }

  const res = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(body),
    }
  )

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`Google Calendar API hatası: ${res.status} — ${JSON.stringify(err)}`)
  }

  const data = await res.json()

  // Meet linki: conferenceData.entryPoints içinden uri al
  const meetEntry = data.conferenceData?.entryPoints?.find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ep: any) => ep.entryPointType === 'video'
  )
  const meetLink: string | null = meetEntry?.uri ?? null

  return {
    meetLink,
    calendarEventId: data.id,
    htmlLink: data.htmlLink,
  }
}
