import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { webhookYetkili, telegramCagir, htmlKacir } from '@/lib/kanal/telegram'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Telegram webhook.
 *
 * İki iş yapar:
 *  1. /start <kod> ile hesabı bağlar
 *  2. Inline buton (callback_query) ile görev durumunu günceller
 *
 * Güvenlik notları:
 *  - Gizli anahtar başlığı doğrulanmazsa bot adresini bilen herkes sahte
 *    güncelleme gönderebilir.
 *  - Doğrulama başarısız olsa bile 200 dönülür: Telegram 200 dışındaki
 *    yanıtlarda aynı güncellemeyi tekrar tekrar gönderir.
 *  - chat_id doğrulanmış kimliktir, ama YETKİ her zaman sunucuda kontrol
 *    edilir: kullanıcı yalnızca kendi görevini veya yöneticisi olduğu org'un
 *    görevini güncelleyebilir.
 */

interface TgUpdate {
  update_id: number
  message?: {
    chat: { id: number; first_name?: string; username?: string }
    from?: { id: number; first_name?: string; username?: string }
    text?: string
  }
  callback_query?: {
    id: string
    from: { id: number }
    message?: { chat: { id: number }; message_id: number }
    data?: string
  }
}

function admin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

const OK = NextResponse.json({ ok: true })

export async function POST(req: NextRequest) {
  if (!webhookYetkili(req)) {
    console.warn('[telegram] gizli anahtar doğrulanamadı')
    return OK   // 200: Telegram tekrar denemesin
  }

  let g: TgUpdate
  try {
    g = await req.json() as TgUpdate
  } catch {
    return OK
  }

  const db = admin()

  try {
    if (g.message?.text) return await mesajIsle(db, g)
    if (g.callback_query)  return await butonIsle(db, g)
  } catch (e) {
    console.error('[telegram] işleme hatası:', e)
  }
  return OK
}

/* ── /start <kod> ────────────────────────────────────────────────────────── */

async function mesajIsle(db: SupabaseClient, g: TgUpdate) {
  const chatId = g.message!.chat.id
  const metin  = (g.message!.text ?? '').trim()

  const yanit = (t: string) => telegramCagir('sendMessage', {
    chat_id: chatId, text: t, parse_mode: 'HTML', disable_web_page_preview: true,
  })

  if (!metin.startsWith('/start')) {
    await yanit(
      'DENEYAP Ops bildirim botu.\n\n' +
      'Hesabınızı bağlamak için uygulamada <b>Profilim → Telegram\'a Bağla</b> ' +
      'adımını izleyin; size verilen bağlantıya tıklamanız yeterli.',
    )
    return OK
  }

  const kod = metin.split(/\s+/)[1]
  if (!kod) {
    await yanit(
      'Bağlantı kodu bulunamadı.\n\n' +
      'Uygulamada <b>Profilim → Telegram\'a Bağla</b> düğmesine basıp oradaki ' +
      'bağlantıyı kullanın.',
    )
    return OK
  }

  const { data: kayit } = await db
    .from('channel_link_codes')
    .select('kod, user_id, organization_id, expires_at, kullanildi_at')
    .eq('kod', kod)
    .eq('kanal', 'telegram')
    .maybeSingle()

  if (!kayit) { await yanit('Bu kod geçersiz.'); return OK }
  if (kayit.kullanildi_at) { await yanit('Bu kod daha önce kullanılmış. Uygulamadan yeni bir kod alın.'); return OK }
  if (new Date(kayit.expires_at) < new Date()) { await yanit('Bu kodun süresi dolmuş. Uygulamadan yeni bir kod alın.'); return OK }

  const ad = [g.message!.from?.first_name, g.message!.from?.username && `@${g.message!.from.username}`]
    .filter(Boolean).join(' ')

  const { error } = await db.from('channel_links').upsert({
    user_id: kayit.user_id,
    organization_id: kayit.organization_id,
    kanal: 'telegram',
    harici_id: String(chatId),
    gorunen_ad: ad || null,
    aktif: true,
  }, { onConflict: 'user_id,organization_id,kanal' })

  if (error) {
    console.error('[telegram] bağlantı kaydedilemedi:', error)
    await yanit('Bağlantı kaydedilemedi. Lütfen tekrar deneyin.')
    return OK
  }

  await db.from('channel_link_codes')
    .update({ kullanildi_at: new Date().toISOString() })
    .eq('kod', kod)

  const { data: org } = await db
    .from('organizations').select('name').eq('id', kayit.organization_id).maybeSingle()

  await yanit(
    `✅ <b>Bağlantı kuruldu</b>\n\n` +
    `${htmlKacir(org?.name ?? 'Çalışma alanı')} bildirimlerini buradan alacaksınız.\n\n` +
    `Gecikme ve termin uyarılarında görevi doğrudan bu ekrandan ` +
    `tamamlandı olarak işaretleyebilirsiniz.`,
  )
  return OK
}

