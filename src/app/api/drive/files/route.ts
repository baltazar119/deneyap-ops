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

// GET: list files for a task
export async function GET(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin()
  const taskId = req.nextUrl.searchParams.get('taskId')
  if (!taskId) return NextResponse.json({ error: 'taskId gerekli' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('task_files')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ files: data || [] })
}

// DELETE: remove a file record (and from admin's Drive)
export async function DELETE(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin()
  const { fileId } = await req.json()
  if (!fileId) return NextResponse.json({ error: 'Eksik parametre.' }, { status: 400 })

  // Get drive file ID before deleting record
  const { data: fileRow } = await (supabaseAdmin as any)
    .from('task_files')
    .select('drive_file_id')
    .eq('id', fileId)
    .single()

  // Delete DB record
  await (supabaseAdmin as any).from('task_files').delete().eq('id', fileId)

  // Delete from admin's Drive
  if (fileRow?.drive_file_id) {
    const adminId = process.env.DRIVE_ADMIN_USER_ID
    const query = adminId
      ? (supabaseAdmin as any).from('drive_tokens').select('access_token').eq('user_id', adminId).single()
      : (supabaseAdmin as any).from('drive_tokens').select('access_token').limit(1).single()

    const { data: tokenRow } = await query

    if (tokenRow?.access_token) {
      await fetch(`https://www.googleapis.com/drive/v3/files/${fileRow.drive_file_id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tokenRow.access_token}` },
      })
    }
  }

  return NextResponse.json({ success: true })
}
