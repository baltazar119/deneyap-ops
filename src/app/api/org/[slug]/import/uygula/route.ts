import { NextRequest, NextResponse } from 'next/server'
import { orgYetkiCoz } from '@/lib/server/apiAuth'
import { rateLimit } from '@/lib/rateLimit'
import type { Esleme } from '@/lib/import/columnMap'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * POST /api/org/[slug]/import/uygula  { batchId, yalnizGecerli?, mod? }
 *
 * Yazma işini `import_tasks_apply` RPC'sine devreder — tek transaction,
 * ya hep ya hiç. Route yalnızca yetki, seçenek ve bildirim işini yapar.
 */
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const y = await orgYetkiCoz(req, { slug: params.slug, gerekli: 'yazma' })
  if (!y.ok) return y.res
  const { yetki } = y

  const rl = await rateLimit(`import:uygula:${yetki.org.id}`, 5, 60 * 60 * 1000)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Saatte en fazla 5 içe aktarma uygulanabilir.' }, { status: 429 })
  }

  const govde = await req.json().catch(() => ({})) as {
    batchId?: string
    yalnizGecerli?: boolean
    mod?: 'guncelle' | 'atla' | 'her_zaman_olustur'
  }
  if (!govde.batchId) {
    return NextResponse.json({ error: 'batchId gerekli.' }, { status: 400 })
  }

  /* ── Parti bu org'a mı ait ────────────────────────────────────────────── */
  const { data: parti } = await yetki.admin
    .from('import_batches')
    .select('id, organization_id, durum, hatali, esleme')
    .eq('id', govde.batchId)
    .maybeSingle()

  if (!parti || parti.organization_id !== yetki.org.id) {
    return NextResponse.json({ error: 'İçe aktarma bulunamadı.' }, { status: 404 })
  }
  if (parti.durum !== 'onizleme') {
    return NextResponse.json(
      { error: 'Bu içe aktarma zaten uygulanmış.' }, { status: 409 },
    )
  }
  if (parti.hatali > 0 && !govde.yalnizGecerli) {
    return NextResponse.json({
      error: `${parti.hatali} satırda hata var. Yalnızca geçerli satırları aktarmak için onay verin.`,
      hatali: parti.hatali,
    }, { status: 400 })
  }

  // Mod önizlemede seçilmemiş olabilir; uygulama anında da belirlenebilsin
  if (govde.mod) {
    await yetki.admin.from('import_batches')
      .update({ secenekler: { mod: govde.mod } })
      .eq('id', parti.id)
  }

  /* ── Uygula ───────────────────────────────────────────────────────────── */
  // RPC'yi KULLANICININ oturumuyla çağırıyoruz: fonksiyon security definer
  // ve yetkiyi içeride is_org_admin() ile doğruluyor. Service-role ile
  // çağrılsa auth.uid() boş olur ve kontrol her zaman reddederdi.
  const { data: sonuc, error } = await yetki.asUser
    .rpc('import_tasks_apply', { p_batch_id: parti.id })

  if (error) {
    console.error('[import/uygula] RPC hatası:', error)
    await yetki.admin.from('import_batches')
      .update({ durum: 'hatali', hata_mesaji: error.message })
      .eq('id', parti.id)
    return NextResponse.json(
      { error: `İçe aktarma uygulanamadı: ${error.message}` }, { status: 500 },
    )
  }

  /* ── Sütun eşlemesini hatırla ─────────────────────────────────────────── */
  // İkinci içe aktarmada kullanıcı aynı eşlemeyi tekrar yapmasın
  await yetki.admin.from('import_column_presets').upsert({
    organization_id: yetki.org.id,
    esleme: parti.esleme as Esleme,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'organization_id' })

  /* ── Bildirim ─────────────────────────────────────────────────────────── */
  const s = sonuc as { olusturulan: number; guncellenen: number; atlanan: number }
  const toplam = s.olusturulan + s.guncellenen

  if (toplam > 0) {
    const { data: yoneticiler } = await yetki.admin
      .from('organization_members')
      .select('user_id')
      .eq('organization_id', yetki.org.id)
      .in('role', ['owner', 'admin'])

    const satirlar = (yoneticiler ?? [])
      .filter((u: { user_id: string }) => u.user_id !== yetki.user.id)
      .map((u: { user_id: string }) => ({
        user_id: u.user_id,
        organization_id: yetki.org.id,
        type: 'task',
        event_type: 'task_assigned',
        title: `${toplam} görev Excel'den içe aktarıldı`,
        description: `${s.olusturulan} yeni görev oluşturuldu, ${s.guncellenen} görev güncellendi.`,
        actor_id: yetki.user.id,
        link: `/org/${yetki.org.slug}/tasks?parti=${parti.id}`,
        is_read: false,
      }))

    if (satirlar.length) {
      const { error: bildirimHata } = await yetki.admin.from('notifications').insert(satirlar)
      if (bildirimHata) console.error('[import/uygula] bildirim hatası (kritik değil):', bildirimHata)
    }
  }

  return NextResponse.json({ batchId: parti.id, ...s })
}
