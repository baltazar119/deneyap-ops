import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

/**
 * GET /api/org/[slug]/members
 * Org üyelerini profil bilgileriyle birlikte döndürür.
 * Admin client kullanır — RLS'den bağımsız çalışır.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseAdmin() as any

  // Auth kontrolü
  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })
  }

  // Org bul
  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .eq('slug', params.slug)
    .single()
  if (!org) return NextResponse.json({ error: 'Org bulunamadı' }, { status: 404 })

  // Üyeliği doğrula
  const { data: membership } = await supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!membership) return NextResponse.json({ error: 'Erişim yok' }, { status: 403 })

  // Tüm üyeleri çek
  const { data: members, error } = await supabase
    .from('organization_members')
    .select('user_id, role')
    .eq('organization_id', org.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (!members?.length) return NextResponse.json({ members: [] })

  // Profilleri çek
  const userIds = members.map((m: { user_id: string }) => m.user_id)
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url')
    .in('id', userIds)

  // Auth kullanıcı e-postalarını çek
  const { data: authUsers } = await supabase.auth.admin.listUsers()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const emailMap = Object.fromEntries((authUsers?.users || []).map((u: any) => [u.id, u.email]))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const profileMap = Object.fromEntries((profiles || []).map((p: any) => [p.id, p]))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = members.map((m: any) => ({
    id:     m.user_id,
    role:   m.role,
    name:   profileMap[m.user_id]?.full_name || emailMap[m.user_id]?.split('@')[0] || m.user_id.slice(0, 8),
    email:  emailMap[m.user_id] || '',
    avatar: profileMap[m.user_id]?.avatar_url || null,
  }))

  return NextResponse.json({ members: result })
}
