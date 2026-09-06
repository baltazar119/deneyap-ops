import { describe, it, expect } from 'vitest'
import { TURKIYE_ILLERI, HARITA_GENISLIK, HARITA_YUKSEKLIK } from './turkiyeIller'
import { haritaVerisiKur, haritaSirala, seviyeSec, sinirKutusu, HARITA_RENK, LEJANT_SIRASI } from './ilDurumu'
import { ILLER, IL_PLAKA } from '@/lib/iller'
import type { ProvinceRisk } from '@/lib/operationRisk'

/**
 * En kritik test 81↔81 eşleşmesi.
 *
 * Harita verisindeki bir il adı `iller.ts`'teki adla tutmazsa o il haritada
 * SESSİZCE boş kalır — hata yok, uyarı yok, sadece Türkiye'de bir delik.
 * Natural Earth adları bizimkiyle birebir değil ("Afyon", "Icel", "K. Maras"),
 * bu yüzden eşleşme testle kilitleniyor.
 */

describe('turkiyeIller — veri bütünlüğü', () => {
  it('tam 81 il içerir', () => {
    expect(TURKIYE_ILLERI).toHaveLength(81)
  })

  it('81↔81: her harita ili iller.ts listesinde VAR', () => {
    const gecerli = new Set(ILLER as readonly string[])
    const eksik = TURKIYE_ILLERI.filter(x => !gecerli.has(x.ad)).map(x => x.ad)
    expect(eksik, `Haritada olup listede olmayan: ${eksik.join(', ')}`).toEqual([])
  })

  it('81↔81: iller.ts listesindeki her il haritada VAR', () => {
    const haritada = new Set(TURKIYE_ILLERI.map(x => x.ad))
    const eksik = (ILLER as readonly string[]).filter(i => !haritada.has(i))
    expect(eksik, `Listede olup haritada olmayan: ${eksik.join(', ')}`).toEqual([])
  })

  it('her ilin plaka kodu tanımlı', () => {
    const eksik = TURKIYE_ILLERI.filter(x => !IL_PLAKA[x.ad]).map(x => x.ad)
    expect(eksik).toEqual([])
  })

  it('aynı il iki kez geçmez', () => {
    const adlar = TURKIYE_ILLERI.map(x => x.ad)
    expect(new Set(adlar).size).toBe(adlar.length)
  })

  it('her ilin geçerli bir path verisi var', () => {
    TURKIYE_ILLERI.forEach(x => {
      expect(x.d.startsWith('M'), x.ad).toBe(true)
      expect(x.d.endsWith('Z'), x.ad).toBe(true)
      expect(x.d).not.toContain('NaN')
      expect(x.d).not.toContain('undefined')
      expect(x.d.length, x.ad).toBeGreaterThan(20)
    })
  })

  it('merkez noktaları viewBox İÇİNDE', () => {
    TURKIYE_ILLERI.forEach(x => {
      const [cx, cy] = x.merkez
      expect(cx, `${x.ad} x`).toBeGreaterThanOrEqual(0)
      expect(cx, `${x.ad} x`).toBeLessThanOrEqual(HARITA_GENISLIK)
      expect(cy, `${x.ad} y`).toBeGreaterThanOrEqual(0)
      expect(cy, `${x.ad} y`).toBeLessThanOrEqual(HARITA_YUKSEKLIK)
    })
  })

  it('koordinatlar tamsayı — dosya gereksiz şişmesin', () => {
    const ondalik = TURKIYE_ILLERI.filter(x => /\d\.\d/.test(x.d))
    expect(ondalik.map(x => x.ad)).toEqual([])
  })
})

describe('seviyeSec — veri yok ayrımı', () => {
  it('verisi olmayan il "veri-yok" olur, "düşük risk" DEĞİL', () => {
    // Bu ayrım olmasaydı hiç görev girilmemiş 60 il "her şey yolunda"
    // yeşiliyle görünür ve harita yalan söylerdi.
    expect(seviyeSec(0, false)).toBe('veri-yok')
    expect(seviyeSec(0, true)).toBe('yok')
  })

  it('skoru kademelere doğru dağıtır', () => {
    expect(seviyeSec(10, true)).toBe('dusuk')
    expect(seviyeSec(30, true)).toBe('orta')
    expect(seviyeSec(60, true)).toBe('yuksek')
    expect(seviyeSec(90, true)).toBe('kritik')
  })

  it('veri-yok rengi diğer kademelerin HİÇBİRİYLE aynı değil', () => {
    const digerleri = LEJANT_SIRASI.filter(s => s !== 'veri-yok').map(s => HARITA_RENK[s].dolgu)
    expect(digerleri).not.toContain(HARITA_RENK['veri-yok'].dolgu)
  })
})

