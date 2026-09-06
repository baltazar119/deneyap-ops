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

/** Logo yükle */
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

  // Admin kontrolü
  const { data: membership } = await supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .single()

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'Yetki yetersiz' }, { status: 403 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Dosya bulunamadı' }, { status: 400 })

  // Dosya tipi kontrolü
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
  if (!allowed.includes(file.type)) {
    return NextResponse.json({ error: 'Desteklenmeyen dosya türü (JPG, PNG, WebP, SVG)' }, { status: 400 })
  }

  // 2 MB limit
  if (file.size > 2 * 1024 * 1024) {
    return NextResponse.json({ error: 'Dosya 2 MB\'ı geçemez' }, { status: 400 })
  }

  const ext      = file.name.split('.').pop() ?? 'png'
  const path     = `${org.id}/logo_${Date.now()}.${ext}`
  const arrayBuf = await file.arrayBuffer()

  // Eski logoyu sil
  const { data: existing } = await supabase.storage
    .from('org-logos')
    .list(org.id)
  if (existing?.length) {
    const oldPaths = existing.map((f: { name: string }) => `${org.id}/${f.name}`)
    await supabase.storage.from('org-logos').remove(oldPaths)
  }

  // Yeni logoyu yükle
  const { error: uploadErr } = await supabase.storage
    .from('org-logos')
    .upload(path, arrayBuf, { contentType: file.type, upsert: true })

  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 })
  }

  const { data: { publicUrl } } = supabase.storage
    .from('org-logos')
    .getPublicUrl(path)

  // organizations ve brand_settings tablosunu güncelle
  await supabase
    .from('organizations')
    .update({ logo_url: publicUrl })
    .eq('id', org.id)

  await supabase
    .from('brand_settings')
    .upsert({ organization_id: org.id, logo_url: publicUrl }, { onConflict: 'organization_id' })

  return NextResponse.json({ logo_url: publicUrl })
}

/** Logoyu kaldır */
export async function DELETE(
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

  const { data: membership } = await supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .single()

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'Yetki yetersiz' }, { status: 403 })
  }

  // Dosyaları sil
  const { data: existing } = await supabase.storage
    .from('org-logos')
    .list(org.id)
  if (existing?.length) {
    const paths = existing.map((f: { name: string }) => `${org.id}/${f.name}`)
    await supabase.storage.from('org-logos').remove(paths)
  }

  // DB'den temizle
  await supabase
    .from('organizations')
    .update({ logo_url: null })
    .eq('id', org.id)

  await supabase
    .from('brand_settings')
    .upsert({ organization_id: org.id, logo_url: null }, { onConflict: 'organization_id' })

  return NextResponse.json({ ok: true })
}
