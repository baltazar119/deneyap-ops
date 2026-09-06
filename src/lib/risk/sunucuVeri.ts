import 'server-only'
import { tumGorevleriGetir } from '@/lib/server/taskQuery'
import type { RiskInput } from '@/lib/operationRisk'
import type { OrgYetki } from '@/lib/server/apiAuth'
import type { Sprint, Profile } from '@/types/database'

/**
 * Risk girdisini SUNUCUDAN toplar.
 *
 * ⚠ EN ÖNEMLİ KURAL: görevler `tumGorevleriGetir(yetki)` üzerinden çekilir,
 * ASLA doğrudan `yetki.admin.from('tasks')` ile değil.
 *
 * Gerekçe: `yetki.admin` service-role istemcisidir ve RLS'i BYPASS eder.
 * Tarayıcı yolunda (risk/istemciVeri.ts) kapsamı RLS uyguluyor; sunucuda öyle
 * bir koruma yok. Ham bir admin sorgusu İl Sorumlusuna tüm org'un görevlerini
 * gösterirdi — sessiz bir kapsam sızıntısı. `tumGorevleriGetir` içinde
 * `taskScope` kuralı uygulanır.
 */
export async function riskGirdisiSunucu(yetki: OrgYetki): Promise<RiskInput> {
  const gorevler = await tumGorevleriGetir(yetki)

  const [sprintRes, uyelikRes, ayarRes] = await Promise.all([
    yetki.admin.from('sprints').select('*').eq('organization_id', yetki.org.id),
    yetki.admin.from('organization_members').select('user_id').eq('organization_id', yetki.org.id),
    yetki.admin
      .from('automation_settings')
      .select('overload_threshold')
      .eq('organization_id', yetki.org.id)
      .maybeSingle(),
  ])

  const ids = (uyelikRes.data ?? []).map((u: { user_id: string }) => u.user_id)
  let members: Profile[] = []
  if (ids.length) {
    const { data } = await yetki.admin.from('profiles').select('*').in('id', ids)
    members = (data ?? []) as Profile[]
  }

  return {
    tasks: gorevler,
    sprints: (sprintRes.data ?? []) as Sprint[],
    members,
    overloadThreshold: ayarRes.data?.overload_threshold ?? 8,
  }
}
