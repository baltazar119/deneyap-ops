import { supabase } from '@/lib/supabase/client'
import type { RiskInput } from '@/lib/operationRisk'
import type { Task, Sprint, Profile } from '@/types/database'

/**
 * Risk girdisini TARAYICIDAN çeker. RLS aktif olduğu için kullanıcı zaten
 * yalnızca yetkili olduğu satırları görür.
 *
 * Sunucu karşılığı için `risk/sunucuVeri.ts` — orada RLS YOKTUR ve kapsam
 * elle uygulanmak zorundadır.
 */
export async function fetchRiskInput(orgId: string): Promise<RiskInput> {
  const [tasksRes, sprintsRes, membershipRes, settingsRes] = await Promise.all([
    supabase.from('tasks').select('*').eq('organization_id', orgId),
    supabase.from('sprints').select('*').eq('organization_id', orgId),
    supabase.from('organization_members').select('user_id').eq('organization_id', orgId),
    supabase
      .from('automation_settings')
      .select('overload_threshold')
      .eq('organization_id', orgId)
      .maybeSingle(),
  ])

  const memberIds = (membershipRes.data ?? []).map((m) => m.user_id)
  let members: Profile[] = []
  if (memberIds.length > 0) {
    const { data } = await supabase.from('profiles').select('*').in('id', memberIds)
    members = data ?? []
  }

  return {
    tasks: (tasksRes.data ?? []) as Task[],
    sprints: (sprintsRes.data ?? []) as Sprint[],
    members,
    overloadThreshold: settingsRes.data?.overload_threshold ?? 8,
  }
}

