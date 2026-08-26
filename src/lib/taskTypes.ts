import type { TaskType } from '@/types/database'

/**
 * Görev kategorileri — TEK KAYNAK.
 *
 * Bu liste daha önce 8 ayrı dosyada (görevler, kanban, görev detayı,
 * takvim, zaman çizelgesi, AI asistan ve 3 AI route'u) tekrar ediyordu.
 * Kategori değişikliği hepsini elle güncellemeyi gerektiriyordu; artık
 * hepsi buradan okuyor.
 *
 * DEĞİŞİKLİK YAPARKEN: veritabanındaki CHECK kısıtları da güncellenmeli
 * (tasks.task_type ve draft_tasks.category) — bkz. migration 051.
 */
export const TASK_TYPES: { value: TaskType; label: string }[] = [
  // Teknik
  { value: 'mechanical', label: 'Mekanik' },
  { value: 'electrical', label: 'Elektronik' },
  { value: 'software',   label: 'Yazılım' },
  // Operasyon
  { value: 'training',   label: 'Eğitim' },
  { value: 'event',      label: 'Etkinlik' },
  { value: 'supply',     label: 'Malzeme & Tedarik' },
  { value: 'admin',      label: 'İdari' },
  { value: 'reporting',  label: 'Raporlama' },
  { value: 'other',      label: 'Diğer' },
]

export const TASK_TYPE_LABELS: Record<TaskType, string> = TASK_TYPES.reduce(
  (acc, t) => { acc[t.value] = t.label; return acc },
  {} as Record<TaskType, string>,
)

/** AI route'larının Gemini çıktısını doğrularken kullandığı geçerli değerler */
export const TASK_TYPE_VALUES: TaskType[] = TASK_TYPES.map((t) => t.value)

/** Bilinmeyen değerler için yedek girdi — index ile aramayın, liste sırası değişebilir */
export const TASK_TYPE_FALLBACK = TASK_TYPES.find((t) => t.value === 'other')!

/** Bilinmeyen/eski bir değer gelirse güvenli etiket döndürür */
export function taskTypeLabel(value: string | null | undefined): string {
  if (!value) return TASK_TYPE_LABELS.other
  return TASK_TYPE_LABELS[value as TaskType] ?? TASK_TYPE_LABELS.other
}
