import { describe, it, expect } from 'vitest'
import { tanimDogrula, cevaplariDogrula, LIMIT } from './dogrula'
import { sablonDoldur, cevapMetni, tanimsizYerTutucular, cevapOzetiMetni, terminHesapla } from './sablon'
import type { FormAlani } from './tipler'

const alan = (p: Partial<FormAlani> & { id: string; tip: FormAlani['tip'] }): FormAlani => ({
  etiket: 'Soru', zorunlu: false, ...p,
})

describe('tanımDoğrula', () => {
  it('geçerli tanımı temizleyip döndürür', () => {
    const { alanlar, hatalar } = tanimDogrula([
      { id: 'ad', tip: 'metin', etiket: '  Adınız  ', zorunlu: true },
    ])
    expect(hatalar).toEqual([])
    expect(alanlar[0]).toMatchObject({ id: 'ad', etiket: 'Adınız', zorunlu: true })
  })

  it('boş form reddedilir', () => {
    expect(tanimDogrula([]).hatalar[0].mesaj).toMatch(/en az bir soru/)
  })

  // Çakışan id, cevapların birbirinin üstüne yazması demek.
  it('tekrar eden alan kimliği reddedilir', () => {
    const { hatalar } = tanimDogrula([
      { id: 'x', tip: 'metin', etiket: 'A' },
      { id: 'x', tip: 'metin', etiket: 'B' },
    ])
    expect(hatalar.some(h => /birden fazla alanda/.test(h.mesaj))).toBe(true)
  })

  it('seçimli soruda seçenek zorunlu', () => {
    const { hatalar } = tanimDogrula([{ id: 's', tip: 'secim', etiket: 'S', secenekler: [] }])
    expect(hatalar[0].mesaj).toMatch(/en az bir seçenek/)
  })

  it('tablo sorusunda sütun zorunlu', () => {
    const { hatalar } = tanimDogrula([{ id: 't', tip: 'tablo', etiket: 'T', sutunlar: [] }])
    expect(hatalar[0].mesaj).toMatch(/en az bir sütun/)
  })

  it('tablo sütunları normalize edilir, bilinmeyen tip metne düşer', () => {
    const { alanlar } = tanimDogrula([{
      id: 't', tip: 'tablo', etiket: 'Sayım',
      sutunlar: [{ id: 'a', baslik: 'Malzeme', tip: 'saçma' }, { id: 'b', baslik: 'Adet', tip: 'sayi' }],
    }])
    expect(alanlar[0].sutunlar).toEqual([
      { id: 'a', baslik: 'Malzeme', tip: 'metin' },
      { id: 'b', baslik: 'Adet', tip: 'sayi' },
    ])
  })

  it('bilinmeyen tip reddedilir', () => {
    expect(tanimDogrula([{ id: 'x', tip: 'dosya', etiket: 'A' }]).hatalar[0].mesaj).toMatch(/Bilinmeyen/)
  })
})

describe('cevaplarıDoğrula', () => {
  const ALANLAR: FormAlani[] = [
    alan({ id: 'ad', tip: 'metin', etiket: 'Adınız', zorunlu: true }),
    alan({ id: 'adet', tip: 'sayi', etiket: 'Adet' }),
    alan({ id: 'gun', tip: 'tarih', etiket: 'Tarih' }),
    alan({ id: 'onay', tip: 'evet_hayir', etiket: 'Onay' }),
    alan({ id: 'durum', tip: 'secim', etiket: 'Durum', secenekler: ['Tamam', 'Eksik'] }),
    alan({ id: 'etiketler', tip: 'coklu_secim', etiket: 'Etiket', secenekler: ['a', 'b'] }),
  ]

  it('zorunlu boş bırakılırsa hata', () => {
    const { hatalar } = cevaplariDogrula(ALANLAR, { ad: '   ' })
    expect(hatalar.some(h => h.alan === 'ad')).toBe(true)
  })

  // Sunucu istemciye güvenmiyor: tanımda olmayan anahtar veri tabanına
  // sızmamalı.
  it('tanımda olmayan anahtarlar sessizce atılır', () => {
    const { cevaplar } = cevaplariDogrula(ALANLAR, { ad: 'Ali', gizli: 'sızıntı' })
    expect(cevaplar).not.toHaveProperty('gizli')
  })

  it('Türkçe ondalık ayracı kabul edilir', () => {
    expect(cevaplariDogrula(ALANLAR, { ad: 'A', adet: '12,5' }).cevaplar.adet).toBe(12.5)
  })

  it('sayı olmayan değer hata verir', () => {
    const { hatalar } = cevaplariDogrula(ALANLAR, { ad: 'A', adet: 'iki' })
    expect(hatalar.some(h => h.alan === 'adet')).toBe(true)
  })

  it('geçersiz tarih reddedilir', () => {
    expect(cevaplariDogrula(ALANLAR, { ad: 'A', gun: '32.13.2026' }).hatalar.some(h => h.alan === 'gun')).toBe(true)
    expect(cevaplariDogrula(ALANLAR, { ad: 'A', gun: '2026-05-10' }).cevaplar.gun).toBe('2026-05-10')
  })

  // false ile "hiç cevaplanmadı" ayrı şeyler.
  it('evet/hayır boş bırakılırsa null, false ise false', () => {
    expect(cevaplariDogrula(ALANLAR, { ad: 'A' }).cevaplar.onay).toBeNull()
    expect(cevaplariDogrula(ALANLAR, { ad: 'A', onay: false }).cevaplar.onay).toBe(false)
  })

  it('listede olmayan seçenek reddedilir', () => {
    expect(cevaplariDogrula(ALANLAR, { ad: 'A', durum: 'Uydurma' }).hatalar.some(h => h.alan === 'durum')).toBe(true)
  })

  it('çoklu seçimde geçersizler ayıklanır', () => {
    const { cevaplar } = cevaplariDogrula(ALANLAR, { ad: 'A', etiketler: ['a', 'yok'] })
    expect(cevaplar.etiketler).toEqual(['a'])
  })
})

