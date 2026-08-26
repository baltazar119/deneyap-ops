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
