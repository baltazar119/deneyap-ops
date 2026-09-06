import { TURKIYE_ILLERI } from './turkiyeIller'
import type { ProvinceRisk } from '@/lib/operationRisk'

/**
 * Harita için il durumu — SAF fonksiyon.
 *
 * EN ÖNEMLİ TASARIM KARARI burada: **verisi olmayan il, düşük riskli ilden
 * görsel olarak FARKLI olmak zorunda.**
 *
 * Türkiye'de 81 il var ama bir organizasyonun çoğunda hiç görevi olmayabilir.
 * "Veri yok" durumunu "düşük risk" yeşiliyle boyamak, hiç görev girilmemiş
 * 60 ili "her şey yolunda" olarak gösterir — harita o anda YALAN SÖYLER ve
 * yönetici sahada olmayan bir güven duyar. Bu yüzden `veriVarMi` ayrı bir
 * alan ve renk skalasında ayrı bir kademe.
 */

export type HaritaSeviye = 'veri-yok' | 'yok' | 'dusuk' | 'orta' | 'yuksek' | 'kritik'

export interface DeneyapDurumu {
  id: string
  ad: string
  acik: number
  geciken: number
}

export interface IlHaritaVerisi {
  il: string
  d: string
  merkez: [number, number]
  veriVarMi: boolean
  riskSkoru: number
  seviye: HaritaSeviye
  acik: number
  geciken: number
  bloke: number
  deneyaplar: DeneyapDurumu[]
}

/**
 * 5 kademeli sıralı renk skalası (ColorBrewer YlOrRd) + ayrı "veri yok" grisi.
 *
 * Mevcut 3 renkli kategorik `RISK_RENK` harita için yetersiz: 81 il aynı üç
 * renge sıkışınca kırılım kaybolur.
 *
 * RENK TEK KANAL DEĞİL: skala açıklık gradyanı taşır (renk körlüğü),
 * en yüksek kademe ayrıca tarama deseniyle işaretlenir ve her ilin
 * `aria-label`'ında sayısal değer bulunur.
 */
export const HARITA_RENK: Record<HaritaSeviye, { dolgu: string; kenar: string; etiket: string }> = {
  'veri-yok': { dolgu: '#e2e8f0', kenar: '#cbd5e1', etiket: 'Veri yok' },
  'yok':      { dolgu: '#ffffcc', kenar: '#e5e7eb', etiket: 'Risk yok' },
  'dusuk':    { dolgu: '#ffeda0', kenar: '#e5e7eb', etiket: 'Düşük' },
  'orta':     { dolgu: '#feb24c', kenar: '#e5e7eb', etiket: 'Orta' },
  'yuksek':   { dolgu: '#f03b20', kenar: '#ffffff', etiket: 'Yüksek' },
  'kritik':   { dolgu: '#bd0026', kenar: '#ffffff', etiket: 'Kritik' },
}

/** Lejant sırası — "veri yok" en sonda, ayrı bir kategori olduğu belli olsun */
export const LEJANT_SIRASI: HaritaSeviye[] = ['yok', 'dusuk', 'orta', 'yuksek', 'kritik', 'veri-yok']

export function seviyeSec(skor: number, veriVarMi: boolean): HaritaSeviye {
  if (!veriVarMi) return 'veri-yok'
  if (skor <= 0) return 'yok'
  if (skor < 25) return 'dusuk'
  if (skor < 50) return 'orta'
  if (skor < 75) return 'yuksek'
  return 'kritik'
}

export interface HaritaGirdisi {
  /** operationRisk.computeRisk çıktısındaki il riskleri */
  provinces: ProvinceRisk[]
  /** Görevi olan iller — risk skoru 0 olsa bile "veri var" sayılır */
  veriOlanIller: string[]
  /** il → o ildeki DENEYAP'lar */
  deneyaplar?: Record<string, DeneyapDurumu[]>
}

export function haritaVerisiKur(g: HaritaGirdisi): IlHaritaVerisi[] {
  const riskHarita = new Map(g.provinces.map(p => [p.il, p]))
  const veriSeti = new Set(g.veriOlanIller)

  return TURKIYE_ILLERI.map(sekil => {
    const r = riskHarita.get(sekil.ad)
    // Risk skoru 0 olan bir il de "veri var" olabilir: görevleri var ama
    // hiçbiri riskli değil. Bu, hiç görevi olmayan ilden FARKLI bir durum.
    const veriVarMi = veriSeti.has(sekil.ad) || !!r
    const skor = r?.score ?? 0

    return {
      il: sekil.ad,
      d: sekil.d,
      merkez: sekil.merkez,
      veriVarMi,
      riskSkoru: skor,
      seviye: seviyeSec(skor, veriVarMi),
      acik: r?.openCount ?? 0,
      geciken: r?.overdueCount ?? 0,
      bloke: r?.blockedCount ?? 0,
      deneyaplar: g.deneyaplar?.[sekil.ad] ?? [],
    }
  })
}

/** Tabloda ve sıralamada kullanılacak: önce riskli, sonra verisi olanlar */
export function haritaSirala(veri: IlHaritaVerisi[]): IlHaritaVerisi[] {
  return [...veri].sort((a, b) => {
    if (a.veriVarMi !== b.veriVarMi) return a.veriVarMi ? -1 : 1
    if (b.riskSkoru !== a.riskSkoru) return b.riskSkoru - a.riskSkoru
    return a.il.localeCompare(b.il, 'tr')
  })
}

/**
 * Bir path'in sınır kutusu. Tek il gösterilirken viewBox'ı o ilin etrafına
 * daraltmak için gerekir: aksi halde tek bir il, Türkiye'nin tamamı için
 * ölçeklenmiş 1000x430 çerçevenin ortasında minik bir leke olarak kalır.
 */
export function sinirKutusu(d: string, pay = 12): { x: number; y: number; w: number; h: number } | null {
  const sayilar = d.match(/-?\d+(?:\.\d+)?/g)
  if (!sayilar || sayilar.length < 4) return null

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (let i = 0; i + 1 < sayilar.length; i += 2) {
    const x = Number(sayilar[i]), y = Number(sayilar[i + 1])
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    if (x < minX) minX = x; if (x > maxX) maxX = x
    if (y < minY) minY = y; if (y > maxY) maxY = y
  }
  if (!Number.isFinite(minX) || maxX <= minX || maxY <= minY) return null

  return {
    x: minX - pay,
    y: minY - pay,
    w: (maxX - minX) + pay * 2,
    h: (maxY - minY) + pay * 2,
  }
}
