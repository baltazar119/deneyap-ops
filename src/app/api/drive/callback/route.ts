import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID!
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!
const REDIRECT_URI  = process.env.GOOGLE_REDIRECT_URI!

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

function getReturnBase(req: NextRequest): string {
  return req.cookies.get('drive_return_to')?.value || '/workspaces'
}

/**
 * State'i decode et.
 * drive/auth base64url(JSON{userId,orgId,nonce}) encode ediyor.
 * Eski "userId|orgId" formatı da desteklenir.
 */
function decodeState(raw: string): { userId: string; orgId: string } {
  if (!raw) return { userId: '', orgId: '' }

  // Yöntem 1: base64url JSON
  try {
    const b64    = raw.replace(/-/g, '+').replace(/_/g, '/')
    const padLen = (4 - (b64.length % 4)) % 4
    const padded = b64 + '='.repeat(padLen)
    const obj    = JSON.parse(Buffer.from(padded, 'base64').toString('utf-8'))
    if (typeof obj?.userId === 'string' && /^[0-9a-f-]{36}$/i.test(obj.userId)) {
      return { userId: obj.userId, orgId: typeof obj.orgId === 'string' ? obj.orgId : '' }
    }
  } catch { /* devam */ }

  // Yöntem 2: eski "userId|orgId" formatı
  if (raw.includes('|')) {
    const [u, o] = raw.split('|')
    if (/^[0-9a-f-]{36}$/i.test(u)) return { userId: u, orgId: o || '' }
  }

  // Yöntem 3: düz UUID
  if (/^[0-9a-f-]{36}$/i.test(raw)) return { userId: raw, orgId: '' }

  return { userId: '', orgId: '' }
}

export async function GET(req: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseAdmin = getSupabaseAdmin() as any
  const code       = req.nextUrl.searchParams.get('code')
  const rawState   = req.nextUrl.searchParams.get('state') || ''
  const oauthError = req.nextUrl.searchParams.get('error')

  const { userId, orgId } = decodeState(rawState)

  if (oauthError || !code || !userId) {
    const base = getReturnBase(req)
    const url  = new URL(base, req.url)
    url.searchParams.set('drive_error', oauthError || 'missing_params')
    const res = NextResponse.redirect(url)
    res.cookies.delete('drive_return_to')
    return res
  }

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
    console.error('[Drive Callback] Token exchange failed:', tokens)
    const base = getReturnBase(req)
    const url  = new URL(base, req.url)
    url.searchParams.set('drive_error', 'token_exchange_failed')
    const res = NextResponse.redirect(url)
    res.cookies.delete('drive_return_to')
    return res
  }

  const expiry = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString()

  // Mevcut satırı bul — sadece user_id ile, güvenli
  const { data: existing, error: selectError } = await supabaseAdmin
    .from('drive_tokens')
    .select('user_id, refresh_token')
    .eq('user_id', userId)
    .maybeSingle()

  if (selectError) {
    console.error('[Drive Callback] Select error:', selectError)
    const base = getReturnBase(req)
    const url  = new URL(base, req.url)
    url.searchParams.set('drive_error', encodeURIComponent(selectError.message))
    const res = NextResponse.redirect(url)
    res.cookies.delete('drive_return_to')
    return res
  }

  const refreshToken = tokens.refresh_token || existing?.refresh_token || null

  const tokenPayload: Record<string, unknown> = {
    access_token:  tokens.access_token,
    refresh_token: refreshToken,
    expiry,
    updated_at:    new Date().toISOString(),
  }
  if (orgId && /^[0-9a-f-]{36}$/i.test(orgId)) {
    tokenPayload.organization_id = orgId
  }

  let saveError: { message: string } | null = null

  if (existing) {
    const { error } = await supabaseAdmin
      .from('drive_tokens')
      .update(tokenPayload)
      .eq('user_id', userId)
    saveError = error
  } else {
    const { error } = await supabaseAdmin
      .from('drive_tokens')
      .insert({ user_id: userId, ...tokenPayload })
    saveError = error
  }

  if (saveError) {
    console.error('[Drive Callback] Save error:', saveError)
    const base = getReturnBase(req)
    const url  = new URL(base, req.url)
    url.searchParams.set('drive_error', encodeURIComponent(saveError.message))
    const res = NextResponse.redirect(url)
    res.cookies.delete('drive_return_to')
    return res
  }

  console.log('[Drive Callback] Token saved — userId:', userId, 'orgId:', orgId)

  const base = getReturnBase(req)
  const url  = new URL(base, req.url)
  url.searchParams.set('drive_connected', 'true')
  const response = NextResponse.redirect(url)
  response.cookies.delete('drive_return_to')
  return response
}
