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

// POST: dosyayı bir göreve bağla
export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string; fileId: string } }
) {
  const supabaseAdmin = getSupabaseAdmin()
  const { fileId } = params
  const { taskId, linkedBy } = await req.json()

  if (!taskId || !linkedBy) {
    return NextResponse.json({ error: 'taskId ve linkedBy gerekli.' }, { status: 400 })
  }

  // Zaten bağlıysa 409 dön
  const { data: existing } = await supabaseAdmin
    .from('task_file_links')
    .select('id')
    .eq('org_file_id', fileId)
    .eq('task_id', taskId)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ success: true, alreadyLinked: true })
  }

  const { error } = await supabaseAdmin.from('task_file_links').insert({
    org_file_id: fileId,
    task_id: taskId,
    linked_by: linkedBy,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

// DELETE: dosya-görev bağlantısını kaldır
export async function DELETE(
  req: NextRequest,
  { params }: { params: { slug: string; fileId: string } }
) {
  const supabaseAdmin = getSupabaseAdmin()
  const { fileId } = params
  const { taskId } = await req.json()

  if (!taskId) {
    return NextResponse.json({ error: 'taskId gerekli.' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('task_file_links')
    .delete()
    .eq('org_file_id', fileId)
    .eq('task_id', taskId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
