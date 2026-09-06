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

// GET /api/admin/users
// Super admin: tüm kullanıcıları org üyelikleriyle birlikte döndür
export async function GET(request: NextRequest) {
  const adminClient = getAdminClient()

  // Auth
  const authHeader = request.headers.get('authorization')
  if (!authHeader) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: { user } } = await adminClient.auth.getUser(authHeader.replace('Bearer ', ''))
  if (!user || !isSuperAdmin(user.email)) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })
  }

  // Tüm auth kullanıcılarını çek
  const { data: authUsers } = await adminClient.auth.admin.listUsers({ perPage: 1000 })

  // Profilleri çek
  const { data: profiles } = await adminClient
    .from('profiles')
    .select('id, full_name, username, avatar_url, title, bio, skills, plan, ai_addon, created_at')

  // Org üyeliklerini çek
  const { data: memberships } = await adminClient
    .from('organization_members')
    .select('user_id, role, organization_id, joined_at')

  // Organizasyonları çek (created_by dahil)
  const { data: orgs } = await adminClient
    .from('organizations')
    .select('id, name, slug, plan, created_by')

  const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]))
  const orgMap = Object.fromEntries((orgs ?? []).map(o => [o.id, o]))

  // Kullanıcı başına org üyeliklerini grupla
  const membershipsByUser: Record<string, { orgId: string; orgName: string; orgSlug: string; plan: string; role: string; joinedAt: string }[]> = {}
  for (const m of memberships ?? []) {
    if (!membershipsByUser[m.user_id]) membershipsByUser[m.user_id] = []
    const org = orgMap[m.organization_id]
    if (org) {
      membershipsByUser[m.user_id].push({
        orgId: org.id,
        orgName: org.name,
        orgSlug: org.slug,
        plan: org.plan,
        role: m.role,
        joinedAt: m.joined_at,
      })
    }
  }

  // Kullanıcı başına oluşturduğu workspace'leri grupla (created_by alanından)
  const createdOrgsByUser: Record<string, { orgId: string; orgName: string; orgSlug: string; plan: string }[]> = {}
  for (const o of orgs ?? []) {
    if (!o.created_by) continue
    if (!createdOrgsByUser[o.created_by]) createdOrgsByUser[o.created_by] = []
    createdOrgsByUser[o.created_by].push({
      orgId: o.id,
      orgName: o.name,
      orgSlug: o.slug,
      plan: o.plan,
    })
  }

  const users = (authUsers?.users ?? []).map(u => {
    const profile = profileMap[u.id] ?? null
    return {
      id: u.id,
      email: u.email ?? '',
      createdAt: u.created_at,
      lastSignIn: u.last_sign_in_at,
      plan: profile?.plan ?? 'free',
      ai_addon: profile?.ai_addon ?? false,
      profile,
      orgs: membershipsByUser[u.id] ?? [],
      createdOrgs: createdOrgsByUser[u.id] ?? [],
    }
  })

  return NextResponse.json({ users })
}
