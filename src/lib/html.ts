/**
 * HTML kaçışı — e-posta şablonları için.
 *
 * E-posta gövdesine giren metinler (görev başlığı, açıklama, kullanıcı adı)
 * kullanıcı üretimi. Bunlar şablona kaçırılmadan enterpolasyon ediliyordu;
 * `<img src=x onerror=...>` başlıklı bir görev maili bozabiliyordu. Excel'den
 * içe aktarma devreye girince metin tamamen dış kaynaklı olacağı için bu
 * daha da önemli hale geliyor.
 *
 * Burada DOMPurify KULLANILMIYOR: DOMPurify "güvenli HTML'e izin ver" içindir;
 * bizim istediğimiz tam kaçış — hiçbir etiket geçmesin.
 */

const KACISLAR: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/** Metni HTML gövdesine güvenle gömülebilir hâle getirir */
export function esc(s: string | null | undefined): string {
  if (s == null) return ''
  return String(s).replace(/[&<>"']/g, (c) => KACISLAR[c])
}

/**
 * href olarak kullanılacak URL'i doğrular.
 *
 * `javascript:` ve `data:` şemaları bazı web posta istemcilerinde çalışır;
 * bildirim linki veritabanından geldiği için beyaz listeye alıyoruz.
 * Geçersizse yedek adres döner.
 */
export function guvenliUrl(url: string | null | undefined, yedek: string): string {
  if (!url) return yedek
  const t = url.trim()
  // Göreli yol (uygulama içi link) — şema yok, güvenli
  if (t.startsWith('/')) return esc(t)
  if (/^https?:\/\//i.test(t)) return esc(t)
  return esc(yedek)
}
