import { describe, it, expect } from 'vitest'
import { raporPdfUret } from './uret'
import { raporHesapla, type HesapGirdisi } from '../hesapla'
import { raporKapsami } from '../kapsam'
import type { Task, OrgRole } from '@/types/database'

/**
 * PDF üretiminin gerçekten çalıştığını ve Türkçe karakterleri bozmadığını
 * doğrular. Eski jsPDF raporu tam bu yüzden ASCII'ye indirgenmişti.
 */

let n = 0
function gorev(o: Partial<Task> = {}): Task {
  n++
  return {
    id: `t${n}`, title: `Görev ${n}`, description: null,
    status: 'backlog', priority: 'normal', task_type: 'other',
    assignee_id: null, start_date: null, due_date: null,
    estimated_hours: null, actual_hours: null, sprint_id: null,
    il: null, organization_id: 'o1', created_by: 'u1',
    created_at: '2026-08-01', updated_at: '2026-08-01', ...o,
  } as Task
}

function veri(rol: OrgRole, uyeIl: string | null = null, gorevler?: Task[]) {
  const girdi: HesapGirdisi = {
    gorevler: gorevler ?? [
      gorev({ title: 'Şanlıurfa atölye açılışı', il: 'Şanlıurfa', status: 'doing', assignee_id: 'u1', due_date: '2026-08-20' }),
      gorev({ title: 'Iğdır eğitmen görevlendirmesi', il: 'Iğdır', status: 'done', assignee_id: 'u2' }),
      gorev({ title: 'Çanakkale ölçüm çalışması', il: 'Çanakkale', status: 'blocked', due_date: '2026-09-03' }),
      gorev({ title: 'Ğüşıöç karakter testi', il: 'İstanbul', status: 'backlog' }),
    ],
    kapsam: raporKapsami(rol, uyeIl),
    donem: { baslangic: '2026-08-01', bitis: '2026-09-01', etiket: 'Ağustos 2026' },
    uyeAdlari: { u1: 'Ayşe Gülşen', u2: 'Çağrı Öztürk' },
    uyeIlleri: { u1: 'Şanlıurfa', u2: 'Iğdır' },
    orgAd: 'DENEYAP Türkiye',
    uretenAd: 'İbrahim Şahin',
    uretenRol: rol,
    uretenRolAdi: 'Merkez Operasyon Ekibi',
    bugun: '2026-09-01',
  }
  return raporHesapla(girdi)
}

/** PDF içinden okunabilir metin çıkarmak zor; en azından geçerli bir PDF mi */
function pdfMi(buf: Buffer): boolean {
  return buf.subarray(0, 5).toString('latin1') === '%PDF-'
}

describe('raporPdfUret', () => {
  it('geçerli bir PDF üretir', async () => {
    const buf = await raporPdfUret(veri('owner'))
    expect(pdfMi(buf)).toBe(true)
    expect(buf.length).toBeGreaterThan(3000)
  }, 30_000)

  it('Türkçe karakterli veride çökmez ve gömülü font kullanır', async () => {
    const buf = await raporPdfUret(veri('owner'))
    const ham = buf.toString('latin1')
    // Font gömülüyse PDF içinde Roboto adı geçer. Geçmiyorsa Helvetica'ya
    // düşülmüş demektir ve Türkçe karakterler bozulur.
    expect(ham).toContain('Roboto')
  }, 30_000)

  it('her rol için üretilebiliyor', async () => {
    for (const rol of ['owner', 'admin', 'member', 'viewer'] as OrgRole[]) {
      const buf = await raporPdfUret(veri(rol, 'Şanlıurfa'))
      expect(pdfMi(buf)).toBe(true)
    }
  }, 60_000)

  it('boş veri setinde de çöker değil, PDF üretir', async () => {
    const buf = await raporPdfUret(veri('owner', null, []))
    expect(pdfMi(buf)).toBe(true)
  }, 30_000)

  it('çok satırlı veride sayfalara bölünür', async () => {
    const cok = Array.from({ length: 120 }, (_, i) =>
      gorev({ title: `Gecikmiş görev ${i}`, il: 'Ankara', status: 'doing', due_date: '2026-07-01' }))
    const buf = await raporPdfUret(veri('owner', null, cok))
    expect(pdfMi(buf)).toBe(true)
    // Birden çok /Type /Page nesnesi olmalı
    const sayfaSayisi = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length
    expect(sayfaSayisi).toBeGreaterThan(1)
  }, 60_000)
})
