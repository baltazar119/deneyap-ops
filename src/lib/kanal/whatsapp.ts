import 'server-only'
import type { Kanal } from './tipler'

/**
 * WhatsApp Cloud API adaptörü — ARAYÜZ HAZIR, AKTİF DEĞİL.
 *
 * Gerçekten çalışması için Meta işletme doğrulaması, WhatsApp'a kayıtlı
 * olmayan bir telefon numarası ve onaylı şablon mesajı gerekiyor; doğrulama
 * tek başına haftalar sürebiliyor ve mesaj başına ücret var.
 *
 * Bu yüzden kanal env değişkenleri tanımlı değilse `destekleniyor()` false
 * döner ve sistem WhatsApp'ı hiç denemeden Telegram/e-postaya devam eder.
 * Erişim sağlandığında yalnızca bu dosya doldurulacak.
 */
export const whatsappKanali: Kanal = {
  ad: 'whatsapp',
  etiket: 'WhatsApp',
  eylemDestekler: true,
  destekleniyor: () => !!process.env.WHATSAPP_TOKEN && !!process.env.WHATSAPP_PHONE_ID,
  async gonder() {
    return {
      ok: false,
      yapilandirilmamis: true,
      hata: 'WhatsApp Business API yapılandırılmamış.',
    }
  },
}
