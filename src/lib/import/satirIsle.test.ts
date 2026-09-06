import { describe, it, expect } from 'vitest'
import { satirIsle, type UyeOzeti } from './satirIsle'
import { parmakIzi, eslestirmeAnahtari } from './fingerprint'
import type { Esleme } from './columnMap'

const ESLEME: Esleme = {
  'Görev': 'title',
  'Açıklama': 'description',
  'İl': 'il',
  'Sorumlu': 'assignee',
  'Durum': 'status',
  'Öncelik': 'priority',
  'Kategori': 'task_type',
  'Başlangıç': 'start_date',
  'Termin': 'due_date',
  'Süre': 'estimated_hours',
  'Kod': 'external_key',
}

const UYELER: UyeOzeti[] = [
  { id: 'u1', adSoyad: 'Ankara İl Sorumlusu', email: 'ankara@deneyap.demo' },
  { id: 'u2', adSoyad: 'İzmir İl Sorumlusu',  email: 'izmir@deneyap.demo' },
  { id: 'u3', adSoyad: 'Ali Yılmaz',          email: 'ali1@deneyap.demo' },
  { id: 'u4', adSoyad: 'Ali Yılmaz',          email: 'ali2@deneyap.demo' },
]

function satir(over: Record<string, unknown> = {}) {
  return {
    'Görev': 'Atölye açılışı',
    'Açıklama': '',
    'İl': 'Ankara',
    'Sorumlu': '',
    'Durum': '',
    'Öncelik': '',
    'Kategori': '',
    'Başlangıç': '',
    'Termin': '',
    'Süre': '',
    'Kod': '',
    ...over,
  }
}

