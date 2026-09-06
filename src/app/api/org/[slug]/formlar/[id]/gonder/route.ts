import { NextRequest, NextResponse } from 'next/server'
import { orgYetkiCoz } from '@/lib/server/apiAuth'
import { formTokenUret } from '@/lib/formToken'

export const dynamic = 'force-dynamic'

/**
 * POST — formu gönder: bir gönderim kaydı + doldurma bağlantısı üretir.
 *
 * Ham token yalnızca BU YANITTA döner; veritabanında sadece SHA-256 özeti
 * saklanır. Kullanıcı bağlantıyı kaybederse yenisi üretilir, eskisi
 * "iptal" edilir — kurtarma yok, çünkü ham token hiçbir yerde yok.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string; id: string } },
) {
  const y = await orgYetkiCoz(req, { slug: params.slug, gerekli: 'uye' })
  if (!y.ok) return y.res
  const { org, admin, user } = y.yetki

  const govde = await req.json().catch(() => ({}))
  const gorevId = typeof govde.gorev_id === 'string' && govde.gorev_id ? govde.gorev_id : null
  const aliciUserId = typeof govde.alici_user_id === 'string' && govde.alici_user_id ? govde.alici_user_id : null
  const aliciEtiket = typeof govde.alici_etiket === 'string' ? govde.alici_etiket.trim() || null : null
  const gunGecerli = Number(govde.gecerlilik_gun)

  // Form bu org'a mı ait — çapraz-org gönderimi burada kesiyoruz.
  const { data: form } = await admin
    .from('formlar')
    .select('id, baslik, yayinda')
    .eq('id', params.id)
    .eq('organization_id', org.id)
    .maybeSingle()
  if (!form) return NextResponse.json({ error: 'Form bulunamadı.' }, { status: 404 })
  if (!(form as { yayinda: boolean }).yayinda) {
    return NextResponse.json({ error: 'Taslak form gönderilemez. Önce yayına alın.' }, { status: 400 })
  }

  // Görev de aynı org'un olmalı; yoksa başka org'un görevi tamamlanabilirdi.
  if (gorevId) {
    const { data: gorev } = await admin
      .from('tasks')
      .select('id')
      .eq('id', gorevId)
      .eq('organization_id', org.id)
      .maybeSingle()
    if (!gorev) return NextResponse.json({ error: 'Bağlanacak görev bulunamadı.' }, { status: 400 })
  }

  // Alıcı üye olarak verildiyse gerçekten bu org'un üyesi mi.
  if (aliciUserId) {
    const { data: uye } = await admin
      .from('organization_members')
      .select('user_id')
      .eq('organization_id', org.id)
      .eq('user_id', aliciUserId)
      .maybeSingle()
    if (!uye) return NextResponse.json({ error: 'Alıcı bu çalışma alanının üyesi değil.' }, { status: 400 })
  }

  const { ham, ozet } = formTokenUret()
  const sonGecerlilik = Number.isFinite(gunGecerli) && gunGecerli > 0
    ? new Date(Date.now() + Math.min(gunGecerli, 365) * 86400000).toISOString()
    : null

  const { data, error } = await admin
    .from('form_gonderimleri')
    .insert({
      organization_id: org.id,
      form_id: params.id,
      gorev_id: gorevId,
      alici_user_id: aliciUserId,
      alici_etiket: aliciEtiket,
      token_ozeti: ozet,
      son_gecerlilik: sonGecerlilik,
      gonderen_id: user.id,
    })
    .select()
    .single()

  if (error) {
    console.error('[form gonder]', error)
    return NextResponse.json({ error: 'Gönderim oluşturulamadı.' }, { status: 500 })
  }

  // Alıcı sistemde bir üyeyse bildirim gitsin; dışarıdan biriyse bağlantıyı
  // gönderen kişi kendi kanalıyla iletir.
  // `lib/notifications.ts:createNotification` BURADA KULLANILAMAZ: o fonksiyon
  // tarayıcı Supabase istemcisini kullanıyor, sunucuda oturum olmadığı için
  // `notifications` INSERT politikasına takılıp sessizce düşerdi. Duyurularda
  // da aynı sebeple ayrı yol yazılmıştı.
  if (aliciUserId && aliciUserId !== user.id) {
    const { error: bildirimHatasi } = await admin.from('notifications').insert({
      user_id: aliciUserId,
      type: 'system',
      event_type: 'form_yanitlandi',
      title: 'Doldurmanız Gereken Form',
      description: `"${(form as { baslik: string }).baslik}" formu size gönderildi.`,
      actor_id: user.id,
      link: `/form/${ham}`,
      is_read: false,
      organization_id: org.id,
    })
    // Bildirim gitmezse gönderim yine geçerli: bağlantı yanıtta dönüyor.
    if (bildirimHatasi) console.error('[form gonder bildirim]', bildirimHatasi)
  }

  return NextResponse.json({ gonderim: data, token: ham }, { status: 201 })
}
