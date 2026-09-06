import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { onbelleksizFetch } from '@/lib/server/supabaseFetch'

export const dynamic = 'force-dynamic'

/**
 * AI taslaklarını gerçek görevlere çevirir.
 *
 * Bu route daha önce çalışmıyordu: `tasks.organization_id` NOT NULL olmasına
 * rağmen insert'e eklenmiyordu, yani her yayınlama denemesi kısıt ihlaliyle
 * düşüyordu. Ayrıca yetkilendirme org rolüne değil global `profiles.role`'e
 * bakıyordu — bir org'un yöneticisi başka org'un taslağını yayınlayabilirdi.
 */

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: onbelleksizFetch } },
  )
}

/** draft_set'in ait olduğu org'da yazma yetkisi var mı */
async function yetkiCoz(req: NextRequest, draftSetId: string) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return { hata: NextResponse.json({ error: 'Yetkisiz erişim.' }, { status: 401 }) }

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return { hata: NextResponse.json({ error: 'Yetkisiz erişim.' }, { status: 401 }) }

  const { data: draftSet } = await db
    .from('draft_sets')
    .select('id, organization_id')
    .eq('id', draftSetId)
    .maybeSingle()

  if (!draftSet?.organization_id) {
    return { hata: NextResponse.json({ error: 'Taslak seti bulunamadı.' }, { status: 404 }) }
  }

  const { data: uyelik } = await db
    .from('organization_members')
    .select('role')
    .eq('organization_id', draftSet.organization_id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!uyelik || !['owner', 'admin'].includes(uyelik.role)) {
    return { hata: NextResponse.json({ error: 'Bu işlem için yetkiniz yok.' }, { status: 403 }) }
  }

  return { db, userId: user.id, orgId: draftSet.organization_id as string }
}

/** Kabul kriterlerini açıklamanın sonuna markdown blok olarak ekler */
function aciklamayaKriterEkle(aciklama: string | null, kriterler: unknown): string | null {
  if (!Array.isArray(kriterler) || kriterler.length === 0) return aciklama
  const liste = kriterler
    .filter((k): k is string => typeof k === 'string' && k.trim().length > 0)
    .map((k) => `- ${k.trim()}`)
  if (!liste.length) return aciklama
  const blok = `## Kabul Kriterleri\n${liste.join('\n')}`
  return aciklama ? `${aciklama}\n\n${blok}` : blok
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { draft_set_id?: string; sprint_id?: string }
    const { draft_set_id, sprint_id } = body

    if (!draft_set_id) {
      return NextResponse.json({ error: 'draft_set_id gerekli.' }, { status: 400 })
    }

    const yetki = await yetkiCoz(req, draft_set_id)
    if ('hata' in yetki) return yetki.hata
    const { db, userId, orgId } = yetki

    /* ── Taslak görevler ──────────────────────────────────────────────────── */
    const { data: draftTasks, error: fetchError } = await db
      .from('draft_tasks')
      .select('*')
      .eq('draft_set_id', draft_set_id)
      .order('order_index', { ascending: true })

    if (fetchError) {
      console.error('[ai-tasks/publish] draft_tasks fetch hatası:', fetchError)
      return NextResponse.json({ error: 'Taslak görevler alınamadı.' }, { status: 500 })
    }
    if (!draftTasks?.length) {
      return NextResponse.json({ error: 'Yayınlanacak görev yok.' }, { status: 400 })
    }

    /* ── tasks tablosuna yaz ──────────────────────────────────────────────── */
    // draft category → tasks task_type (değerler birebir aynı, bkz. lib/taskTypes.ts)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const taskRows = draftTasks.map((dt: any) => ({
      organization_id: orgId,          // ← NOT NULL; eksikliği route'u tamamen bozuyordu
      title:           dt.title,
      description:     aciklamayaKriterEkle(dt.description || null, dt.acceptance_criteria),
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

    const { data: insertedTasks, error: insertError } = await db
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

    /* ── Bağımlılıkları taşı ──────────────────────────────────────────────── */
    // Taslaktaki depends_on, draft_task id'sine işaret ediyor; sırayla eklendikleri
    // için draft id → yeni task id haritasını kurabiliyoruz.
    if (insertedTasks?.length === draftTasks.length) {
      const harita = new Map<string, string>()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      draftTasks.forEach((dt: any, i: number) => harita.set(dt.id, insertedTasks[i].id))

      const bagimliliklar = draftTasks
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((dt: any) => dt.depends_on && harita.has(dt.depends_on))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((dt: any) => ({
          task_id:    harita.get(dt.id)!,
          depends_on: harita.get(dt.depends_on)!,
        }))

      if (bagimliliklar.length) {
        const { error: depError } = await db.from('task_dependencies').insert(bagimliliklar)
        if (depError) {
          console.error('[ai-tasks/publish] bağımlılık insert hatası (kritik değil):', depError)
        }
      }
    }

    /* ── Bildirim — yalnızca BU org'un yöneticileri ───────────────────────── */
    // Önceden tüm sistemdeki admin+member profillerine gidiyordu (org filtresi yoktu).
    const { data: uyeler } = await db
      .from('organization_members')
      .select('user_id')
      .eq('organization_id', orgId)
      .in('role', ['owner', 'admin'])

    const { data: org } = await db
      .from('organizations').select('slug').eq('id', orgId).maybeSingle()

    if (uyeler?.length) {
      const notifRows = uyeler.map((u: { user_id: string }) => ({
        user_id:         u.user_id,
        organization_id: orgId,
        type:            'task',
        event_type:      'task_assigned',
        title:           `${draftTasks.length} yeni görev yayınlandı`,
        description:     `AI Asistan tarafından oluşturulan ${draftTasks.length} görev, görev listesine eklendi.`,
        actor_id:        userId,
        link:            org?.slug ? `/org/${org.slug}/tasks` : null,
        is_read:         false,
      }))

      const { error: notifError } = await db.from('notifications').insert(notifRows)
      if (notifError) {
        console.error('[ai-tasks/publish] bildirim insert hatası (kritik değil):', notifError)
      }
    }

    /* ── Taslak setini kapat ──────────────────────────────────────────────── */
    const { error: updateError } = await db
      .from('draft_sets')
      .update({ status: 'published' })
      .eq('id', draft_set_id)

    if (updateError) {
      console.error('[ai-tasks/publish] draft_sets status güncelleme hatası (kritik değil):', updateError)
    }

    return NextResponse.json({
      published_count: insertedTasks?.length ?? draftTasks.length,
    })
  } catch (err) {
    console.error('[ai-tasks/publish] beklenmeyen hata:', err)
    return NextResponse.json({ error: 'Sunucu hatası. Lütfen tekrar deneyin.' }, { status: 500 })
  }
}
