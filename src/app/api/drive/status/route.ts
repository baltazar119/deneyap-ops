import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/driveAdmin'

export const dynamic = 'force-dynamic'

/**
 * GET /api/drive/status?orgId=xxx
 *
 * Workspace'e ait Drive token'ının varlığını kontrol eder.
 * Salt-okunur — DB'yi asla değiştirmez, token yenilemez.
 * Token yenileme sadece upload sırasında yapılır.
 * DB'de access_token VEYA refresh_token varsa "bağlı" sayılır.
 */
export async function GET(req: NextRequest) {
  try {
    const db = getSupabaseAdmin() as any  // eslint-disable-line @typescript-eslint/no-explicit-any

    const adminId = process.env.DRIVE_ADMIN_USER_ID

    let tokenRow: { access_token: string | null; refresh_token: string | null } | null = null

    if (adminId) {
      const { data } = await db
        .from('drive_tokens')
        .select('access_token, refresh_token')
        .eq('user_id', adminId)
        .maybeSingle()
      tokenRow = data
      // Fallback: adminId'e ait token yoksa en son güncellenen token'ı kullan
      if (!tokenRow) {
        const { data: fallback } = await db
          .from('drive_tokens')
          .select('access_token, refresh_token')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        tokenRow = fallback
      }
    } else {
      const { data } = await db
        .from('drive_tokens')
        .select('access_token, refresh_token')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      tokenRow = data
    }

    // DB'de kayıt var ve en az biri dolu ise bağlı say
    const connected = !!(tokenRow && (tokenRow.access_token || tokenRow.refresh_token))
    return NextResponse.json({ connected })
  } catch {
    return NextResponse.json({ connected: false })
  }
}
