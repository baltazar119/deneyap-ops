import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { FREE_LIMITS } from '@/lib/featureGate'
import { onbelleksizFetch } from '@/lib/server/supabaseFetch'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: onbelleksizFetch } },
  )
}

export async function POST(request: NextRequest) {
  const { token } = await request.json() as { token: string }
  if (!token) return NextResponse.json({ error: 'Token gerekli' }, { status: 400 })

  // Caller'ın session'ını doğrula
  const authHeader = request.headers.get('authorization')
  if (!authHeader) return NextResponse.json({ error: 'Giriş gerekli' }, { status: 401 })

  const adminClient = getAdminClient()
  const accessToken = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authErr } = await adminClient.auth.getUser(accessToken)
  if (authErr || !user) return NextResponse.json({ error: 'Giriş gerekli' }, { status: 401 })

  // Daveti bul
  const { data: invitation } = await adminClient
    .from('organization_invitations')
    .select(`
      id, role, expires_at, accepted_at, email,
      organizations!inner (id, slug, plan, name)
    `)
    .eq('token', token)
    .single()

  if (!invitation) return NextResponse.json({ error: 'Davet bulunamadı' }, { status: 404 })
  if (invitation.accepted_at) return NextResponse.json({ error: 'Davet zaten kullanıldı' }, { status: 410 })
  if (new Date(invitation.expires_at) < new Date()) return NextResponse.json({ error: 'Davet süresi doldu' }, { status: 410 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const org = (invitation.organizations as any) as { id: string; slug: string; plan: string; name: string }

  // Free plan üye limiti kontrolü
  if (org.plan === 'free') {
    const { count } = await adminClient
      .from('organization_members')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', org.id)

    if ((count ?? 0) >= FREE_LIMITS.maxMembers) {
      return NextResponse.json({
        error: `Bu workspace üye limitine ulaştı (${FREE_LIMITS.maxMembers} üye). Sahiple iletişime geçin.`,
        code: 'member_limit',
      }, { status: 403 })
    }
  }

  // Zaten üye mi?
  const { data: existing } = await adminClient
    .from('organization_members')
    .select('id')
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .single()

  if (!existing) {
    await adminClient.from('organization_members').insert({
      organization_id: org.id,
      user_id: user.id,
      role: invitation.role,
    })
  }

  // Daveti kabul edildi olarak işaretle
  await adminClient
    .from('organization_invitations')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', invitation.id)

  return NextResponse.json({ success: true, slug: org.slug })
}
