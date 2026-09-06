import type { FormAlani, Cevaplar, CevapDegeri } from './tipler'

/**
 * Cevapları sonraki görevin metnine taşıyan şablon motoru.
 *
 * "Elde edilen bilgiler diğer aşamaya aktarılabilecek" isteğinin somut hali:
 * form sahibi sonraki görevin başlığını `{{alan_id}}` yer tutucularıyla
 * yazıyor, form dolunca yer tutucular cevaplarla değişiyor.
 *
 * BİLİNÇLİ OLARAK ÇOK BASİT: koşul, döngü, filtre yok. Bir şablon dili
 * yazmıyoruz; değişken yerleştiriyoruz. Karmaşıklık istenirse çok aşamalı
 * workflow motoru ayrı bir iş.
 */

/** `{{ alan_id }}` — boşluklara toleranslı. */
const YER_TUTUCU = /\{\{\s*([A-Za-z0-9_-]+)\s*\}\}/g

/**
 * Bir cevabı görev metninde kullanılacak düz metne çevirir.
 *
 * Tablo cevapları başlığa sığmaz; "3 satır" özeti veriliyor. Tam içerik
 * görevin açıklamasına ayrıca ekleniyor (`cevapOzetiMetni`).
 */
export function cevapMetni(deger: CevapDegeri, alan?: FormAlani): string {
  if (deger === null || deger === undefined) return ''
  if (typeof deger === 'boolean') return deger ? 'Evet' : 'Hayır'
  if (typeof deger === 'number') return String(deger)
  if (typeof deger === 'string') return deger
  if (Array.isArray(deger)) {
    if (deger.length === 0) return ''
    if (typeof deger[0] === 'string') return (deger as string[]).join(', ')
    const n = deger.length
    return alan ? `${n} satır` : `${n} satır`
  }
  return ''
}

/**
 * Şablondaki yer tutucuları cevaplarla doldurur.
 *
 * Bilinmeyen ya da boş bir alan yer tutucusu BOŞ DİZGEYE değil, alan
 * etiketine düşmez — boş bırakılır ve arta kalan çift boşluklar temizlenir.
 * Gerekçe: "{{il}} ziyareti" şablonu cevap boşsa " ziyareti" değil
 * "ziyareti" üretmeli.
 */
export function sablonDoldur(
  sablon: string | null | undefined, alanlar: FormAlani[], cevaplar: Cevaplar,
): string {
  if (!sablon) return ''
  const haritalanmis = new Map(alanlar.map(a => [a.id, a]))
  return sablon
    .replace(YER_TUTUCU, (_, id: string) => cevapMetni(cevaplar[id] ?? null, haritalanmis.get(id)))
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

/** Şablonda geçen alan id'leri — düzenleme ekranında uyarı vermek için. */
export function sablondakiAlanlar(sablon: string | null | undefined): string[] {
  if (!sablon) return []
  return [...sablon.matchAll(YER_TUTUCU)].map(m => m[1])
}

/** Şablonda var ama formda olmayan alanlar. Sessiz boş metnin sebebi budur. */
export function tanimsizYerTutucular(
  sablon: string | null | undefined, alanlar: FormAlani[],
): string[] {
  const idler = new Set(alanlar.map(a => a.id))
  return [...new Set(sablondakiAlanlar(sablon))].filter(id => !idler.has(id))
}

/**
 * Tüm cevapların okunabilir özeti — oluşan görevin açıklamasına ve görev
 * detayına yazılır. Tablolar burada TAM haliyle yer alır.
 */
export function cevapOzetiMetni(alanlar: FormAlani[], cevaplar: Cevaplar): string {
  const satirlar: string[] = []
  for (const alan of alanlar) {
    const deger = cevaplar[alan.id] ?? null
    if (alan.tip === 'tablo' && Array.isArray(deger) && deger.length > 0 && typeof deger[0] === 'object') {
      const sutunlar = alan.sutunlar ?? []
      satirlar.push(`${alan.etiket}:`)
      satirlar.push(sutunlar.map(s => s.baslik).join(' | '))
      for (const satir of deger as Record<string, string | number | null>[]) {
        satirlar.push(sutunlar.map(s => (satir[s.id] ?? '')).join(' | '))
      }
    } else {
      const metin = cevapMetni(deger, alan)
      satirlar.push(`${alan.etiket}: ${metin || '—'}`)
    }
  }
  return satirlar.join('\n')
}

/** Yanıt tarihinden N gün sonrası — görev termini için (YYYY-AA-GG). */
export function terminHesapla(gunSonra: number | null, simdi: Date = new Date()): string | null {
  if (gunSonra === null || gunSonra === undefined || !Number.isFinite(gunSonra)) return null
  const d = new Date(simdi.getTime() + gunSonra * 86400000)
  return d.toISOString().slice(0, 10)
}