/** Bugüne göre kaydırılmış YYYY-MM-DD (yerel, toISOString değil) */
function gun(n: number): string {
  const d = new Date(); d.setDate(d.getDate() + n)
  const iki = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${iki(d.getMonth() + 1)}-${iki(d.getDate())}`
}

describe('satirIsle — temel', () => {
  it('geçerli bir satırı eksiksiz çevirir', () => {
    const r = satirIsle(satir({
      'Sorumlu': 'ankara@deneyap.demo', 'Durum': 'Devam Ediyor',
      'Öncelik': 'Yüksek', 'Kategori': 'Etkinlik', 'Termin': '01.09.2026', 'Süre': '7,5',
    }), ESLEME, UYELER)

    expect(r.hatalar).toHaveLength(0)
    expect(r.normalize).toMatchObject({
      title: 'Atölye açılışı',
      il: 'Ankara',
      status: 'doing',
      priority: 'high',
      task_type: 'event',
      due_date: '2026-09-01',
      estimated_hours: 7.5,
      assignee_id: 'u1',
    })
  })

  it('boş hücreleri varsayılana çeker, uyarı üretmez', () => {
    const r = satirIsle(satir(), ESLEME, UYELER)
    expect(r.hatalar).toHaveLength(0)
    expect(r.uyarilar).toHaveLength(0)
    expect(r.normalize).toMatchObject({ status: 'backlog', priority: 'normal', task_type: 'other' })
  })
})

describe('satirIsle — hatalar satırı durdurur ama işi durdurmaz', () => {
  it('başlık boşsa satır hatalı olur', () => {
    const r = satirIsle(satir({ 'Görev': '' }), ESLEME, UYELER)
    expect(r.normalize).toBeNull()
    expect(r.hatalar[0].alan).toBe('title')
  })

  it('çok kısa başlığı reddeder', () => {
    const r = satirIsle(satir({ 'Görev': 'ab' }), ESLEME, UYELER)
    expect(r.hatalar[0].mesaj).toContain('3 karakter')
  })

  it('dolu ama tanınmayan il satırı hatalı yapar — sessizce boşa çekmez', () => {
    const r = satirIsle(satir({ 'İl': 'Zamazingo' }), ESLEME, UYELER)
    expect(r.normalize).toBeNull()
    expect(r.hatalar.some(h => h.alan === 'il')).toBe(true)
  })

  it('boş il hata değildir', () => {
    const r = satirIsle(satir({ 'İl': '' }), ESLEME, UYELER)
    expect(r.hatalar).toHaveLength(0)
    expect(r.normalize?.il).toBeNull()
  })

  it('okunamayan tarihi hata sayar', () => {
    const r = satirIsle(satir({ 'Termin': 'gelecek hafta' }), ESLEME, UYELER)
    expect(r.hatalar.some(h => h.alan === 'due_date')).toBe(true)
  })

  it('başlangıç terminden sonraysa reddeder', () => {
    const r = satirIsle(satir({ 'Başlangıç': '10.09.2026', 'Termin': '01.09.2026' }), ESLEME, UYELER)
    expect(r.hatalar.some(h => h.mesaj.includes('terminden sonra'))).toBe(true)
  })
})

describe('satirIsle — "Gecikti" ele alışı', () => {
  it('termin geçmişse yalnızca doing\'e çevirir, ek uyarı vermez', () => {
    const r = satirIsle(satir({ 'Durum': 'Gecikti', 'Termin': gun(-5) }), ESLEME, UYELER)
    expect(r.normalize?.status).toBe('doing')
    expect(r.gecikmeIsareti).toBe(true)
    expect(r.uyarilar.some(u => u.includes('gecikmiş görünmeyecek'))).toBe(false)
  })

  it('termin gelecekteyse kullanıcıyı uyarır — görev gecikmiş görünmeyecek', () => {
    const r = satirIsle(satir({ 'Durum': 'Gecikti', 'Termin': gun(10) }), ESLEME, UYELER)
    expect(r.uyarilar.some(u => u.includes('gecikmiş görünmeyecek'))).toBe(true)
  })

  it('termin hiç yoksa da uyarır', () => {
    const r = satirIsle(satir({ 'Durum': 'Gecikti', 'Termin': '' }), ESLEME, UYELER)
    expect(r.uyarilar.some(u => u.includes('termin tarihi yok'))).toBe(true)
  })
})

describe('satirIsle — sorumlu eşleme', () => {
  it('e-posta ile eşler', () => {
    const r = satirIsle(satir({ 'Sorumlu': 'İZMİR@deneyap.demo' }), ESLEME, UYELER)
    expect(r.normalize?.assignee_id).toBe('u2')
  })

  it('ad soyad ile eşler', () => {
    const r = satirIsle(satir({ 'Sorumlu': 'ankara il sorumlusu' }), ESLEME, UYELER)
    expect(r.normalize?.assignee_id).toBe('u1')
  })

  it('aynı adlı iki üye varsa atama yapmaz, seçim ister', () => {
    const r = satirIsle(satir({ 'Sorumlu': 'Ali Yılmaz' }), ESLEME, UYELER)
    expect(r.normalize?.assignee_id).toBeNull()
    expect(r.belirsizSorumlu).toHaveLength(2)
  })

  it('varsayılanda eşleşmeyen sorumlu görevi engellemez', () => {
    const r = satirIsle(satir({ 'Sorumlu': 'Ahmet Yılmaz' }), ESLEME, UYELER)
    expect(r.hatalar).toHaveLength(0)
    expect(r.normalize?.assignee_id).toBeNull()
    expect(r.eslesmeyenSorumlu).toBe('Ahmet Yılmaz')
  })

  it('katı politikada eşleşmeyen sorumlu satırı hatalı yapar', () => {
    const r = satirIsle(satir({ 'Sorumlu': 'Ahmet Yılmaz' }), ESLEME, UYELER,
      { sorumluPolitikasi: 'reddet' })
    expect(r.hatalar.some(h => h.alan === 'assignee')).toBe(true)
  })
})

describe('eşleştirme anahtarı', () => {
  it('Kod sütunu varsa onu kullanır', () => {
    const r = satirIsle(satir({ 'Kod': 'GRV-014' }), ESLEME, UYELER)
    expect(r.anahtarYontemi).toBe('external_key')
    expect(r.eslestirmeAnahtari).toBe('GRV-014')
  })

  it('Kod yoksa başlık+il parmak izine düşer', () => {
    const r = satirIsle(satir(), ESLEME, UYELER)
    expect(r.anahtarYontemi).toBe('fingerprint')
    expect(r.eslestirmeAnahtari).toBe(parmakIzi('Atölye açılışı', 'Ankara'))
  })

  it('aynı başlık+il her zaman aynı anahtarı verir — ikinci yüklemede kopya olmasın', () => {
    const a = satirIsle(satir({ 'Görev': 'ATÖLYE AÇILIŞI' }), ESLEME, UYELER)
    const b = satirIsle(satir({ 'Görev': 'atölye açılışı' }), ESLEME, UYELER)
    expect(a.eslestirmeAnahtari).toBe(b.eslestirmeAnahtari)
  })

  it('termin anahtara girmez — tarih düzeltilince kopya oluşmasın', () => {
    const a = satirIsle(satir({ 'Termin': '01.09.2026' }), ESLEME, UYELER)
    const b = satirIsle(satir({ 'Termin': '15.09.2026' }), ESLEME, UYELER)
    expect(a.eslestirmeAnahtari).toBe(b.eslestirmeAnahtari)
  })

  it('farklı il farklı anahtar üretir', () => {
    const a = satirIsle(satir({ 'İl': 'Ankara' }), ESLEME, UYELER)
    const b = satirIsle(satir({ 'İl': 'İzmir' }), ESLEME, UYELER)
    expect(a.eslestirmeAnahtari).not.toBe(b.eslestirmeAnahtari)
  })

  it('Türkçe İ tuzağı anahtarı bozmaz', () => {
    expect(eslestirmeAnahtari('İstanbul işi', 'İstanbul', null).anahtar)
      .toBe(eslestirmeAnahtari('İSTANBUL İŞİ', 'İSTANBUL', null).anahtar)
  })
})

/**
 * FAZ 7 — DENEYAP sütunu ve "etkin il".
 *
 * Bu bloğun asıl işi bir REGRESYONU önlemek: "Atölye" başlıklı sütun eskiden
 * `il` alanına eşleniyordu, artık `deneyap`a eşleniyor. Eşleştirme anahtarı
 * (fingerprint) `il` üzerinden hesaplandığı için bu ayrıştırma yanlış
 * yapılırsa aynı Excel ikinci kez yüklendiğinde KOPYA GÖREV oluşur — sessizce.
 */
describe('satirIsle — DENEYAP ve etkin il', () => {
  const DENEYAPLAR = [
    { id: 'd1', ad: 'Çankaya DENEYAP',  il: 'Ankara', kod: 'ANK-01', aktif: true },
    { id: 'd2', ad: 'Keçiören DENEYAP', il: 'Ankara', kod: null,     aktif: true },
    { id: 'd3', ad: 'Bornova DENEYAP',  il: 'İzmir',  kod: null,     aktif: true },
  ]

  /** İl sütunu OLMAYAN, yalnızca Atölye sütunu olan eski dosya düzeni */
  const ESLEME_ATOLYE: Esleme = { 'Görev': 'title', 'Atölye': 'deneyap' }
  /** Hem İl hem DENEYAP sütunu olan yeni düzen */
  const ESLEME_IKISI: Esleme = { 'Görev': 'title', 'İl': 'il', 'DENEYAP': 'deneyap' }

  it('KRİTİK REGRESYON: Atölye sütununda il adı + İl sütunu yok → fingerprint DEĞİŞMEZ', () => {
    // Eski sürümde "Atölye" → il alanıydı; anahtar parmakIzi(baslik, 'Ankara').
    // Yeni sürümde "Atölye" → deneyap alanı ve çözülemiyor; geri düşme
    // normIl('Ankara') ile aynı anahtarı üretmek ZORUNDA.
    const r = satirIsle(
      { 'Görev': 'Dönem raporu', 'Atölye': 'Ankara' },
      ESLEME_ATOLYE, UYELER, { deneyaplar: DENEYAPLAR },
    )
    expect(r.eslestirmeAnahtari).toBe(parmakIzi('Dönem raporu', 'Ankara'))
    expect(r.normalize?.il).toBe('Ankara')
    expect(r.hatalar).toHaveLength(0)   // satır düşmemeli
  })

  it('geri düşme yalnızca İL SÜTUNU YOKKEN devreye girer', () => {
    // İl sütunu eşlenmişse DENEYAP hücresi ile oynamayız.
    const r = satirIsle(
      { 'Görev': 'Dönem işi', 'İl': 'İzmir', 'DENEYAP': 'Ankara' },
      ESLEME_IKISI, UYELER, { deneyaplar: DENEYAPLAR },
    )
    expect(r.normalize?.il).toBe('İzmir')
    expect(r.eslestirmeAnahtari).toBe(parmakIzi('Dönem işi', 'İzmir'))
  })

  it('DENEYAP çözülünce il ONDAN gelir ve anahtar ona göre kurulur', () => {
    const r = satirIsle(
      { 'Görev': 'Kit sayımı', 'Atölye': 'Çankaya DENEYAP' },
      ESLEME_ATOLYE, UYELER, { deneyaplar: DENEYAPLAR },
    )
    expect(r.normalize?.deneyap_id).toBe('d1')
    expect(r.normalize?.il).toBe('Ankara')
    expect(r.eslestirmeAnahtari).toBe(parmakIzi('Kit sayımı', 'Ankara'))
  })

  it('aynı ildeki iki DENEYAP ayrı ayrı çözülür', () => {
    const a = satirIsle({ 'Görev': 'Görev A', 'Atölye': 'Çankaya DENEYAP' },  ESLEME_ATOLYE, UYELER, { deneyaplar: DENEYAPLAR })
    const b = satirIsle({ 'Görev': 'Görev B', 'Atölye': 'Keçiören DENEYAP' }, ESLEME_ATOLYE, UYELER, { deneyaplar: DENEYAPLAR })
    expect(a.normalize?.deneyap_id).toBe('d1')
    expect(b.normalize?.deneyap_id).toBe('d2')
    expect(a.normalize?.il).toBe('Ankara')
    expect(b.normalize?.il).toBe('Ankara')   // ikisi de Ankara — projenin çekirdek senaryosu
  })

  it('DENEYAP ile İl çelişirse HATA değil UYARI, DENEYAP kazanır', () => {
    const r = satirIsle(
      { 'Görev': 'Dönem işi', 'İl': 'İzmir', 'DENEYAP': 'Çankaya DENEYAP' },
      ESLEME_IKISI, UYELER, { deneyaplar: DENEYAPLAR },
    )
    expect(r.hatalar).toHaveLength(0)
    expect(r.normalize?.il).toBe('Ankara')
    expect(r.uyarilar.some(u => u.includes('DENEYAP') && u.includes('İzmir'))).toBe(true)
  })

  it('tanınmayan DENEYAP satırı DÜŞÜRMEZ, oluşturma adayı bırakır', () => {
    const r = satirIsle(
      { 'Görev': 'Dönem işi', 'İl': 'Ankara', 'DENEYAP': 'Sincan DENEYAP' },
      ESLEME_IKISI, UYELER, { deneyaplar: DENEYAPLAR },
    )
    expect(r.hatalar).toHaveLength(0)
    expect(r.yeniDeneyapAdi).toBe('Sincan DENEYAP')
    expect(r.normalize?.deneyap_id).toBeNull()
    expect(r.normalize?.il).toBe('Ankara')   // il sütunundan
  })

  it('DENEYAP sütunu hiç yoksa davranış eskisiyle birebir aynı', () => {
    const r = satirIsle(satir({ 'İl': 'Ankara' }), ESLEME, UYELER)
    expect(r.normalize?.deneyap_id).toBeNull()
    expect(r.normalize?.il).toBe('Ankara')
    expect(r.eslestirmeAnahtari).toBe(parmakIzi('Atölye açılışı', 'Ankara'))
  })

  it('dış anahtar varsa DENEYAP anahtarı etkilemez', () => {
    const r = satirIsle(
      { 'Görev': 'Dönem işi', 'Atölye': 'Çankaya DENEYAP', 'Kod': 'GRV-9' },
      { ...ESLEME_ATOLYE, 'Kod': 'external_key' }, UYELER, { deneyaplar: DENEYAPLAR },
    )
    expect(r.eslestirmeAnahtari).toBe('GRV-9')
    expect(r.anahtarYontemi).toBe('external_key')
    expect(r.normalize?.deneyap_id).toBe('d1')
  })

  it('DENEYAP listesi verilmezse çökmez, ad il olarak yorumlanır', () => {
    const r = satirIsle({ 'Görev': 'Dönem işi', 'Atölye': 'Ankara' }, ESLEME_ATOLYE, UYELER)
    expect(r.normalize?.il).toBe('Ankara')
    expect(r.normalize?.deneyap_id).toBeNull()
  })
})

describe('satirIsle — il adı DENEYAP sanılmamalı', () => {
  const DENEYAPLAR = [
    { id: 'd1', ad: 'Çankaya DENEYAP', il: 'Ankara', kod: null, aktif: true },
  ]
  const ESLEME_ATOLYE: Esleme = { 'Görev': 'title', 'Atölye': 'deneyap' }

  it('geri düşme başarılıysa DENEYAP oluşturma ÖNERİLMEZ', () => {
    // Eski "Atölye" sütunlu dosyalarda hücre il adı taşır. Öneri
    // bastırılmazsa önizleme paneli il adlarıyla dolar ve kullanıcı
    // "Ankara" adında sahte bir DENEYAP oluşturur.
    const r = satirIsle(
      { 'Görev': 'Dönem raporu', 'Atölye': 'Ankara' },
      ESLEME_ATOLYE, UYELER, { deneyaplar: DENEYAPLAR },
    )
    expect(r.yeniDeneyapAdi).toBeNull()
    expect(r.normalize?.il).toBe('Ankara')
  })

  it('çelişkili iki uyarı basmaz', () => {
    const r = satirIsle(
      { 'Görev': 'Dönem raporu', 'Atölye': 'Ankara' },
      ESLEME_ATOLYE, UYELER, { deneyaplar: DENEYAPLAR },
    )
    expect(r.uyarilar.some(u => u.includes('oluşturabilirsiniz'))).toBe(false)
    expect(r.uyarilar.some(u => u.includes('il adı olarak yorumlandı'))).toBe(true)
  })

  it('gerçekten tanınmayan bir ad ise öneri KORUNUR', () => {
    // "Sincan DENEYAP" bir il adı değil → oluşturma önerisi doğru davranış.
    const r = satirIsle(
      { 'Görev': 'Dönem raporu', 'Atölye': 'Sincan DENEYAP' },
      ESLEME_ATOLYE, UYELER, { deneyaplar: DENEYAPLAR },
    )
    expect(r.yeniDeneyapAdi).toBe('Sincan DENEYAP')
    expect(r.uyarilar.some(u => u.includes('oluşturabilirsiniz'))).toBe(true)
  })
})
