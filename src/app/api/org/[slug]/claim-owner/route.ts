import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// POST /api/org/[slug]/claim-owner
// Bir admin, org'da hiç owner yoksa kendini sahip yapabilir.
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

  // 3. Caller'ın bu org'da admin olduğunu doğrula
  const { data: callerMember } = await adminClient
    .from('organization_members')
    .select('role')
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .single()

  if (!callerMember || callerMember.role !== 'admin') {
    return NextResponse.json({ error: 'Sadece admin bu işlemi yapabilir' }, { status: 403 })
  }

  // 4. Zaten bir owner var mı?
  const { data: existingOwner } = await adminClient
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', org.id)
    .eq('role', 'owner')
    .maybeSingle()

  if (existingOwner) {
    return NextResponse.json({ error: 'Bu organizasyonun zaten bir sahibi var' }, { status: 409 })
  }

  // 5. Caller'ı owner yap
  const { error } = await adminClient
    .from('organization_members')
    .update({ role: 'owner' })
    .eq('organization_id', org.id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: 'Güncelleme başarısız' }, { status: 500 })

  return NextResponse.json({ success: true })
}
