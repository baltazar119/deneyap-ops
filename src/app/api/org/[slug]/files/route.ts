import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { onbelleksizFetch } from '@/lib/server/supabaseFetch'

export const dynamic = 'force-dynamic'

/** Service role: Drive token okuma + silme işlemleri için */
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { fetch: onbelleksizFetch } },
  )
}

/**
 * User-scoped client: kullanıcının cookie session'ını kullanır.
 * getUser() çağrısı ile session yüklenmeli, ardından RLS çalışır.
 */
function getUserClient(req: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return req.cookies.getAll() },
        setAll() { /* read-only */ },
      },
    }
  )
}

// GET: org dosyalarını listele (kategori + arama filtresi ile)
export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const { slug } = params
  const url = req.nextUrl
  const category  = url.searchParams.get('category') ?? null
  const search    = url.searchParams.get('search') ?? ''
  const taskId    = url.searchParams.get('taskId') ?? null
  const orgIdParam = url.searchParams.get('orgId') ?? null

  // ── Oturum doğrula ───────────────────────────────────────────
  const userClient = getUserClient(req)
  const { data: { user }, error: authErr } = await userClient.auth.getUser()

  if (authErr || !user) {
    return NextResponse.json(
      { error: 'Oturum açmanız gerekiyor.' },
      { status: 401 }
    )
  }

  // ── Kullanıcı doğrulandı — admin client ile sorgula (RLS bypass) ──
  // Service role key varsa RLS tamamen atlanır.
  // Yoksa anon key ile fallback yapılır; ama kullanıcı auth edildiğinden
  // Supabase oturumu header ile gönderilmez (server-side admin client).
  // Bu nedenle user client ile sorgular yapılır.
  const db = userClient

  // ── orgId: ya query param olarak gelir ya da slug'dan bulunur ──
  let orgId = orgIdParam
  if (!orgId) {
    const { data: org, error: orgErr } = await db
      .from('organizations')
      .select('id')
      .eq('slug', slug)
      .single()

    if (orgErr || !org) {
      console.error('[files/route] org lookup error:', orgErr?.message)
      return NextResponse.json({ error: 'Org bulunamadı veya erişim yok.' }, { status: 404 })
    }
    orgId = org.id
  }

  // ── TASK bazlı filtreleme ──────────────────────────────────────
  if (taskId) {
    const { data: linkRows, error: linkErr } = await db
      .from('task_file_links')
      .select('org_file_id')
      .eq('task_id', taskId)

    if (linkErr) {
      console.error('[files/route] task_file_links error:', linkErr.message)
      return NextResponse.json({ error: linkErr.message }, { status: 500 })
    }

    const linkedIds = (linkRows ?? []).map((l: { org_file_id: string }) => l.org_file_id)

    if (linkedIds.length === 0) {
      return NextResponse.json({ files: [] })
    }

    // ❌ task_file_links(task_id, tasks(id, title)) — tasks alt join'i kaldırıldı (RLS sorunlu)
    const { data: files, error: filesErr } = await db
      .from('org_files')
      .select('*, task_file_links(task_id)')
      .in('id', linkedIds)
      .order('created_at', { ascending: false })

    if (filesErr) {
      console.error('[files/route] org_files (taskId) error:', filesErr.message)
      return NextResponse.json({ error: filesErr.message }, { status: 500 })
    }

    return NextResponse.json({ files: await enrichWithUploaders(db, files ?? []) })
  }

  // ── Normal listeleme (Dosya Merkezi / bağlama modalı) ──────────
  // task_file_links(task_id) — sadece task_id lazım, tasks alt join yok
  let q = db
    .from('org_files')
    .select('*, task_file_links(task_id)')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })

  if (category && category !== 'tumu') q = q.eq('category', category)
  if (search) q = q.ilike('file_name', `%${search}%`)

  const { data: files, error } = await q
  if (error) {
    console.error('[files/route] org_files (list) error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ files: await enrichWithUploaders(db, files ?? []) })
}

/** Uploader profil bilgisini ayrı sorgu ile ekle */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function enrichWithUploaders(db: any, files: Record<string, unknown>[]) {
  if (files.length === 0) return files
  const ids = Array.from(new Set(files.map(f => f.uploaded_by as string).filter(Boolean)))
  const uploaderMap: Record<string, { id: string; full_name: string | null; avatar_url: string | null }> = {}
  if (ids.length > 0) {
    const { data: profiles } = await db.from('profiles').select('id, full_name, avatar_url').in('id', ids)
    for (const p of profiles ?? []) uploaderMap[p.id] = p
  }
  return files.map(f => ({ ...f, uploader: uploaderMap[f.uploaded_by as string] ?? null }))
}

// DELETE: org dosyasını sil (Drive'dan da kaldır)
export async function DELETE(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin()
  const { fileId } = await req.json()

  if (!fileId) {
    return NextResponse.json({ error: 'fileId gerekli.' }, { status: 400 })
  }

  const { data: fileRow } = await supabaseAdmin
    .from('org_files').select('drive_file_id').eq('id', fileId).single()

  await supabaseAdmin.from('org_files').delete().eq('id', fileId)

  if (fileRow?.drive_file_id) {
    const adminId = process.env.DRIVE_ADMIN_USER_ID
    const tokenQ = adminId
      ? supabaseAdmin.from('drive_tokens').select('access_token').eq('user_id', adminId).single()
      : supabaseAdmin.from('drive_tokens').select('access_token').limit(1).single()
    const { data: tokenRow } = await tokenQ
    if (tokenRow?.access_token) {
      await fetch(`https://www.googleapis.com/drive/v3/files/${fileRow.drive_file_id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tokenRow.access_token}` },
      })
    }
  }

  return NextResponse.json({ success: true })
}
