import { describe, it, expect } from 'vitest'
import { dogrusalOlcek, guzelTickler, ustSinir, bantOlcek, etiketSeyrelt } from './olcek'
import { cizgiSerisi, yatayBar, yiginBar, sparkline } from './geometri'

/**
 * Grafik geometrisi testleri.
 *
 * Öncelik SINIR DURUMLARINDA: boş seri, tek nokta, hepsi sıfır. Bunlar
 * demo gününde ekranı patlatan tipik durumlar ve NaN / Infinity üreten bir
 * `d` string'i SVG'de sessizce hiçbir şey çizmez — hata da vermez.
 */

function nanIcermiyor(d: string) {
  expect(d).not.toContain('NaN')
  expect(d).not.toContain('Infinity')
  expect(d).not.toContain('undefined')
}

describe('dogrusalOlcek', () => {
  it('alanı hedefe eşler', () => {
    const o = dogrusalOlcek([0, 10], [0, 100])
    expect(o(0)).toBe(0)
    expect(o(5)).toBe(50)
    expect(o(10)).toBe(100)
  })

  it('ters hedefte (y ekseni) doğru çalışır', () => {
    const o = dogrusalOlcek([0, 10], [100, 0])
    expect(o(0)).toBe(100)
    expect(o(10)).toBe(0)
  })

  it('sıfır genişlikli alanda NaN ÜRETMEZ', () => {
    // Tüm değerler eşitse (örn. hepsi 0) alan sıfır genişlikte olur.
    const o = dogrusalOlcek([5, 5], [0, 100])
    expect(Number.isNaN(o(5))).toBe(false)
    expect(o(5)).toBe(50)
  })
})

describe('guzelTickler', () => {
  it('okunabilir adımlar üretir', () => {
    expect(guzelTickler(10)).toEqual([0, 5, 10])
    expect(guzelTickler(100)).toEqual([0, 50, 100])
    expect(guzelTickler(8)).toEqual([0, 2, 4, 6, 8])
  })

  it('görev sayısı ekseninde kesirli tick üretmez', () => {
    // "2,5 görev" diye bir şey yok; 1/2/5 katları kuralı bunu zaten sağlıyor.
    for (const max of [1, 3, 7, 9, 11, 23, 47, 96]) {
      for (const t of guzelTickler(max)) {
        expect(Number.isInteger(t), `max=${max} tick=${t}`).toBe(true)
      }
    }
  })

  it('üst sınırı yukarı yuvarlar', () => {
    expect(ustSinir(7)).toBeGreaterThanOrEqual(7)
    expect(ustSinir(23)).toBeGreaterThanOrEqual(23)
  })

  it('sıfır ve negatifte çökmez', () => {
    expect(guzelTickler(0)).toEqual([0, 1])
    expect(guzelTickler(-5)).toEqual([0, 1])
    expect(guzelTickler(NaN)).toEqual([0, 1])
  })

  it('kayan nokta artığı bırakmaz', () => {
    for (const t of guzelTickler(3)) {
      expect(String(t)).not.toMatch(/\d{6,}/)
    }
  })
})

describe('bantOlcek', () => {
  it('bantları eşit dağıtır', () => {
    const b = bantOlcek(4, 100)
    expect(b.merkez(0)).toBe(12.5)
    expect(b.merkez(3)).toBe(87.5)
    expect(b.bandGenisligi).toBeCloseTo(18.75)
  })
  it('sıfır öğede çökmez', () => {
    const b = bantOlcek(0, 100)
    expect(b.bandGenisligi).toBe(0)
    expect(Number.isNaN(b.merkez(0))).toBe(false)
  })
})

describe('etiketSeyrelt', () => {
  it('az öğede hepsini bırakır', () => {
    expect(etiketSeyrelt(['a', 'b', 'c'], 8)).toHaveLength(3)
  })
  it('çok öğede seyreltir ama İLK ve SON daima kalır', () => {
    const g = Array.from({ length: 90 }, (_, i) => `g${i}`)
    const r = etiketSeyrelt(g, 8)
    expect(r.length).toBeLessThanOrEqual(9)
    expect(r[0].i).toBe(0)
    expect(r[r.length - 1].i).toBe(89)
  })
})

