import 'server-only'
import { tumGorevleriGetir } from '@/lib/server/taskQuery'
import { rolAdi } from '@/lib/roller'
import { raporKapsami } from './kapsam'
import { raporHesapla, type RaporVerisi, type Donem } from './hesapla'
import { yerelGun } from './donem'
import type { OrgYetki } from '@/lib/server/apiAuth'

/**
 * Rapor verisini veritabanından toplar ve saf hesaplayıcıya devreder.
 *
 * Rol ve il HİÇBİR ZAMAN istek gövdesinden alınmaz — organization_members'tan
 * çözülür (apiAuth bunu zaten yapmış olur). İstemci kapsamını genişletemez.
 */
export async function raporVerisi(
  yetki: OrgYetki,
  donem: Donem,
): Promise<RaporVerisi> {
  const kapsam = raporKapsami(yetki.rol, yetki.il)

  // taskQuery zaten rol kapsamını uyguluyor; kapsam.ilFiltresi ikinci katman
  const gorevler = await tumGorevleriGetir(yetki)

  const { data: uyelikler } = await yetki.admin
    .from('organization_members')
    .select('user_id, il')
    .eq('organization_id', yetki.org.id)

  const ids = (uyelikler ?? []).map((u: { user_id: string }) => u.user_id)
  const { data: profiller } = ids.length
    ? await yetki.admin.from('profiles').select('id, full_name').in('id', ids)
    : { data: [] }

  const uyeAdlari: Record<string, string> = {}
  ;(profiller ?? []).forEach((p: { id: string; full_name: string | null }) => {
    uyeAdlari[p.id] = p.full_name ?? 'İsimsiz'
  })
  const uyeIlleri: Record<string, string | null> = {}
  ;(uyelikler ?? []).forEach((u: { user_id: string; il: string | null }) => {
    uyeIlleri[u.user_id] = u.il
  })

  const { data: profil } = await yetki.admin
    .from('profiles').select('full_name').eq('id', yetki.user.id).maybeSingle()

  return raporHesapla({
    gorevler,
    kapsam,
    donem,
    uyeAdlari,
    uyeIlleri,
    orgAd: yetki.org.name,
    uretenAd: profil?.full_name ?? yetki.user.email ?? 'Kullanıcı',
    uretenRol: yetki.rol,
    uretenRolAdi: rolAdi(yetki.rol),
    bugun: yerelGun(new Date()),
  })
}
