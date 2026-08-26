import { describe, it, expect } from 'vitest'
import { raporHesapla, type HesapGirdisi } from './hesapla'
import { raporKapsami } from './kapsam'
import type { Task, OrgRole } from '@/types/database'

const BUGUN = '2026-09-01'

let sayac = 0
function gorev(o: Partial<Task> = {}): Task {
  sayac++
  return {
    id: `t${sayac}`, title: `Görev ${sayac}`, description: null,
    status: 'backlog', priority: 'normal', task_type: 'other',
    assignee_id: null, start_date: null, due_date: null,
    estimated_hours: null, actual_hours: null, sprint_id: null,
    il: null, organization_id: 'org1', created_by: 'u1',
    created_at: '2026-08-01', updated_at: '2026-08-01',
    ...o,
  } as Task
}

function hesapla(gorevler: Task[], rol: OrgRole, uyeIl: string | null = null) {
  const girdi: HesapGirdisi = {
    gorevler,
    kapsam: raporKapsami(rol, uyeIl),
    donem: { baslangic: '2026-08-01', bitis: '2026-09-01', etiket: 'Ağustos 2026' },
    uyeAdlari: { u1: 'Ankara Sorumlusu', u2: 'İzmir Sorumlusu' },
    uyeIlleri: { u1: 'Ankara', u2: 'İzmir' },
    orgAd: 'DENEYAP Demo',
    uretenAd: 'Test Kullanıcı',
    uretenRol: rol,
    uretenRolAdi: 'Test Rolü',
    bugun: BUGUN,
  }
  return raporHesapla(girdi)
}

const ORNEK = [
  gorev({ il: 'Ankara', status: 'done',    assignee_id: 'u1' }),
  gorev({ il: 'Ankara', status: 'doing',   assignee_id: 'u1', due_date: '2026-08-25' }), // 7 gün gecikme
  gorev({ il: 'Ankara', status: 'backlog', due_date: '2026-09-05' }),                    // yaklaşan
  gorev({ il: 'İzmir',  status: 'done',    assignee_id: 'u2' }),
  gorev({ il: 'İzmir',  status: 'blocked', assignee_id: 'u2', due_date: '2026-08-30' }), // 2 gün gecikme
  gorev({ il: null,     status: 'backlog' }),
]

describe('raporHesapla — KPI', () => {
  it('temel sayıları doğru üretir', () => {
    const r = hesapla(ORNEK, 'owner')
    expect(r.kpi.toplam).toBe(6)
    expect(r.kpi.tamamlanan).toBe(2)
    expect(r.kpi.geciken).toBe(2)
    expect(r.kpi.bloke).toBe(1)
    expect(r.kpi.tamamlanmaOrani).toBe(33)
  })

  it('tamamlanmış görevi termini geçmiş olsa da gecikmiş saymaz', () => {
    const r = hesapla([gorev({ status: 'done', due_date: '2026-01-01' })], 'owner')
    expect(r.kpi.geciken).toBe(0)
  })

  it('termini bugün olan görev gecikmiş değildir', () => {
    const r = hesapla([gorev({ status: 'doing', due_date: BUGUN })], 'owner')
    expect(r.kpi.geciken).toBe(0)
  })

  it('ortalama gecikmeyi hesaplar', () => {
    const r = hesapla(ORNEK, 'owner')
    expect(r.kpi.ortalamaGecikmeGunu).toBe(5)   // (7 + 2) / 2 → 4.5 → 5
  })

  it('boş görev listesinde sıfıra bölmez', () => {
    const r = hesapla([], 'owner')
    expect(r.kpi.tamamlanmaOrani).toBe(0)
    expect(r.kpi.ortalamaGecikmeGunu).toBe(0)
  })
})

