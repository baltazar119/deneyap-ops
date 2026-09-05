import { isOverdue } from '@/lib/utils'
import type { Task } from '@/types/database'

/**
 * Termin durumu saf kuralları. Sayaç chip'leri, süzgeç ve satır rozeti aynı
 * tanımı kullanmalı; eskiden üçü de kendi kopyasını taşıyordu.
 */

/** Tamamlanmamış ve termini geçmiş. */
export function gecikmisMi(task: Pick<Task, 'status' | 'due_date'>): boolean {
  return task.status !== 'done' && isOverdue(task.due_date)
}

/** Tamamlanmamış ve termini önümüzdeki 7 gün içinde (bugün dahil). */
export function yaklasanMi(task: Pick<Task, 'status' | 'due_date'>): boolean {
  if (task.status === 'done' || !task.due_date) return false
  const kalan = Math.round((Date.parse(task.due_date) - Date.now()) / 86400000)
  return kalan >= 0 && kalan <= 7
}
