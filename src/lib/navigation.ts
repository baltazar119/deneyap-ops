import {
  LayoutDashboard, CheckSquare, Columns2, Calendar, GitBranch,
  Zap, FolderOpen, Sparkles, MessageSquare, Users, User,
  LayoutGrid, MessageCircle, ListTodo, Video, Settings, ShieldAlert,
  type LucideIcon,
} from 'lucide-react'
import type { OrgRole } from '@/types/database'

export interface NavLink {
  href: string
  label: string
  icon: LucideIcon
}

export const NAV_ICONS: Record<string, LucideIcon> = {
  Panel: LayoutDashboard,
  Görevler: CheckSquare,
  Kanban: Columns2,
  'Operasyon Riski': ShieldAlert,
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
export function getNavLinks({ base, role, isPro }: { base: string; role: OrgRole; isPro: boolean }): NavLink[] {
  const withIcon = (href: string, label: string): NavLink => ({ href, label, icon: NAV_ICONS[label] ?? User })

  const isAdminOrOwner = role === 'admin' || role === 'owner'

  if (isAdminOrOwner) {
    return [
      withIcon(`${base}/dashboard`, 'Panel'),
      withIcon(`${base}/tasks`, 'Görevler'),
      withIcon(`${base}/kanban`, 'Kanban'),
      withIcon(`${base}/risk`, 'Operasyon Riski'),
      withIcon(`${base}/calendar`, 'Takvim'),
      withIcon(`${base}/timeline`, 'Timeline'),
      withIcon(`${base}/sprints`, 'Sprintler'),
      withIcon(`${base}/files`, 'Dosyalar'),
      ...(isPro ? [withIcon(`${base}/ai-assistant`, 'AI Asistan')] : []),
      ...(isPro ? [withIcon(`${base}/consultant`, 'Danışmanlık')] : []),
      withIcon(`${base}/members`, 'Ekip'),
      withIcon(`${base}/chat`, 'Sohbet'),
      withIcon(`${base}/meetings`, 'Toplantılar'),
      withIcon(`${base}/checklists`, 'Listelerim'),
      withIcon(`${base}/profile`, 'Profilim'),
      withIcon(`${base}/settings`, 'Ayarlar'),
    ]
  }

  if (role === 'consultant') {
    return [
      ...(isPro ? [withIcon(`${base}/consultant`, 'Danışmanlık')] : []),
      withIcon(`${base}/profile`, 'Profilim'),
    ]
  }

  return [
    withIcon(`${base}/kanban`, 'Kanban'),
    withIcon(`${base}/calendar`, 'Takvim'),
    withIcon(`${base}/timeline`, 'Timeline'),
    withIcon(`${base}/files`, 'Dosyalar'),
    withIcon(`${base}/me`, 'Panelim'),
    withIcon(`${base}/chat`, 'Sohbet'),
    withIcon(`${base}/meetings`, 'Toplantılar'),
    withIcon(`${base}/checklists`, 'Listelerim'),
    withIcon(`${base}/profile`, 'Profilim'),
  ]
}

export const ROLE_LABEL: Record<OrgRole, string> = {
  owner: 'Sahip', admin: 'Admin', consultant: 'Danışman', member: 'Üye',
}

export const ROLE_COLOR: Record<OrgRole, string> = {
  owner: '#f59e0b', admin: '#2abbd5', consultant: '#a78bfa', member: '#6ee7b7',
}
