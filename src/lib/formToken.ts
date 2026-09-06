import 'server-only'
import { randomBytes, createHash, timingSafeEqual } from 'crypto'

/**
 * Form doldurma bağlantısı için token.
 *
 * `eylemToken.ts` ile aynı iki karar:
 *   1) Ham token VERİTABANINDA TUTULMAZ, yalnızca SHA-256 özeti. Veritabanı
 *      sızsa bile bağlantılar kullanılamaz.
 *   2) Token tek başına org verisine erişim vermez — yalnızca O gönderime
 *      ait formu açar. Form "sadece üyeler"e işaretliyse token'ın üstüne
 *      ayrıca oturum ve üyelik aranır.
 *
 * Eylem token'ından FARKI: bu token tek kullanımlık değil. Kullanıcı formu
 * açıp yarıda bırakabilir, sayfayı yenileyebilir. Tüketilme, gönderimin
 * `durum` alanıyla yönetiliyor.
 */

/** 32 bayt = 256 bit. URL'de base64url olarak taşınır. */
const BAYT = 32

export function formTokenUret(): { ham: string; ozet: string } {
  const ham = randomBytes(BAYT).toString('base64url')
  return { ham, ozet: tokenOzeti(ham) }
}

export function tokenOzeti(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * Sabit zamanlı karşılaştırma.
 *
 * Özetler zaten veritabanında indeksli olarak aranıyor, ama karşılaştırmanın
 * kendisi kod içinde yapıldığı her yerde zamanlama sızıntısına kapalı olmalı.
 */
export function ozetEsitMi(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

/** Gönderim hâlâ doldurulabilir mi? */
export function gonderimAcikMi(
  g: { durum: string; son_gecerlilik: string | null }, simdi: Date = new Date(),
): { acik: boolean; sebep?: string } {
  if (g.durum === 'yanitlandi') return { acik: false, sebep: 'Bu form zaten doldurulmuş.' }
  if (g.durum === 'iptal') return { acik: false, sebep: 'Bu form bağlantısı iptal edilmiş.' }
  if (g.son_gecerlilik && Date.parse(g.son_gecerlilik) <= simdi.getTime()) {
    return { acik: false, sebep: 'Bu form bağlantısının süresi dolmuş.' }
  }
  return { acik: true }
}
