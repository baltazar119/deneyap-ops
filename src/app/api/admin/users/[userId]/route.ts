import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { OrgRole } from '@/types/database'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function isSuperAdmin(email: string | undefined): boolean {
  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL
  return !!superAdminEmail && email === superAdminEmail
}

// PATCH /api/admin/users/[userId]
// Super admin: bir kullanıcının org içindeki rolünü değiştir veya orgdan çıkar
export async function PATCH(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  const adminClient = getAdminClient()

  // Auth
  const authHeader = request.headers.get('authorization')
  if (!authHeader) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: { user } } = await adminClient.auth.getUser(authHeader.replace('Bearer ', ''))
  if (!user || !isSuperAdmin(user.email)) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })
  }

  const body = await request.json() as {
    action?: 'remove' | 'set_plan' | 'set_ai_addon'
    organization_id?: string
    role?: OrgRole
    plan?: 'free' | 'pro'
    ai_addon?: boolean
  }

  // ── set_plan: kullanıcının kişisel planını değiştir ────────────────────────
  if (body.action === 'set_plan') {
    if (!body.plan || !['free', 'pro'].includes(body.plan)) {
      return NextResponse.json({ error: 'Geçerli bir plan belirtin: free veya pro' }, { status: 400 })
    }
    const { error } = await adminClient
      .from('profiles')
      .update({ plan: body.plan })
      .eq('id', params.userId)

    if (error) return NextResponse.json({ error: 'Plan güncelleme başarısız' }, { status: 500 })
    console.log(JSON.stringify({ audit: 'admin_user_plan_change', admin_id: user.id, target_user_id: params.userId, plan: body.plan, ts: new Date().toISOString() }))
    return NextResponse.json({ success: true })
  }

  // ── set_ai_addon: kullanıcının AI eklentisini aç/kapat ────────────────────
  if (body.action === 'set_ai_addon') {
    const ai_addon = !!body.ai_addon

    const { error: updateError } = await adminClient
      .from('profiles')
      .update({ ai_addon })
      .eq('id', params.userId)

    if (updateError) {
      console.error('[Admin] set_ai_addon update error:', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // Update'in gerçekten uygulandığını doğrula
    const { data: verify, error: verifyError } = await adminClient
      .from('profiles')
      .select('ai_addon')
      .eq('id', params.userId)
      .single()

    if (verifyError) {
      console.error('[Admin] set_ai_addon verify error:', verifyError)
      return NextResponse.json({ error: verifyError.message }, { status: 500 })
    }

    if (!verify) {
      return NextResponse.json({ error: 'Kullanıcı profili bulunamadı' }, { status: 404 })
    }

    console.log('[Admin] set_ai_addon result:', { userId: params.userId, requested: ai_addon, actual: verify.ai_addon })

    return NextResponse.json({ success: true, ai_addon: verify.ai_addon })
  }

  // ── Org işlemleri: organization_id gerekli ────────────────────────────────
  if (!body.organization_id) {
    return NextResponse.json({ error: 'organization_id gerekli' }, { status: 400 })
  }

  if (body.action === 'remove') {
    const { error } = await adminClient
      .from('organization_members')
      .delete()
      .eq('organization_id', body.organization_id)
      .eq('user_id', params.userId)

    if (error) return NextResponse.json({ error: 'Silme başarısız' }, { status: 500 })
    console.log(JSON.stringify({ audit: 'admin_user_removed_from_org', admin_id: user.id, target_user_id: params.userId, org_id: body.organization_id, ts: new Date().toISOString() }))
    return NextResponse.json({ success: true })
  }

  if (body.role) {
    const { error } = await adminClient
      .from('organization_members')
      .update({ role: body.role })
      .eq('organization_id', body.organization_id)
      .eq('user_id', params.userId)

    if (error) return NextResponse.json({ error: 'Rol güncelleme başarısız' }, { status: 500 })
    console.log(JSON.stringify({ audit: 'admin_user_role_change', admin_id: user.id, target_user_id: params.userId, org_id: body.organization_id, new_role: body.role, ts: new Date().toISOString() }))
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Geçersiz istek' }, { status: 400 })
}
