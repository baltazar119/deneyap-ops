import { Profile } from './types'

export function formatTime(ts: string) {
  const d = new Date(ts)
  const now = new Date()
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  if (isToday) return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
  return (
    d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) +
    ' ' +
    d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
  )
}

export function avatarBg(id: string) {
  const colors = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#dc2626', '#0891b2', '#be185d']
  let n = 0
  for (let i = 0; i < id.length; i++) n = (n * 31 + id.charCodeAt(i)) % colors.length
  return colors[n]
}

export function getInitials(
  profile: { full_name?: string | null; username?: string | null } | null | undefined,
  fallback = '?'
) {
  const name = profile?.full_name ?? profile?.username ?? fallback
  return name.slice(0, 2).toUpperCase()
}

export function statusColor(status: string | null | undefined) {
  switch (status) {
    case 'online': return '#22c55e'
    case 'away': return '#f59e0b'
    case 'dnd': return '#ef4444'
    default: return '#94a3b8'
  }
}

export function statusLabel(status: string | null | undefined) {
  switch (status) {
    case 'online': return 'Çevrimiçi'
    case 'away': return 'Uzakta'
    case 'dnd': return 'Rahatsız Etme'
    default: return 'Çevrimdışı'
  }
}

/** Render <@uuid> mentions as @Name in display text */
export function renderMentions(
  content: string,
  profileMap: Record<string, Profile | null>
): string {
  return content.replace(/<@([a-f0-9-]{36})>/g, (_, uid) => {
    const p = profileMap[uid]
    return '@' + (p?.full_name ?? p?.username ?? 'kullanıcı')
  })
}

/** Parse @mention tags from content and return array of user IDs */
export function parseMentionIds(content: string): string[] {
  const pattern = /<@([a-f0-9-]{36})>/g
  const ids: string[] = []
  let match
  while ((match = pattern.exec(content)) !== null) ids.push(match[1])
  return ids
}