describe('haritaVerisiKur', () => {
  const risk = (il: string, score: number, o: Partial<ProvinceRisk> = {}): ProvinceRisk => ({
    il, score, level: 'medium', openCount: 5, overdueCount: 2,
    blockedCount: 0, unassignedCriticalCount: 0, topIssue: null, ...o,
  })

  it('her zaman 81 il döndürür — risk verisi olmayanlar dahil', () => {
    const v = haritaVerisiKur({ provinces: [risk('Ankara', 50)], veriOlanIller: ['Ankara'] })
    expect(v).toHaveLength(81)
    expect(v.filter(x => x.veriVarMi)).toHaveLength(1)
  })

  it('risk skoru 0 ama görevi olan il "veri var" sayılır', () => {
    // Görevleri var, hiçbiri riskli değil — hiç görevi olmayandan FARKLI.
    const v = haritaVerisiKur({ provinces: [], veriOlanIller: ['Bolu'] })
    const bolu = v.find(x => x.il === 'Bolu')!
    expect(bolu.veriVarMi).toBe(true)
    expect(bolu.seviye).toBe('yok')
  })

  it('hiç görevi olmayan il "veri-yok" olur', () => {
    const v = haritaVerisiKur({ provinces: [], veriOlanIller: [] })
    expect(v.every(x => x.seviye === 'veri-yok')).toBe(true)
  })

  it('bir ildeki BİRDEN FAZLA DENEYAP taşınır', () => {
    const v = haritaVerisiKur({
      provinces: [risk('Ankara', 40)],
      veriOlanIller: ['Ankara'],
      deneyaplar: {
        Ankara: [
          { id: 'd1', ad: 'Çankaya DENEYAP', acik: 3, geciken: 1 },
          { id: 'd2', ad: 'Keçiören DENEYAP', acik: 2, geciken: 0 },
        ],
      },
    })
    expect(v.find(x => x.il === 'Ankara')!.deneyaplar).toHaveLength(2)
  })

  it('bilinmeyen il adı çökmeye yol açmaz', () => {
    expect(() => haritaVerisiKur({
      provinces: [risk('İl Belirtilmemiş', 30)],
      veriOlanIller: ['İl Belirtilmemiş'],
    })).not.toThrow()
  })
})

describe('haritaSirala', () => {
  it('verisi olanları öne, riski yüksek olanı en başa alır', () => {
    const v = haritaVerisiKur({
      provinces: [
        { il: 'İzmir', score: 20, level: 'low', openCount: 2, overdueCount: 0, blockedCount: 0, unassignedCriticalCount: 0, topIssue: null },
        { il: 'Ankara', score: 80, level: 'high', openCount: 9, overdueCount: 5, blockedCount: 1, unassignedCriticalCount: 0, topIssue: null },
      ],
      veriOlanIller: ['Ankara', 'İzmir'],
    })
    const s = haritaSirala(v)
    expect(s[0].il).toBe('Ankara')
    expect(s[1].il).toBe('İzmir')
    expect(s[2].veriVarMi).toBe(false)
  })
})

describe('sinirKutusu — tek il yakınlaştırma', () => {
  it('path sınırlarını doğru bulur', () => {
    const k = sinirKutusu('M10 20L110 20L110 120L10 120Z', 0)
    expect(k).toEqual({ x: 10, y: 20, w: 100, h: 100 })
  })

  it('pay ekler', () => {
    const k = sinirKutusu('M10 20L110 20L110 120L10 120Z', 5)!
    expect(k.x).toBe(5)
    expect(k.w).toBe(110)
  })

  it('gerçek il verisinde makul bir kutu üretir', () => {
    const ankara = TURKIYE_ILLERI.find(x => x.ad === 'Ankara')!
    const k = sinirKutusu(ankara.d)!
    expect(k.w).toBeGreaterThan(0)
    expect(k.h).toBeGreaterThan(0)
    // Tek il ülkenin tamamından belirgin şekilde küçük olmalı,
    // yoksa "yakınlaştırma" hiçbir işe yaramaz.
    expect(k.w).toBeLessThan(HARITA_GENISLIK / 2)
  })

  it('bozuk girdide null döner, çökmez', () => {
    expect(sinirKutusu('')).toBeNull()
    expect(sinirKutusu('M')).toBeNull()
    expect(sinirKutusu('M10 10')).toBeNull()   // tek nokta, alan yok
  })

  it('her ilin kutusu üretilebiliyor', () => {
    const basarisiz = TURKIYE_ILLERI.filter(x => sinirKutusu(x.d) === null).map(x => x.ad)
    expect(basarisiz).toEqual([])
  })
})
