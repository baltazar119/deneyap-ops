import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { gorevleriSuz, type GorevFiltreDegerleri } from './useGorevFiltreleri'
import { gecikmisMi, yaklasanMi } from './gorevTermin'
import type { Task } from '@/types/database'

/**
 * Görevler ekranının BUGÜNKÜ filtre davranışını kilitler.
 *
 * Faz 1'de sayfa mobil/masaüstü iki JSX ağacından tek ağaca indirildi ve
 * süzme mantığı bileşenlerden `useGorevFiltreleri.ts`'e çıkarıldı. Bu
 * refactor'da en kolay kaybedilecek şey `il` filtresinin ÜÇ AYRI anlamıydı
 * ('all' ≠ '' ≠ il adı) — o yüzden burada literal olarak kilitli.
 */

const VARSAYILAN: GorevFiltreDegerleri = {
  status: 'all', priority: 'all', type: 'all', il: 'all', termin: 'all', assignee: 'all',
}

function f(kismi: Partial<GorevFiltreDegerleri> = {}): GorevFiltreDegerleri {
  return { ...VARSAYILAN, ...kismi }
}

// Termin kuralları "şimdi"ye göre çalıştığı için saat sabitleniyor; aksi
// halde testler günün saatine göre bir sınırda kayıyor (`due_date` tarih-only
// bir metin ve UTC gece yarısı olarak ayrıştırılıyor).
const SIMDI = '2026-03-10T09:00:00.000Z'
beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(SIMDI)) })
afterAll(() => { vi.useRealTimers() })

const GUN = 86400000
const gunSonra = (n: number) => new Date(Date.parse(SIMDI) + n * GUN).toISOString().slice(0, 10)

function gorev(p: Partial<Task> & { id: string }): Task {
  return {
    status: 'backlog', priority: 'normal', task_type: 'other',
    il: null, assignee_id: null, due_date: null,
    ...p,
  } as Task
}

const GOREVLER: Task[] = [
  gorev({ id: 'ankara',      il: 'Ankara' }),
  gorev({ id: 'izmir',       il: 'İzmir', priority: 'critical', status: 'doing' }),
  gorev({ id: 'ilsiz',       il: null }),
  gorev({ id: 'ilsiz-bos',   il: '' }),
  gorev({ id: 'geciken',     il: 'Ankara', due_date: gunSonra(-3) }),
  gorev({ id: 'yaklasan',    il: 'Ankara', due_date: gunSonra(3) }),
  gorev({ id: 'uzak',        il: 'Ankara', due_date: gunSonra(30) }),
  gorev({ id: 'gecikmis-ama-bitmis', il: 'Ankara', due_date: gunSonra(-3), status: 'done' }),
]

const idler = (t: Task[]) => t.map(x => x.id).sort()

describe('il filtresinin üç ayrı anlamı', () => {
  it("'all' → il süzmesi yok (URL'de ?il parametresi hiç yok)", () => {
    expect(gorevleriSuz(GOREVLER, f({ il: 'all' })).length).toBe(GOREVLER.length)
  })

  it("'' → yalnızca il ATANMAMIŞ görevler (URL'de ?il=), null da boş da sayılır", () => {
    expect(idler(gorevleriSuz(GOREVLER, f({ il: '' })))).toEqual(['ilsiz', 'ilsiz-bos'])
  })

  it("'Ankara' → yalnızca o il; il atanmamışlar DIŞARIDA kalır", () => {
    const sonuc = idler(gorevleriSuz(GOREVLER, f({ il: 'Ankara' })))
    expect(sonuc).not.toContain('ilsiz')
    expect(sonuc).not.toContain('izmir')
    expect(sonuc).toContain('ankara')
  })
})

describe('termin süzgeci', () => {
  it("'geciken' tamamlanmış görevi ASLA saymaz", () => {
    const sonuc = idler(gorevleriSuz(GOREVLER, f({ termin: 'geciken' })))
    expect(sonuc).toEqual(['geciken'])
  })

  it("'yaklasan' yalnızca önümüzdeki 7 gün — geçmiş ve uzak termin dışarıda", () => {
    expect(idler(gorevleriSuz(GOREVLER, f({ termin: 'yaklasan' })))).toEqual(['yaklasan'])
  })

  it('terminsiz görev ne geciken ne yaklaşandır', () => {
    expect(gecikmisMi({ status: 'backlog', due_date: null })).toBe(false)
    expect(yaklasanMi({ status: 'backlog', due_date: null })).toBe(false)
  })

  it('7 günlük pencerenin sınırı: 7. gün içeride, 8. gün dışarıda', () => {
    expect(yaklasanMi({ status: 'backlog', due_date: gunSonra(7) })).toBe(true)
    expect(yaklasanMi({ status: 'backlog', due_date: gunSonra(8) })).toBe(false)
  })
})

describe('filtreler birlikte AND olarak uygulanır', () => {
  it('kritik + İzmir + yapılıyor tek görevi bırakır', () => {
    const sonuc = gorevleriSuz(GOREVLER, f({ priority: 'critical', il: 'İzmir', status: 'doing' }))
    expect(idler(sonuc)).toEqual(['izmir'])
  })

  it('çelişen filtreler boş sonuç verir', () => {
    expect(gorevleriSuz(GOREVLER, f({ il: 'İzmir', termin: 'geciken' }))).toEqual([])
  })
})
