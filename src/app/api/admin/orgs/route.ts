import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { onbelleksizFetch } from '@/lib/server/supabaseFetch'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: onbelleksizFetch } },
  )
}

function isSuperAdmin(email: string | undefined): boolean {
  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL
  return !!superAdminEmail && email === superAdminEmail
}

// GET /api/admin/orgs
// Super admin: tüm organizasyonları üye sayısıyla döndür
export async function GET(request: NextRequest) {
  const adminClient = getAdminClient()

  // Auth
  const authHeader = request.headers.get('authorization')
  if (!authHeader) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: { user } } = await adminClient.auth.getUser(authHeader.replace('Bearer ', ''))
  if (!user || !isSuperAdmin(user.email)) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })
  }

  // Tüm org'ları çek
  const { data: orgs } = await adminClient
    .from('organizations')
    .select('id, name, slug, plan, max_members, created_by, created_at, join_code')
    .order('created_at', { ascending: false })

  // Üye sayılarını çek
  const { data: memberCounts } = await adminClient
    .from('organization_members')
    .select('organization_id, role')

  // Owner emaillerini bulmak için auth.admin.listUsers
  const { data: authUsers } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
  const emailMap = Object.fromEntries((authUsers?.users ?? []).map(u => [u.id, u.email ?? '']))

  const countByOrg: Record<string, number> = {}
  const ownerByOrg: Record<string, string> = {}
  for (const m of memberCounts ?? []) {
    countByOrg[m.organization_id] = (countByOrg[m.organization_id] ?? 0) + 1
    if (m.role === 'owner') {
      // owner user_id → email lazım, ama sadece organization_id ve role var burada
      // ayrı bir sorgu yapmak yerine created_by kullanacağız
    }
  }

  const result = (orgs ?? []).map(o => ({
    ...o,
    memberCount: countByOrg[o.id] ?? 0,
    createdByEmail: emailMap[o.created_by] ?? '',
  }))

  return NextResponse.json({ orgs: result })
}
