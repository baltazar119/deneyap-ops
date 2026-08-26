import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { sendEmail } from '@/lib/email'
import { FREE_LIMITS } from '@/lib/featureGate'
import { rateLimit, getClientIp } from '@/lib/rateLimit'
import { writeAuditLog } from '@/lib/audit'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET /api/org/invite/info?token=... — Davet bilgisi (public, token ile)
export async function GET(request: NextRequest) {
  const adminClient = getAdminClient()
  const token = request.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'Token gerekli' }, { status: 400 })

  const { data: invitation } = await adminClient
    .from('organization_invitations')
    .select(`
      role,
      expires_at,
      accepted_at,
      invited_by,
      organizations!inner (name)
    `)
    .eq('token', token)
    .single()

  if (!invitation) return NextResponse.json({ error: 'Davet bulunamadı' }, { status: 404 })
  if (invitation.accepted_at) return NextResponse.json({ error: 'Davet zaten kullanıldı', code: 'used' }, { status: 410 })
  if (new Date(invitation.expires_at) < new Date()) return NextResponse.json({ error: 'Davet süresi doldu', code: 'expired' }, { status: 410 })

  // Davet eden kişinin adı
  const { data: inviter } = await adminClient
    .from('profiles')
    .select('full_name')
    .eq('id', invitation.invited_by)
    .single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orgName = (invitation.organizations as any)?.name ?? ''

  return NextResponse.json({
    organizationName: orgName,
    role: invitation.role,
    inviterName: inviter?.full_name ?? null,
  })
}

const inviteSchema = z.object({
  organization_id: z.string().uuid('Geçersiz organizasyon ID'),
  email: z.string().email('Geçersiz e-posta adresi').max(254),
  role: z.enum(['admin', 'member', 'viewer', 'consultant']),
})

// POST /api/org/invite — Yeni davet oluştur (admin)
export async function POST(request: NextRequest) {
  // Rate limit: IP başına 10 davet / 15 dakika
  const ip = getClientIp(request)
  const rl = await rateLimit(`invite:${ip}`, 10, 15 * 60 * 1000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Çok fazla istek. Lütfen bekleyin.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    )
  }

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Geçersiz istek gövdesi' }, { status: 400 })
  }

  const parsed = inviteSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }
  const { organization_id, email, role } = parsed.data

  const adminClient = getAdminClient()

  // Caller'ın session'ını doğrula
  const authHeader = request.headers.get('authorization')
  if (!authHeader) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authErr } = await adminClient.auth.getUser(token)
  if (authErr || !user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  // Caller bu org'da admin mi?
  const { data: membership } = await adminClient
    .from('organization_members')
    .select('role')
    .eq('organization_id', organization_id)
    .eq('user_id', user.id)
    .single()

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })
  }

  // Org bilgisini çek (plan + mevcut üye sayısı)
  const { data: org } = await adminClient
    .from('organizations')
    .select('plan, max_members, name, slug')
    .eq('id', organization_id)
    .single()

  if (!org) return NextResponse.json({ error: 'Org bulunamadı' }, { status: 404 })

  // Free plan sınır kontrolü
  if (org.plan === 'free') {
    const { count } = await adminClient
      .from('organization_members')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organization_id)

    if ((count ?? 0) >= FREE_LIMITS.maxMembers) {
      return NextResponse.json({
        error: `Ücretsiz planda en fazla ${FREE_LIMITS.maxMembers} üye olabilir. Pro plana geçin.`,
        code: 'member_limit',
      }, { status: 403 })
    }
  }

  // Email zaten üye mi?
  const { data: existingUser } = await adminClient
    .from('profiles')
    .select('id')
    .eq('email', email)
    .single()

  if (existingUser) {
    const { data: existingMember } = await adminClient
      .from('organization_members')
      .select('id')
      .eq('organization_id', organization_id)
      .eq('user_id', existingUser.id)
      .single()

    if (existingMember) {
      return NextResponse.json({ error: 'Bu kullanıcı zaten üye' }, { status: 409 })
    }
  }

  // Davet oluştur
  const { data: invitation, error: invErr } = await adminClient
    .from('organization_invitations')
    .insert({ organization_id, email, role, invited_by: user.id })
    .select('token')
    .single()

  if (invErr || !invitation) {
    return NextResponse.json({ error: 'Davet oluşturulamadı' }, { status: 500 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const inviteLink = `${appUrl}/invite/${invitation.token}`

  const roleLabels: Record<string, string> = {
    admin: 'Yönetici', member: 'Üye', consultant: 'Danışman',
  }

  // Email gönder
  try {
    await sendEmail(
      email,
      `${org.name} workspace'ine davet edildiniz`,
      `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#0d1a2a">Workspace Daveti</h2>
        <p><strong>${org.name}</strong> ekibine <strong>${roleLabels[role] ?? role}</strong> olarak davet edildiniz.</p>
        <a href="${inviteLink}" style="display:inline-block;background:#2288c9;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;margin:16px 0">
          Daveti Kabul Et
        </a>
        <p style="color:#666;font-size:12px">Bu link 7 gün geçerlidir.</p>
      </div>`
    )
  } catch {
    // Email gönderilemese de davet oluşturuldu
  }

  await writeAuditLog({
    userId: user.id,
    orgId: organization_id,
    action: 'member_invited',
    entityType: 'invitation',
    entityId: invitation.token,
    metadata: { email, role },
    ipAddress: ip,
  })

  return NextResponse.json({ success: true, inviteLink })
}
