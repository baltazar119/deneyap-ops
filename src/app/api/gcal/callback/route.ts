import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID!
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!
const REDIRECT_URI  = process.env.GOOGLE_GCAL_REDIRECT_URI!

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function GET(req: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase   = getSupabaseAdmin() as any
  const code       = req.nextUrl.searchParams.get('code')
  const rawState   = req.nextUrl.searchParams.get('state') || ''
  const oauthError = req.nextUrl.searchParams.get('error')

  // State: base64url encoded { userId, orgId, slug }
  let userId = '', orgId = '', slug = ''
  try {
    const parsed = JSON.parse(Buffer.from(rawState, 'base64url').toString())
    userId = parsed.userId || ''
    orgId  = parsed.orgId  || ''
    slug   = parsed.slug   || ''
  } catch {
    // eski format fallback
  }

  const fallbackUrl = slug ? `/org/${slug}/meetings` : '/workspaces'

  if (oauthError || !code || !userId) {
    const url = new URL(fallbackUrl, req.url)
    url.searchParams.set('gcal_error', oauthError || 'missing_params')
    return NextResponse.redirect(url)
  }

  // Kod → token takası
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri:  REDIRECT_URI,
      grant_type:    'authorization_code',
    }),
  })

  const tokens = await tokenRes.json()

  if (!tokens.access_token) {
    console.error('[GCal Callback] Token exchange failed:', tokens)
    const url = new URL(fallbackUrl, req.url)
    url.searchParams.set('gcal_error', 'token_exchange_failed')
    return NextResponse.redirect(url)
  }

  const expiry = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString()

  // Mevcut refresh_token'ı koru (Google her zaman yenisini vermez)
  let refreshToken: string | null = tokens.refresh_token || null
  if (!refreshToken && orgId) {
    const { data: existing } = await supabase
      .from('gcal_tokens')
      .select('refresh_token')
      .eq('user_id', userId)
      .eq('organization_id', orgId)
      .maybeSingle()
    refreshToken = existing?.refresh_token || null
  }

  const { error: saveError } = await supabase
    .from('gcal_tokens')
    .upsert({
      user_id:         userId,
      organization_id: orgId || null,
      access_token:    tokens.access_token,
      refresh_token:   refreshToken,
      expiry,
    }, { onConflict: 'user_id,organization_id' })

  if (saveError) {
    console.error('[GCal Callback] Save error:', saveError)
    const url = new URL(fallbackUrl, req.url)
    url.searchParams.set('gcal_error', encodeURIComponent(saveError.message))
    return NextResponse.redirect(url)
  }

  console.log('[GCal Callback] Token saved — userId:', userId, 'orgId:', orgId)

  const url = new URL(fallbackUrl, req.url)
  url.searchParams.set('gcal_connected', 'true')
  return NextResponse.redirect(url)
}
