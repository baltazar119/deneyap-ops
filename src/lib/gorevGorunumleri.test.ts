import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import {
  gorulebilirGorunumler, gorunumEtiketi, gorunumCoz, varsayilanGorunum,
  gorevleriGorunumeGoreSuz, GORUNUMLER,
  type GorunumBaglami,
} from './gorevGorunumleri'
import type { Task, OrgRole } from '@/types/database'

const SIMDI = '2026-03-10T09:00:00.000Z'
beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(SIMDI)) })
afterAll(() => { vi.useRealTimers() })

const GUN = 86400000
const gunSonra = (n: number) => new Date(Date.parse(SIMDI) + n * GUN).toISOString().slice(0, 10)

const BEN = 'user-ben'
const BASKASI = 'user-baskasi'

function baglam(
  role: OrgRole | null, userIl: string | null = null,
  userDeneyapId: string | null = null, userDeneyapAdi: string | null = null,
): GorunumBaglami {
  return { role, userId: BEN, userIl, userDeneyapId, userDeneyapAdi }
}

function gorev(p: Partial<Task> & { id: string }): Task {
  return {
    status: 'backlog', priority: 'normal', task_type: 'other',
    il: null, assignee_id: null, due_date: null,
    ...p,
  } as Task
}

const GOREVLER: Task[] = [
  gorev({ id: 'benim',      assignee_id: BEN, il: 'Ankara' }),
  gorev({ id: 'baskasinin', assignee_id: BASKASI, il: 'İzmir' }),
  gorev({ id: 'atanmamis',  assignee_id: null, il: 'Ankara' }),
  gorev({ id: 'geciken',    assignee_id: BASKASI, due_date: gunSonra(-5) }),
  gorev({ id: 'yaklasan',   assignee_id: BASKASI, due_date: gunSonra(3) }),
]

const idler = (t: Task[]) => t.map(x => x.id).sort()

describe('görünürlük — rol bazlı', () => {
  it('Atanmamış görünümünü yalnızca atama yetkisi olanlar görür', () => {
    const idOf = (b: GorunumBaglami) => gorulebilirGorunumler(b).map(g => g.id)
    expect(idOf(baglam('owner'))).toContain('atanmamis')
    expect(idOf(baglam('admin'))).toContain('atanmamis')
    expect(idOf(baglam('viewer'))).not.toContain('atanmamis')
    expect(idOf(baglam('member', 'Ankara'))).not.toContain('atanmamis')
  })

  it('İl görünümü yalnızca ili olan İl Sorumlusunda çıkar', () => {
    const idOf = (b: GorunumBaglami) => gorulebilirGorunumler(b).map(g => g.id)
    expect(idOf(baglam('member', 'Ankara'))).toContain('ilim')
    expect(idOf(baglam('member', null))).not.toContain('ilim')
    expect(idOf(baglam('admin', 'Ankara'))).not.toContain('ilim')
  })

  it('İl görünümünün etiketi ilin gerçek adını taşır', () => {
    const g = GORUNUMLER.find(x => x.id === 'ilim')!
    expect(gorunumEtiketi(g, baglam('member', 'Ankara'))).toBe('Ankara görevleri')
  })
})

describe('varsayılan görünüm', () => {
  it('İl Sorumlusu "Bana atananlar" ile açılır, diğerleri "Tümü"', () => {
    expect(varsayilanGorunum('member')).toBe('bana')
    expect(varsayilanGorunum('owner')).toBe('tumu')
    expect(varsayilanGorunum('admin')).toBe('tumu')
    expect(varsayilanGorunum('viewer')).toBe('tumu')
    expect(varsayilanGorunum(null)).toBe('tumu')
  })
})

describe('gorunumCoz — URL değeri', () => {
  it('geçerli değeri kabul eder', () => {
    expect(gorunumCoz('gecikenler', baglam('admin'))).toBe('gecikenler')
  })

  it('bilinmeyen değer sessizce varsayılana düşer', () => {
    expect(gorunumCoz('yok-boyle-bir-sey', baglam('admin'))).toBe('tumu')
    expect(gorunumCoz(null, baglam('member', 'Ankara'))).toBe('bana')
  })

  it('rolün göremeyeceği görünüm URL ile zorlanamaz', () => {
    expect(gorunumCoz('atanmamis', baglam('viewer'))).toBe('tumu')
  })
})

