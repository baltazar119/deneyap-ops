import { NextRequest, NextResponse } from 'next/server'
import { orgYetkiCoz } from '@/lib/server/apiAuth'
import { rateLimit } from '@/lib/rateLimit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * POST /api/org/[slug]/import/[batchId]/geri-al
 *
 * Partide OLUŞTURULAN görevleri siler, GÜNCELLENENLERİ eski hâline döndürür.
 * İçe aktarmadan sonra elle düzenlenmiş görevlere dokunulmaz — kaç tanesinin
 * korunduğu yanıtta bildirilir.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string; batchId: string } },
) {
  const y = await orgYetkiCoz(req, { slug: params.slug, gerekli: 'yazma' })
  if (!y.ok) return y.res
  const { yetki } = y

  const rl = await rateLimit(`import:geri-al:${yetki.org.id}`, 5, 60 * 60 * 1000)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Saatte en fazla 5 geri alma yapılabilir.' }, { status: 429 })
  }

  const { data: parti } = await yetki.admin
    .from('import_batches')
    .select('id, organization_id, durum')
    .eq('id', params.batchId)
    .maybeSingle()

  if (!parti || parti.organization_id !== yetki.org.id) {
    return NextResponse.json({ error: 'İçe aktarma bulunamadı.' }, { status: 404 })
  }
  if (parti.durum === 'geri_alindi') {
    return NextResponse.json({ error: 'Bu içe aktarma zaten geri alınmış.' }, { status: 409 })
  }
  if (parti.durum !== 'tamamlandi' && parti.durum !== 'kismi') {
    return NextResponse.json({ error: 'Yalnızca uygulanmış içe aktarmalar geri alınabilir.' }, { status: 400 })
  }

  // Yetki fonksiyon içinde auth.uid() üzerinden doğrulanıyor — kullanıcı oturumu şart
  const { data: sonuc, error } = await yetki.asUser
    .rpc('import_tasks_revert', { p_batch_id: parti.id })

  if (error) {
    console.error('[import/geri-al] RPC hatası:', error)
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json(sonuc)
}
