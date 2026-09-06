import 'server-only'
import { tumGorevleriGetir } from '@/lib/server/taskQuery'
import { rolAdi } from '@/lib/roller'
import { raporKapsami } from './kapsam'
import { raporHesapla, type RaporVerisi, type Donem } from './hesapla'
import { yerelGun } from './donem'
import { computeRisk } from '@/lib/operationRisk'
import { riskGirdisiSunucu } from '@/lib/risk/sunucuVeri'
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

  const temel = raporHesapla({
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

  /* ── Risk bölümü ────────────────────────────────────────────────────────
   *
   * 'risk' uzun süre `RaporBolumu` enum'unda TANIMLI ama hiç ÜRETİLMEYEN bir
   * değerdi; artık gerçekten dolduruluyor ve PDF/Excel'e girebiliyor.
   *
   * Risk DÖNEME TABİ DEĞİL — anlık durumu anlatır. "Geçen ay" seçildiğinde
   * "şu an neyin riskli olduğu" değişmemeli.
   */
  if (!kapsam.bolumler.has('risk')) return temel

  try {
    const girdi = await riskGirdisiSunucu(yetki)
    const r = computeRisk(girdi)
    return {
      ...temel,
      risk: {
        skor: r.score,
        seviye: r.level,
        baslik: r.headline,
        // Kişi bazlı veri kapalıysa (Yetkili Yönetici) sinyal metinlerinde
        // isim geçebileceği için o bölüm hiç eklenmez.
        sinyaller: kapsam.kisiBazliVeri
          ? r.signals.map(x => ({ baslik: x.title, detay: x.detail, seviye: x.level, eylem: x.action }))
          : [],
        iller: r.provinces.map(x => ({
          il: x.il, skor: x.score, seviye: x.level,
          acik: x.openCount, geciken: x.overdueCount,
        })),
      },
    }
  } catch (err) {
    // Risk hesabı raporun tamamını düşürmemeli — bölüm boş kalır.
    console.error('[rapor/veri] risk hesaplanamadı:', err)
    return temel
  }
}
