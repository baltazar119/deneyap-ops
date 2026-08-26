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
