import type { OrgRole } from '@/types/database'

/**
 * "Hangi rol hangi görevleri görür" — TEK KAYNAK.
 *
 * PRD madde 2: "Kullanıcı rolü ve sorumlu olduğu il/birim tanımlanır;
 * yalnızca ilgili görevleri görür."
 *
 * Bu kural daha önce beş ekranda ayrı ayrı ve TUTARSIZ yazılıydı: Görevler ve
 * Panelim il'i hesaba katıyordu, Kanban / Zaman Çizelgesi / Takvim yalnızca
 * `assignee_id`'ye bakıyordu. Sonuç: İl Sorumlusu o üç ekranda kendi ilinin
 * görevlerini göremiyordu. Artık hepsi buradan okuyor.
 *
 * Dosya izomorfiktir (sunucu ve istemci) — bilerek hiçbir şey import etmez.
 */

export interface TaskScope {
  role: OrgRole
  userId: string
  /** organization_members.il — İl Sorumlusu için sorumluluk alanı */
  il: string | null
}

/** Merkez, Koordinatör, Yetkili Yönetici ve Danışman org'un tamamını görür */
export function tumGorevleriGorurMu(role: OrgRole): boolean {
  return role !== 'member'
}

/** Tek bir görev bu kapsama giriyor mu (bellekte filtreleme) */
export function gorevKapsamdaMi(
  t: { assignee_id: string | null; il: string | null },
  s: TaskScope,
): boolean {
  if (tumGorevleriGorurMu(s.role)) return true
  if (t.assignee_id === s.userId) return true
  return !!s.il && t.il === s.il
}

/** Bir görev dizisini kapsama göre süzer */
export function kapsamaGoreSuz<T extends { assignee_id: string | null; il: string | null }>(
  tasks: T[],
  s: TaskScope,
): T[] {
  if (tumGorevleriGorurMu(s.role)) return tasks
  return tasks.filter((t) => gorevKapsamdaMi(t, s))
}

/**
 * PostgREST `.or()` değerini kaçırır.
 *
 * `or()` içinde virgül ve parantez ayırıcıdır; il adları boşluk ("Genel Merkez")
 * ve Türkçe karakter içerdiği için değer çift tırnağa alınmalı. Yanlış tırnaklama
 * hata vermez — SESSİZCE yanlış sonuç döner, bu yüzden ayrı bir fonksiyon.
 */
export function postgrestDegerKacir(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/**
 * Kapsam için PostgREST `.or()` ifadesi üretir.
 * `null` dönerse filtre uygulanmaz (kullanıcı her şeyi görür).
 */
export function taskScopeOrFilter(s: TaskScope): string | null {
  if (tumGorevleriGorurMu(s.role)) return null
  const kendi = `assignee_id.eq.${s.userId}`
  if (!s.il) return kendi
  return `${kendi},il.eq.${postgrestDegerKacir(s.il)}`
}

/** Supabase sorgu kurucusuna kapsam filtresini uygular (istemci ve sunucu) */
export function applyTaskScope<Q extends { or: (f: string) => Q }>(q: Q, s: TaskScope): Q {
  const filtre = taskScopeOrFilter(s)
  return filtre ? q.or(filtre) : q
}