describe('cizgiSerisi', () => {
  const ETIKET = ['1 Eyl', '2 Eyl', '3 Eyl']

  it('normal seride path üretir', () => {
    const c = cizgiSerisi({
      etiketler: ETIKET,
      seriler: [{ ad: 'Açık', renk: '#2288c9', degerler: [1, 3, 2] }],
    })
    expect(c.seriler[0].parcalar.length).toBeGreaterThan(0)
    expect(c.seriler[0].noktalar).toHaveLength(3)
    nanIcermiyor(c.seriler[0].parcalar.map(p => p.d).join(' '))
  })

  it('BOŞ seride çökmez', () => {
    const c = cizgiSerisi({ etiketler: [], seriler: [] })
    expect(c.seriler).toHaveLength(0)
    expect(c.eksen.tickler.length).toBeGreaterThan(0)
  })

  it('TEK noktalı seride NaN üretmez', () => {
    const c = cizgiSerisi({
      etiketler: ['1 Eyl'],
      seriler: [{ ad: 'Açık', renk: '#000', degerler: [5] }],
    })
    nanIcermiyor(c.seriler[0].parcalar.map(p => p.d).join(' '))
    expect(c.seriler[0].noktalar).toHaveLength(1)
  })

  it('TÜMÜ SIFIR seride NaN üretmez', () => {
    const c = cizgiSerisi({
      etiketler: ETIKET,
      seriler: [{ ad: 'Açık', renk: '#000', degerler: [0, 0, 0] }],
    })
    nanIcermiyor(c.seriler[0].parcalar.map(p => p.d).join(' '))
  })

  it('null değerde çizgi KOPAR — sıfır olarak çizilmez', () => {
    // Türetilemeyen metrikler (bloke, atanmamış) null döner. Sıfır çizmek
    // "o gün hiç bloke görev yoktu" demek olurdu — bu bir yalan.
    const c = cizgiSerisi({
      etiketler: ['a', 'b', 'c', 'd'],
      seriler: [{ ad: 'Bloke', renk: '#000', degerler: [2, null, null, 3] }],
    })
    expect(c.seriler[0].noktalar).toHaveLength(2)
    expect(c.seriler[0].parcalar.length).toBe(2)   // iki ayrı parça
  })

  it('türetilmiş bölge KESİKLİ parça olarak işaretlenir', () => {
    const c = cizgiSerisi({
      etiketler: ['a', 'b', 'c'],
      seriler: [{ ad: 'Açık', renk: '#000', degerler: [1, 2, 3] }],
      turetilmis: [true, true, false],
    })
    expect(c.seriler[0].parcalar.some(p => p.kesikli)).toBe(true)
    expect(c.seriler[0].parcalar.some(p => !p.kesikli)).toBe(true)
  })

  it('çok serili grafikte hepsi aynı ölçeği kullanır', () => {
    const c = cizgiSerisi({
      etiketler: ETIKET,
      seriler: [
        { ad: 'A', renk: '#111', degerler: [10, 20, 30] },
        { ad: 'B', renk: '#222', degerler: [1, 2, 3] },
      ],
    })
    // Aynı değer aynı y'ye düşmeli
    const aY = c.seriler[0].noktalar.find(n => n.deger === 10)!.y
    const c2 = cizgiSerisi({
      etiketler: ETIKET,
      seriler: [{ ad: 'A', renk: '#111', degerler: [10, 20, 30] }],
    })
    expect(aY).toBe(c2.seriler[0].noktalar.find(n => n.deger === 10)!.y)
  })
})

describe('yatayBar', () => {
  it('en büyük değeri tam genişliğe yayar', () => {
    const b = yatayBar({ ogeler: [{ etiket: 'Ankara', deger: 10 }, { etiket: 'İzmir', deger: 5 }] })
    expect(b.barlar[0].w).toBeGreaterThan(b.barlar[1].w)
    b.barlar.forEach(x => expect(Number.isFinite(x.w)).toBe(true))
  })

  it('BOŞ listede çökmez', () => {
    const b = yatayBar({ ogeler: [] })
    expect(b.barlar).toHaveLength(0)
    expect(b.yukseklik).toBeGreaterThan(0)
  })

  it('TÜMÜ SIFIR değerde bölme hatası vermez', () => {
    const b = yatayBar({ ogeler: [{ etiket: 'A', deger: 0 }, { etiket: 'B', deger: 0 }] })
    b.barlar.forEach(x => {
      expect(Number.isFinite(x.w)).toBe(true)
      expect(x.w).toBe(0)
    })
  })
})

describe('yiginBar', () => {
  it('yüzdeleri doğru dağıtır', () => {
    const y = yiginBar([
      { ad: 'Tamam', deger: 5, renk: '#0a0' },
      { ad: 'Açık', deger: 5, renk: '#a00' },
    ], 100)
    expect(y.dilimler).toHaveLength(2)
    expect(y.dilimler[0].yuzde).toBe(50)
    expect(y.dilimler[0].w + y.dilimler[1].w).toBeCloseTo(100)
  })

  it('sıfır toplamda boş döner, bölme yapmaz', () => {
    const y = yiginBar([{ ad: 'A', deger: 0, renk: '#000' }])
    expect(y.dilimler).toHaveLength(0)
    expect(y.toplam).toBe(0)
  })

  it('sıfır değerli dilimi çizmez', () => {
    const y = yiginBar([
      { ad: 'A', deger: 3, renk: '#000' },
      { ad: 'B', deger: 0, renk: '#111' },
    ])
    expect(y.dilimler).toHaveLength(1)
  })
})

describe('sparkline', () => {
  it('path üretir', () => {
    const s = sparkline([1, 5, 3, 8])
    expect(s.d).toContain('M')
    nanIcermiyor(s.d)
    expect(s.sonNokta).not.toBeNull()
  })

  it('boş dizide boş path döner', () => {
    const s = sparkline([])
    expect(s.d).toBe('')
    expect(s.sonNokta).toBeNull()
  })

  it('tek değerde ve düz seride NaN üretmez', () => {
    nanIcermiyor(sparkline([5]).d)
    nanIcermiyor(sparkline([4, 4, 4]).d)   // aralık 0 → bölme riski
  })

  it('null değerlerde kopar', () => {
    const s = sparkline([1, null, 3])
    expect((s.d.match(/M/g) ?? []).length).toBe(2)
  })
})
