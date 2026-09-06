import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { onbelleksizFetch } from '@/lib/server/supabaseFetch'

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

// PATCH /api/admin/orgs/[orgId]
// Super admin: org planını değiştir
export async function PATCH(
  request: NextRequest,
  { params }: { params: { orgId: string } }
) {
  const adminClient = getAdminClient()

  // Auth
  const authHeader = request.headers.get('authorization')
  if (!authHeader) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: { user } } = await adminClient.auth.getUser(authHeader.replace('Bearer ', ''))
  if (!user || !isSuperAdmin(user.email)) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })
  }

  const body = await request.json() as { plan?: 'free' | 'pro'; max_members?: number }
  const updates: Record<string, unknown> = {}

  if (body.plan === 'pro') {
    updates.plan = 'pro'
    updates.max_members = body.max_members ?? 999
  } else if (body.plan === 'free') {
    updates.plan = 'free'
    updates.max_members = body.max_members ?? 5
  } else {
    return NextResponse.json({ error: 'Geçersiz plan değeri' }, { status: 400 })
  }

  const { error } = await adminClient
    .from('organizations')
    .update(updates)
    .eq('id', params.orgId)

  if (error) return NextResponse.json({ error: 'Güncelleme başarısız' }, { status: 500 })

  console.log(JSON.stringify({
    audit: 'admin_org_plan_change',
    admin_user_id: user.id,
    org_id: params.orgId,
    new_plan: updates.plan,
    new_max_members: updates.max_members,
    ts: new Date().toISOString(),
  }))

  return NextResponse.json({ success: true })
}
