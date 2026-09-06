import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { onbelleksizFetch } from '@/lib/server/supabaseFetch'

const joinByCodeSchema = z.object({
  code: z.string().min(1).max(12).regex(/^[A-Z0-9]+$/, 'Geçersiz kod formatı'),
})

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: onbelleksizFetch } },
  )
}

const FREE_MAX_MEMBERS = 5

// POST /api/join-by-code
// Body: { code: string }
// Kullanıcıyı katılım koduyla bir organizasyona ekler.
export async function POST(request: NextRequest) {
  const adminClient = getAdminClient()

  // 1. Auth
  const authHeader = request.headers.get('authorization')
  if (!authHeader) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: { user } } = await adminClient.auth.getUser(authHeader.replace('Bearer ', ''))
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  // 2. Body
  let raw: unknown
  try { raw = await request.json() } catch {
    return NextResponse.json({ error: 'Geçersiz istek gövdesi' }, { status: 400 })
  }
  const parsed = joinByCodeSchema.safeParse({ code: (raw as Record<string, unknown>)?.code?.toString?.().trim().toUpperCase() })
  if (!parsed.success) {
    return NextResponse.json({ error: 'Geçersiz katılım kodu' }, { status: 400 })
  }
  const code = parsed.data.code

  // 3. Koda göre org bul
  const { data: org } = await adminClient
    .from('organizations')
    .select('id, slug, plan, max_members')
    .eq('join_code', code)
    .single()

  if (!org) return NextResponse.json({ error: 'Katılım kodu bulunamadı' }, { status: 404 })

  // 4. Zaten üye mi?
  const { data: existing } = await adminClient
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ success: true, slug: org.slug })
  }

  // 5. Üye limiti kontrolü (free plan)
  if (org.plan === 'free') {
    const { count } = await adminClient
      .from('organization_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('organization_id', org.id)

    const limit = org.max_members ?? FREE_MAX_MEMBERS
    if ((count ?? 0) >= limit) {
      return NextResponse.json(
        { error: 'Bu organizasyon üye limitine ulaştı. Yönetici planı yükseltmeli.' },
        { status: 403 }
      )
    }
  }

  // 6. Üye ekle
  const { error } = await adminClient
    .from('organization_members')
    .insert({ organization_id: org.id, user_id: user.id, role: 'member' })

  if (error) return NextResponse.json({ error: 'Katılma işlemi başarısız' }, { status: 500 })

  return NextResponse.json({ success: true, slug: org.slug })
}
