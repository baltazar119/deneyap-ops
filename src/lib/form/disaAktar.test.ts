import { describe, it, expect } from 'vitest'
import { yanitSayfalari, sayfaAdiTemizle, dosyaAdi } from './disaAktar'
import type { Form, FormGonderim, FormYanit } from './tipler'

const FORM = {
  id: 'f1', baslik: 'Malzeme sayımı',
  alanlar: [
    { id: 'ad', tip: 'metin', etiket: 'Adınız', zorunlu: true },
    { id: 'onay', tip: 'evet_hayir', etiket: 'Onay', zorunlu: false },
    { id: 'sayim', tip: 'tablo', etiket: 'Malzeme listesi', zorunlu: true,
      sutunlar: [{ id: 'm', baslik: 'Malzeme', tip: 'metin' }, { id: 'a', baslik: 'Adet', tip: 'sayi' }] },
  ],
} as unknown as Form

const gonderim = (id: string, durum: string): FormGonderim =>
  ({ id, durum, alici_etiket: 'Çankaya', alici_user_id: null, created_at: '2026-09-01T10:00:00Z' } as FormGonderim)

const yanit = (gid: string, cevaplar: Record<string, unknown>, ek: Partial<FormYanit> = {}): FormYanit =>
  ({ id: 'y-' + gid, gonderim_id: gid, cevaplar, created_at: '2026-09-02T12:00:00Z',
     yanitlayan_user_id: null, olusan_gorev_id: null, ...ek } as unknown as FormYanit)

describe('yanitSayfalari — çok sayfalı çıktı', () => {
  it('her tablo sorusu için AYRI sayfa üretir', () => {
    const s = yanitSayfalari({ form: FORM, gonderimler: [gonderim('g1', 'yanitlandi')], yanitlar: [] })
    expect(s.map(x => x.ad)).toEqual(['Yanıtlar', 'Malzeme listesi'])
  })

  // "Kim doldurmadı" sorusu en az "kim ne yazdı" kadar önemli.
  it('yanıtlanmamış gönderimler de listeye girer', () => {
    const s = yanitSayfalari({ form: FORM, gonderimler: [gonderim('g1', 'bekliyor')], yanitlar: [] })
    expect(s[0].satirlar.length).toBe(1)
    expect(s[0].satirlar[0][1]).toBe('Bekliyor')
  })

  it('ana sayfada tablo cevabı satır sayısı olarak özetlenir', () => {
    const s = yanitSayfalari({
      form: FORM,
      gonderimler: [gonderim('g1', 'yanitlandi')],
      yanitlar: [yanit('g1', { ad: 'Ayşe', onay: true, sayim: [{ m: 'A', a: 1 }, { m: 'B', a: 2 }] })],
    })
    const satir = s[0].satirlar[0]
    expect(satir).toContain('Ayşe')
    expect(satir).toContain('Evet')
    expect(satir).toContain('2 satır')
  })

  it('tablo sayfasında her satır ayrı kayıt ve Yanıt no ile bağlı', () => {
    const s = yanitSayfalari({
      form: FORM,
      gonderimler: [gonderim('g1', 'yanitlandi'), gonderim('g2', 'yanitlandi')],
      yanitlar: [
        yanit('g1', { sayim: [{ m: 'Arduino', a: 12 }] }),
        yanit('g2', { sayim: [{ m: 'Sensör', a: 30 }, { m: 'Kablo', a: 5 }] }),
      ],
    })
    const tablo = s[1]
    expect(tablo.basliklar).toEqual(['Yanıt no', 'Satır', 'Malzeme', 'Adet'])
    expect(tablo.satirlar).toEqual([
      [1, 1, 'Arduino', 12],
      [2, 1, 'Sensör', 30],
      [2, 2, 'Kablo', 5],
    ])
  })

  it('üye adı çözülür, bilinmeyen id boş bırakılır', () => {
    const s = yanitSayfalari({
      form: FORM,
      gonderimler: [{ ...gonderim('g1', 'yanitlandi'), alici_etiket: null, alici_user_id: 'u1' } as FormGonderim],
      yanitlar: [yanit('g1', {}, { yanitlayan_user_id: 'bilinmeyen' })],
      adlar: { u1: 'Selin Koç' },
    })
    expect(s[0].satirlar[0][2]).toBe('Selin Koç')
    expect(s[0].satirlar[0][5]).toBe('')
  })

  it('oluşan görev sütunu doldurulur', () => {
    const s = yanitSayfalari({
      form: FORM, gonderimler: [gonderim('g1', 'yanitlandi')],
      yanitlar: [yanit('g1', {}, { olusan_gorev_id: 't1' })],
    })
    expect(s[0].satirlar[0].at(-1)).toBe('Evet')
  })
})

describe('sayfaAdiTemizle — Excel kuralları', () => {
  it('yasak karakterler temizlenir ve 31 karaktere kırpılır', () => {
    const ters = String.fromCharCode(92)
    const ad = sayfaAdiTemizle(`Rapor: [2026] / özet * ? ${ters} çok uzun bir başlık`, new Set())
    expect(ad.length).toBeLessThanOrEqual(31)
    const yasak = ['[', ']', ':', '*', '?', '/', ters]
    expect(yasak.some(y => ad.includes(y))).toBe(false)
  })

  it('çakışan adlara sayı eklenir', () => {
    const k = new Set<string>()
    expect(sayfaAdiTemizle('Liste', k)).toBe('Liste')
    expect(sayfaAdiTemizle('Liste', k)).toBe('Liste 2')
  })
})

describe('dosyaAdi', () => {
  it('Türkçe karakterler sadeleşir ve tarih eklenir', () => {
    expect(dosyaAdi('Atölye Sayımı', 'xlsx')).toMatch(/^atolye-sayimi-\d{4}-\d{2}-\d{2}\.xlsx$/)
  })

  it('boş başlıkta yedek ad kullanılır', () => {
    expect(dosyaAdi('!!!', 'csv')).toMatch(/^form-/)
  })
})
