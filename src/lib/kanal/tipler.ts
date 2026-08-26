/**
 * Bildirim kanalı soyutlaması.
 *
 * E-posta, Telegram ve (ileride) WhatsApp aynı arayüzü paylaşır. Böylece
 * çağıran taraf "hangi kanal" bilmeden mesaj gönderebilir ve WhatsApp
 * erişimi olmadan sistem eksiksiz çalışır.
 */

export type KanalAdi = 'eposta' | 'telegram' | 'whatsapp'

export interface KanalEylem {
  etiket: string
  /** Kısa yük — Telegram callback_data 64 bayt ile sınırlı */
  eylem: 'gorev_tamamla' | 'termin_ertele' | 'ac'
  hedefId: string
}

export interface KanalMesaji {
  baslik: string
  /** Düz metin — her adaptör kendi biçimine çevirir */
  govde: string
  url?: string
  eylemler?: KanalEylem[]
  aciliyet: 'bilgi' | 'uyari' | 'kritik'
}

export interface KanalHedefi {
  userId: string
  orgId: string
  orgSlug: string
  /** Kanala özgü adres: e-posta adresi ya da chat_id */
  adres: string
  ad?: string | null
}

export interface GonderimSonucu {
  ok: boolean
  hata?: string
  /** Kanal yapılandırılmamış — hata değil, "bu kanal yok" demek */
  yapilandirilmamis?: boolean
}

export interface Kanal {
  ad: KanalAdi
  etiket: string
  /** Env değişkenleri tanımlı mı — değilse sistem bu kanalı atlar */
  destekleniyor(): boolean
  eylemDestekler: boolean
  gonder(hedef: KanalHedefi, mesaj: KanalMesaji): Promise<GonderimSonucu>
}
