import { TASK_TYPES, TASK_TYPE_FALLBACK } from '@/lib/taskTypes'
import type { Task, TaskStatus, TaskPriority, TaskType } from '@/types/database'

export { gecikmisMi, yaklasanMi } from '@/lib/gorevTermin'

/**
 * Görevler ekranının ortak sabitleri ve saf yardımcıları.
 *
 * Bu dosyadan önce aynı listeler ve rozet mantığı mobil ve masaüstü JSX
 * ağaçlarında iki kez ayrı ayrı yazılıydı; biri güncellenip diğeri
 * unutulduğunda iki ekran sessizce farklı etiket gösteriyordu. Rozet/renk
 * kararı artık tek yerde.
 */

export const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'backlog', label: 'Beklemede' },
  { value: 'doing',   label: 'Yapılıyor' },
  { value: 'testing', label: 'Test' },
  { value: 'blocked', label: 'Bloke' },
  { value: 'done',    label: 'Tamamlandı' },
]

export const PRIORITY_OPTIONS: { value: TaskPriority; label: string; color: string; bg: string; icon: string }[] = [
  { value: 'critical', label: 'Kritik',  color: '#dc2626', bg: '#fee2e2', icon: '🔴' },
  { value: 'high',     label: 'Yüksek',  color: '#d97706', bg: '#fef3c7', icon: '🟡' },
  { value: 'normal',   label: 'Normal',  color: '#2288c9', bg: '#bee5f0', icon: '🔵' },
  { value: 'low',      label: 'Düşük',   color: '#6b7280', bg: '#f3f4f6', icon: '⚪' },
]

/** Kart görünümündeki kısa durum etiketi — "Tamamlandı" yerine "Tamam". */
export const STATUS_KISA_ETIKET: Record<TaskStatus, string> = {
  backlog: 'Beklemede',
  doing:   'Yapılıyor',
  testing: 'Test',
  blocked: 'Bloke',
  done:    'Tamam',
}

export const STATUS_RENK: Record<TaskStatus, string> = {
  backlog: '#94a3b8',
  doing:   '#2288c9',
  testing: '#f59e0b',
  blocked: '#ef4444',
  done:    '#10b981',
}

export function getPriorityMeta(priority: TaskPriority) {
  return PRIORITY_OPTIONS.find(p => p.value === priority) || PRIORITY_OPTIONS[2]
}

export function getTypeMeta(type: TaskType) {
  return TASK_TYPES.find(t => t.value === type) || TASK_TYPE_FALLBACK
}

export interface TaskWithAssignee extends Task {
  assigneeName?: string
}
