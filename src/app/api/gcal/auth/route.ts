import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const CLIENT_ID    = process.env.GOOGLE_CLIENT_ID!
const REDIRECT_URI = process.env.GOOGLE_GCAL_REDIRECT_URI!

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId') || ''
  const orgId  = req.nextUrl.searchParams.get('orgId')  || ''
  const slug   = req.nextUrl.searchParams.get('slug')   || ''

  const state = Buffer.from(
    JSON.stringify({ userId, orgId, slug, nonce: crypto.randomUUID() })
  ).toString('base64url')

  const params = new URLSearchParams({
    client_id:     CLIENT_ID,
    redirect_uri:  REDIRECT_URI,
    response_type: 'code',
    scope:         'https://www.googleapis.com/auth/calendar.events',
    access_type:   'offline',
    prompt:        'consent',
    state,
  })

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  )
}
