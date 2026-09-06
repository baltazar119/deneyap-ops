import { describe, it, expect } from 'vitest'
import {
  duyuruHedefliyorMu, duyuruYayindaMi, duyurulariSirala, gosterilecekDuyurular,
  type AliciBaglami,
} from './duyuru'

/**
 * Hedefleme SUNUCUDA uygulanıyor; bu testler o kuralın tek kaynağını kilitler.
 * Bir hata burada "duyuruyu görmemesi gereken kişinin görmesi" demek olurdu.
 */

function hedef(p: Partial<{ roller: string[]; iller: string[]; deneyaplar: string[] }> = {}) {
  return {
    hedef_roller: p.roller ?? [],
    hedef_iller: p.iller ?? [],
    hedef_deneyap_ids: p.deneyaplar ?? [],
  }
}

function alici(role: string | null, il: string | null = null, deneyapId: string | null = null): AliciBaglami {
  return { role: role as AliciBaglami['role'], il, deneyapId }
}

describe('hedefleme — boş dizi "herkes" demek', () => {
  it('üç hedef de boşsa herkese gider', () => {
    expect(duyuruHedefliyorMu(hedef(), alici('member', 'Ankara', 'd1'))).toBe(true)
    expect(duyuruHedefliyorMu(hedef(), alici(null, null, null))).toBe(true)
  })

  it('rol hedefi eşleşmeliyse eşleşmeyen almaz', () => {
    const d = hedef({ roller: ['member'] })
    expect(duyuruHedefliyorMu(d, alici('member'))).toBe(true)
    expect(duyuruHedefliyorMu(d, alici('admin'))).toBe(false)
  })

  it('il hedefi eşleşmeliyse eşleşmeyen almaz', () => {
    const d = hedef({ iller: ['Ankara', 'İzmir'] })
    expect(duyuruHedefliyorMu(d, alici('member', 'İzmir'))).toBe(true)
    expect(duyuruHedefliyorMu(d, alici('member', 'Bursa'))).toBe(false)
  })

  it('DENEYAP hedefi tek bir birimi seçebilir', () => {
    const d = hedef({ deneyaplar: ['d-cankaya'] })
    expect(duyuruHedefliyorMu(d, alici('member', 'Ankara', 'd-cankaya'))).toBe(true)
    // Aynı ildeki DİĞER DENEYAP almamalı — projenin belirleyici gereksinimi.
    expect(duyuruHedefliyorMu(d, alici('member', 'Ankara', 'd-kecioren'))).toBe(false)
  })

  // Hedef belirtilmişse, o boyutta DEĞERİ OLMAYAN kullanıcı dışarıda kalır.
  // Aksi halde "Ankara'ya duyuru" ili atanmamış herkese de giderdi.
  it('hedef varken değeri olmayan kullanıcı dışarıda kalır', () => {
    expect(duyuruHedefliyorMu(hedef({ iller: ['Ankara'] }), alici('member', null))).toBe(false)
    expect(duyuruHedefliyorMu(hedef({ deneyaplar: ['d1'] }), alici('member', 'Ankara', null))).toBe(false)
  })

  it('boyutlar VE ile bağlı — biri tutmazsa gitmez', () => {
    const d = hedef({ roller: ['member'], iller: ['Ankara'] })
    expect(duyuruHedefliyorMu(d, alici('member', 'Ankara'))).toBe(true)
    expect(duyuruHedefliyorMu(d, alici('member', 'İzmir'))).toBe(false)
    expect(duyuruHedefliyorMu(d, alici('admin', 'Ankara'))).toBe(false)
  })
})

describe('yayın penceresi', () => {
  const S = new Date('2026-05-10T12:00:00Z')
  const p = (y: boolean, b: string | null, bit: string | null) =>
    ({ yayinda: y, baslangic_at: b, bitis_at: bit })

  it('taslak asla gösterilmez', () => {
    expect(duyuruYayindaMi(p(false, null, null), S)).toBe(false)
  })

  it('tarihsiz yayındaki duyuru daima gösterilir', () => {
    expect(duyuruYayindaMi(p(true, null, null), S)).toBe(true)
  })

  it('başlangıçtan önce gösterilmez', () => {
    expect(duyuruYayindaMi(p(true, '2026-05-11T00:00:00Z', null), S)).toBe(false)
    expect(duyuruYayindaMi(p(true, '2026-05-09T00:00:00Z', null), S)).toBe(true)
  })

  it('bitiş anı DIŞARIDA — o anda artık görünmez', () => {
    expect(duyuruYayindaMi(p(true, null, '2026-05-10T12:00:00Z'), S)).toBe(false)
    expect(duyuruYayindaMi(p(true, null, '2026-05-10T12:00:01Z'), S)).toBe(true)
  })
})

describe('sıralama — önce kritik, sonra yeni', () => {
  const d = (id: string, onem: string, tarih: string) =>
    ({ id, onem, baslangic_at: tarih, created_at: tarih })

  it('önem sırası her şeyin önünde', () => {
    const liste = [d('a', 'normal', '2026-05-10T00:00:00Z'), d('b', 'kritik', '2026-01-01T00:00:00Z')]
    expect(duyurulariSirala(liste).map(x => x.id)).toEqual(['b', 'a'])
  })

  it('aynı önemde yeni olan önce', () => {
    const liste = [d('eski', 'normal', '2026-01-01T00:00:00Z'), d('yeni', 'normal', '2026-05-01T00:00:00Z')]
    expect(duyurulariSirala(liste).map(x => x.id)).toEqual(['yeni', 'eski'])
  })

  it('bilinmeyen önem normal sayılır, çökmez', () => {
    const liste = [d('x', 'saçma-değer', '2026-05-01T00:00:00Z')]
    expect(() => duyurulariSirala(liste)).not.toThrow()
  })
})

describe('gosterilecekDuyurular — üç kural birlikte', () => {
  const S = new Date('2026-05-10T12:00:00Z')
  const yap = (id: string, ek: Record<string, unknown> = {}) => ({
    id, onem: 'normal', created_at: '2026-05-01T00:00:00Z',
    yayinda: true, baslangic_at: null, bitis_at: null,
    ...hedef(), ...ek,
  })

  it('okunmuş duyuru bir daha gösterilmez', () => {
    const liste = [yap('a'), yap('b')]
    const sonuc = gosterilecekDuyurular(liste, alici('admin'), new Set(['a']), S)
    expect(sonuc.map(x => x.id)).toEqual(['b'])
  })

  it('taslak, hedef dışı ve okunmuş birlikte elenir', () => {
    const liste = [
      yap('taslak', { yayinda: false }),
      yap('hedef-disi', { hedef_iller: ['Bursa'] }),
      yap('okunmus'),
      yap('gorunur'),
    ]
    const sonuc = gosterilecekDuyurular(liste, alici('member', 'Ankara'), new Set(['okunmus']), S)
    expect(sonuc.map(x => x.id)).toEqual(['gorunur'])
  })

  it('kritik olan en başa gelir', () => {
    const liste = [yap('normal1'), yap('kritik1', { onem: 'kritik' })]
    expect(gosterilecekDuyurular(liste, alici('admin'), new Set(), S).map(x => x.id))
      .toEqual(['kritik1', 'normal1'])
  })
})
