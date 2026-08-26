import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { rateLimit } from '@/lib/rateLimit'
import { eylemTokenDogrula, eylemTokenTuket } from '@/lib/eylemToken'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * E-postadaki aksiyon düğmesinin uygulandığı uç.
 *
 * SADECE POST — bu pazarlık dışı bir kural.
 *
 * Kurumsal e-posta tarayıcıları (Microsoft Defender for Office 365, Gmail
 * link tarayıcısı) e-postadaki TÜM linkleri otomatik açar. Bu uç GET'e de
 * cevap verseydi, kimse tıklamadan görevler kendiliğinden "tamamlandı"
 * olurdu. Kullanıcı önce /eylem/[token] onay ekranını görür, oradaki düğme
 * bu ucu POST ile çağırır.
 */

function admin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

function ip(req: NextRequest): string {
  return req.headers.get('cf-connecting-ip')
    ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? 'bilinmiyor'
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const istekIp = ip(req)

  const rl = await rateLimit(`eylem:${istekIp}`, 20, 60 * 1000)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Çok fazla istek.' }, { status: 429 })
  }

  const db = admin()
  const dogrulama = await eylemTokenDogrula(db, params.token)

  if (!dogrulama.ok) {
    const mesaj = {
      gecersiz:     'Bu bağlantı geçersiz.',
      suresi_doldu: 'Bu bağlantının süresi dolmuş. Uygulamadan işlem yapabilirsiniz.',
      kullanilmis:  'Bu bağlantı zaten kullanılmış.',
    }[dogrulama.sebep]
    return NextResponse.json({ error: mesaj, sebep: dogrulama.sebep }, { status: 410 })
  }

  const { kayit } = dogrulama

  const { data: gorev } = await db
    .from('tasks')
    .select('id, title, status, due_date, assignee_id, organization_id')
    .eq('id', kayit.hedef_id)
    .maybeSingle()

  if (!gorev || gorev.organization_id !== kayit.organization_id) {
    return NextResponse.json({ error: 'Görev bulunamadı.' }, { status: 404 })
  }

  // Token tek başına yetki vermez: kural burada da uygulanıyor
  // (tasks_update RLS'iyle aynı: sahibi ya da org yöneticisi).
  const { data: uyelik } = await db
    .from('organization_members')
    .select('role')
    .eq('organization_id', gorev.organization_id)
    .eq('user_id', kayit.user_id)
    .maybeSingle()

  const yetkili = gorev.assignee_id === kayit.user_id ||
    (!!uyelik && ['owner', 'admin'].includes(uyelik.role))

  if (!yetkili) {
    return NextResponse.json({ error: 'Bu görevi güncelleme yetkiniz yok.' }, { status: 403 })
  }

  // Tüketim ÖNCE: iki eşzamanlı istekten yalnızca biri geçsin
  const tuketildi = await eylemTokenTuket(db, kayit.id, istekIp)
  if (!tuketildi) {
    return NextResponse.json({ error: 'Bu bağlantı zaten kullanılmış.' }, { status: 410 })
  }

  let sonucMetni: string

  if (kayit.eylem === 'gorev_tamamla') {
    if (gorev.status === 'done') {
      sonucMetni = 'Bu görev zaten tamamlanmıştı.'
    } else {
      const { error } = await db.from('tasks').update({ status: 'done' }).eq('id', gorev.id)
      if (error) return NextResponse.json({ error: 'Görev güncellenemedi.' }, { status: 500 })
      sonucMetni = 'Görev tamamlandı olarak işaretlendi.'
    }
  } else {
    const temel = gorev.due_date ? new Date(gorev.due_date + 'T00:00:00') : new Date()
    temel.setDate(temel.getDate() + 7)
    const iki = (n: number) => String(n).padStart(2, '0')
    const yeni = `${temel.getFullYear()}-${iki(temel.getMonth() + 1)}-${iki(temel.getDate())}`

    const { error } = await db.from('tasks').update({ due_date: yeni }).eq('id', gorev.id)
    if (error) return NextResponse.json({ error: 'Görev güncellenemedi.' }, { status: 500 })
    sonucMetni = `Termin ${yeni.split('-').reverse().join('.')} tarihine ertelendi.`
  }

  const { data: org } = await db
    .from('organizations').select('slug').eq('id', gorev.organization_id).maybeSingle()

  return NextResponse.json({
    ok: true,
    mesaj: sonucMetni,
    gorevBasligi: gorev.title,
    gorevUrl: org?.slug ? `/org/${org.slug}/tasks/${gorev.id}` : null,
  })
}
