import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

const patchRoleSchema = z.object({
  role: z.enum(['admin', 'member', 'consultant']),
})

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function getCallerAndOrg(request: NextRequest, slug: string) {
  const adminClient = getAdminClient()
  const authHeader = request.headers.get('authorization')
  if (!authHeader) return null

  const { data: { user } } = await adminClient.auth.getUser(authHeader.replace('Bearer ', ''))
  if (!user) return null

  const { data: org } = await adminClient
    .from('organizations')
    .select('id')
    .eq('slug', slug)
    .single()

  if (!org) return null

  const { data: callerMember } = await adminClient
    .from('organization_members')
    .select('role')
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .single()

  if (!callerMember || !['owner', 'admin'].includes(callerMember.role)) return null

  return { userId: user.id, orgId: org.id, callerRole: callerMember.role }
}

// PATCH /api/org/[slug]/members/[userId] — Rol değiştir
export async function PATCH(
  request: NextRequest,
  { params }: { params: { slug: string; userId: string } }
) {
  const ctx = await getCallerAndOrg(request, params.slug)
  if (!ctx) return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })

  let rawBody: unknown
  try { rawBody = await request.json() } catch {
    return NextResponse.json({ error: 'Geçersiz istek gövdesi' }, { status: 400 })
  }
  const parsedRole = patchRoleSchema.safeParse(rawBody)
  if (!parsedRole.success) {
    return NextResponse.json({ error: 'Geçersiz rol. İzin verilen: admin, member, consultant' }, { status: 400 })
  }
  const { role } = parsedRole.data

  const adminClient = getAdminClient()

  // Hedef üyenin mevcut rolünü kontrol et
  const { data: target } = await adminClient
    .from('organization_members')
    .select('role')
    .eq('organization_id', ctx.orgId)
    .eq('user_id', params.userId)
    .single()

  if (!target) return NextResponse.json({ error: 'Üye bulunamadı' }, { status: 404 })

  // Owner değiştirilemez — Zod schema 'owner' değerini zaten reddeder, target kontrolü yeterli
  if (target.role === 'owner') return NextResponse.json({ error: 'Sahip rolü değiştirilemez' }, { status: 403 })

  await adminClient
    .from('organization_members')
    .update({ role })
    .eq('organization_id', ctx.orgId)
    .eq('user_id', params.userId)

  return NextResponse.json({ success: true })
}

// DELETE /api/org/[slug]/members/[userId] — Üye çıkar
export async function DELETE(
  request: NextRequest,
  { params }: { params: { slug: string; userId: string } }
) {
  const ctx = await getCallerAndOrg(request, params.slug)
  if (!ctx) return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })

  // Kendinizi çıkaramazsınız
  if (params.userId === ctx.userId) return NextResponse.json({ error: 'Kendinizi çıkaramazsınız' }, { status: 400 })

  const adminClient = getAdminClient()

  // Owner çıkarılamaz
  const { data: target } = await adminClient
    .from('organization_members')
    .select('role')
    .eq('organization_id', ctx.orgId)
    .eq('user_id', params.userId)
    .single()

  if (!target) return NextResponse.json({ error: 'Üye bulunamadı' }, { status: 404 })
  if (target.role === 'owner') return NextResponse.json({ error: 'Sahip çıkarılamaz' }, { status: 403 })

  await adminClient
    .from('organization_members')
    .delete()
    .eq('organization_id', ctx.orgId)
    .eq('user_id', params.userId)

  return NextResponse.json({ success: true })
}
