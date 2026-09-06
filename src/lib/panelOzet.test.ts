import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import {
  yaklasanTerminler, kritikVeGecikmis, ilDeneyapKirilimi, sonHareketler, yaklasanToplantilar,
} from './panelOzet'
import type { Task, Deneyap, Meeting } from '@/types/database'

const SIMDI = '2026-03-10T09:00:00.000Z'
beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(SIMDI)) })
afterAll(() => { vi.useRealTimers() })

const GUN = 86400000
const gunSonra = (n: number) => new Date(Date.parse(SIMDI) + n * GUN).toISOString().slice(0, 10)
const anSonra = (n: number) => new Date(Date.parse(SIMDI) + n * GUN).toISOString()

function g(p: Partial<Task> & { id: string }): Task {
  return {
    status: 'backlog', priority: 'normal', task_type: 'other',
    il: null, deneyap_id: null, assignee_id: null, due_date: null,
    created_at: SIMDI, updated_at: SIMDI,
    ...p,
  } as Task
}

const idler = (t: { id: string }[]) => t.map(x => x.id)

describe('yaklasanTerminler', () => {
  it('en yakın termin başta', () => {
    const liste = [g({ id: 'uc', due_date: gunSonra(3) }), g({ id: 'bir', due_date: gunSonra(1) })]
    expect(idler(yaklasanTerminler(liste))).toEqual(['bir', 'uc'])
  })

  // Gecikmişlerin ayrı bloğu var; ikisini karıştırmak "yaklaşan" listesini
  // geçmişle doldururdu.
  it('gecikmiş ve tamamlanmış görevler bu bloğa girmez', () => {
    const liste = [
      g({ id: 'geciken', due_date: gunSonra(-2) }),
      g({ id: 'bitmis', due_date: gunSonra(2), status: 'done' }),
      g({ id: 'yaklasan', due_date: gunSonra(2) }),
    ]
    expect(idler(yaklasanTerminler(liste))).toEqual(['yaklasan'])
  })

  it('limit uygulanır', () => {
    const liste = Array.from({ length: 10 }, (_, i) => g({ id: `t${i}`, due_date: gunSonra(1) }))
    expect(yaklasanTerminler(liste, 3).length).toBe(3)
  })
})

describe('kritikVeGecikmis', () => {
  it('kritik açık görev, gecikmemiş olsa da listeye girer', () => {
    expect(idler(kritikVeGecikmis([g({ id: 'k', priority: 'critical' })]))).toEqual(['k'])
  })

  it('gecikmiş görev, önceliği düşük olsa da listeye girer', () => {
    expect(idler(kritikVeGecikmis([g({ id: 'd', priority: 'low', due_date: gunSonra(-1) })]))).toEqual(['d'])
  })

  // Gecikmiş bir "düşük", henüz gecikmemiş bir "kritik"in üstüne çıkmamalı.
  it('önce öncelik, sonra termin sıralanır', () => {
    const liste = [
      g({ id: 'dusuk-gecikmis', priority: 'low', due_date: gunSonra(-5) }),
      g({ id: 'kritik', priority: 'critical', due_date: gunSonra(20) }),
    ]
    expect(idler(kritikVeGecikmis(liste))).toEqual(['kritik', 'dusuk-gecikmis'])
  })

  it('tamamlanmış görev hiç girmez', () => {
    const liste = [g({ id: 'x', priority: 'critical', status: 'done', due_date: gunSonra(-3) })]
    expect(kritikVeGecikmis(liste)).toEqual([])
  })
})

describe('ilDeneyapKirilimi', () => {
  const deneyaplar = [
    { id: 'd-cankaya', ad: 'Çankaya DENEYAP', il: 'Ankara' },
    { id: 'd-kecioren', ad: 'Keçiören DENEYAP', il: 'Ankara' },
  ] as Deneyap[]

  it('aynı ildeki iki DENEYAP AYRI satır olur', () => {
    const gorevler = [
      g({ id: '1', deneyap_id: 'd-cankaya', il: 'Ankara' }),
      g({ id: '2', deneyap_id: 'd-kecioren', il: 'Ankara' }),
    ]
    const satirlar = ilDeneyapKirilimi(gorevler, deneyaplar)
    expect(satirlar.map(s => s.etiket).sort())
      .toEqual(['Keçiören DENEYAP', 'Çankaya DENEYAP'].sort())
  })

  // DENEYAP'a bağlanmamış işler görünmezleşmemeli.
  it('DENEYAP\'sız görevler kendi ili altında toplanır', () => {
    const gorevler = [g({ id: '1', deneyap_id: null, il: 'Bursa' })]
    const s = ilDeneyapKirilimi(gorevler, deneyaplar)
    expect(s[0].etiket).toBe('Bursa')
    expect(s[0].altEtiket).toBeNull()
  })

  it('ne DENEYAP ne il varsa "İl atanmamış" satırı', () => {
    const s = ilDeneyapKirilimi([g({ id: '1' })], deneyaplar)
    expect(s[0].etiket).toBe('İl atanmamış')
  })

  it('sayaçlar doğru: toplam / açık / geciken / tamamlanan', () => {
    const gorevler = [
      g({ id: '1', il: 'Ankara', status: 'done' }),
      g({ id: '2', il: 'Ankara', due_date: gunSonra(-1) }),
      g({ id: '3', il: 'Ankara' }),
    ]
    const s = ilDeneyapKirilimi(gorevler, [])[0]
    expect(s).toMatchObject({ toplam: 3, acik: 2, geciken: 1, tamamlanan: 1 })
  })

  it('geciken sayısı çok olan üstte', () => {
    const gorevler = [
      g({ id: '1', il: 'Ankara' }),
      g({ id: '2', il: 'Bursa', due_date: gunSonra(-1) }),
      g({ id: '3', il: 'Bursa', due_date: gunSonra(-2) }),
    ]
    expect(ilDeneyapKirilimi(gorevler, []).map(s => s.etiket)).toEqual(['Bursa', 'Ankara'])
  })
})

describe('sonHareketler', () => {
  it('en son güncellenen başta', () => {
    const liste = [
      g({ id: 'eski', updated_at: anSonra(-5) }),
      g({ id: 'yeni', updated_at: anSonra(-1) }),
    ]
    expect(idler(sonHareketler(liste))).toEqual(['yeni', 'eski'])
  })

  it('girdiyi değiştirmez (kopya üzerinde sıralar)', () => {
    const liste = [g({ id: 'a', updated_at: anSonra(-5) }), g({ id: 'b', updated_at: anSonra(-1) })]
    sonHareketler(liste)
    expect(idler(liste)).toEqual(['a', 'b'])
  })
})

describe('yaklasanToplantilar', () => {
  const m = (id: string, ek: Partial<Meeting> = {}): Meeting =>
    ({ id, start_time: anSonra(1), status: 'scheduled', ...ek } as Meeting)

  it('geçmiş toplantı gösterilmez', () => {
    expect(idler(yaklasanToplantilar([m('gecmis', { start_time: anSonra(-1) })]))).toEqual([])
  })

  it('bitmiş toplantı gösterilmez', () => {
    expect(idler(yaklasanToplantilar([m('bitti', { status: 'ended' })]))).toEqual([])
  })

  it('en yakın toplantı başta', () => {
    const liste = [m('uzak', { start_time: anSonra(5) }), m('yakin', { start_time: anSonra(1) })]
    expect(idler(yaklasanToplantilar(liste))).toEqual(['yakin', 'uzak'])
  })
})