describe('görünüm süzgeci', () => {
  it('Tümü hiçbir şey elemez', () => {
    expect(gorevleriGorunumeGoreSuz(GOREVLER, 'tumu', baglam('admin')).length).toBe(GOREVLER.length)
  })

  it('Bana atananlar yalnızca benim görevlerim', () => {
    expect(idler(gorevleriGorunumeGoreSuz(GOREVLER, 'bana', baglam('admin')))).toEqual(['benim'])
  })

  it('Atanmamış yalnızca sahipsiz görevler', () => {
    expect(idler(gorevleriGorunumeGoreSuz(GOREVLER, 'atanmamis', baglam('admin')))).toEqual(['atanmamis'])
  })

  it('Gecikenler ve Bu hafta termin kurallarını kullanır', () => {
    expect(idler(gorevleriGorunumeGoreSuz(GOREVLER, 'gecikenler', baglam('admin')))).toEqual(['geciken'])
    expect(idler(gorevleriGorunumeGoreSuz(GOREVLER, 'bu-hafta', baglam('admin')))).toEqual(['yaklasan'])
  })

  it('İl görünümü kullanıcının ilini süzer', () => {
    expect(idler(gorevleriGorunumeGoreSuz(GOREVLER, 'ilim', baglam('member', 'Ankara'))))
      .toEqual(['atanmamis', 'benim'])
  })

  // Güvenlik değil ergonomi kuralı: kapsam zaten taskScope'ta uygulanıyor.
  // Yine de rolün göremediği bir görünüm URL'den gelirse sessizce süzmemeli,
  // "boş liste" gibi görünüp kullanıcıyı yanıltmamalı.
  it('rolün göremeyeceği görünüm süzme yapmaz', () => {
    expect(gorevleriGorunumeGoreSuz(GOREVLER, 'atanmamis', baglam('viewer')).length)
      .toBe(GOREVLER.length)
  })
})

describe("DENEYAP'ım görünümü (Faz 4)", () => {
  const G = [
    gorev({ id: 'benim-birim',  deneyap_id: 'd-cankaya',  il: 'Ankara' }),
    gorev({ id: 'diger-birim',  deneyap_id: 'd-kecioren', il: 'Ankara' }),
    gorev({ id: 'birimsiz',     deneyap_id: null,         il: 'Ankara' }),
  ]

  it("üyenin DENEYAP'ı yoksa görünüm hiç çıkmaz", () => {
    expect(gorulebilirGorunumler(baglam('member', 'Ankara')).map(g => g.id))
      .not.toContain('deneyapim')
  })

  it('DENEYAP bağlıysa görünür ve rolden bağımsızdır', () => {
    for (const rol of ['owner', 'admin', 'member', 'viewer'] as OrgRole[]) {
      expect(gorulebilirGorunumler(baglam(rol, null, 'd-cankaya')).map(g => g.id))
        .toContain('deneyapim')
    }
  })

  it("chip etiketi DENEYAP'ın gerçek adını taşır", () => {
    const g = GORUNUMLER.find(x => x.id === 'deneyapim')!
    expect(gorunumEtiketi(g, baglam('admin', null, 'd-cankaya', 'Çankaya DENEYAP')))
      .toBe('Çankaya DENEYAP')
  })

  // Projenin belirleyici gereksinimi: aynı ildeki iki DENEYAP birbirinden
  // ayrılabilmeli. İl bazlı bir görünüm bunu yapamazdı.
  it("aynı ildeki DİĞER DENEYAP'ın görevini getirmez", () => {
    expect(idler(gorevleriGorunumeGoreSuz(G, 'deneyapim', baglam('admin', 'Ankara', 'd-cankaya'))))
      .toEqual(['benim-birim'])
  })

  it("DENEYAP'sız görevler bu görünümde yer almaz", () => {
    const sonuc = idler(gorevleriGorunumeGoreSuz(G, 'deneyapim', baglam('admin', null, 'd-cankaya')))
    expect(sonuc).not.toContain('birimsiz')
  })
})
