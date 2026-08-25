'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { AppNotification, NotificationType } from '@/types/database'

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Az önce'
  if (mins < 60) return `${mins} dk`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} sa`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days} gün`
  return new Date(dateStr).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
}

// ── Config maps ───────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<NotificationType, { bg: string; color: string; label: string; abbr: string }> = {
  task:   { bg: '#dbeafe', color: '#1e40af', label: 'Görev',  abbr: 'G' },
  review: { bg: '#ede9fe', color: '#5b21b6', label: 'Review', abbr: 'R' },
  sprint: { bg: '#dcfce7', color: '#166534', label: 'Sprint', abbr: 'S' },
  system: { bg: '#fef3c7', color: '#92400e', label: 'Sistem', abbr: '!' },
}

const EVENT_ABBR: Record<string, string> = {
  task_assigned:       'A',
  task_status_changed: '~',
  task_overdue:        '!',
  review_reply:        'R',
  mention:             '@',
  annotation_resolved: '✓',
  new_version:         'N',
  sprint_changed:      'S',
  // Otomasyon event'leri
  task_due_soon:       '⏰',
  sprint_ending_soon:  '🏁',
  meeting_created:     '📅',
  meeting_cancelled:   '❌',
  meeting_reminder:    '🔔',
  member_overloaded:   '⚡',
}

type FilterKey = 'all' | NotificationType

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  role: 'admin' | 'member' | 'consultant'
  orgId?: string
}