describe('tablo cevabı — Excel benzeri ızgara', () => {
  const TABLO: FormAlani[] = [alan({
    id: 'sayim', tip: 'tablo', etiket: 'Malzeme sayımı', zorunlu: true, enAzSatir: 2,
    sutunlar: [
      { id: 'malzeme', baslik: 'Malzeme', tip: 'metin' },
      { id: 'adet', baslik: 'Adet', tip: 'sayi' },
    ],
  })]

  it('satırlar sütun tiplerine göre normalize edilir', () => {
    const { cevaplar } = cevaplariDogrula(TABLO, {
      sayim: [{ malzeme: 'Arduino', adet: '12' }, { malzeme: 'Sensör', adet: 3 }],
    })
    expect(cevaplar.sayim).toEqual([
      { malzeme: 'Arduino', adet: 12 },
      { malzeme: 'Sensör', adet: 3 },
    ])
  })

  // Cevaplayan ızgarada fazladan satır bırakmış olabilir; bunlar veri değil.
  it('tamamen boş satırlar atılır', () => {
    const { cevaplar } = cevaplariDogrula(TABLO, {
      sayim: [{ malzeme: 'A', adet: 1 }, { malzeme: '', adet: '' }, { malzeme: 'B', adet: 2 }],
    })
    expect((cevaplar.sayim as unknown[]).length).toBe(2)
  })

  it('enAzSatir kuralı uygulanır', () => {
    const { hatalar } = cevaplariDogrula(TABLO, { sayim: [{ malzeme: 'A', adet: 1 }] })
    expect(hatalar.some(h => /en az 2 satır/.test(h.mesaj))).toBe(true)
  })

  it('satır tavanı aşılırsa hata verir ve kırpar', () => {
    const cok = Array.from({ length: LIMIT.tabloSatiri + 5 }, () => ({ malzeme: 'x', adet: 1 }))
    const { cevaplar, hatalar } = cevaplariDogrula(TABLO, { sayim: cok })
    expect(hatalar.some(h => /en fazla/.test(h.mesaj))).toBe(true)
    expect((cevaplar.sayim as unknown[]).length).toBe(LIMIT.tabloSatiri)
  })

  it('tanımda olmayan sütun satırdan atılır', () => {
    const { cevaplar } = cevaplariDogrula(TABLO, { sayim: [{ malzeme: 'A', adet: 1, gizli: 'x' }] })
    expect(cevaplar.sayim).toEqual([{ malzeme: 'A', adet: 1 }])
  })
})

describe('şablon — cevapları sonraki göreve taşıma', () => {
  const ALANLAR: FormAlani[] = [
    alan({ id: 'il', tip: 'metin', etiket: 'İl' }),
    alan({ id: 'sayim', tip: 'tablo', etiket: 'Sayım', sutunlar: [{ id: 'm', baslik: 'Malzeme', tip: 'metin' }] }),
  ]

  it('yer tutucular cevaplarla değişir', () => {
    expect(sablonDoldur('{{il}} saha ziyareti', ALANLAR, { il: 'Ankara' }))
      .toBe('Ankara saha ziyareti')
  })

  it('boşluklu yazım da çalışır', () => {
    expect(sablonDoldur('{{ il }} ziyareti', ALANLAR, { il: 'Bursa' })).toBe('Bursa ziyareti')
  })

  // "{{il}} ziyareti" cevap boşsa " ziyareti" değil "ziyareti" üretmeli.
  it('boş cevapta arta kalan boşluk temizlenir', () => {
    expect(sablonDoldur('{{il}} ziyareti', ALANLAR, { il: null })).toBe('ziyareti')
  })

  it('tanımsız yer tutucu boş bırakılır ve tespit edilebilir', () => {
    expect(sablonDoldur('{{yok}} işi', ALANLAR, {})).toBe('işi')
    expect(tanimsizYerTutucular('{{yok}} {{il}}', ALANLAR)).toEqual(['yok'])
  })

  it('tablo cevabı başlıkta satır sayısı olarak görünür', () => {
    expect(cevapMetni([{ m: 'a' }, { m: 'b' }])).toBe('2 satır')
  })

  it('evet/hayır Türkçeye çevrilir', () => {
    expect(cevapMetni(true)).toBe('Evet')
    expect(cevapMetni(false)).toBe('Hayır')
  })
})

describe('cevapÖzetiMetni', () => {
  it('tablo TAM haliyle yazılır', () => {
    const alanlar: FormAlani[] = [alan({
      id: 't', tip: 'tablo', etiket: 'Sayım',
      sutunlar: [{ id: 'm', baslik: 'Malzeme', tip: 'metin' }, { id: 'a', baslik: 'Adet', tip: 'sayi' }],
    })]
    const metin = cevapOzetiMetni(alanlar, { t: [{ m: 'Arduino', a: 12 }] })
    expect(metin).toContain('Malzeme | Adet')
    expect(metin).toContain('Arduino | 12')
  })

  it('boş cevap tire ile gösterilir', () => {
    expect(cevapOzetiMetni([alan({ id: 'x', tip: 'metin', etiket: 'Not' })], {})).toBe('Not: —')
  })
})

describe('terminHesapla', () => {
  it('N gün sonrası', () => {
    expect(terminHesapla(3, new Date('2026-05-10T09:00:00Z'))).toBe('2026-05-13')
  })

  it('null → terminsiz', () => {
    expect(terminHesapla(null)).toBeNull()
  })
})
