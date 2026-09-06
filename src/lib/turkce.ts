/**
 * Türkçe metin normalizasyonu — TEK KAYNAK.
 *
 * Buradaki asıl mesele `"İ".toLowerCase()`: JavaScript bunu `i` + U+0307
 * (birleşik nokta) olarak üretir. Bu proje daha önce tam bu yüzden
 * "İSTANBUL" → "i-stanbul" hatası verdi. Çözüm Türkçe harfleri
 * toLowerCase()'ten ÖNCE çevirmek.
 *
 * Bu mantık `onboarding/create-org` içinde yerel bir fonksiyondu; içe aktarma
 * (başlık eşleme, il eşleme, sorumlu eşleme) aynı katlamaya ihtiyaç duyduğu
 * için buraya alındı. Yeni kopya çıkarmayın.
 */

/**
 * Karşılaştırma için metni katlar: Türkçe harfler ASCII'ye çevrilir,
 * küçük harfe indirilir, aksanlar temizlenir, boşluklar tekilleştirilir.
 *
 * "İl / Birim" ve "il birim" aynı sonucu verir → başlık eşlemesi çalışır.
 */
export function trFold(s: string): string {
  return s
    .replace(/[İIı]/g, 'i')
    .replace(/[Ğğ]/g, 'g')
    .replace(/[Üü]/g, 'u')
    .replace(/[Şş]/g, 's')
    .replace(/[Öö]/g, 'o')
    .replace(/[Çç]/g, 'c')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** URL/slug hâline getirir (workspace slug'ları, dosya adları) */
export function toSlug(s: string): string {
  return trFold(s)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
}

/** Türkçe alfabetik sıralama — "Çanakkale" C'den sonra gelir */
export function trCompare(a: string, b: string): number {
  return a.localeCompare(b, 'tr')
}

/* ── Türkçe ekler ────────────────────────────────────────────────────────── */

const SESLI = 'aeıioöuü'
const KALIN = 'aıou'
const SERT  = 'pçtkfhsş'

/** Kelimenin son sesli harfi (yoksa null) */
function sonSesli(s: string): string | null {
  for (let i = s.length - 1; i >= 0; i--) {
    const c = s[i].toLowerCase()
    if (SESLI.includes(c)) return c
  }
  return null
}

/** Son harf (kesme işareti ve boşluk atlanır) */
function sonHarf(s: string): string {
  const t = s.trim().replace(/['’]/g, '')
  return t.length ? t[t.length - 1].toLowerCase() : ''
}

/**
 * Özel ada bulunma hâli eki: "Ankara'da", "Uşak'ta", "İzmir'de", "Bolu'da".
 *
 * İki kural birden: büyük ünlü uyumu (kalın → 'da', ince → 'de') ve sert
 * ünsüz benzeşmesi (son harf sert ise 'ta'/'te').
 *
 * Bu yardımcı olmadan yorumlar "Uşak'da" yazıyor ve metin anında "makine
 * üretmiş" gibi okunuyor — yorum motorunun tüm güvenilirliği bu tür küçük
 * ayrıntılara bağlı.
 */
export function bulunmaEki(ad: string): string {
  const kalin = (sonSesli(ad) ?? 'a')
  const sert = SERT.includes(sonHarf(ad))
  const ek = KALIN.includes(kalin)
    ? (sert ? 'ta' : 'da')
    : (sert ? 'te' : 'de')
  return `${ad}'${ek}`
}

/**
 * Özel ada yönelme hâli eki: "Ankara'ya", "İzmir'e", "Uşak'a", "Bolu'ya".
 * Sesliyle biten adlarda kaynaştırma 'y'si girer.
 */
export function yonelmeEki(ad: string): string {
  const kalin = (sonSesli(ad) ?? 'a')
  const seslikBitis = SESLI.includes(sonHarf(ad))
  const ek = KALIN.includes(kalin) ? 'a' : 'e'
  return `${ad}'${seslikBitis ? 'y' : ''}${ek}`
}
