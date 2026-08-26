import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { writeAuditLog } from '@/lib/audit'
import { getClientIp } from '@/lib/rateLimit'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET /api/me/export
// KVKK Md.20 — Kullanıcı kendi verilerini JSON olarak indirebilir.
// Authorization: Bearer <access_token>
export async function GET(request: NextRequest) {
  const adminClient = getAdminClient()

  // 1. Auth
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: { user } } = await adminClient.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const uid = user.id

  // 2. Tüm kişisel verileri paralel çek
  const [
    { data: profile },
    { data: checkins },
    { data: schedules },
    { data: assignedTasks },
    { data: createdTasks },
    { data: memberships },
    { data: emailPrefs },
  ] = await Promise.all([
    adminClient.from('profiles').select('*').eq('id', uid).single(),
    adminClient.from('checkins').select('*').eq('user_id', uid).order('timestamp', { ascending: false }),
    adminClient.from('schedules').select('*').eq('user_id', uid).order('start_time', { ascending: false }),
    adminClient.from('tasks').select('id, title, description, status, priority, task_type, start_date, due_date, estimated_hours, actual_hours, created_at').eq('assignee_id', uid),
    adminClient.from('tasks').select('id, title, description, status, priority, task_type, start_date, due_date, created_at').eq('created_by', uid),
    adminClient.from('organization_members').select('role, joined_at, organizations(id, name, slug)').eq('user_id', uid),
    adminClient.from('email_preferences').select('*').eq('user_id', uid).maybeSingle(),
  ])

  const exportData = {
    exported_at: new Date().toISOString(),
    requested_by: uid,
    account: {
      email: user.email,
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at,
    },
    profile: profile ?? null,
    checkins: checkins ?? [],
    schedules: schedules ?? [],
    tasks: {
      assigned_to_me: assignedTasks ?? [],
      created_by_me: createdTasks ?? [],
    },
    organization_memberships: memberships ?? [],
    email_preferences: emailPrefs ?? null,
  }

  await writeAuditLog({
    userId: uid,
    action: 'data_exported',
    entityType: 'profile',
    entityId: uid,
    ipAddress: getClientIp(request),
  })

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="deneyap-verilerim-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  })
}
