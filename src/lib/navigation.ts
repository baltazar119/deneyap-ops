import {
  LayoutDashboard, CheckSquare, Columns2, Calendar, GitBranch, FileBarChart,
  Zap, FolderOpen, Sparkles, MessageSquare, Users, User,
  LayoutGrid, MessageCircle, ListTodo, Video, Settings, ShieldAlert,
  type LucideIcon,
} from 'lucide-react'
import type { OrgRole } from '@/types/database'

export type NavGrup = 'ana' | 'is' | 'izleme' | 'ekip' | 'kisisel'

export interface NavLink {
  href: string
  label: string
  icon: LucideIcon
  /** Kenar çubuğunda gruplar arasına ayırıcı çizilir */
  grup: NavGrup
}

export const NAV_ICONS: Record<string, LucideIcon> = {
  Panel: LayoutDashboard,
  Görevler: CheckSquare,
  Kanban: Columns2,
  'Operasyon Riski': ShieldAlert,
  Raporlar: FileBarChart,
  Takvim: Calendar,
  Timeline: GitBranch,
  Sprintler: Zap,
  Dosyalar: FolderOpen,
  'AI Asistan': Sparkles,
  Danışmanlık: MessageSquare,
  Ekip: Users,
  Sohbet: MessageCircle,
  Toplantılar: Video,
  Listelerim: ListTodo,
  Profilim: User,
  Panelim: LayoutGrid,
  Ayarlar: Settings,
}

/**
 * Role + plan'a göre gezinme bağlantılarını üretir. DesktopSidebar ve
 * MobileNavigation aynı listeyi kullanır, böylece menü iki yerde ayrı ayrı
 * bakım gerektirmez.
 */
/**
 * Rol → menü. Sıralama rolün İŞ AKIŞINI izler, alfabetik ya da rastgele değil.
 *
 * PRD'deki akışlar:
 *   Merkez Yönetici : görev oluştur → ata → termin belirle → panelden izle
 *   İl Sorumlusu    : kendi görevlerini gör → durumu güncelle → tamamla
 *   Koordinatör     : gecikenleri filtrele → sorumluyu gör → önceliklendir → rapor al
 *   Yetkili Yönetici: oranları ve gecikmeleri raporlardan izle
 *
 * Bu yüzden her rolün ANA EKRANI listenin başındadır. Önceden İl Sorumlusu'nun
 * "Panelim"i listenin ortasında kalıyordu.
 *
 * `grup` alanı kenar çubuğunda ayırıcı çizgi çizmek için; aynı gruptaki
 * öğeler bitişik görünür.
 */
export function getNavLinks({ base, role, isPro }: { base: string; role: OrgRole; isPro: boolean }): NavLink[] {
  const g = (grup: NavLink['grup']) =>
    (href: string, label: string): NavLink => ({ href, label, icon: NAV_ICONS[label] ?? User, grup })

  const ana     = g('ana')
  const is      = g('is')
  const izleme  = g('izleme')
  const ekip    = g('ekip')
  const kisisel = g('kisisel')

  /* ── Merkez Operasyon Ekibi / Koordinatör ── */
  if (role === 'owner' || role === 'admin') {
    return [
      ana(`${base}/dashboard`, 'Panel'),

      is(`${base}/tasks`, 'Görevler'),
      is(`${base}/kanban`, 'Kanban'),
      is(`${base}/calendar`, 'Takvim'),
      is(`${base}/timeline`, 'Timeline'),
      is(`${base}/sprints`, 'Sprintler'),

      izleme(`${base}/risk`, 'Operasyon Riski'),
      izleme(`${base}/raporlar`, 'Raporlar'),

      ekip(`${base}/members`, 'Ekip'),
      ekip(`${base}/chat`, 'Sohbet'),
      ekip(`${base}/meetings`, 'Toplantılar'),
      ekip(`${base}/files`, 'Dosyalar'),
      ...(isPro ? [ekip(`${base}/ai-assistant`, 'AI Asistan')] : []),
      ...(isPro ? [ekip(`${base}/consultant`, 'Danışmanlık')] : []),

      kisisel(`${base}/checklists`, 'Listelerim'),
      kisisel(`${base}/profile`, 'Profilim'),
      kisisel(`${base}/settings`, 'Ayarlar'),
    ]
  }

  /* ── Yetkili Yönetici — salt izleme ── */
  if (role === 'viewer') {
    return [
      ana(`${base}/dashboard`, 'Panel'),

      // Bu rolün asıl aracı raporlar; görev listesi salt okunur destek
      izleme(`${base}/raporlar`, 'Raporlar'),
      izleme(`${base}/risk`, 'Operasyon Riski'),

      is(`${base}/tasks`, 'Görevler'),
      is(`${base}/timeline`, 'Timeline'),

      kisisel(`${base}/profile`, 'Profilim'),
    ]
  }

  /* ── Danışman ── */
  if (role === 'consultant') {
    return [
      ...(isPro ? [ana(`${base}/consultant`, 'Danışmanlık')] : []),
      kisisel(`${base}/profile`, 'Profilim'),
    ]
  }

  /* ── İl Sorumlusu ── */
  return [
    // Akışın başladığı yer: "kendi görevlerini görür"
    ana(`${base}/me`, 'Panelim'),

    // Görev listesi salt okunur: kapsam taskScope ile kendi ili, yazma
    // aksiyonları gizli. Kuralı `gorevListesiGorebilirMi` taşıyor.
    is(`${base}/tasks`, 'Görevler'),
    is(`${base}/kanban`, 'Kanban'),
    is(`${base}/calendar`, 'Takvim'),
    is(`${base}/timeline`, 'Timeline'),

    izleme(`${base}/raporlar`, 'Raporlar'),

    ekip(`${base}/chat`, 'Sohbet'),
    ekip(`${base}/meetings`, 'Toplantılar'),
    ekip(`${base}/files`, 'Dosyalar'),

    kisisel(`${base}/checklists`, 'Listelerim'),
    kisisel(`${base}/profile`, 'Profilim'),
  ]
}

/** Rolün giriş sonrası gideceği ana ekran */
export function anaEkran(base: string, role: OrgRole): string {
  if (role === 'member') return `${base}/me`
  if (role === 'consultant') return `${base}/consultant`
  return `${base}/dashboard`
}

export const ROLE_LABEL: Record<OrgRole, string> = {
  owner: 'Merkez Operasyon', admin: 'Koordinatör', member: 'İl Sorumlusu',
  viewer: 'Yetkili Yönetici', consultant: 'Danışman',
}

export const ROLE_COLOR: Record<OrgRole, string> = {
  owner: '#f59e0b', admin: '#2abbd5', member: '#6ee7b7',
  viewer: '#5eead4', consultant: '#a78bfa',
}
