import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { onbelleksizFetch } from '@/lib/server/supabaseFetch'

export const dynamic = 'force-dynamic'

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const googleClientId = process.env.GOOGLE_CLIENT_ID
  const redirectUri = process.env.GOOGLE_REDIRECT_URI
  const driveAdminId = process.env.DRIVE_ADMIN_USER_ID

  const envCheck = {
    supabase_url: !!url,
    service_role_key: !!serviceKey,
    anon_key: !!anonKey,
    using_service_role: !!serviceKey,
    google_client_id: !!googleClientId,
    redirect_uri: redirectUri || 'NOT SET',
    drive_admin_user_id: driveAdminId || 'NOT SET',
  }

  // Try to query drive_tokens table
  let driveTokensStatus: any = null
  let driveTokensRows: any = null
  let tableError: any = null

  try {
    const supabase = createClient(url!, serviceKey || anonKey!, { global: { fetch: onbelleksizFetch } })
    const { data, error, count } = await (supabase as any)
      .from('drive_tokens')
      .select('user_id, expiry, updated_at', { count: 'exact' })

    if (error) {
      tableError = { code: error.code, message: error.message, hint: error.hint }
    } else {
      driveTokensStatus = 'table_exists'
      driveTokensRows = { count, rows: data }
    }
  } catch (e: any) {
    tableError = { exception: e.message }
  }

  return NextResponse.json({
    env: envCheck,
    drive_tokens: {
      status: driveTokensStatus,
      rows: driveTokensRows,
      error: tableError,
    },
  })
}
