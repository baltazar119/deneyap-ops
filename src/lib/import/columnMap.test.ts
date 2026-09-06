import { describe, it, expect } from 'vitest'
import { otomatikEsle, eksikZorunluAlanlar, type Esleme } from './columnMap'

function harita(oneriler: ReturnType<typeof otomatikEsle>): Record<string, string | null> {
  return Object.fromEntries(oneriler.map(o => [o.sutun, o.alan]))
}

describe('otomatikEsle', () => {
  it('tipik bir Türkçe Excel başlık satırını eşler', () => {
    const h = harita(otomatikEsle([
      'Görev', 'Açıklama', 'İl', 'Sorumlu', 'Durum', 'Öncelik', 'Termin Tarihi',
    ]))
    expect(h).toEqual({
      'Görev': 'title',
      'Açıklama': 'description',
      'İl': 'il',
      'Sorumlu': 'assignee',
      'Durum': 'status',
      'Öncelik': 'priority',
      'Termin Tarihi': 'due_date',
    })
  })

  it('büyük harf ve yıldızlı zorunluluk işaretine takılmaz', () => {
    const h = harita(otomatikEsle(['GÖREV BAŞLIĞI*', 'İL / BİRİM']))
    expect(h['GÖREV BAŞLIĞI*']).toBe('title')
    expect(h['İL / BİRİM']).toBe('il')
  })

  it('eş anlamlı başlıkları tanır', () => {
    const h = harita(otomatikEsle(['Faaliyet', 'Son Tarih', 'Atanan', 'Şehir']))
    expect(h['Faaliyet']).toBe('title')
    expect(h['Son Tarih']).toBe('due_date')
    expect(h['Atanan']).toBe('assignee')
    expect(h['Şehir']).toBe('il')
  })

  it('başlangıç ve termin tarihini karıştırmaz', () => {
    const h = harita(otomatikEsle(['Başlangıç Tarihi', 'Termin Tarihi']))
    expect(h['Başlangıç Tarihi']).toBe('start_date')
    expect(h['Termin Tarihi']).toBe('due_date')
  })

  it('aynı alana düşen iki sütundan yalnızca birini eşler', () => {
    const oneriler = otomatikEsle(['Sorumlu', 'Sorumlu E-posta'])
    const eslenenler = oneriler.filter(o => o.alan === 'assignee')
    expect(eslenenler).toHaveLength(1)
    const bosta = oneriler.find(o => o.alan === null)
    expect(bosta?.sebep).toContain('elle seçin')
  })

  it('tanınmayan sütunu null bırakır — yanlış tahmin etmez', () => {
    const h = harita(otomatikEsle(['Görev', 'Bütçe Kalemi']))
    expect(h['Görev']).toBe('title')
    expect(h['Bütçe Kalemi']).toBeNull()
  })

  it('önceki eşlemeyi hatırlar ve ona öncelik verir', () => {
    const onceki: Esleme = { 'Bütçe Kalemi': 'description' }
    const oneriler = otomatikEsle(['Bütçe Kalemi'], onceki)
    expect(oneriler[0].alan).toBe('description')
    expect(oneriler[0].guven).toBe(100)
  })

  it('boş başlık sütununu atlar', () => {
    const h = harita(otomatikEsle(['Görev', '']))
    expect(h['']).toBeNull()
  })
})

describe('eksikZorunluAlanlar', () => {
  it('görev başlığı eşlenmemişse uyarır', () => {
    const eksik = eksikZorunluAlanlar({ 'İl': 'il' })
    expect(eksik.map(a => a.key)).toContain('title')
  })

  it('başlık eşlendiyse eksik yoktur', () => {
    expect(eksikZorunluAlanlar({ 'Görev': 'title' })).toHaveLength(0)
  })
})

/**
 * DENEYAP alanının ayrıştırılması (Faz 7).
 *
 * "Atölye" başlıklı sütun eskiden `il`'e eşleniyordu. Artık `deneyap`'a
 * eşleniyor ama bu ayrıştırma iki koruma altında yapıldı:
 *   1. `birim` ve `merkez` `il`'de KALDI (alanın etiketi zaten "İl / Birim")
 *   2. Preset hafızası migrate edilmedi — eski eşleme aynen korunuyor
 */
describe('DENEYAP sütunu ayrıştırması', () => {
  const alan = (basliklar: string[], sutun: string) =>
    otomatikEsle(basliklar).find(o => o.sutun === sutun)?.alan

  it('"Atölye" artık il değil DENEYAP alanına eşlenir', () => {
    expect(alan(['Atölye'], 'Atölye')).toBe('deneyap')
  })

  it('"DENEYAP" ve türevleri DENEYAP alanına eşlenir', () => {
    expect(alan(['DENEYAP'], 'DENEYAP')).toBe('deneyap')
    expect(alan(['Deneyap Adı'], 'Deneyap Adı')).toBe('deneyap')
    expect(alan(['Atölye Adı'], 'Atölye Adı')).toBe('deneyap')
  })

  it('"Birim" ve "Merkez" il alanında KALIR', () => {
    // Taşınsalardı "Birim" başlıklı sütunu olan mevcut dosyaların il
    // verisi kopardı.
    expect(alan(['Birim'], 'Birim')).toBe('il')
    expect(alan(['Merkez'], 'Merkez')).toBe('il')
  })

  it('İl ve Atölye sütunları bir arada FARKLI alanlara düşer', () => {
    const b = ['Görev', 'İl', 'Atölye']
    expect(alan(b, 'İl')).toBe('il')
    expect(alan(b, 'Atölye')).toBe('deneyap')
  })

  it('GERİYE DÖNÜK: preset "Atölye"→il diyorsa o eşleme korunur', () => {
    // Bu org daha önce "Atölye" sütununu il olarak aktarmış. Eşleme
    // değişirse fingerprint kayar ve aynı dosya kopya görev üretir.
    const onceki = { 'Atölye': 'il' as const }
    const o = otomatikEsle(['Atölye'], onceki).find(x => x.sutun === 'Atölye')
    expect(o?.alan).toBe('il')
    expect(o?.guven).toBe(100)
  })

  it('preset yalnızca o sütunu bağlar, diğerleri normal eşlenir', () => {
    const onceki = { 'Atölye': 'il' as const }
    const oneriler = otomatikEsle(['Görev', 'Atölye', 'Termin'], onceki)
    expect(oneriler.find(o => o.sutun === 'Atölye')?.alan).toBe('il')
    expect(oneriler.find(o => o.sutun === 'Görev')?.alan).toBe('title')
    expect(oneriler.find(o => o.sutun === 'Termin')?.alan).toBe('due_date')
  })
})
