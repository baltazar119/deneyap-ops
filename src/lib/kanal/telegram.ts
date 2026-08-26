import 'server-only'
import { timingSafeEqual } from 'crypto'
import type { Kanal, KanalMesaji, KanalHedefi, GonderimSonucu } from './tipler'

/**
 * Telegram Bot API adaptörü.
 *
 * WhatsApp'ın aksine ücretsiz, anında ve inline butonlarla tek dokunuşla
 * durum güncellemeyi doğal olarak destekliyor.
 */

const API = 'https://api.telegram.org/bot'

function token(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN || null
}

/** Telegram MarkdownV2 çok kırılgan; HTML modu daha güvenli */
export function htmlKacir(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const ACILIYET_ISARET: Record<KanalMesaji['aciliyet'], string> = {
  bilgi: 'ℹ️', uyari: '⚠️', kritik: '🔴',
}

export async function telegramCagir<T = unknown>(
  metot: string,
  govde: Record<string, unknown>,
): Promise<{ ok: boolean; sonuc?: T; hata?: string }> {
  const t = token()
  if (!t) return { ok: false, hata: 'TELEGRAM_BOT_TOKEN tanımlı değil' }

  try {
    const res = await fetch(`${API}${t}/${metot}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(govde),
      // Telegram yavaşsa cron'u kilitlemesin
      signal: AbortSignal.timeout(8000),
    })
    const j = await res.json() as { ok: boolean; result?: T; description?: string }
    return j.ok ? { ok: true, sonuc: j.result } : { ok: false, hata: j.description }
  } catch (e) {
    return { ok: false, hata: e instanceof Error ? e.message : 'Telegram\'a ulaşılamadı' }
  }
}

/** callback_data 64 bayt ile sınırlı — kısa tutmak zorunlu */
export function callbackVerisi(eylem: string, hedefId: string): string {
  const kisa = { gorev_tamamla: 'ok', termin_ertele: 'ert' }[eylem] ?? eylem
  return `${kisa}:${hedefId}`
}

export const telegramKanali: Kanal = {
  ad: 'telegram',
  etiket: 'Telegram',
  eylemDestekler: true,
  destekleniyor: () => !!token(),

  async gonder(hedef: KanalHedefi, mesaj: KanalMesaji): Promise<GonderimSonucu> {
    if (!token()) return { ok: false, yapilandirilmamis: true, hata: 'Telegram yapılandırılmamış.' }

    const isaret = ACILIYET_ISARET[mesaj.aciliyet]
    const metin = [
      `${isaret} <b>${htmlKacir(mesaj.baslik)}</b>`,
      htmlKacir(mesaj.govde),
    ].join('\n\n')

    // Eylem butonları inline klavyeye; "ac" bir URL butonu olur
    const butonlar = (mesaj.eylemler ?? []).map(e =>
      e.eylem === 'ac' && mesaj.url
        ? [{ text: e.etiket, url: mesaj.url }]
        : [{ text: e.etiket, callback_data: callbackVerisi(e.eylem, e.hedefId) }],
    )
    if (mesaj.url && !butonlar.some(b => 'url' in b[0])) {
      butonlar.push([{ text: '🔗 Uygulamada aç', url: mesaj.url }])
    }

    const sonuc = await telegramCagir('sendMessage', {
      chat_id: hedef.adres,
      text: metin,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...(butonlar.length ? { reply_markup: { inline_keyboard: butonlar } } : {}),
    })

    return sonuc.ok ? { ok: true } : { ok: false, hata: sonuc.hata }
  },
}

/**
 * Webhook gizli anahtarını doğrular.
 *
 * Telegram her webhook isteğinde `X-Telegram-Bot-Api-Secret-Token` başlığını
 * gönderir (setWebhook sırasında belirlenen değer). Bu olmadan bot adresini
 * bilen herkes sahte güncelleme gönderebilirdi.
 */
export function webhookYetkili(req: Request): boolean {
  const beklenen = process.env.TELEGRAM_WEBHOOK_SECRET
  if (!beklenen) return false
  const gelen = req.headers.get('x-telegram-bot-api-secret-token') ?? ''
  const a = Buffer.from(gelen)
  const b = Buffer.from(beklenen)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
