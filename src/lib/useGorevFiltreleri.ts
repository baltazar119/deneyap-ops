'use client'

import { useState, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { gecikmisMi, yaklasanMi } from '@/lib/gorevTermin'
import type { Task, TaskStatus, TaskPriority, TaskType } from '@/types/database'

export type TerminFiltresi = 'all' | 'geciken' | 'yaklasan'

export interface GorevFiltreDegerleri {
  status: TaskStatus | 'all'
  priority: TaskPriority | 'all'
  type: TaskType | 'all'
  /**
   * ÜÇ AYRI ANLAM — refactor'da en kolay kaybedilen ayrım:
   *   'all' → il filtresi yok
   *   ''    → "İl atanmamış" (il alanı boş olan görevler)
   *   'Ankara' → o il
   * URL'de `?il=` (boş değer) ikinci anlamı taşır, `?il` hiç yoksa birincisi.
   */
  il: string
  termin: TerminFiltresi
  assignee: string
}

const VARSAYILAN: GorevFiltreDegerleri = {
  status: 'all', priority: 'all', type: 'all', il: 'all', termin: 'all', assignee: 'all',
}

/**
 * Görevler ekranının filtre durumu ve saf süzme kuralı.
 *
 * Süzme mantığı bileşenlerden ayrı tutuluyor ki mobil ve masaüstü kontrolleri
 * aynı tek kaynağı sürsün — eskiden iki JSX ağacı aynı state'i farklı
 * yerlerden set ediyordu.
 */
export function useGorevFiltreleri() {
  const searchParams = useSearchParams()

  // Operasyon Riski gibi ekranlardan "?il=Ankara" ile gelindiğinde filtre
  // önceden uygulanmış olsun — kullanıcı elle tekrar seçmek zorunda kalmasın.
  const [filtreler, setFiltreler] = useState<GorevFiltreDegerleri>(() => ({
    ...VARSAYILAN,
    il: searchParams.get('il') ?? 'all',
  }))

  const ayarla = useMemo(
    () => <K extends keyof GorevFiltreDegerleri>(alan: K, deger: GorevFiltreDegerleri[K]) =>
      setFiltreler(onceki => ({ ...onceki, [alan]: deger })),
    [],
  )

  const temizle = useMemo(() => () => setFiltreler(VARSAYILAN), [])

  const aktifMi = Object.keys(VARSAYILAN).some(
    k => filtreler[k as keyof GorevFiltreDegerleri] !== VARSAYILAN[k as keyof GorevFiltreDegerleri],
  )

  return { filtreler, ayarla, temizle, aktifMi }
}

/** Saf süzgeç — hook'suz test edilebilsin diye ayrı. */
export function gorevleriSuz<T extends Task>(gorevler: T[], f: GorevFiltreDegerleri): T[] {
  return gorevler.filter(t => {
    if (f.status !== 'all' && t.status !== f.status) return false
    if (f.priority !== 'all' && t.priority !== f.priority) return false
    if (f.type !== 'all' && t.task_type !== f.type) return false
    if (f.il !== 'all' && (t.il ?? '') !== f.il) return false
    if (f.termin === 'geciken' && !gecikmisMi(t)) return false
    if (f.termin === 'yaklasan' && !yaklasanMi(t)) return false
    if (f.assignee !== 'all' && t.assignee_id !== f.assignee) return false
    return true
  })
}
