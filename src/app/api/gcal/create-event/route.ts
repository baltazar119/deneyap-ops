import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getGcalToken, createCalendarEvent } from '@/lib/googleCalendar'
import { onbelleksizFetch } from '@/lib/server/supabaseFetch'

export const dynamic = 'force-dynamic'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { fetch: onbelleksizFetch } },
  )
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { userId, orgId, title, description, startTime, endTime, attendeeEmails } = body

    if (!userId || !orgId || !title || !startTime || !endTime) {
      return NextResponse.json({ error: 'Eksik parametreler' }, { status: 400 })
    }

    const accessToken = await getGcalToken(userId, orgId)
    if (!accessToken) {
      return NextResponse.json({ error: 'Google hesabı bağlı değil' }, { status: 401 })
    }

    const result = await createCalendarEvent(accessToken, {
      title,
      description: description || null,
      startTime,
      endTime,
      attendeeEmails: attendeeEmails || [],
    })

    return NextResponse.json(result)
  } catch (err) {
    console.error('[GCal create-event]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Bilinmeyen hata' },
      { status: 500 }
    )
  }
}

/** Kullanıcının gcal token'ı gerçekten kullanılabilir mi kontrol et */
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId')
  const orgId  = req.nextUrl.searchParams.get('orgId')

  if (!userId || !orgId) {
    return NextResponse.json({ connected: false })
  }

  // Sadece satır varlığını değil, token'ın gerçekten geçerli/yenilenebilir
  // olduğunu da kontrol et (süresi dolmuş ve refresh_token yoksa false döner)
  const accessToken = await getGcalToken(userId, orgId)
  return NextResponse.json({ connected: !!accessToken })
}
