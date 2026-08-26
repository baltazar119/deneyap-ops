import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// ── Admin Doğrulama ────────────────────────────────────────────────────────────

async function getAdminUserId(req: NextRequest): Promise<string | null> {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return null

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: { user } } = await adminClient.auth.getUser(token)
  if (!user) return null

  const { data: profile } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  return profile?.role === 'admin' ? user.id : null
}

// ── POST Handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const userId = await getAdminUserId(req)
    if (!userId) {
      return NextResponse.json({ error: 'Yetkisiz erişim.' }, { status: 401 })
    }

    const body = await req.json() as { draft_set_id?: string; sprint_id?: string }
    const { draft_set_id, sprint_id } = body

    if (!draft_set_id) {
      return NextResponse.json({ error: 'draft_set_id gerekli.' }, { status: 400 })
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    // ── Draft görevleri getir ─────────────────────────────────────────────────
    const { data: draftTasks, error: fetchError } = await supabaseAdmin
      .from('draft_tasks')
      .select('*')
      .eq('draft_set_id', draft_set_id)
      .order('order_index', { ascending: true })

    if (fetchError) {
      console.error('[ai-tasks/publish] draft_tasks fetch hatası:', fetchError)
      return NextResponse.json({ error: 'Taslak görevler alınamadı.' }, { status: 500 })
    }

    if (!draftTasks || draftTasks.length === 0) {
      return NextResponse.json({ error: 'Yayınlanacak görev yok.' }, { status: 400 })
    }

    // ── Gerçek tasks tablosuna insert ─────────────────────────────────────────
    // draft category → tasks task_type (değerler birebir aynı)
    const taskRows = draftTasks.map((dt: any) => ({
      title:           dt.title,
      description:     dt.description || null,
      status:          'backlog',
      priority:        dt.priority,
      task_type:       dt.category,
      assignee_id:     null,
      due_date:        dt.due_date || null,
      estimated_hours: dt.estimated_hours || null,
      actual_hours:    null,
      sprint_id:       sprint_id || null,
      created_by:      userId,
    }))

    const { data: insertedTasks, error: insertError } = await supabaseAdmin
      .from('tasks')
      .insert(taskRows)
      .select('id, title')

    if (insertError) {
      console.error('[ai-tasks/publish] tasks insert hatası:', insertError)
      return NextResponse.json(
        { error: `Görevler eklenemedi: ${insertError.message}` },
        { status: 500 },
      )
    }

    // ── Bildirimleri oluştur (admin + member) ─────────────────────────────────
    // notifications tablosu event_type CHECK constraint'i 'task_assigned' kabul eder
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .in('role', ['admin', 'member'])

    if (profiles && profiles.length > 0) {
      const notifRows = profiles.map((p: any) => ({
        user_id:     p.id,
        type:        'task',
        event_type:  'task_assigned',
        title:       `${draftTasks.length} yeni görev yayınlandı`,
        description: `AI Asistan tarafından oluşturulan ${draftTasks.length} görev, görev listesine eklendi.`,
        actor_id:    userId,
        link:        '/tasks',
        is_read:     false,
      }))

      // Bildirim hatası publish işlemini bloke etmemeli (send-email pattern'ı ile aynı)
      const { error: notifError } = await supabaseAdmin
        .from('notifications')
        .insert(notifRows)

      if (notifError) {
        console.error('[ai-tasks/publish] notifications insert hatası (non-critical):', notifError)
      }
    }

    // ── Taslak setini 'published' yap ─────────────────────────────────────────
    const { error: updateError } = await supabaseAdmin
      .from('draft_sets')
      .update({ status: 'published' })
      .eq('id', draft_set_id)

    if (updateError) {
      // Görevler başarıyla eklendi — sadece status güncelleme başarısız
      // Log et ama 200 dön (görevler görünür, UI yine de güncellenir)
      console.error('[ai-tasks/publish] draft_sets status update hatası (non-critical):', updateError)
    }

    return NextResponse.json({
      published_count: insertedTasks?.length ?? draftTasks.length,
    })
  } catch (err) {
    console.error('[ai-tasks/publish] beklenmeyen hata:', err)
    return NextResponse.json({ error: 'Sunucu hatası. Lütfen tekrar deneyin.' }, { status: 500 })
  }
}