describe('raporHesapla — rol kapsamı', () => {
  it('Merkez Operasyon tüm illeri görür', () => {
    const r = hesapla(ORNEK, 'owner')
    expect(r.kpi.toplam).toBe(6)
    expect(r.meta.kapsamEtiketi).toBe('Tüm iller')
  })

  it('İl Sorumlusu YALNIZCA kendi ilini görür', () => {
    const r = hesapla(ORNEK, 'member', 'Ankara')
    expect(r.kpi.toplam).toBe(3)
    expect(r.ilKirilimi.every(s => s.il === 'Ankara')).toBe(true)
    expect(r.hamListe.every(s => s.il === 'Ankara')).toBe(true)
  })

  it('ili tanımsız İl Sorumlusu hiçbir ile düşmez — tüm illere AÇILMAZ', () => {
    const r = hesapla(ORNEK, 'member', null)
    expect(r.kpi.toplam).toBe(0)
    expect(r.meta.kapsamEtiketi).toContain('size atanan')
  })

  it('Danışman rapor üretemez', () => {
    const r = hesapla(ORNEK, 'consultant')
    expect(r.kpi.toplam).toBe(0)
    expect(r.meta.bolumler).toHaveLength(0)
  })

  it('rol adı rapora yazılır', () => {
    expect(hesapla(ORNEK, 'owner').meta.raporAdi).toBe('Merkez Operasyon Raporu')
    expect(hesapla(ORNEK, 'admin').meta.raporAdi).toBe('Koordinatör Risk Raporu')
    expect(hesapla(ORNEK, 'viewer').meta.raporAdi).toBe('Yönetici Özeti')
    expect(hesapla(ORNEK, 'member', 'Ankara').meta.raporAdi).toBe('Ankara İl Durum Raporu')
  })
})

describe('raporHesapla — Yetkili Yönetici gizliliği', () => {
  it('kişi kırılımı ve ham görev listesi içermez', () => {
    const r = hesapla(ORNEK, 'viewer')
    expect(r.sorumluKirilimi).toHaveLength(0)
    expect(r.hamListe).toHaveLength(0)
  })

  it('KVKK regresyonu: çıktıda hiçbir üye adı geçmez', () => {
    const r = hesapla(ORNEK, 'viewer')
    const metin = JSON.stringify(r)
    expect(metin).not.toContain('Ankara Sorumlusu')
    expect(metin).not.toContain('İzmir Sorumlusu')
  })

  it('ama oranları ve gecikme sayısını görür', () => {
    const r = hesapla(ORNEK, 'viewer')
    expect(r.kpi.geciken).toBe(2)
    expect(r.ilKirilimi.length).toBeGreaterThan(0)
  })
})

describe('raporHesapla — kırılımlar', () => {
  it('il kırılımını en çok gecikene göre sıralar', () => {
    const r = hesapla(ORNEK, 'admin')
    expect(r.ilKirilimi[0].il).toBe('Ankara')   // 1 gecikme, alfabetik önde
    expect(r.ilKirilimi[0].oran).toBe(33)
  })

  it('ili olmayan görevleri ayrı grupta toplar', () => {
    const r = hesapla(ORNEK, 'owner')
    expect(r.ilKirilimi.some(s => s.il === 'İl atanmamış')).toBe(true)
  })

  it('sorumlu kırılımını en çok gecikene göre sıralar', () => {
    const r = hesapla(ORNEK, 'owner')
    expect(r.sorumluKirilimi[0].ad).toBe('Ankara Sorumlusu')
    expect(r.sorumluKirilimi[0].geciken).toBe(1)
  })

  it('gecikmeleri en uzun gecikeni başa alarak sıralar', () => {
    const r = hesapla(ORNEK, 'owner')
    expect(r.gecikmeler[0].gecikmeGunu).toBe(7)
    expect(r.gecikmeler[1].gecikmeGunu).toBe(2)
  })

  it('yaklaşan terminleri 7 gün penceresiyle sınırlar', () => {
    const r = hesapla([
      gorev({ status: 'backlog', due_date: '2026-09-03' }),   // 2 gün → dahil
      gorev({ status: 'backlog', due_date: '2026-09-20' }),   // 19 gün → hariç
      gorev({ status: 'done',    due_date: '2026-09-03' }),   // tamamlanmış → hariç
    ], 'owner')
    expect(r.yaklasan).toHaveLength(1)
  })

  it('tür kırılımında Türkçe etiket kullanır', () => {
    const r = hesapla([gorev({ task_type: 'training' })], 'owner')
    expect(r.turKirilimi[0].etiket).toBe('Eğitim')
  })
})
