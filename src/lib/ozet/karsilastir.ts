/**
 * Dönem karşılaştırması — SAF fonksiyon.
 *
 * `guvenilir` bayrağı bu modülün varlık sebebi. Küçük sayılarda yüzde
 * hesaplamak yorumların tamamının güvenilirliğini bitirir:
 *   "Geciken görev %100 arttı" → aslında 1'den 2'ye çıkmış.
 * Böyle bir cümleyi bir kez gören yönetici bir daha hiçbir yoruma inanmaz.
 *
 * Bu yüzden önceki dönem eşiğin altındaysa yüzde ÜRETİLMEZ; yalnızca mutlak
 * fark verilir ve arayüz "2 arttı" der, "%100 arttı" demez.
 */

/** Altında yüzde hesaplanmayan eşik */
export const GUVENILIR_ESIK = 5

export type Yon = 'artis' | 'azalis' | 'sabit'

export interface Karsilastirma {
  bu: number
  onceki: number
  fark: number
  /** Yalnızca `guvenilir` true iken dolu */
  yuzde: number | null
  yon: Yon
  guvenilir: boolean
}

export function karsilastir(bu: number, onceki: number): Karsilastirma {
  const fark = bu - onceki
  const yon: Yon = fark > 0 ? 'artis' : fark < 0 ? 'azalis' : 'sabit'
  const guvenilir = onceki >= GUVENILIR_ESIK

  return {
    bu,
    onceki,
    fark,
    yuzde: guvenilir ? Math.round((fark / onceki) * 100) : null,
    yon,
    guvenilir,
  }
}

/**
 * Karşılaştırmayı insan diline çevirir.
 * Yüzde güvenilir değilse mutlak sayıyla konuşur.
 */
export function karsilastirmaMetni(k: Karsilastirma, birim = 'görev'): string {
  if (k.yon === 'sabit') return 'geçen döneme göre değişmedi'
  const fiil = k.yon === 'artis' ? 'arttı' : 'azaldı'
  const mutlak = Math.abs(k.fark)
  if (k.guvenilir && k.yuzde !== null) {
    return `geçen döneme göre %${Math.abs(k.yuzde)} ${fiil} (${k.onceki} → ${k.bu})`
  }
  return `geçen döneme göre ${mutlak} ${birim} ${fiil} (${k.onceki} → ${k.bu})`
}

/**
 * Verilen dönemin hemen öncesindeki, AYNI UZUNLUKTA pencere.
 * "Bu hafta"nın öncesi geçen hafta, "bu ay"ın öncesi geçen ay olur.
 */
export function oncekiDonem(baslangic: string, bitis: string): { baslangic: string; bitis: string } {
  const b = new Date(baslangic + 'T00:00:00')
  const s = new Date(bitis + 'T00:00:00')
  const gunSayisi = Math.round((s.getTime() - b.getTime()) / 86400000) + 1

  const yeniBitis = new Date(b); yeniBitis.setDate(b.getDate() - 1)
  const yeniBas   = new Date(yeniBitis); yeniBas.setDate(yeniBitis.getDate() - (gunSayisi - 1))

  const f = (d: Date) => {
    const iki = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${iki(d.getMonth() + 1)}-${iki(d.getDate())}`
  }
  return { baslangic: f(yeniBas), bitis: f(yeniBitis) }
}
