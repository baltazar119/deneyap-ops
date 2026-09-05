import { describe, it, expect } from 'vitest'
import { computeRisk, type RiskInput } from './operationRisk'
import type { Task, Sprint, Profile } from '@/types/database'

const GUN = 86_400_000

function gun(offset: number): string {
  return new Date(Date.now() + offset * GUN).toISOString().slice(0, 10)
}

function gorev(over: Partial<Task> = {}): Task {
  return {
    id: Math.random().toString(36).slice(2),
    title: 'Görev',
    description: null,
    status: 'backlog',
    priority: 'normal',
    task_type: 'other',
    assignee_id: null,
    start_date: null,
    due_date: null,
    estimated_hours: null,
    actual_hours: null,
    sprint_id: null,
    organization_id: 'org-1',
    created_by: 'user-1',
    created_at: new Date().toISOString(),
    ...over,
  } as Task
}

function uye(id: string, ad: string): Profile {
  return { id, full_name: ad } as Profile
}

function girdi(over: Partial<RiskInput> = {}): RiskInput {
  return { tasks: [], sprints: [], members: [], overloadThreshold: 8, ...over }
}

describe('computeRisk', () => {
  it('veri yokken risk üretmez', () => {
    const r = computeRisk(girdi())
    expect(r.signals).toHaveLength(0)
    expect(r.score).toBe(0)
    expect(r.level).toBe('low')
  })

  it('tamamlanmış görevleri gecikmiş saymaz', () => {
    const r = computeRisk(girdi({
      tasks: [gorev({ status: 'done', due_date: gun(-10) })],
    }))
    expect(r.counts.overdue).toBe(0)
  })

  it('termini geçmiş açık görevleri yakalar', () => {
    const r = computeRisk(girdi({
      tasks: [gorev({ due_date: gun(-1) }), gorev({ due_date: gun(-5) })],
    }))
    expect(r.counts.overdue).toBe(2)
    expect(r.signals.some((s) => s.id === 'overdue')).toBe(true)
  })

  it('3 ve üzeri gecikmede seviyeyi yükseltir', () => {
    const az = computeRisk(girdi({ tasks: [gorev({ due_date: gun(-1) })] }))
    const cok = computeRisk(girdi({
      tasks: [gorev({ due_date: gun(-1) }), gorev({ due_date: gun(-2) }), gorev({ due_date: gun(-3) })],
    }))
    expect(az.signals.find((s) => s.id === 'overdue')?.level).toBe('medium')
    expect(cok.signals.find((s) => s.id === 'overdue')?.level).toBe('high')
  })

  it('termini yaklaşan görevleri ayırt eder (3 gün penceresi)', () => {
    const r = computeRisk(girdi({
      tasks: [gorev({ due_date: gun(2) }), gorev({ due_date: gun(10) })],
    }))
    expect(r.counts.dueSoon).toBe(1)
  })

  it('bloke görevleri yüksek risk sayar', () => {
    const r = computeRisk(girdi({ tasks: [gorev({ status: 'blocked' })] }))
    expect(r.signals.find((s) => s.id === 'blocked')?.level).toBe('high')
  })

  it('atanmamış kritik görevi yakalar, atanmışı saymaz', () => {
    const r = computeRisk(girdi({
      tasks: [
        gorev({ priority: 'critical' }),
        gorev({ priority: 'critical', assignee_id: 'u1' }),
      ],
    }))
    expect(r.counts.unassignedCritical).toBe(1)
  })

  it('eşiği aşan üyeyi aşırı yüklü işaretler', () => {
    const tasks = Array.from({ length: 5 }, () => gorev({ assignee_id: 'u1' }))
    const altinda = computeRisk(girdi({ tasks, members: [uye('u1', 'Ahmet')], overloadThreshold: 8 }))
    const ustunde = computeRisk(girdi({ tasks, members: [uye('u1', 'Ahmet')], overloadThreshold: 3 }))
    expect(altinda.counts.overloaded).toBe(0)
    expect(ustunde.counts.overloaded).toBe(1)
    expect(ustunde.signals.some((s) => s.title.includes('Ahmet'))).toBe(true)
  })

  it('sprint takvimin gerisindeyse uyarır', () => {
    const sprint = {
      id: 's1', name: 'Sprint 1', is_active: true,
      start_date: gun(-8), end_date: gun(2),   // süresinin ~%80'i doldu
    } as Sprint
    const r = computeRisk(girdi({
      sprints: [sprint],
      tasks: [
        gorev({ sprint_id: 's1', status: 'done' }),
        ...Array.from({ length: 9 }, () => gorev({ sprint_id: 's1' })),   // %10 tamamlanma
      ],
    }))
    expect(r.signals.some((s) => s.id === 'sprint-behind')).toBe(true)
  })

  it('sprint zamanında ilerliyorsa uyarmaz', () => {
    const sprint = {
      id: 's1', name: 'Sprint 1', is_active: true,
      start_date: gun(-5), end_date: gun(5),
    } as Sprint
    const r = computeRisk(girdi({
      sprints: [sprint],
      tasks: [
        ...Array.from({ length: 6 }, () => gorev({ sprint_id: 's1', status: 'done' })),
        ...Array.from({ length: 4 }, () => gorev({ sprint_id: 's1' })),
      ],
    }))
    expect(r.signals.some((s) => s.id === 'sprint-behind')).toBe(false)
  })

  it('uzun süredir beklemede duran görevleri düşük riskle işaretler', () => {
    const r = computeRisk(girdi({
      tasks: [gorev({ status: 'backlog', created_at: new Date(Date.now() - 20 * GUN).toISOString() })],
    }))
    expect(r.counts.stale).toBe(1)
    expect(r.signals.find((s) => s.id === 'stale')?.level).toBe('low')
  })

  it('sinyalleri yüksekten düşüğe sıralar', () => {
    const r = computeRisk(girdi({
      tasks: [
        gorev({ status: 'backlog', created_at: new Date(Date.now() - 20 * GUN).toISOString() }), // low
        gorev({ status: 'blocked' }),                                                            // high
        gorev({ due_date: gun(1) }),                                                             // medium
      ],
    }))
    const seviyeler = r.signals.map((s) => s.level)
    expect(seviyeler).toEqual([...seviyeler].sort((a, b) =>
      ({ high: 0, medium: 1, low: 2 })[a] - ({ high: 0, medium: 1, low: 2 })[b]))
  })

  it('skor 100 ile sınırlı kalır', () => {
    const r = computeRisk(girdi({
      tasks: [
        ...Array.from({ length: 20 }, () => gorev({ status: 'blocked' })),
        ...Array.from({ length: 20 }, () => gorev({ due_date: gun(-3), priority: 'critical' })),
      ],
    }))
    expect(r.score).toBeLessThanOrEqual(100)
    expect(r.level).toBe('high')
  })

  it('her sinyalde somut bir aksiyon önerisi olur', () => {
    const r = computeRisk(girdi({ tasks: [gorev({ status: 'blocked' })] }))
    expect(r.signals.every((s) => s.action.length > 0)).toBe(true)
  })

  describe('il bazlı kırılım', () => {
    it('sorunsuz ili listede göstermez', () => {
      const r = computeRisk(girdi({ tasks: [gorev({ il: 'Ankara' })] }))
      expect(r.provinces).toHaveLength(0)
    })

    it('sorunlu ili yakalar ve en kritik sinyali özetler', () => {
      const r = computeRisk(girdi({
        tasks: [gorev({ il: 'Ankara', status: 'blocked' }), gorev({ il: 'Ankara' })],
      }))
      expect(r.provinces).toHaveLength(1)
      expect(r.provinces[0].il).toBe('Ankara')
      expect(r.provinces[0].blockedCount).toBe(1)
      expect(r.provinces[0].openCount).toBe(2)
      expect(r.provinces[0].topIssue).toContain('bloke')
    })

    it('en riskli ili en başa sıralar', () => {
      const r = computeRisk(girdi({
        tasks: [
          gorev({ il: 'İzmir', due_date: gun(-1) }),                    // düşük puan
          gorev({ il: 'Ankara', status: 'blocked' }),                   // yüksek puan
          gorev({ il: 'Ankara', priority: 'critical' }),                // + atanmamış kritik
        ],
      }))
      expect(r.provinces[0].il).toBe('Ankara')
    })

    it('il girilmemiş görevleri ayrı grupta toplar', () => {
      const r = computeRisk(girdi({ tasks: [gorev({ status: 'blocked' })] }))
      expect(r.provinces[0].il).toBe('İl Belirtilmemiş')
    })

    it('tamamlanmış görevleri il skoruna katmaz', () => {
      const r = computeRisk(girdi({
        tasks: [gorev({ il: 'Ankara', status: 'done', due_date: gun(-10) })],
      }))
      expect(r.provinces).toHaveLength(0)
    })
  })

  describe('headline', () => {
    it('sinyal yokken sakin bir mesaj döner', () => {
      const r = computeRisk(girdi())
      expect(r.headline).toBe('Şu an acele edilmesi gereken bir durum yok.')
    })

    it('acil sinyal sayısını ve en kritik ili belirtir', () => {
      const r = computeRisk(girdi({
        tasks: [gorev({ il: 'Ankara', status: 'blocked' }), gorev({ il: 'Ankara', status: 'blocked' })],
      }))
      expect(r.headline).toContain('acil')
      expect(r.headline).toContain('Ankara')
    })
  })
})
