import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { onbelleksizFetch } from '@/lib/server/supabaseFetch'

export const dynamic = 'force-dynamic'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { fetch: onbelleksizFetch } },
  )
}

/** Otomasyon ayarlarını getir */
export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseAdmin() as any

  const authHeader = req.headers.get('authorization') || ''
  const token      = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .eq('slug', params.slug)
    .single()
  if (!org) return NextResponse.json({ error: 'Org bulunamadı' }, { status: 404 })

  const { data: settings } = await supabase
    .from('automation_settings')
    .select('*')
    .eq('organization_id', org.id)
    .maybeSingle()

  // Kayıt yoksa varsayılanları döndür
  const defaults = {
    task_overdue:          true,
    task_due_soon:         true,
    sprint_ending_soon:    true,
    meeting_notifications: true,
    member_overload:       true,
    overload_threshold:    5,
  }

  return NextResponse.json({ settings: settings ?? defaults })
}

/** Otomasyon ayarlarını güncelle (sadece admin) */
export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseAdmin() as any

  const authHeader = req.headers.get('authorization') || ''
  const token      = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .eq('slug', params.slug)
    .single()
  if (!org) return NextResponse.json({ error: 'Org bulunamadı' }, { status: 404 })

  // Sadece admin/owner kaydedebilir
  const { data: membership } = await supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .single()

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'Yetki yetersiz' }, { status: 403 })
  }

  const body = await req.json()
  const payload = {
    organization_id:       org.id,
    task_overdue:          body.task_overdue          ?? true,
    task_due_soon:         body.task_due_soon         ?? true,
    sprint_ending_soon:    body.sprint_ending_soon    ?? true,
    meeting_notifications: body.meeting_notifications ?? true,
    member_overload:       body.member_overload       ?? true,
    overload_threshold:    body.overload_threshold    ?? 5,
  }

  const { data, error } = await supabase
    .from('automation_settings')
    .upsert(payload, { onConflict: 'organization_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ settings: data })
}
