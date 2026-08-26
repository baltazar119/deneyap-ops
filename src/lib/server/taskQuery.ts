import 'server-only'
import { applyTaskScope, type TaskScope } from '@/lib/taskScope'
import type { OrgYetki } from './apiAuth'
import type { Task, TaskStatus, TaskPriority, TaskType } from '@/types/database'

/**
 * Sunucu tarafı görev okuma katmanı.
 *
 * Görevler bugüne kadar yalnızca tarayıcıdan okunuyordu. İçe aktarma,
 * rapor üretimi, zamanlanmış e-posta ve Telegram botu kullanıcı oturumu
 * olmadan çalıştığı için sunucuda da bir okuma yoluna ihtiyaç var.
 *
 * Kapsam kuralı burada YENİDEN YAZILMAZ — `lib/taskScope.ts`'ten gelir,
 * yani istemci ve sunucu aynı kuralı paylaşır.
 */

export function kapsamCoz(yetki: OrgYetki): TaskScope {
  return { role: yetki.rol, userId: yetki.user.id, il: yetki.il }
}

export interface GorevFiltreleri {
  status?: TaskStatus[]
  priority?: TaskPriority[]
  taskType?: TaskType[]
  il?: string[]
  assigneeId?: string | null
  sprintId?: string | null
  /** YYYY-MM-DD — termini bu tarihten önce olanlar */
  terminOnce?: string
  terminSonra?: string
  /** Tamamlananları hariç tut */
  yalnizAcik?: boolean
  limit?: number
  offset?: number
  siralama?: 'created_at' | 'due_date' | 'priority'
}

export interface GorevListesi {
  gorevler: Task[]
  toplam: number
}

export async function gorevleriListele(
  yetki: OrgYetki,
  f: GorevFiltreleri = {},
): Promise<GorevListesi> {
  let q = yetki.admin
    .from('tasks')
    .select('*', { count: 'exact' })
    .eq('organization_id', yetki.org.id)

  // Rol kapsamı — service-role kullandığımız için RLS devrede değil,
  // kapsamı burada uygulamak ZORUNLU.
  q = applyTaskScope(q, kapsamCoz(yetki))

  if (f.status?.length)     q = q.in('status', f.status)
  if (f.priority?.length)   q = q.in('priority', f.priority)
  if (f.taskType?.length)   q = q.in('task_type', f.taskType)
  if (f.il?.length)         q = q.in('il', f.il)
  if (f.sprintId !== undefined) {
    q = f.sprintId === null ? q.is('sprint_id', null) : q.eq('sprint_id', f.sprintId)
  }
  if (f.assigneeId !== undefined) {
    q = f.assigneeId === null ? q.is('assignee_id', null) : q.eq('assignee_id', f.assigneeId)
  }
  if (f.yalnizAcik)   q = q.neq('status', 'done')
  if (f.terminOnce)   q = q.lte('due_date', f.terminOnce)
  if (f.terminSonra)  q = q.gte('due_date', f.terminSonra)

  const siralama = f.siralama ?? 'created_at'
  q = q.order(siralama, { ascending: siralama !== 'created_at', nullsFirst: false })

  if (f.limit !== undefined) {
    const bas = f.offset ?? 0
    q = q.range(bas, bas + f.limit - 1)
  }

  const { data, count, error } = await q
  if (error) throw new Error(`Görevler okunamadı: ${error.message}`)

  return { gorevler: (data ?? []) as Task[], toplam: count ?? 0 }
}

/** Tek görev — kapsam dışındaysa null döner (404 ile 403'ü ayırmamak için) */
export async function gorevGetir(yetki: OrgYetki, id: string): Promise<Task | null> {
  let q = yetki.admin
    .from('tasks')
    .select('*')
    .eq('organization_id', yetki.org.id)
    .eq('id', id)

  q = applyTaskScope(q, kapsamCoz(yetki))

  const { data } = await q.maybeSingle()
  return (data as Task | null) ?? null
}

/**
 * Rapor ve içe aktarma önizlemesi için org'un tüm görevlerini sayfalı çeker.
 * Supabase varsayılan 1000 satır sınırını aştığı için döngü gerekiyor.
 */
export async function tumGorevleriGetir(
  yetki: OrgYetki,
  f: Omit<GorevFiltreleri, 'limit' | 'offset'> = {},
): Promise<Task[]> {
  const SAYFA = 1000
  const hepsi: Task[] = []
  for (let offset = 0; ; offset += SAYFA) {
    const { gorevler } = await gorevleriListele(yetki, { ...f, limit: SAYFA, offset })
    hepsi.push(...gorevler)
    if (gorevler.length < SAYFA) break
    // 20.000 satırdan sonrası bu uygulamanın ölçeğinde anormal — sonsuz
    // döngüye karşı emniyet
    if (hepsi.length >= 20_000) break
  }
  return hepsi
}
