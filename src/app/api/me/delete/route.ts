import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { writeAuditLog } from '@/lib/audit'
import { getClientIp } from '@/lib/rateLimit'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// DELETE /api/me/delete
// KVKK Md.11/f — Kullanıcı kişisel verilerinin silinmesini talep edebilir.
// Authorization: Bearer <access_token>
export async function DELETE(request: NextRequest) {
  const adminClient = getAdminClient()

  // 1. Auth
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: { user } } = await adminClient.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const uid = user.id

  // 2. Kullanıcının sahip olduğu organizasyonları kontrol et
  // Owner'lık devredilmeden hesap silinemez (orphan org bırakılmaması için)
  const { data: ownedOrgs } = await adminClient
    .from('organization_members')
    .select('organization_id, organizations(name)')
    .eq('user_id', uid)
    .eq('role', 'owner')

  if (ownedOrgs && ownedOrgs.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orgNames = ownedOrgs.map((o: any) => o.organizations?.name ?? o.organization_id).join(', ')
    return NextResponse.json({
      error: 'owner_transfer_required',
      message: `Hesabınızı silmeden önce şu organizasyonların sahipliğini devredin: ${orgNames}`,
    }, { status: 409 })
  }

  // 3. Kişisel verileri temizle (RLS bypass için service role kullanılıyor)
  // Supabase Auth kullanıcısını silmek tüm bağlı verileri cascade ile siler (FK ON DELETE CASCADE varsa)
  // Profil ve ilişkili tablolar cascade ile silinir; güvenlik için önce auth user'ı sil.
  // Silmeden önce log yaz (user_id silinince SET NULL olacak)
  await writeAuditLog({
    userId: uid,
    action: 'account_deleted',
    entityType: 'profile',
    entityId: uid,
    metadata: { email: user.email },
    ipAddress: getClientIp(request),
  })

  const { error: deleteError } = await adminClient.auth.admin.deleteUser(uid)

  if (deleteError) {
    console.error('[DeleteAccount] Auth user delete failed:', deleteError)
    return NextResponse.json({ error: 'Hesap silinemedi. Lütfen destek ekibiyle iletişime geçin.' }, { status: 500 })
  }

  return NextResponse.json({ success: true, message: 'Hesabınız ve tüm kişisel verileriniz silindi.' })
}
