import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { onbelleksizFetch } from '@/lib/server/supabaseFetch'

export const dynamic = 'force-dynamic'

// ── Admin Doğrulama ────────────────────────────────────────────────────────────

async function getAdminUserId(req: NextRequest): Promise<string | null> {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return null

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: onbelleksizFetch } },
  )

  const { data: { user } } = await adminClient.auth.getUser(token)
  if (!user) return null

  // profiles.role global bir alan, org rolüyle bağlantısı yok — 9 ai-tasks
  // route'unda olduğu gibi kullanıcının HERHANGİ bir çalışma alanında
  // owner/admin olup olmadığına bakıyoruz (bkz. src/lib/server/apiAuth.ts).
  const { data: uyelik } = await adminClient
    .from('organization_members')
    .select('role')
    .eq('user_id', user.id)
    .in('role', ['owner', 'admin'])
    .limit(1)
    .maybeSingle()

  return uyelik ? user.id : null
}

// ── GET: Proje bağlamını getir ────────────────────────────────────────────────

export async function GET() {
  try {
    const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: onbelleksizFetch } },
  )

    const { data, error } = await supabase
      .from('project_context')
      .select('*')
      .eq('id', 1)
      .single()

    if (error) {
      console.error('[ai-tasks/context] GET hatası:', error)
      return NextResponse.json({ content: '' })
    }

    return NextResponse.json({ content: data?.content ?? '' })
  } catch (err: any) {
    console.error('[ai-tasks/context] GET beklenmeyen hata:', err)
    return NextResponse.json({ content: '' })
  }
}

// ── POST: Proje bağlamını kaydet ──────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const userId = await getAdminUserId(req)
    if (!userId) {
      return NextResponse.json({ error: 'Yetkisiz erişim.' }, { status: 401 })
    }

    const body = await req.json() as { content?: string }
    const content = body.content ?? ''

    const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: onbelleksizFetch } },
  )

    const { data, error } = await supabaseAdmin
      .from('project_context')
      .upsert({ id: 1, content, updated_at: new Date().toISOString(), updated_by: userId })
      .select('*')
      .single()

    if (error) {
      console.error('[ai-tasks/context] POST hatası:', error)
      return NextResponse.json({ error: 'Bağlam kaydedilemedi.' }, { status: 500 })
    }

    return NextResponse.json({ content: data?.content ?? '' })
  } catch (err: any) {
    console.error('[ai-tasks/context] POST beklenmeyen hata:', err)
    return NextResponse.json({ error: `Sunucu hatası: ${err?.message ?? ''}` }, { status: 500 })
  }
}
