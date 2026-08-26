import type { RaporVerisi, GorevSatiri } from './hesapla'

/**
 * CSV üretimi — bağımlılık gerektirmez.
 *
 * UTF-8 BOM ZORUNLU: yoksa Excel dosyayı ANSI sanıp "Şanlıurfa"yı bozar.
 * Ayırıcı varsayılan ";" — Türkçe yerelli Excel'in beklediği ayırıcı bu.
 */
const BOM = '\uFEFF'

function hucre(v: unknown, ayirici: string): string {
  const s = v === null || v === undefined ? '' : String(v)
  // Formül enjeksiyonu: = + - @ ile başlayan hücreler Excel'de çalıştırılabilir
  const guvenli = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  return /["\n\r]|[;,\t]/.test(guvenli) ? `"${guvenli.replace(/"/g, '""')}"` : guvenli
}

export function satirlariCsv(
  basliklar: string[],
  satirlar: unknown[][],
  ayirici: ';' | ',' = ';',
): string {
  const tumu = [basliklar, ...satirlar]
  return BOM + tumu.map(r => r.map(c => hucre(c, ayirici)).join(ayirici)).join('\r\n') + '\r\n'
}

const GOREV_BASLIK = ['Görev', 'İl / Birim', 'Sorumlu', 'Durum', 'Öncelik', 'Kategori', 'Termin', 'Gecikme (gün)']

function gorevSatirlari(satirlar: GorevSatiri[]): unknown[][] {
  return satirlar.map(r => [r.baslik, r.il ?? '', r.sorumlu ?? '', r.durum, r.oncelik, r.tur, r.termin ?? '', r.gecikmeGunu ?? ''])
}

export type CsvSayfa = 'gorevler' | 'gecikmeler' | 'yaklasan' | 'il-ozeti'

export function raporCsv(v: RaporVerisi, sayfa: CsvSayfa, ayirici: ';' | ',' = ';'): string {
  switch (sayfa) {
    case 'gecikmeler': return satirlariCsv(GOREV_BASLIK, gorevSatirlari(v.gecikmeler), ayirici)
    case 'yaklasan':   return satirlariCsv(GOREV_BASLIK, gorevSatirlari(v.yaklasan), ayirici)
    case 'il-ozeti':
      return satirlariCsv(
        ['İl / Birim', 'Toplam', 'Tamamlanan', 'Devam Eden', 'Geciken', 'Tamamlanma %'],
        v.ilKirilimi.map(r => [r.il, r.toplam, r.tamamlanan, r.devamEden, r.geciken, r.oran]),
        ayirici,
      )
    case 'gorevler':
    default:           return satirlariCsv(GOREV_BASLIK, gorevSatirlari(v.hamListe), ayirici)
  }
}
