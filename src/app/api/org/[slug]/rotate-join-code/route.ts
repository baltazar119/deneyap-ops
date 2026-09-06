import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { onbelleksizFetch } from '@/lib/server/supabaseFetch'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: onbelleksizFetch } },
  )
}

// POST /api/org/[slug]/rotate-join-code
// Admin veya owner, org'un katılım kodunu yeniler.
export async function POST(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  const adminClient = getAdminClient()

  // 1. Auth
  const authHeader = request.headers.get('authorization')
  if (!authHeader) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: { user } } = await adminClient.auth.getUser(authHeader.replace('Bearer ', ''))
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  // 2. Org bul
  const { data: org } = await adminClient
    .from('organizations')
    .select('id')
    .eq('slug', params.slug)
    .single()

  if (!org) return NextResponse.json({ error: 'Org bulunamadı' }, { status: 404 })

  // 3. Caller admin/owner mi?
  const { data: callerMember } = await adminClient
    .from('organization_members')
    .select('role')
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .single()

  if (!callerMember || !['owner', 'admin'].includes(callerMember.role)) {
    return NextResponse.json({ error: 'Sadece admin veya sahip bu işlemi yapabilir' }, { status: 403 })
  }

  // 4. Çakışmasız yeni kod üret
  let newCode: string
  let attempts = 0

  while (true) {
    newCode = crypto.randomBytes(8).toString('hex').toUpperCase().slice(0, 10)

    const { data: collision } = await adminClient
      .from('organizations')
      .select('id')
      .eq('join_code', newCode)
      .maybeSingle()

    if (!collision) break
    if (++attempts > 20) {
      return NextResponse.json({ error: 'Kod üretimi başarısız, tekrar deneyin' }, { status: 500 })
    }
  }

  // 5. Güncelle
  const { error } = await adminClient
    .from('organizations')
    .update({ join_code: newCode! })
    .eq('id', org.id)

  if (error) return NextResponse.json({ error: 'Güncelleme başarısız' }, { status: 500 })

  return NextResponse.json({ success: true, join_code: newCode! })
}
