import type { OrgRole } from '@/types/database'

/**
 * PRD rolleri ↔ uygulama rolleri — TEK KAYNAK.
 *
 * PRD dört rol tanımlıyor (Merkez Operasyon Ekibi, İl Sorumlusu,
 * Koordinatör, Yetkili Yönetici). Uygulamanın veritabanındaki `org_role`
 * enum'u bunların birebir karşılığını taşıyor:
 *
 *   owner   → Merkez Operasyon Ekibi   (görev oluşturur, atar, her şeyi yönetir)
 *   admin   → Koordinatör              (tüm görevleri izler, düzenler)
 *   member  → İl Sorumlusu             (yalnızca kendi ili/görevleri)
 *   viewer  → Yetkili Yönetici         (salt okunur: raporlar, oranlar)
 *
 * `consultant` PRD'de yok — Tarlis'ten gelen UI danışmanlığı rolü, ayrı
 * bir ekranı var, burada listelenmiyor ama enum'da duruyor.
 */

export interface RolTanimi {
  role: OrgRole
  /** PRD'deki rol adı — arayüzde bu gösterilir */
  ad: string
  aciklama: string
  /** Görev oluşturabilir / atayabilir mi */
  yazabilir: boolean
}

export const ROLLER: RolTanimi[] = [
  {
    role: 'owner',
    ad: 'Merkez Operasyon Ekibi',
    aciklama: 'Görevleri oluşturur, ilgili il sorumlularına atar ve terminleri merkezi olarak takip eder.',
    yazabilir: true,
  },
  {
    role: 'admin',
    ad: 'Koordinatör',
    aciklama: 'Geciken ve kritik görevleri izler; sorumlu, il ve dönem bazında operasyonu yönetir.',
    yazabilir: true,
  },
  {
    role: 'member',
    ad: 'İl Sorumlusu',
    aciklama: 'Kendisine atanan görevleri görür, ilerleme durumunu günceller ve tamamlanma bilgisini iletir.',
    yazabilir: false,
  },
  {
    role: 'viewer',
    ad: 'Yetkili Yönetici',
    aciklama: 'Tamamlanma oranlarını ve gecikmeleri raporlar üzerinden izler. Değişiklik yapamaz.',
    yazabilir: false,
  },
]

const ROL_HARITASI: Partial<Record<OrgRole, RolTanimi>> = ROLLER.reduce(
  (acc, r) => { acc[r.role] = r; return acc },
  {} as Partial<Record<OrgRole, RolTanimi>>,
)

/** Arayüzde gösterilecek rol adı — PRD terminolojisi */
export function rolAdi(role: OrgRole | null | undefined): string {
  if (!role) return 'Üye'
  if (role === 'consultant') return 'Danışman'
  return ROL_HARITASI[role]?.ad ?? 'Üye'
}

export function rolAciklamasi(role: OrgRole | null | undefined): string {
  return role ? (ROL_HARITASI[role]?.aciklama ?? '') : ''
}

/** Görev oluşturma/düzenleme yetkisi (RLS'teki is_org_admin ile aynı kural) */
export function yazabilirMi(role: OrgRole | null | undefined): boolean {
  return role === 'owner' || role === 'admin'
}

/** Raporları (Panel, Operasyon Riski, Timeline) görebilen roller */
export function raporGorebilirMi(role: OrgRole | null | undefined): boolean {
  return role === 'owner' || role === 'admin' || role === 'viewer'
}

/** Salt-okunur rol — arayüzde tüm aksiyon butonları gizlenir */
export function saltOkunurMu(role: OrgRole | null | undefined): boolean {
  return role === 'viewer'
}