/* ── Inline buton ────────────────────────────────────────────────────────── */

async function butonIsle(db: SupabaseClient, g: TgUpdate) {
  const cq = g.callback_query!
  const chatId = cq.message?.chat.id
  const [kisaEylem, gorevId] = (cq.data ?? '').split(':')

  const cevap = (t: string, uyari = false) =>
    telegramCagir('answerCallbackQuery', { callback_query_id: cq.id, text: t, show_alert: uyari })

  if (!chatId || !gorevId) { await cevap('Geçersiz istek.'); return OK }

  // chat_id → kullanıcı. Bağlantı yoksa işlem yok.
  const { data: baglanti } = await db
    .from('channel_links')
    .select('user_id, organization_id')
    .eq('kanal', 'telegram')
    .eq('harici_id', String(chatId))
    .eq('aktif', true)
    .maybeSingle()

  if (!baglanti) { await cevap('Hesabınız bağlı değil. Uygulamadan tekrar bağlayın.', true); return OK }

  const { data: gorev } = await db
    .from('tasks')
    .select('id, title, status, due_date, assignee_id, organization_id')
    .eq('id', gorevId)
    .maybeSingle()

  if (!gorev || gorev.organization_id !== baglanti.organization_id) {
    await cevap('Görev bulunamadı.', true); return OK
  }

  // YETKİ: chat_id doğrulanmış kimlik olsa da kuralı sunucuda uyguluyoruz.
  // Görevin sahibi ya da org yöneticisi olmak gerekiyor (tasks_update RLS'iyle aynı kural).
  const { data: uyelik } = await db
    .from('organization_members')
    .select('role')
    .eq('organization_id', gorev.organization_id)
    .eq('user_id', baglanti.user_id)
    .maybeSingle()

  const yetkili = gorev.assignee_id === baglanti.user_id ||
    (!!uyelik && ['owner', 'admin'].includes(uyelik.role))

  if (!yetkili) { await cevap('Bu görevi güncelleme yetkiniz yok.', true); return OK }

  if (kisaEylem === 'ok') {
    if (gorev.status === 'done') { await cevap('Bu görev zaten tamamlanmış.'); return OK }
    const { error } = await db.from('tasks').update({ status: 'done' }).eq('id', gorev.id)
    if (error) { await cevap('Güncellenemedi.', true); return OK }

    await db.from('channel_log').insert({
      user_id: baglanti.user_id, kanal: 'telegram',
      olay_tipi: 'gorev_tamamla', entity_key: `task:${gorev.id}`, durum: 'uygulandi',
    })
    await cevap('✅ Görev tamamlandı olarak işaretlendi.')
    await mesajGuncelle(cq, `✅ <b>${htmlKacir(gorev.title)}</b>\n\nTamamlandı olarak işaretlendi.`)
    return OK
  }

  if (kisaEylem === 'ert') {
    const temel = gorev.due_date ? new Date(gorev.due_date + 'T00:00:00') : new Date()
    temel.setDate(temel.getDate() + 7)
    const iki = (n: number) => String(n).padStart(2, '0')
    const yeni = `${temel.getFullYear()}-${iki(temel.getMonth() + 1)}-${iki(temel.getDate())}`

    const { error } = await db.from('tasks').update({ due_date: yeni }).eq('id', gorev.id)
    if (error) { await cevap('Güncellenemedi.', true); return OK }

    await db.from('channel_log').insert({
      user_id: baglanti.user_id, kanal: 'telegram',
      olay_tipi: 'termin_ertele', entity_key: `task:${gorev.id}`, durum: 'uygulandi',
    })
    const gosterim = yeni.split('-').reverse().join('.')
    await cevap(`⏰ Termin ${gosterim} tarihine ertelendi.`)
    await mesajGuncelle(cq, `⏰ <b>${htmlKacir(gorev.title)}</b>\n\nTermin ${gosterim} tarihine ertelendi.`)
    return OK
  }

  await cevap('Bilinmeyen işlem.')
  return OK
}

/** Butonları kaldırıp mesajı sonuç metniyle değiştirir — tekrar basılamasın */
async function mesajGuncelle(cq: NonNullable<TgUpdate['callback_query']>, metin: string) {
  if (!cq.message) return
  await telegramCagir('editMessageText', {
    chat_id: cq.message.chat.id,
    message_id: cq.message.message_id,
    text: metin,
    parse_mode: 'HTML',
  })
}