export default function NotificationCenter({ role, orgId }: Props) {
  const [userId, setUserId]             = useState<string | null>(null)
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [open, setOpen]                 = useState(false)
  const [filter, setFilter]             = useState<FilterKey>('all')
  const [loading, setLoading]           = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  // ── Get user (getSession reads from localStorage — no network call) ────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) setUserId(session.user.id)
    })
  }, [])

  // ── Load notifications ────────────────────────────────────────────────────
  const loadNotifications = useCallback(async (uid: string) => {
    setLoading(true)
    let query = supabase
      .from('notifications')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(60)
    if (orgId) query = query.eq('organization_id', orgId)
    const { data } = await query
    setNotifications((data || []) as AppNotification[])
    setLoading(false)
  }, [orgId])

  // ── Real-time subscription ─────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return

    loadNotifications(userId)

    const channel = supabase
      .channel(`notif-center-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          const newNotif = payload.new as AppNotification
          if (orgId && newNotif.organization_id && newNotif.organization_id !== orgId) return
          setNotifications((prev) => [newNotif, ...prev])
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          setNotifications((prev) =>
            prev.map((n) => (n.id === (payload.new as AppNotification).id ? (payload.new as AppNotification) : n))
          )
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId, loadNotifications])

  // ── Click-outside to close ────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // ── Role-based + tab filtering ─────────────────────────────────────────────
  function getVisible(): AppNotification[] {
    let result = notifications
    if (role === 'consultant') {
      result = result.filter((n) => n.type === 'review' || n.type === 'system')
    } else if (role === 'member') {
      result = result.filter((n) => n.type !== 'review')
    }
    if (filter !== 'all') {
      result = result.filter((n) => n.type === filter)
    }
    return result
  }

  function getFilterTabs(): { key: FilterKey; label: string }[] {
    const base: { key: FilterKey; label: string }[] = [
      { key: 'all',    label: 'Tümü'   },
    ]
    if (role === 'admin' || role === 'member') {
      base.push({ key: 'task',   label: 'Görev'  })
      base.push({ key: 'sprint', label: 'Sprint' })
    }
    if (role === 'admin' || role === 'consultant') {
      base.push({ key: 'review', label: 'Review' })
    }
    base.push({ key: 'system', label: 'Sistem' })
    return base
  }

  function unreadCountForFilter(key: FilterKey): number {
    let result = notifications
    if (role === 'consultant') result = result.filter((n) => n.type === 'review' || n.type === 'system')
    else if (role === 'member') result = result.filter((n) => n.type !== 'review')
    if (key !== 'all') result = result.filter((n) => n.type === key)
    return result.filter((n) => !n.is_read).length
  }

  const visible      = getVisible()
  const unreadTotal  = unreadCountForFilter('all')
  const tabs         = getFilterTabs()

  // ── Actions ───────────────────────────────────────────────────────────────
  async function markAsRead(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)))
    await supabase.from('notifications').update({ is_read: true }).eq('id', id)
  }

  async function markAllAsRead() {
    if (!userId) return
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false)
  }

  async function deleteNotification(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    setNotifications((prev) => prev.filter((n) => n.id !== id))
    await supabase.from('notifications').delete().eq('id', id)
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div ref={panelRef} style={{ position: 'relative' }}>

      {/* ── Bell button ── */}
      <button
        onClick={() => setOpen((p) => !p)}
        title="Bildirimler"
        style={{
          position: 'relative',
          width: 36,
          height: 36,
          borderRadius: 10,
          background: open ? 'rgba(34,136,201,0.22)' : 'rgba(255,255,255,0.06)',
          border: `1px solid ${open ? 'rgba(34,136,201,0.4)' : 'rgba(255,255,255,0.1)'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          color: open ? '#7acfe6' : 'rgba(255,255,255,0.6)',
          transition: 'all 0.15s',
        }}
        onMouseEnter={(e) => {
          if (!open) {
            e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
            e.currentTarget.style.color = 'rgba(255,255,255,0.9)'
          }
        }}
        onMouseLeave={(e) => {
          if (!open) {
            e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
            e.currentTarget.style.color = 'rgba(255,255,255,0.6)'
          }
        }}
      >
        {/* Bell SVG */}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>

        {/* Unread badge */}
        {unreadTotal > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -5,
              right: -5,
              minWidth: 17,
              height: 17,
              borderRadius: 9,
              background: '#dc2626',
              color: '#fff',
              fontSize: 9,
              fontWeight: 900,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 4px',
              border: '2px solid #0d1a2a',
              letterSpacing: '-0.3px',
              lineHeight: 1,
            }}
          >
            {unreadTotal > 99 ? '99+' : unreadTotal}
          </span>
        )}
      </button>

      {/* ── Backdrop ── */}
      <div
        onClick={() => setOpen(false)}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(13,26,42,0.35)',
          backdropFilter: 'blur(2px)',
          zIndex: 48,
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 0.2s',
        }}
      />

      {/* ── Slide-in panel ── */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 'min(380px, 100vw)',
          background: '#fff',
          boxShadow: '-4px 0 48px rgba(13,26,42,0.18)',
          zIndex: 49,
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >

        {/* ── Panel header ── */}
        <div
          style={{
            padding: '16px 18px',
            background: '#eef3f8',
            borderBottom: '1px solid #d0dce8',
            borderLeft: '3px solid #2563eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                background: '#dbeafe',
                border: '1px solid #bfdbfe',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1e40af" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </div>
            <div>
              <p style={{ color: '#0f172a', fontWeight: 700, fontSize: 15, margin: 0, lineHeight: 1.2 }}>
                Bildirimler
              </p>
              <p style={{ color: '#64748b', fontSize: 11, margin: 0 }}>
                {unreadTotal > 0 ? `${unreadTotal} okunmamış` : 'Hepsi okundu'}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {unreadTotal > 0 && (
              <button
                onClick={markAllAsRead}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '5px 10px',
                  borderRadius: 8,
                  background: '#dbeafe',
                  color: '#1e40af',
                  border: '1px solid #bfdbfe',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#bfdbfe' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#dbeafe' }}
              >
                Tümünü Oku
              </button>
            )}
            <button
              onClick={() => setOpen(false)}
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#f1f5f9',
                border: '1px solid #e2e8f0',
                color: '#64748b',
                cursor: 'pointer',
                fontSize: 16,
                lineHeight: 1,
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#fee2e2'
                e.currentTarget.style.color = '#dc2626'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#f1f5f9'
                e.currentTarget.style.color = '#64748b'
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* ── Filter tabs ── */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid rgba(0,0,0,0.07)',
            background: '#f8fafc',
            overflowX: 'auto',
            flexShrink: 0,
            scrollbarWidth: 'none',
          }}
        >
          {tabs.map((tab) => {
            const cnt = unreadCountForFilter(tab.key)
            const active = filter === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '10px 14px',
                  fontSize: 12,
                  fontWeight: active ? 700 : 500,
                  color: active ? '#1e40af' : '#64748b',
                  background: 'none',
                  border: 'none',
                  borderBottom: active ? '2px solid #2563eb' : '2px solid transparent',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s',
                  flexShrink: 0,
                }}
              >
                {tab.label}
                {cnt > 0 && (
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 900,
                      background: active ? '#2563eb' : '#e2e8f0',
                      color: active ? '#fff' : '#64748b',
                      padding: '1px 5px',
                      borderRadius: 10,
                      lineHeight: 1.6,
                    }}
                  >
                    {cnt}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* ── Notification list ── */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[1, 2, 3].map((i) => (
                <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: '#e2e8f0', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ height: 13, background: '#e2e8f0', borderRadius: 6, marginBottom: 6, width: '70%' }} />
                    <div style={{ height: 11, background: '#f1f5f9', borderRadius: 5, width: '90%' }} />
                  </div>
                </div>
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div style={{ padding: '56px 24px', textAlign: 'center' }}>
              <div style={{ width: 52, height: 52, borderRadius: 16, background: '#eef3f8', margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
              </div>
              <p style={{ fontWeight: 700, fontSize: 14, color: '#0d1a2a', margin: '0 0 6px' }}>
                Bildirim yok
              </p>
              <p style={{ fontSize: 12, color: '#94a3b8', margin: 0, lineHeight: 1.6 }}>
                {filter === 'all'
                  ? 'Henüz hiç bildirim almadınız.'
                  : `Bu kategoride bildirim bulunmuyor.`}
              </p>
            </div>
          ) : (
            visible.map((n) => {
              const cfg = TYPE_CONFIG[n.type]
              return (
                <div
                  key={n.id}
                  onClick={() => {
                    markAsRead(n.id)
                    if (n.link) window.location.href = n.link
                  }}
                  style={{
                    padding: '13px 18px',
                    borderBottom: '1px solid rgba(0,0,0,0.05)',
                    cursor: n.link ? 'pointer' : 'default',
                    background: n.is_read ? '#fff' : 'rgba(34,136,201,0.04)',
                    display: 'flex',
                    gap: 12,
                    alignItems: 'flex-start',
                    transition: 'background 0.1s',
                    position: 'relative',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = n.is_read ? '#f8fafc' : 'rgba(34,136,201,0.07)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = n.is_read ? '#fff' : 'rgba(34,136,201,0.04)' }}
                >
                  {/* Type icon */}
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: cfg.bg,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 13,
                      fontWeight: 800,
                      color: cfg.color,
                      flexShrink: 0,
                      letterSpacing: '-0.5px',
                    }}
                  >
                    {EVENT_ABBR[n.event_type] ?? cfg.abbr}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
                      <p
                        style={{
                          fontWeight: n.is_read ? 500 : 700,
                          fontSize: 13,
                          color: '#0d1a2a',
                          margin: 0,
                          lineHeight: 1.4,
                        }}
                      >
                        {n.title}
                      </p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                        <span style={{ fontSize: 10, color: '#94a3b8', whiteSpace: 'nowrap' }}>
                          {timeAgo(n.created_at)}
                        </span>
                        {!n.is_read && (
                          <span
                            style={{
                              width: 7,
                              height: 7,
                              borderRadius: '50%',
                              background: cfg.color,
                              flexShrink: 0,
                            }}
                          />
                        )}
                      </div>
                    </div>

                    {n.description && (
                      <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 3px', lineHeight: 1.45 }}>
                        {n.description}
                      </p>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {/* Type badge */}
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: 5,
                          background: cfg.bg,
                          color: cfg.color,
                          letterSpacing: '0.3px',
                        }}
                      >
                        {cfg.label.toUpperCase()}
                      </span>
                      {n.actor_name && (
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>
                          {n.actor_name}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Delete button (visible on hover) */}
                  <button
                    onClick={(e) => deleteNotification(n.id, e)}
                    title="Sil"
                    style={{
                      position: 'absolute',
                      top: 10,
                      right: 14,
                      width: 20,
                      height: 20,
                      borderRadius: 6,
                      background: 'transparent',
                      border: 'none',
                      color: '#cbd5e1',
                      cursor: 'pointer',
                      fontSize: 12,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: 0,
                      transition: 'opacity 0.15s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.opacity = '1' }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = '#cbd5e1'; e.currentTarget.style.opacity = '0' }}
                    onFocus={(e) => { e.currentTarget.style.opacity = '1' }}
                  >
                    ✕
                  </button>
                </div>
              )
            })
          )}

          {/* Bottom padding */}
          <div style={{ height: 24 }} />
        </div>

        {/* ── Footer ── */}
        <div
          style={{
            padding: '10px 18px',
            borderTop: '1px solid rgba(0,0,0,0.06)',
            background: '#f8fafc',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 11, color: '#94a3b8' }}>
            {visible.length} bildirim gösteriliyor
          </span>
          {visible.some((n) => n.is_read) && (
            <button
              onClick={async () => {
                if (!userId) return
                const ids = visible.filter((n) => n.is_read).map((n) => n.id)
                setNotifications((prev) => prev.filter((n) => !ids.includes(n.id)))
                for (const id of ids) {
                  await supabase.from('notifications').delete().eq('id', id)
                }
              }}
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: '#94a3b8',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#dc2626' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#94a3b8' }}
            >
              Okunanları temizle
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
