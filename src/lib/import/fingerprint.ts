import { trFold } from '@/lib/turkce'

/**
 * İçe aktarma eşleştirme anahtarı.
 *
 * Kullanıcı kararı "eşleşeni güncelle": aynı dosya ikinci kez yüklendiğinde
 * kopya görev oluşmamalı. Bunun için her satırın kararlı bir kimliği olmalı.
 *
 * Satır SIRASI kasten kullanılmıyor — araya bir satır eklenince tüm eşleşme
 * kayar ve 200 görev birbirinin üstüne yazılır.
 */

/**
 * Excel'de bir Kod/Referans sütunu varsa onu kullanırız — en güvenilir yol,
 * çünkü kullanıcı başlığı düzeltse bile aynı göreve işaret eder.
 */
export function disAnahtarTemizle(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null
  const s = String(raw).trim()
  if (!s || s.length > 100) return null
  return s
}

/**
 * Kod sütunu yoksa başlık + il + terminden türetilen anahtar.
 *
 * Termin DAHİL DEĞİL: kullanıcının Excel'de en sık düzelttiği alan tarihtir.
 * Tarihi anahtara koyarsak "terminini düzeltip tekrar yükledim" senaryosunda
 * güncelleme yerine ikinci bir görev oluşur — tam da kaçınmak istediğimiz şey.
 */
export function parmakIzi(baslik: string, il: string | null): string {
  const b = trFold(baslik)
  const i = il ? trFold(il) : ''
  return `${b}|${i}`
}

/** Satır için kullanılacak nihai anahtar ve hangi yöntemin seçildiği */
export function eslestirmeAnahtari(
  baslik: string,
  il: string | null,
  disAnahtar: string | null,
): { anahtar: string; yontem: 'external_key' | 'fingerprint' } {
  return disAnahtar
    ? { anahtar: disAnahtar, yontem: 'external_key' }
    : { anahtar: parmakIzi(baslik, il), yontem: 'fingerprint' }
}
