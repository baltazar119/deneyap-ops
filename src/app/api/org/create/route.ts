import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { rateLimit, getClientIp } from '@/lib/rateLimit'
import { writeAuditLog } from '@/lib/audit'

const createOrgSchema = z.object({
  name: z.string().min(1, 'Workspace adı gerekli').max(60, 'Ad en fazla 60 karakter olabilir').trim(),
  slug: z.string().min(1, 'URL gerekli').max(50, 'URL en fazla 50 karakter olabilir')
    .regex(/^[a-z0-9-]+$/, 'URL sadece küçük harf, rakam ve tire içerebilir').trim(),
})

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// POST /api/org/create
// Yeni bir organizasyon oluşturur. Service role ile RLS bypass eder.
export async function POST(request: NextRequest) {
  // Rate limit: IP başına 5 org / saat
  const ip = getClientIp(request)
  const rl = await rateLimit(`create-org:${ip}`, 5, 60 * 60 * 1000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Çok fazla istek. Lütfen bekleyin.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    )
  }

  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })
  }

  const serviceClient = getServiceClient()

  // Token ile kullanıcıyı doğrula
  const { data: { user }, error: authError } = await serviceClient.auth.getUser(
    authHeader.replace('Bearer ', '')
  )
  if (authError || !user) {
    return NextResponse.json({ error: 'Geçersiz oturum' }, { status: 401 })
  }

  // Body'yi parse et ve validate et
  let name: string, slug: string
  try {
    const raw = await request.json()
    const parsed = createOrgSchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }
    name = parsed.data.name
    slug = parsed.data.slug
  } catch {
    return NextResponse.json({ error: 'Geçersiz istek gövdesi' }, { status: 400 })
  }

  // Kullanıcının Pro olup olmadığını kontrol et
  const { data: profile } = await serviceClient
    .from('profiles')
    .select('plan')
    .eq('id', user.id)
    .single()

  const isPro = (profile?.plan ?? 'free') === 'pro'

  // Kullanıcının mevcut org sayısını kontrol et
  const { count: existingOrgCount } = await serviceClient
    .from('organization_members')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('role', 'owner')

  // Free kullanıcılar yalnızca 1 workspace sahibi olabilir
  if (!isPro && (existingOrgCount ?? 0) >= 1) {
    return NextResponse.json(
      { error: 'Birden fazla workspace oluşturmak için Pro plan gereklidir' },
      { status: 403 }
    )
  }

  // ── Org oluştur ─────────────────────────────────────────────────────────────
  const { data: org, error: orgErr } = await serviceClient
    .from('organizations')
    .insert({ name, slug, created_by: user.id })
    .select('id, slug')
    .single()

  if (orgErr) {
    const isSlugConflict =
      orgErr.message?.includes('unique') ||
      orgErr.code === '23505'
    return NextResponse.json(
      { error: isSlugConflict ? 'Bu URL zaten kullanılıyor' : 'Workspace oluşturulamadı', detail: orgErr.message },
      { status: isSlugConflict ? 409 : 500 }
    )
  }

  if (!org) {
    return NextResponse.json({ error: 'Workspace oluşturulamadı' }, { status: 500 })
  }

  // ── Owner olarak ekle ────────────────────────────────────────────────────────
  const { error: memberErr } = await serviceClient
    .from('organization_members')
    .insert({ organization_id: org.id, user_id: user.id, role: 'owner' })

  if (memberErr) {
    // Org oluştu ama üye eklenemedi — org'u geri al
    await serviceClient.from('organizations').delete().eq('id', org.id)
    return NextResponse.json({ error: 'Üyelik kaydı oluşturulamadı' }, { status: 500 })
  }

  // ── Boş project context oluştur ─────────────────────────────────────────────
  await serviceClient
    .from('project_context')
    .insert({ organization_id: org.id, content: '', updated_by: user.id })

  // ── Brand settings oluştur ──────────────────────────────────────────────────
  await serviceClient
    .from('brand_settings')
    .insert({ organization_id: org.id, org_name: name })

  await writeAuditLog({
    userId: user.id,
    orgId: org.id,
    action: 'org_created',
    entityType: 'organization',
    entityId: org.id,
    metadata: { name, slug },
    ipAddress: getClientIp(request),
  })

  return NextResponse.json({ id: org.id, slug: org.slug })
}
