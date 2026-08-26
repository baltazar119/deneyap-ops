'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useRef, useState } from 'react'
import { applyTaskScope } from '@/lib/taskScope'
import { TASK_TYPE_LABELS } from '@/lib/taskTypes'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { useOrg } from '@/lib/supabase/orgContext'
import { getCachedData, setCachedData } from '@/lib/pageDataCache'
import { downloadAllICS } from '@/lib/ics'
import { useIsMobile } from '@/lib/useIsMobile'
import type { Task, TaskStatus } from '@/types/database'

// ── Sabitler ────────────────────────────────────────────────────────────────────

const TR_DAYS_SHORT = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pa']
const TR_DAYS_MED   = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']
const TR_DAYS_FULL  = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']
const TR_MONTHS     = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık']
const HOURS         = Array.from({ length: 24 }, (_, i) => i) // 00–23

const STATUS_CARD: Record<TaskStatus, { bg: string; accent: string; text: string; sub: string }> = {
  backlog:  { bg: '#ede9fe', accent: '#7c3aed', text: '#3b0764', sub: '#6d28d9' },
  doing:    { bg: '#dbeafe', accent: '#2563eb', text: '#1e3a8a', sub: '#3b82f6' },
  testing:  { bg: '#fef3c7', accent: '#d97706', text: '#78350f', sub: '#f59e0b' },
  blocked:  { bg: '#ffe4e6', accent: '#e11d48', text: '#881337', sub: '#f43f5e' },
  done:     { bg: '#dcfce7', accent: '#16a34a', text: '#14532d', sub: '#22c55e' },
}

const STATUS_META: Record<TaskStatus, { label: string; bg: string; text: string; bar: string }> = {
  backlog:  { label: 'Beklemede',  bg: '#ede9fe', text: '#4c1d95', bar: '#7c3aed' },
  doing:    { label: 'Yapılıyor',  bg: '#dbeafe', text: '#1e3a8a', bar: '#2563eb' },
  testing:  { label: 'Test',       bg: '#fef3c7', text: '#78350f', bar: '#d97706' },
  blocked:  { label: 'Bloke',      bg: '#ffe4e6', text: '#881337', bar: '#e11d48' },
  done:     { label: 'Tamamlandı', bg: '#dcfce7', text: '#14532d', bar: '#16a34a' },
}

const PRIORITY_META: Record<string, { label: string; color: string }> = {
  critical: { label: 'Kritik',  color: '#dc2626' },
  high:     { label: 'Yüksek', color: '#d97706' },
  normal:   { label: 'Normal', color: '#2288c9' },
  low:      { label: 'Düşük',  color: '#9ca3af' },
}


// ── Yardımcı ─────────────────────────────────────────────────────────────────

function getWeekdayMon(d: Date) { return (d.getDay() + 6) % 7 }
function startOfWeekMon(date: Date): Date {
  const d = new Date(date); d.setDate(d.getDate() - getWeekdayMon(d)); d.setHours(0,0,0,0); return d
}
function addDays(date: Date, n: number): Date {
  const d = new Date(date); d.setDate(d.getDate() + n); return d
}
function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

interface TaskRange { start: Date; end: Date }
function parseLocalDate(s: string): Date {
  // 'YYYY-MM-DD' → local midnight (avoids UTC-to-local offset)
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(y, m - 1, d); dt.setHours(0,0,0,0); return dt
}
function getEffectiveRange(task: Task): TaskRange | null {
  if (!task.start_date && !task.due_date) return null
  let start: Date, end: Date
  if (task.start_date && task.due_date) { start = parseLocalDate(task.start_date); end = parseLocalDate(task.due_date) }
  else if (task.due_date) { start = end = parseLocalDate(task.due_date) }
  else { start = end = parseLocalDate(task.start_date!) }
  if (end < start) end = start
  return { start, end }
}
function fmtShort(d: Date) { return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) }
function taskInDay(task: Task, day: Date): boolean {
  const r = getEffectiveRange(task); if (!r) return false
  const ds = new Date(day); ds.setHours(0,0,0,0)
  const de = new Date(day); de.setHours(23,59,59,999)
  return r.start <= de && r.end >= ds
}

interface TaskWithAssignee extends Task { assigneeName?: string; assigneeAvatarUrl?: string | null }

interface CalendarEvent {
  id: string
  title: string
  organization_id: string
  created_by: string
  assignee_id: string | null
  event_date: string   // YYYY-MM-DD
  is_all_day: boolean
  start_slot: number | null  // 0–47
  end_slot: number | null    // 0–47
  notes: string | null
  created_at: string
}

// ── Mini Calendar Sidebar (Figma referansı) ───────────────────────────────────

function CalendarSidebar({
  tasks, calendarEvents, viewDay, view, onDayClick,
}: {
  tasks: TaskWithAssignee[]
  calendarEvents: CalendarEvent[]
  viewDay: Date
  view: 'month' | 'week' | 'day'
  onDayClick: (d: Date) => void
}) {
  const today = new Date()
  const [miniYear, setMiniYear]   = useState(viewDay.getFullYear())
  const [miniMonth, setMiniMonth] = useState(viewDay.getMonth())

  const fd = new Date(miniYear, miniMonth, 1), ld = new Date(miniYear, miniMonth + 1, 0)
  const offset = getWeekdayMon(fd), total = ld.getDate()
  const miniCells: (number | null)[] = [...Array(offset).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)]
  while (miniCells.length % 7 !== 0) miniCells.push(null)

  const taskDays = new Set<string>()
  const statusByDay: Record<string, Set<TaskStatus>> = {}
  for (const task of tasks) {
    const r = getEffectiveRange(task); if (!r) continue
    const ms = new Date(miniYear, miniMonth, 1), me = new Date(miniYear, miniMonth + 1, 0)
    if (r.end < ms || r.start > me) continue
    const cs = r.start < ms ? 1 : r.start.getDate()
    const ce = r.end > me ? total : r.end.getDate()
    for (let d = cs; d <= ce; d++) {
      taskDays.add(String(d))
      if (!statusByDay[d]) statusByDay[d] = new Set()
      statusByDay[d].add(task.status)
    }
  }
  // Mini takvimde etkinlik günlerine de nokta
  for (const ev of calendarEvents) {
    const d = parseLocalDate(ev.event_date)
    if (d.getFullYear() === miniYear && d.getMonth() === miniMonth) taskDays.add(String(d.getDate()))
  }

  const isCurrentMiniMonth = miniYear === today.getFullYear() && miniMonth === today.getMonth()

  const now = new Date(); now.setHours(0,0,0,0)

  // Yaklaşan: görevler + etkinlikler birlikte sıralı
  type UpcomingItem =
    | { kind: 'task'; task: TaskWithAssignee; date: Date }
    | { kind: 'event'; event: CalendarEvent; date: Date }
  const upcomingItems: UpcomingItem[] = [
    ...tasks
      .filter(t => { const r = getEffectiveRange(t); if (!r) return false; return r.end >= now && t.status !== 'done' })
      .map(t => ({ kind: 'task' as const, task: t, date: getEffectiveRange(t)!.start })),
    ...calendarEvents
      .filter(e => parseLocalDate(e.event_date) >= now)
      .map(e => ({ kind: 'event' as const, event: e, date: parseLocalDate(e.event_date) })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, 5)

  const upcoming = tasks
    .filter(t => { const r = getEffectiveRange(t); if (!r) return false; return r.end >= now && t.status !== 'done' })
    .sort((a, b) => { const ra = getEffectiveRange(a), rb = getEffectiveRange(b); if (!ra||!rb) return 0; return ra.start.getTime() - rb.start.getTime() })
    .slice(0, 4)

  const statusCounts = Object.keys(STATUS_META).reduce((acc, k) => {
    acc[k as TaskStatus] = tasks.filter(t => t.status === k).length
    return acc
  }, {} as Record<TaskStatus, number>)

  function prevMini() { if (miniMonth===0){setMiniYear(y=>y-1);setMiniMonth(11)}else setMiniMonth(m=>m-1) }
  function nextMini() { if (miniMonth===11){setMiniYear(y=>y+1);setMiniMonth(0)}else setMiniMonth(m=>m+1) }

  return (
    <div style={{ width: 360, flexShrink: 0, background: '#fff', borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>

      {/* ── Mini Takvim ─────────────────────────────── */}
      <div style={{ padding: '22px 20px 18px' }}>

        {/* Ay navigasyonu */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#111827', letterSpacing: '-0.01em' }}>
            {TR_MONTHS[miniMonth]} <span style={{ color: '#9ca3af', fontWeight: 500 }}>{miniYear}</span>
          </span>
          <div style={{ display: 'flex', gap: 2 }}>
            <button onClick={prevMini} style={{ width: 30, height: 30, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', transition: 'all 0.12s' }} onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='#f3f4f6'}} onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='#fff'}}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <button onClick={nextMini} style={{ width: 30, height: 30, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', transition: 'all 0.12s' }} onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='#f3f4f6'}} onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='#fff'}}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        </div>

        {/* Gün başlıkları */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 6 }}>
          {TR_DAYS_SHORT.map((d, i) => (
            <div key={i} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: i>=5 ? '#e5e7eb' : '#c4c8d0', padding: '3px 0', letterSpacing: '0.04em' }}>{d}</div>
          ))}
        </div>

        {/* Mini hücreler */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', rowGap: 2 }}>
          {miniCells.map((day, idx) => {
            if (!day) return <div key={idx} style={{ height: 38 }} />
            const isToday    = isCurrentMiniMonth && day === today.getDate()
            const isSelected = view==='day' && viewDay.getFullYear()===miniYear && viewDay.getMonth()===miniMonth && viewDay.getDate()===day
            const hasTask    = taskDays.has(String(day))
            const isWknd     = idx % 7 >= 5
            const statuses   = statusByDay[day]
            const dotColor   = statuses?.has('blocked') ? '#e11d48' : statuses?.has('doing') ? '#2563eb' : statuses?.has('testing') ? '#d97706' : '#7c3aed'
            return (
              <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <button
                  onClick={() => onDayClick(new Date(miniYear, miniMonth, day))}
                  style={{ width: 36, height: 36, borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: isToday||isSelected ? 700 : 400, background: isToday ? '#111827' : isSelected ? '#2288c9' : 'transparent', color: isToday||isSelected ? '#fff' : isWknd ? '#d1d5db' : '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.1s' }}
                  onMouseEnter={e => { if (!isToday && !isSelected) (e.currentTarget as HTMLElement).style.background = '#f3f4f6' }}
                  onMouseLeave={e => { if (!isToday && !isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  {day}
                </button>
                <div style={{ height: 5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {hasTask && !isToday && !isSelected && (
                    <span style={{ width: 4, height: 4, borderRadius: '50%', background: dotColor }} />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: '#f3f4f6', margin: '0 20px' }} />

      {/* ── Yaklaşan ────────────────────────────────── */}
      <div style={{ padding: '18px 20px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Yaklaşan</span>
          {upcomingItems.length > 0 && <span style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af' }}>{upcomingItems.length} öğe</span>}
        </div>
        {upcomingItems.length === 0
          ? <p style={{ fontSize: 13, color: '#d1d5db', margin: '0 0 16px', fontStyle: 'italic' }}>Yaklaşan öğe yok</p>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
              {upcomingItems.map(item => {
                const daysLeft = Math.ceil((item.date.getTime() - now.getTime()) / 86400000)
                if (item.kind === 'event') {
                  const ev = item.event
                  const startLabel = ev.start_slot != null ? TIME_OPTIONS[ev.start_slot]?.label : null
                  return (
                    <button key={ev.id} onClick={() => onDayClick(item.date)}
                      style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '14px 16px', borderRadius: 14, border: 'none', background: '#dbeafe', cursor: 'pointer', textAlign: 'left', width: '100%', borderLeft: '4px solid #2563eb', transition: 'opacity 0.12s, transform 0.12s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.85'; (e.currentTarget as HTMLElement).style.transform = 'translateX(2px)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; (e.currentTarget as HTMLElement).style.transform = 'translateX(0)' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                        <p style={{ fontSize: 14, fontWeight: 600, color: '#1e3a8a', margin: 0, lineHeight: 1.4, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.title}</p>
                        {daysLeft >= 0 && <span style={{ fontSize: 11, fontWeight: 700, color: '#2563eb', background: '#2563eb18', padding: '3px 8px', borderRadius: 99, flexShrink: 0, lineHeight: 1.5 }}>{daysLeft === 0 ? 'Bugün' : `${daysLeft}g`}</span>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 12, color: '#3b82f6', fontWeight: 500 }}>{fmtShort(item.date)}{startLabel ? ` · ${startLabel}` : ''}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#1e3a8a', background: '#2563eb14', padding: '3px 8px', borderRadius: 99 }}>Etkinlik</span>
                      </div>
                    </button>
                  )
                }
                const task  = item.task
                const card  = STATUS_CARD[task.status]
                const meta  = STATUS_META[task.status]
                const range = getEffectiveRange(task)
                return (
                  <button key={task.id} onClick={() => { if (range) onDayClick(range.start) }}
                    style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 16px', borderRadius: 14, border: 'none', background: card.bg, cursor: 'pointer', textAlign: 'left', width: '100%', borderLeft: `4px solid ${card.accent}`, transition: 'opacity 0.12s, transform 0.12s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.85'; (e.currentTarget as HTMLElement).style.transform = 'translateX(2px)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; (e.currentTarget as HTMLElement).style.transform = 'translateX(0)' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <p style={{ fontSize: 14, fontWeight: 600, color: card.text, margin: 0, lineHeight: 1.4, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</p>
                      {daysLeft >= 0 && <span style={{ fontSize: 11, fontWeight: 700, color: card.accent, background: `${card.accent}18`, padding: '3px 8px', borderRadius: 99, flexShrink: 0, lineHeight: 1.5 }}>{daysLeft === 0 ? 'Bugün' : `${daysLeft}g`}</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {range && <span style={{ fontSize: 12, color: card.sub, fontWeight: 500 }}>{fmtShort(range.start)}{!isSameDay(range.start,range.end) ? ` – ${fmtShort(range.end)}` : ''}</span>}
                      <span style={{ fontSize: 11, fontWeight: 700, color: meta.text, background: `${card.accent}14`, padding: '3px 8px', borderRadius: 99 }}>{meta.label}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          )
        }
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: '#f3f4f6', margin: '0 18px' }} />

      {/* ── Kategoriler ─────────────────────────────── */}
      <div style={{ padding: '16px 18px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Kategoriler</span>
          <span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 500 }}>{tasks.length + calendarEvents.length} toplam</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(Object.entries(STATUS_META) as [TaskStatus, typeof STATUS_META[TaskStatus]][]).map(([key, m]) => {
            const count = statusCounts[key] || 0
            const total = tasks.length || 1
            const pct   = Math.round((count / total) * 100)
            return (
              <div key={key}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: m.bar, display: 'inline-block', flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: '#374151', fontWeight: 500 }}>{m.label}</span>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#6b7280' }}>{count}</span>
                </div>
                <div style={{ height: 4, borderRadius: 999, background: '#f3f4f6', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 999, background: m.bar, width: `${pct}%`, transition: 'width 0.5s ease' }} />
                </div>
              </div>
            )
          })}
          {/* Etkinlikler satırı */}
          {calendarEvents.length > 0 && (() => {
            const evTotal = tasks.length + calendarEvents.length || 1
            const evPct = Math.round((calendarEvents.length / evTotal) * 100)
            return (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#2563eb', display: 'inline-block', flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: '#374151', fontWeight: 500 }}>Etkinlikler</span>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#6b7280' }}>{calendarEvents.length}</span>
                </div>
                <div style={{ height: 4, borderRadius: 999, background: '#f3f4f6', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 999, background: '#2563eb', width: `${evPct}%`, transition: 'width 0.5s ease' }} />
                </div>
              </div>
            )
          })()}
        </div>
      </div>

    </div>
  )
}

// ── Görev Kartı (Tüm Gün alanı) ──────────────────────────────────────────────

function AllDayCard({ task, onClick }: { task: TaskWithAssignee; onClick: () => void }) {
  const card  = STATUS_CARD[task.status]
  const range = getEffectiveRange(task)
  return (
    <button onClick={onClick} style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '10px 12px', borderRadius: 11, background: card.bg, border: 'none', borderLeft: `4px solid ${card.accent}`, cursor: 'pointer', textAlign: 'left', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', width: '100%', opacity: task.status==='done' ? 0.65 : 1 }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 3px 8px rgba(0,0,0,0.1)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)' }}
    >
      <p style={{ fontSize: 13, fontWeight: 700, color: card.text, lineHeight: 1.35, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</p>
      {range && <p style={{ fontSize: 11, color: card.sub, margin: 0, opacity: 0.85 }}>{isSameDay(range.start,range.end) ? fmtShort(range.start) : `${fmtShort(range.start)} – ${fmtShort(range.end)}`}</p>}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: card.accent, background: `${card.accent}18`, padding: '2px 8px', borderRadius: 99 }}>{PRIORITY_META[task.priority ?? 'normal'].label}</span>
        {task.assigneeName && (
          <div style={{ borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
            <AvatarImg name={task.assigneeName} avatarUrl={task.assigneeAvatarUrl} size={22} color={card.accent} />
          </div>
        )}
      </div>
    </button>
  )
}

// ── Takvim Etkinlik Chip (CalEventChip) ──────────────────────────────────────

function CalEventChip({ event, onClick }: { event: CalendarEvent; onClick?: () => void }) {
  const startLabel = event.start_slot != null ? TIME_OPTIONS[event.start_slot]?.label : null
  const endLabel   = event.end_slot   != null ? TIME_OPTIONS[event.end_slot]?.label   : null
  return (
    <div onClick={onClick} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 12px', borderRadius: 11, background: '#dbeafe', borderLeft: '4px solid #2563eb', width: '100%', boxSizing: 'border-box', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', cursor: onClick ? 'pointer' : 'default' }}
      onMouseEnter={e => { if (onClick) (e.currentTarget as HTMLElement).style.boxShadow = '0 3px 8px rgba(37,99,235,0.18)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)' }}
    >
      <p style={{ fontSize: 13, fontWeight: 700, color: '#1e3a8a', lineHeight: 1.35, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.title}</p>
      {startLabel && <p style={{ fontSize: 11, color: '#3b82f6', margin: 0 }}>{startLabel}{endLabel ? ` – ${endLabel}` : ''}</p>}
    </div>
  )
}

// ── Saat Izgara ───────────────────────────────────────────────────────────────

interface TimedEventOverlay { colIndex: number; startSlot: number; endSlot: number; title: string; id: string }

function TimeGrid({ colCount, todayCols, timedEvents, onSlotClick, onTimedEventClick }: {
  colCount: number
  todayCols: boolean[]
  timedEvents?: TimedEventOverlay[]
  onSlotClick?: (colIndex: number, hour: number) => void
  onTimedEventClick?: (id: string) => void
}) {
  return (
    <div style={{ position: 'relative' }}>
      {HOURS.map((hour) => (
        <div key={hour} style={{ display: 'grid', gridTemplateColumns: `52px repeat(${colCount}, 1fr)`, height: 72, borderTop: '1px solid #f3f4f6', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-start', paddingRight: 8, paddingTop: 4 }}>
            <span style={{ fontSize: 10, color: '#c4c8d0', fontWeight: 600, userSelect: 'none', lineHeight: 1 }}>{String(hour).padStart(2,'0')}:00</span>
          </div>
          {Array.from({ length: colCount }, (_, ci) => (
            <div
              key={ci}
              onClick={() => onSlotClick?.(ci, hour)}
              style={{ borderLeft: '1px solid #f3f4f6', background: todayCols[ci] ? '#fafcff' : 'transparent', cursor: onSlotClick ? 'pointer' : 'default', transition: 'background 0.1s', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 72 }}
              onMouseEnter={e => {
                if (!onSlotClick) return
                const el = e.currentTarget as HTMLElement
                el.style.background = todayCols[ci] ? '#eef4ff' : '#f5f7fa'
                const plus = el.querySelector('.slot-plus') as HTMLElement | null
                if (plus) plus.style.opacity = '1'
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLElement
                el.style.background = todayCols[ci] ? '#fafcff' : 'transparent'
                const plus = el.querySelector('.slot-plus') as HTMLElement | null
                if (plus) plus.style.opacity = '0'
              }}
            >
              {onSlotClick && (
                <div className="slot-plus" style={{ opacity: 0, transition: 'opacity 0.12s', width: 22, height: 22, borderRadius: 11, border: '1.5px dashed #9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}

      {/* Saatli etkinlik overlay'leri */}
      {timedEvents?.map((ev) => {
        const top    = ev.startSlot * 36  // 72px/saat → 36px/30-dk
        const height = Math.max((ev.endSlot - ev.startSlot) * 36, 24)
        const startLabel = TIME_OPTIONS[ev.startSlot]?.label ?? ''
        const endLabel   = TIME_OPTIONS[ev.endSlot]?.label ?? ''
        return (
          <div key={ev.id}
            onClick={(e) => { e.stopPropagation(); onTimedEventClick?.(ev.id) }}
            style={{
            position: 'absolute',
            top,
            left: `calc(52px + ${ev.colIndex / colCount} * (100% - 52px) + 3px)`,
            width: `calc(${1 / colCount} * (100% - 52px) - 6px)`,
            height,
            background: '#dbeafe',
            borderLeft: '3px solid #2563eb',
            borderRadius: 6,
            padding: '3px 7px',
            overflow: 'hidden',
            zIndex: 3,
            cursor: onTimedEventClick ? 'pointer' : 'default',
            boxSizing: 'border-box',
          }}
            onMouseEnter={e => { if (onTimedEventClick) (e.currentTarget as HTMLElement).style.background = '#bfdbfe' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#dbeafe' }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: '#1e3a8a', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.title}</div>
            {height >= 40 && <div style={{ fontSize: 10, color: '#3b82f6', marginTop: 1 }}>{startLabel} – {endLabel}</div>}
          </div>
        )
      })}
    </div>
  )
}

// ── Event Modal (Figma referansı) — görev detay paneli ───────────────────────

function EventModal({ task, orgSlug, onClose }: { task: TaskWithAssignee; orgSlug: string; onClose: () => void }) {
  const range  = getEffectiveRange(task)
  const card   = STATUS_CARD[task.status]
  const status = STATUS_META[task.status]
  const prio   = PRIORITY_META[task.priority ?? 'normal']

  return (
    <div style={{ width: 292, flexShrink: 0, background: '#fff', borderLeft: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Renkli başlık şeridi */}
      <div style={{ background: card.bg, padding: '14px 16px 12px', borderBottom: `3px solid ${card.accent}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: card.accent }}>{status.label}</span>
            <p style={{ fontSize: 14, fontWeight: 700, color: card.text, marginTop: 4, lineHeight: 1.4, wordBreak: 'break-word' }}>{task.title}</p>
          </div>
          <button onClick={onClose} style={{ width: 26, height: 26, borderRadius: 7, border: `1px solid ${card.accent}30`, background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: card.accent, flexShrink: 0 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Tarih satırı — Figma referansındaki date row */}
        {range && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: '#f9fafb', border: '1px solid #f3f4f6' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>
              {isSameDay(range.start, range.end) ? fmtShort(range.start) : `${fmtShort(range.start)} – ${fmtShort(range.end)}`}
            </span>
          </div>
        )}

        {/* Öncelik */}
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Öncelik</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: prio.color }} />
            <span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>{prio.label}</span>
          </div>
        </div>

        {/* Atanan — Figma'daki avatar row */}
        {task.assigneeName && (
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Atanan</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: card.bg, border: `2px solid ${card.accent}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: card.accent }}>
                {task.assigneeName.charAt(0).toUpperCase()}
              </div>
              <span style={{ fontSize: 13, color: '#374151' }}>{task.assigneeName}</span>
            </div>
          </div>
        )}

        {task.task_type && (
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Tür</p>
            <span style={{ fontSize: 13, color: '#374151' }}>{TASK_TYPE_LABELS[task.task_type] ?? task.task_type}</span>
          </div>
        )}

        {task.estimated_hours && (
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Tahmini Süre</p>
            <span style={{ fontSize: 13, color: '#374151' }}>{task.estimated_hours} saat</span>
          </div>
        )}

        {task.description && (
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Açıklama</p>
            <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, margin: 0 }}>{task.description}</p>
          </div>
        )}
      </div>

      {/* Figma'daki "Add Event" butonu gibi — "Göreve Git" */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: 8 }}>
        <Link href={`/org/${orgSlug}/tasks/${task.id}`} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 0', borderRadius: 10, background: card.accent, color: '#fff', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
          Göreve Git
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </Link>
      </div>
    </div>
  )
}

// ── Etkinlik Ekleme Modalı ─────────────────────────────────────────────────────

const EVENT_TAGS = [
  { key: 'tasarim',    label: 'Tasarım',    bg: '#fef3c7', color: '#92400e' },
  { key: 'kisisel',    label: 'Kişisel',    bg: '#fce7f3', color: '#9d174d' },
  { key: 'gelistirme', label: 'Geliştirme', bg: '#dbeafe', color: '#1e40af' },
  { key: 'toplanti',   label: 'Toplantı',   bg: '#dcfce7', color: '#166534' },
  { key: 'arastirma',  label: 'Araştırma',  bg: '#ede9fe', color: '#5b21b6' },
]

// 48 slot: 00:00 00:30 01:00 ... 23:30
const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => ({
  value: i,
  label: `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 === 0 ? '00' : '30'}`,
}))

const AVATAR_COLORS = ['#3b82f6','#8b5cf6','#ec4899','#f59e0b','#10b981','#ef4444','#06b6d4','#84cc16']

// ── People Picker ─────────────────────────────────────────────────────────────

function AvatarImg({ name, avatarUrl, size = 36, color }: { name: string; avatarUrl?: string | null; size?: number; color: string }) {
  const [imgErr, setImgErr] = useState(false)
  if (avatarUrl && !imgErr) {
    return <img src={avatarUrl} alt={name} onError={() => setImgErr(true)}
      style={{ width: size, height: size, borderRadius: size / 2, objectFit: 'cover', flexShrink: 0, display: 'block' }} />
  }
  return (
    <div style={{ width: size, height: size, borderRadius: size / 2, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.36, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

function PeopleDropdown({ unselected, open, setOpen, onToggle, avatarColor }: {
  unselected: { id: string; name: string; avatarUrl?: string | null }[]
  open: boolean
  setOpen: (v: boolean | ((prev: boolean) => boolean)) => void
  onToggle: (id: string) => void
  avatarColor: (name: string) => string
}) {
  const btnRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  function handleOpen() {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 6, left: r.left })
    }
    setOpen(o => !o)
  }

  return (
    <div style={{ position: 'relative' }}>
      <button ref={btnRef} onClick={handleOpen}
        style={{ width: 36, height: 36, borderRadius: 18, background: open ? '#f1f5f9' : '#fff', border: '1.5px dashed #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#94a3b8', transition: 'all 0.15s', outline: 'none' }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#94a3b8'; (e.currentTarget as HTMLElement).style.color = '#64748b' }}
        onMouseLeave={e => { if (!open) { (e.currentTarget as HTMLElement).style.borderColor = '#cbd5e1'; (e.currentTarget as HTMLElement).style.color = '#94a3b8' } }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>

      {open && pos && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 9998 }} />
          <div style={{ position: 'fixed', top: pos.top, left: pos.left, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.16)', zIndex: 9999, minWidth: 190, padding: 6, maxHeight: 240, overflowY: 'auto' }}>
            {unselected.length === 0
              ? <p style={{ fontSize: 12, color: '#94a3b8', padding: '8px 10px', margin: 0 }}>Tüm kişiler eklendi</p>
              : unselected.map(m => {
                  const color = avatarColor(m.name)
                  return (
                    <button key={m.id} onClick={() => { onToggle(m.id); setOpen(false) }}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f8fafc' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                    >
                      <div style={{ borderRadius: 14, overflow: 'hidden', flexShrink: 0 }}>
                        <AvatarImg name={m.name} avatarUrl={m.avatarUrl} size={28} color={color} />
                      </div>
                      <span style={{ fontSize: 13, color: '#334155', fontWeight: 500 }}>{m.name}</span>
                    </button>
                  )
                })
            }
          </div>
        </>
      )}
    </div>
  )
}

function PeoplePicker({ members, assignees, userId, onToggle }: {
  members: { id: string; name: string; avatarUrl?: string | null }[]
  assignees: string[]
  userId: string
  onToggle: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const avatarColor = (name: string) => AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length]

  const selectedMembers = members.filter(m => assignees.includes(m.id))
  const unselected      = members.filter(m => !assignees.includes(m.id))
  // Always show current user avatar first
  const displayMembers  = selectedMembers.filter(m => m.id !== userId)
  const me              = members.find(m => m.id === userId)
  const meName          = me?.name ?? 'Ben'

  return (
    <div style={{ padding: '8px 8px 16px' }}>
      <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Kişiler</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {/* Mevcut kullanıcı avatarı */}
        <div title={meName} style={{ borderRadius: 18, border: '2px solid #fff', boxShadow: '0 0 0 2px ' + avatarColor(meName) + '60', flexShrink: 0 }}>
          <AvatarImg name={meName} avatarUrl={me?.avatarUrl} size={36} color={avatarColor(meName)} />
        </div>

        {/* Eklenen kişiler */}
        {displayMembers.map(m => {
          const color = avatarColor(m.name)
          return (
            <button key={m.id} onClick={() => onToggle(m.id)} title={`${m.name} – kaldır`}
              style={{ padding: 0, borderRadius: 18, border: '2px solid #fff', boxShadow: `0 0 0 2px ${color}60`, cursor: 'pointer', outline: 'none', overflow: 'hidden', flexShrink: 0, background: 'none' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.7' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
            >
              <AvatarImg name={m.name} avatarUrl={m.avatarUrl} size={36} color={color} />
            </button>
          )
        })}

        {/* + Ekle butonu */}
        <PeopleDropdown unselected={unselected} open={open} setOpen={setOpen} onToggle={onToggle} avatarColor={avatarColor} />
      </div>
    </div>
  )
}

// ── Quick Add Modal ────────────────────────────────────────────────────────────

function QuickAddModal({ day, initialHour, orgId, userId, onClose, onCreated }: {
  day: Date
  initialHour?: number
  orgId: string
  userId: string
  onClose: () => void
  onCreated: () => void
}) {
  const initStart = initialHour !== undefined ? initialHour * 2 : 18
  const [title, setTitle]               = useState('')
  const [startSlot, setStartSlot]       = useState(initStart)
  const [endSlot, setEndSlot]           = useState(Math.min(initStart + 2, 47))
  const [allDay, setAllDay]             = useState(false)
  const [location, setLocation]         = useState('')
  const [notes, setNotes]               = useState('')
  const [tags, setTags]                 = useState<string[]>([])
  const [customTag, setCustomTag]       = useState('')
  const [editingCustom, setEditingCustom] = useState(false)
  const [members, setMembers]           = useState<{ id: string; name: string; avatarUrl?: string | null }[]>([])
  const [assignees, setAssignees]       = useState<string[]>([userId])
  const [saving, setSaving]             = useState(false)
  const [showMenu, setShowMenu]         = useState(false)

  const dateStr   = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
  const dayIdx    = (day.getDay() + 6) % 7
  const dateLabel = `${TR_DAYS_FULL[dayIdx]}, ${day.getDate()} ${TR_MONTHS[day.getMonth()]}`

  // Org üyelerini iki sorguyla getir (doğru yöntem)
  useEffect(() => {
    async function loadMembers() {
      const { data: memberRows } = await supabase
        .from('organization_members')
        .select('user_id')
        .eq('organization_id', orgId)
      if (!memberRows?.length) return
      const ids = memberRows.map((r: { user_id: string }) => r.user_id)
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', ids)
      if (profiles) {
        setMembers((profiles as { id: string; full_name: string | null; avatar_url: string | null }[]).map(p => ({
          id: p.id,
          name: p.full_name ?? 'Üye',
          avatarUrl: p.avatar_url,
        })))
      }
    }
    loadMembers()
  }, [orgId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleSave() {
    if (!title.trim() || saving) return
    setSaving(true)
    const { error } = await supabase.from('calendar_events').insert({
      title: title.trim(),
      organization_id: orgId,
      created_by: userId,
      assignee_id: assignees[0] ?? null,
      event_date: dateStr,
      is_all_day: allDay,
      start_slot: allDay ? null : startSlot,
      end_slot:   allDay ? null : endSlot,
      notes: notes.trim() || null,
    })
    setSaving(false)
    if (error) { console.error('[QuickAddModal] insert error:', error); return }
    onCreated()
    onClose()
  }

  function toggleAssignee(id: string) {
    setAssignees(prev =>
      prev.includes(id)
        ? prev.length > 1 ? prev.filter(a => a !== id) : prev
        : [...prev, id]
    )
  }

  const avatarColor = (name: string) => AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length]

  const selectStyle: React.CSSProperties = {
    appearance: 'none', WebkitAppearance: 'none',
    padding: '7px 30px 7px 12px', borderRadius: 10, border: '1.5px solid #e2e8f0',
    background: `#f8fafc url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%2394a3b8' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round' fill='none'/%3E%3C/svg%3E") no-repeat right 9px center`,
    fontSize: 14, fontWeight: 600, color: '#0f172a', cursor: 'pointer', outline: 'none', minWidth: 96,
  }

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 24, width: 400, boxShadow: '0 24px 80px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', maxHeight: '90vh', overflow: 'hidden' }}
      >
        {/* ── Başlık + kapat ── */}
        <div style={{ padding: '26px 26px 0', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <input
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
            placeholder="Etkinlik başlığı..."
            style={{ flex: 1, border: 'none', outline: 'none', fontSize: 21, fontWeight: 700, color: '#0f172a', background: 'transparent', padding: 0, lineHeight: 1.3, letterSpacing: '-0.3px' }}
          />
          <button onClick={onClose} style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', marginTop: 2 }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* ── Scrollable içerik ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px 0' }}>

          {/* Tarih */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 8px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            <span style={{ fontSize: 14, color: '#334155', fontWeight: 500 }}>{dateLabel}</span>
          </div>

          {/* Saat — tüm gün kapalıysa göster */}
          {!allDay && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 8px' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <select value={startSlot} onChange={e => { const v = Number(e.target.value); setStartSlot(v); if (v >= endSlot) setEndSlot(v + 2) }} style={selectStyle}>
                  {TIME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <span style={{ color: '#cbd5e1', fontWeight: 500, userSelect: 'none' }}>—</span>
                <select value={endSlot} onChange={e => setEndSlot(Number(e.target.value))} style={selectStyle}>
                  {TIME_OPTIONS.filter(o => o.value > startSlot).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* Konum */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 8px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
            </svg>
            <input value={location} onChange={e => setLocation(e.target.value)} placeholder="Konum ekle" style={{ flex: 1, border: 'none', outline: 'none', fontSize: 14, color: '#334155', background: 'transparent', padding: 0 }} />
          </div>

          {/* Not */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '8px 8px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
              <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
            </svg>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Not ekle..." rows={2}
              style={{ flex: 1, border: 'none', outline: 'none', fontSize: 14, color: '#334155', background: 'transparent', padding: 0, resize: 'none', fontFamily: 'inherit', lineHeight: 1.5 }} />
          </div>

          <div style={{ height: 1, background: '#f1f5f9', margin: '8px 0' }} />

          {/* Kategoriler + Diğer */}
          <div style={{ padding: '6px 8px 10px', display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
            {EVENT_TAGS.map(t => {
              const active = tags.includes(t.key)
              return (
                <button key={t.key}
                  onClick={() => setTags(prev => active ? prev.filter(k => k !== t.key) : [...prev, t.key])}
                  style={{ padding: '6px 14px', borderRadius: 99, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: 'none', background: active ? t.bg : '#f1f5f9', color: active ? t.color : '#64748b', transition: 'all 0.15s' }}
                >
                  {t.label}
                </button>
              )
            })}
            {/* Diğer chip */}
            {editingCustom ? (
              <input
                autoFocus
                value={customTag}
                onChange={e => setCustomTag(e.target.value)}
                onBlur={() => setEditingCustom(false)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setEditingCustom(false) }}
                placeholder="Kategori adı..."
                style={{ padding: '6px 12px', borderRadius: 99, fontSize: 13, fontWeight: 500, border: '1.5px solid #94a3b8', outline: 'none', background: '#fff', width: 130, color: '#334155' }}
              />
            ) : (
              <button
                onClick={() => setEditingCustom(true)}
                style={{ padding: '6px 14px', borderRadius: 99, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: customTag ? 'none' : '1.5px dashed #cbd5e1', background: customTag ? '#f1f5f9' : 'transparent', color: customTag ? '#334155' : '#94a3b8', transition: 'all 0.15s' }}
              >
                {customTag || '+ Diğer'}
              </button>
            )}
          </div>

          <div style={{ height: 1, background: '#f1f5f9', margin: '0 0 8px' }} />

          {/* Kişiler */}
          <PeoplePicker members={members} assignees={assignees} userId={userId} onToggle={toggleAssignee} />
        </div>

        {/* ── Footer ── */}
        <div style={{ padding: '12px 22px 22px', display: 'flex', gap: 10, borderTop: '1px solid #f1f5f9' }}>
          <button onClick={handleSave} disabled={!title.trim() || saving}
            style={{ flex: 1, padding: '13px 0', borderRadius: 14, border: 'none', background: title.trim() ? '#0f172a' : '#f1f5f9', cursor: title.trim() ? 'pointer' : 'default', fontSize: 15, fontWeight: 700, color: title.trim() ? '#fff' : '#94a3b8', transition: 'background 0.15s' }}
            onMouseEnter={e => { if (title.trim()) (e.currentTarget as HTMLElement).style.background = '#1e293b' }}
            onMouseLeave={e => { if (title.trim()) (e.currentTarget as HTMLElement).style.background = '#0f172a' }}
          >
            {saving ? 'Kaydediliyor...' : 'Etkinlik Ekle'}
          </button>

          {/* "..." — Tüm Gün toggle menüsü */}
          <div style={{ position: 'relative' }}>
            {showMenu && (
              <>
                <div onClick={() => setShowMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 1 }} />
                <div style={{ position: 'absolute', bottom: 'calc(100% + 8px)', right: 0, background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 2, minWidth: 196, padding: '6px', overflow: 'hidden' }}>
                  <button
                    onClick={() => { setAllDay(d => !d); setShowMenu(false) }}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 9, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 14, color: '#334155', fontWeight: 500 }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f8fafc' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                  >
                    <span>Tüm gün</span>
                    <div style={{ width: 36, height: 20, borderRadius: 10, background: allDay ? '#0f172a' : '#e2e8f0', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                      <div style={{ position: 'absolute', top: 2, left: allDay ? 18 : 2, width: 16, height: 16, borderRadius: 8, background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
                    </div>
                  </button>
                </div>
              </>
            )}
            <button
              onClick={() => setShowMenu(m => !m)}
              style={{ width: 50, height: '100%', borderRadius: 14, border: `1.5px solid ${showMenu ? '#94a3b8' : '#e2e8f0'}`, background: showMenu ? '#f8fafc' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', transition: 'all 0.1s' }}
            >
              <svg width="16" height="4" viewBox="0 0 16 4" fill="currentColor"><circle cx="2" cy="2" r="2"/><circle cx="8" cy="2" r="2"/><circle cx="14" cy="2" r="2"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Cal Event Edit Modal ──────────────────────────────────────────────────────

function CalEventEditModal({ event, orgId, userId, onClose, onUpdated, onDeleted }: {
  event: CalendarEvent
  orgId: string
  userId: string
  onClose: () => void
  onUpdated: () => void
  onDeleted: () => void
}) {
  const [title, setTitle]         = useState(event.title)
  const [allDay, setAllDay]       = useState(event.is_all_day)
  const [startSlot, setStartSlot] = useState(event.start_slot ?? 18)
  const [endSlot, setEndSlot]     = useState(event.end_slot   ?? 20)
  const [notes, setNotes]         = useState(event.notes ?? '')
  const [saving, setSaving]       = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const dateLabel = (() => {
    const d = parseLocalDate(event.event_date)
    return `${TR_DAYS_FULL[getWeekdayMon(d)]}, ${d.getDate()} ${TR_MONTHS[d.getMonth()]}`
  })()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleSave() {
    if (!title.trim() || saving) return
    setSaving(true)
    const { error } = await supabase.from('calendar_events').update({
      title: title.trim(),
      is_all_day: allDay,
      start_slot: allDay ? null : startSlot,
      end_slot:   allDay ? null : endSlot,
      notes: notes.trim() || null,
    }).eq('id', event.id)
    setSaving(false)
    if (error) { console.error('[CalEventEditModal] update error:', error); return }
    onUpdated()
  }

  async function handleDelete() {
    setSaving(true)
    const { error } = await supabase.from('calendar_events').delete().eq('id', event.id)
    setSaving(false)
    if (error) { console.error('[CalEventEditModal] delete error:', error); return }
    onDeleted()
  }

  const selectStyle: React.CSSProperties = {
    border: '1px solid #e2e8f0', borderRadius: 8, padding: '5px 8px', fontSize: 13,
    fontWeight: 600, color: '#334155', background: '#fff', cursor: 'pointer', outline: 'none',
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.35)', backdropFilter: 'blur(4px)' }} />
      <div style={{ position: 'relative', width: 420, maxWidth: '95vw', background: '#fff', borderRadius: 22, boxShadow: '0 24px 60px rgba(0,0,0,0.18)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

        {/* Başlık */}
        <div style={{ padding: '24px 24px 0', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <input
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
            style={{ flex: 1, border: 'none', outline: 'none', fontSize: 20, fontWeight: 700, color: '#0f172a', background: 'transparent', padding: 0, lineHeight: 1.3 }}
          />
          <button onClick={onClose} style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Tarih */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <span style={{ fontSize: 14, color: '#374151', fontWeight: 500 }}>{dateLabel}</span>
            <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#64748b' }}>
              <span>Tüm gün</span>
              <div onClick={() => setAllDay(d => !d)} style={{ width: 36, height: 20, borderRadius: 10, background: allDay ? '#0f172a' : '#e2e8f0', position: 'relative', transition: 'background 0.2s', cursor: 'pointer', flexShrink: 0 }}>
                <div style={{ position: 'absolute', top: 2, left: allDay ? 18 : 2, width: 16, height: 16, borderRadius: 8, background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
              </div>
            </label>
          </div>

          {/* Saat */}
          {!allDay && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <select value={startSlot} onChange={e => { const v = Number(e.target.value); setStartSlot(v); if (v >= endSlot) setEndSlot(v + 2) }} style={selectStyle}>
                {TIME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <span style={{ color: '#cbd5e1' }}>—</span>
              <select value={endSlot} onChange={e => setEndSlot(Number(e.target.value))} style={selectStyle}>
                {TIME_OPTIONS.filter(o => o.value > startSlot).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          )}

          {/* Not */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '4px 0' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" style={{ marginTop: 2 }}>
              <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
              <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
            </svg>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Not ekle..." rows={2}
              style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13, color: '#334155', background: 'transparent', padding: 0, resize: 'none', fontFamily: 'inherit', lineHeight: 1.5 }} />
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 24px 22px', display: 'flex', gap: 8, borderTop: '1px solid #f1f5f9' }}>
          {confirmDelete
            ? <>
                <span style={{ flex: 1, fontSize: 13, color: '#dc2626', fontWeight: 500, display: 'flex', alignItems: 'center' }}>Silmek istediğinizden emin misiniz?</span>
                <button onClick={() => setConfirmDelete(false)} style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#374151' }}>İptal</button>
                <button onClick={handleDelete} disabled={saving} style={{ padding: '10px 16px', borderRadius: 10, border: 'none', background: '#dc2626', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#fff' }}>Sil</button>
              </>
            : <>
                <button onClick={() => setConfirmDelete(true)} style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #fecaca', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: '#dc2626', fontSize: 13, fontWeight: 600 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                  Sil
                </button>
                <button onClick={handleSave} disabled={!title.trim() || saving} style={{ flex: 1, padding: '11px 0', borderRadius: 10, border: 'none', background: title.trim() ? '#0f172a' : '#f1f5f9', cursor: title.trim() ? 'pointer' : 'default', fontSize: 14, fontWeight: 700, color: title.trim() ? '#fff' : '#94a3b8' }}>
                  {saving ? 'Kaydediliyor...' : 'Kaydet'}
                </button>
              </>
          }
        </div>
      </div>
    </div>
  )
}

// ── Calendar Header (Figma referansı) ─────────────────────────────────────────

function CalendarHeader({
  currentLabel, view, onViewChange, onPrevious, onNext, onToday, tasks, searchQuery, onSearch,
}: {
  currentLabel: string
  view: 'month' | 'week' | 'day'
  onViewChange: (v: 'month' | 'week' | 'day') => void
  onPrevious: () => void
  onNext: () => void
  onToday: () => void
  tasks: TaskWithAssignee[]
  searchQuery: string
  onSearch: (q: string) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 24px 12px', background: '#fff', borderBottom: '1px solid #e5e7eb', gap: 12, flexWrap: 'wrap', flexShrink: 0 }}>
      {/* Sol: büyük başlık */}
      <h1 style={{ fontSize: 22, fontWeight: 800, color: '#111827', letterSpacing: '-0.03em', lineHeight: 1, margin: 0 }}>
        {currentLabel}
      </h1>

      {/* Orta: arama */}
      <div style={{ flex: 1, maxWidth: 280, position: 'relative' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.2" strokeLinecap="round" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          type="text"
          placeholder="Görev veya etkinlik ara..."
          value={searchQuery}
          onChange={e => onSearch(e.target.value)}
          style={{ width: '100%', height: 36, paddingLeft: 32, paddingRight: searchQuery ? 32 : 12, border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 13, color: '#374151', background: '#f9fafb', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s' }}
          onFocus={e => { e.target.style.borderColor = '#2288c9'; e.target.style.background = '#fff' }}
          onBlur={e => { e.target.style.borderColor = '#e5e7eb'; e.target.style.background = '#f9fafb' }}
        />
        {searchQuery && (
          <button onClick={() => onSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 2, display: 'flex', alignItems: 'center' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        )}
      </div>

      {/* Sağ: kontroller */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* View tabs — Figma: Month | Week | Day */}
        <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: 10, padding: 3, gap: 2 }}>
          {(['month', 'week', 'day'] as const).map(v => (
            <button key={v} onClick={() => onViewChange(v)} style={{ padding: '6px 14px', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', borderRadius: 8, transition: 'all 0.15s', background: view===v ? '#fff' : 'transparent', color: view===v ? '#111827' : '#6b7280', boxShadow: view===v ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
              {v==='month' ? 'Ay' : v==='week' ? 'Hafta' : 'Gün'}
            </button>
          ))}
        </div>

        {/* < Today > — Figma stili */}
        <div style={{ display: 'flex', alignItems: 'center', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
          <button onClick={onPrevious} style={{ width: 34, height: 34, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#374151' }} onMouseEnter={e=>{e.currentTarget.style.background='#f3f4f6'}} onMouseLeave={e=>{e.currentTarget.style.background='transparent'}}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <button onClick={onToday} style={{ padding: '0 12px', height: 34, border: 'none', borderLeft: '1px solid #e5e7eb', borderRight: '1px solid #e5e7eb', background: 'transparent', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#374151' }} onMouseEnter={e=>{e.currentTarget.style.background='#f3f4f6'}} onMouseLeave={e=>{e.currentTarget.style.background='transparent'}}>
            Bugün
          </button>
          <button onClick={onNext} style={{ width: 34, height: 34, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#374151' }} onMouseEnter={e=>{e.currentTarget.style.background='#f3f4f6'}} onMouseLeave={e=>{e.currentTarget.style.background='transparent'}}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>

        {tasks.length > 0 && (
          <button onClick={() => downloadAllICS(tasks)} style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', color: '#6b7280', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseEnter={e=>{e.currentTarget.style.color='#2288c9';e.currentTarget.style.borderColor='#2288c9'}} onMouseLeave={e=>{e.currentTarget.style.color='#6b7280';e.currentTarget.style.borderColor='#e5e7eb'}} title="İndir (.ics)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </button>
        )}
      </div>
    </div>
  )
}

// ── Week View ─────────────────────────────────────────────────────────────────

function WeekView({ weekDays, weekTaskMap, calendarEvents, today, onEventClick, onCalEventClick, onDayClick, onAddEvent }: {
  weekDays: Date[]
  weekTaskMap: Map<number, TaskWithAssignee[]>
  calendarEvents: CalendarEvent[]
  today: Date
  onEventClick: (t: TaskWithAssignee) => void
  onCalEventClick: (e: CalendarEvent) => void
  onDayClick: (d: Date) => void
  onAddEvent: (d: Date, hour?: number) => void
}) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '12px 20px 0' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, overflow: 'hidden', marginBottom: 16 }}>

        {/* Gün başlıkları — kart stili */}
        <div style={{ flexShrink: 0, display: 'grid', gridTemplateColumns: `52px repeat(7, 1fr)`, background: '#f5f7fa', padding: '10px 0 0', borderBottom: '1px solid #e5e7eb' }}>
          <div />
          {weekDays.map((d, di) => {
            const isToday = isSameDay(d, today), isWknd = di >= 5
            return (
              <div key={di} style={{ padding: '0 4px 10px' }}>
                <div
                  onClick={() => onDayClick(d)}
                  style={{ background: isToday ? '#111827' : '#fff', borderRadius: 14, border: isToday ? 'none' : '1px solid #e5e7eb', padding: '10px 0 10px', textAlign: 'center', cursor: 'pointer', boxShadow: isToday ? '0 4px 14px rgba(0,0,0,0.18)' : '0 1px 3px rgba(0,0,0,0.04)', transition: 'transform 0.12s, box-shadow 0.12s' }}
                  onMouseEnter={e => { if (!isToday) { (e.currentTarget as HTMLElement).style.boxShadow = '0 3px 10px rgba(0,0,0,0.1)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)' } }}
                  onMouseLeave={e => { if (!isToday) { (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(0)' } }}
                >
                  <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: isToday ? 'rgba(255,255,255,0.65)' : isWknd ? '#d1d5db' : '#9ca3af', margin: '0 0 5px' }}>{TR_DAYS_MED[di]}</p>
                  <span style={{ fontSize: 22, fontWeight: 800, color: isToday ? '#fff' : isWknd ? '#c4c8d0' : '#111827', lineHeight: 1 }}>{d.getDate()}</span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Tüm Gün şeridi — görevler + tüm gün takvim etkinlikleri */}
        <div style={{ flexShrink: 0, display: 'grid', gridTemplateColumns: `52px repeat(7, 1fr)`, borderBottom: '2px solid #f0f0f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 7 }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: '#c4c8d0', textTransform: 'uppercase', letterSpacing: '0.05em', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>Tüm Gün</span>
          </div>
          {weekDays.map((d, di) => {
            const isToday   = isSameDay(d, today)
            const taskItems = weekTaskMap.get(di) ?? []
            const calItems  = calendarEvents.filter(e => e.is_all_day && isSameDay(parseLocalDate(e.event_date), d))
            const empty     = taskItems.length === 0 && calItems.length === 0
            return (
              <div key={di} onClick={() => { if (empty) onAddEvent(d) }} style={{ padding: '6px 6px', borderRight: di<6 ? '1px solid #f3f4f6' : 'none', background: isToday ? '#fafcff' : 'transparent', minHeight: 72, display: 'flex', flexDirection: 'column', gap: 5, cursor: empty ? 'pointer' : 'default' }}>
                {empty
                  ? <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0 }} className="add-hint"><span style={{ fontSize: 16, color: '#c4c8d0' }}>+</span></div>
                  : <>
                      {taskItems.map(t => <AllDayCard key={t.id} task={t} onClick={() => onEventClick(t)} />)}
                      {calItems.map(e => <CalEventChip key={e.id} event={e} onClick={() => onCalEventClick(e)} />)}
                    </>
                }
              </div>
            )
          })}
        </div>

        {/* Saat ızgarası — YALNIZCA bu alan kayar */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <TimeGrid
            colCount={7}
            todayCols={weekDays.map(d => isSameDay(d, today))}
            timedEvents={calendarEvents
              .filter(e => !e.is_all_day)
              .flatMap(e => {
                const ci = weekDays.findIndex(wd => isSameDay(wd, parseLocalDate(e.event_date)))
                if (ci === -1 || e.start_slot == null || e.end_slot == null) return []
                return [{ colIndex: ci, startSlot: e.start_slot, endSlot: e.end_slot, title: e.title, id: e.id }]
              })}
            onSlotClick={(ci, hour) => onAddEvent(weekDays[ci], hour)}
            onTimedEventClick={(id) => { const ev = calendarEvents.find(e => e.id === id); if (ev) onCalEventClick(ev) }}
          />
        </div>
      </div>
    </div>
  )
}

// ── Day View ──────────────────────────────────────────────────────────────────

function DayView({ viewDay, dayTasks, calendarEvents, today, onEventClick, onCalEventClick, onAddEvent }: {
  viewDay: Date; dayTasks: TaskWithAssignee[]; calendarEvents: CalendarEvent[]; today: Date; onEventClick: (t: TaskWithAssignee) => void; onCalEventClick: (e: CalendarEvent) => void; onAddEvent: (d: Date, hour?: number) => void
}) {
  const isToday = isSameDay(viewDay, today)
  const wd = getWeekdayMon(viewDay), isWknd = wd >= 5
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '12px 20px 0' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, overflow: 'hidden', marginBottom: 16 }}>

        {/* Gün başlığı — tam genişlik kart stili */}
        <div style={{ flexShrink: 0, display: 'grid', gridTemplateColumns: '52px 1fr', background: '#f5f7fa', padding: '10px 10px 10px 0', borderBottom: '1px solid #e5e7eb' }}>
          <div />
          <div style={{ background: isToday ? '#111827' : '#fff', borderRadius: 14, border: isToday ? 'none' : '1px solid #e5e7eb', padding: '12px 20px', boxShadow: isToday ? '0 4px 14px rgba(0,0,0,0.18)' : '0 1px 3px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: isToday ? 'rgba(255,255,255,0.55)' : isWknd ? '#d1d5db' : '#9ca3af', margin: '0 0 3px' }}>{TR_DAYS_FULL[wd]}</p>
              <span style={{ fontSize: 32, fontWeight: 800, color: isToday ? '#fff' : isWknd ? '#c4c8d0' : '#111827', lineHeight: 1 }}>{viewDay.getDate()}</span>
            </div>
            <div style={{ height: 40, width: 1, background: isToday ? 'rgba(255,255,255,0.15)' : '#f3f4f6' }} />
            <span style={{ fontSize: 12, fontWeight: 500, color: isToday ? 'rgba(255,255,255,0.65)' : '#9ca3af' }}>
              {TR_MONTHS[viewDay.getMonth()]} {viewDay.getFullYear()}
            </span>
            {isToday && <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: '#fff', background: 'rgba(255,255,255,0.15)', padding: '3px 10px', borderRadius: 99 }}>Bugün</span>}
          </div>
        </div>

        {/* Tüm Gün — görevler + tüm gün takvim etkinlikleri */}
        <div style={{ flexShrink: 0, display: 'grid', gridTemplateColumns: '52px 1fr', borderBottom: '2px solid #f0f0f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 7 }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: '#c4c8d0', textTransform: 'uppercase', letterSpacing: '0.05em', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>Tüm Gün</span>
          </div>
          {(() => {
            const calItems = calendarEvents.filter(e => e.is_all_day && isSameDay(parseLocalDate(e.event_date), viewDay))
            const empty = dayTasks.length === 0 && calItems.length === 0
            return (
              <div onClick={() => { if (empty) onAddEvent(viewDay) }} style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 5, minHeight: 50, cursor: empty ? 'pointer' : 'default' }}>
                {empty
                  ? <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}><span style={{ fontSize:20, color:'#e5e7eb' }}>+</span></div>
                  : <>
                      {dayTasks.map(t => <AllDayCard key={t.id} task={t} onClick={() => onEventClick(t)} />)}
                      {calItems.map(e => <CalEventChip key={e.id} event={e} onClick={() => onCalEventClick(e)} />)}
                    </>
                }
              </div>
            )
          })()}
        </div>

        {/* Saat ızgarası — YALNIZCA bu alan kayar */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <TimeGrid
            colCount={1}
            todayCols={[isToday]}
            timedEvents={calendarEvents
              .filter(e => !e.is_all_day && isSameDay(parseLocalDate(e.event_date), viewDay) && e.start_slot != null && e.end_slot != null)
              .map(e => ({ colIndex: 0, startSlot: e.start_slot!, endSlot: e.end_slot!, title: e.title, id: e.id }))}
            onSlotClick={(_, hour) => onAddEvent(viewDay, hour)}
            onTimedEventClick={(id) => { const ev = calendarEvents.find(e => e.id === id); if (ev) onCalEventClick(ev) }}
          />
        </div>
      </div>
    </div>
  )
}

// ── Month View ────────────────────────────────────────────────────────────────

function MonthView({ cells, tasksByDay, calendarEvents, totalDays, viewYear, viewMonth, today, onEventClick, onCalEventClick, onDayClick, onAddEvent }: {
  cells: (number|null)[]; tasksByDay: Record<number, { task: TaskWithAssignee; isStart: boolean; isEnd: boolean; showTitle: boolean }[]>; calendarEvents: CalendarEvent[]; totalDays: number; viewYear: number; viewMonth: number; today: Date; onEventClick: (t: TaskWithAssignee) => void; onCalEventClick: (e: CalendarEvent) => void; onDayClick: (d: Date) => void; onAddEvent: (d: Date) => void
}) {
  const isCurMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth()
  const MAX_CHIPS = 3
  // Kaç satır var? (42 hücre = 6 satır, 35 hücre = 5 satır)
  const rowCount = cells.length <= 35 ? 5 : 6
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '12px 20px 12px' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
        {/* Gün başlıkları */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', flexShrink: 0 }}>
          {TR_DAYS_MED.map((d, i) => (
            <div key={d} style={{ padding: '11px 0', textAlign: 'center', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: i >= 5 ? '#cbd5e1' : '#94a3b8' }}>{d}</div>
          ))}
        </div>
        {/* Takvim hücreleri — viewport'u tam doldur */}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridTemplateRows: `repeat(${rowCount}, 1fr)` }}>
          {cells.map((day, idx) => {
            const col = idx % 7
            const isToday = isCurMonth && day === today.getDate()
            const isWknd = col >= 5
            const spans = day ? (tasksByDay[day] ?? []) : []
            const calItems = day ? calendarEvents.filter(e => {
              const d = parseLocalDate(e.event_date)
              return d.getFullYear() === viewYear && d.getMonth() === viewMonth && d.getDate() === day
            }) : []
            const totalItems = spans.length + calItems.length
            const extra = Math.max(0, totalItems - MAX_CHIPS)
            const allItems: Array<{ kind: 'task'; task: TaskWithAssignee; isStart: boolean; isEnd: boolean } | { kind: 'event'; event: CalendarEvent }> = [
              ...spans.map(s => ({ kind: 'task' as const, task: s.task, isStart: s.isStart, isEnd: s.isEnd })),
              ...calItems.map(e => ({ kind: 'event' as const, event: e })),
            ]
            const visible = allItems.slice(0, MAX_CHIPS)
            return (
              <div
                key={idx}
                onClick={() => { if (day && totalItems === 0) onAddEvent(new Date(viewYear, viewMonth, day!)) }}
                style={{
                  display: 'flex', flexDirection: 'column',
                  background: !day ? '#f8fafc' : isWknd ? '#fafbfd' : '#fff',
                  borderBottom: idx < cells.length - 7 ? '1px solid #e2e8f0' : 'none',
                  borderRight: col < 6 ? '1px solid #e2e8f0' : 'none',
                  outline: isToday ? '2px solid #f97316' : 'none',
                  outlineOffset: -2,
                  cursor: day && totalItems === 0 ? 'pointer' : 'default',
                  overflow: 'hidden',
                }}
              >
                {day && (
                  <>
                    {/* Gün numarası + ekle butonu */}
                    <div style={{ padding: '7px 9px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                      <span
                        onClick={e => { e.stopPropagation(); onDayClick(new Date(viewYear, viewMonth, day)) }}
                        style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 26, height: 26, borderRadius: '50%',
                          fontSize: 13, fontWeight: isToday ? 700 : 400,
                          background: isToday ? '#f97316' : 'transparent',
                          color: isToday ? '#fff' : isWknd ? '#adb5c7' : '#374151',
                          cursor: 'pointer', userSelect: 'none',
                        }}
                      >{day}</span>
                      <span
                        onClick={e => { e.stopPropagation(); onAddEvent(new Date(viewYear, viewMonth, day)) }}
                        style={{ width: 20, height: 20, borderRadius: 5, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: '#d1d5db', cursor: 'pointer', lineHeight: 1, fontWeight: 300 }}
                      >+</span>
                    </div>
                    {/* Etkinlik chipleri */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 5px 5px', flex: 1, overflow: 'hidden' }}>
                      {visible.map((item, i) => {
                        if (item.kind === 'task') {
                          const m = STATUS_META[item.task.status]
                          return (
                            <button
                              key={item.task.id + '_' + i}
                              onClick={e => { e.stopPropagation(); onEventClick(item.task) }}
                              title={item.task.title}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
                                height: 24, padding: '0 7px 0 5px',
                                border: 'none', borderRadius: 5, cursor: 'pointer',
                                background: m.bg, color: m.text,
                                borderLeft: `3px solid ${m.bar}`,
                                opacity: item.task.status === 'done' ? 0.65 : 1,
                                textAlign: 'left', overflow: 'hidden', width: '100%',
                              }}
                            >
                              <span style={{ width: 5, height: 5, borderRadius: '50%', background: m.bar, flexShrink: 0 }} />
                              <span style={{ fontSize: 11, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, lineHeight: 1 }}>
                                {item.task.title}
                              </span>
                            </button>
                          )
                        } else {
                          return (
                            <button
                              key={item.event.id}
                              onClick={ev => { ev.stopPropagation(); onCalEventClick(item.event) }}
                              title={item.event.title}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
                                height: 24, padding: '0 7px 0 5px',
                                border: 'none', borderRadius: 5, cursor: 'pointer',
                                background: '#eff6ff', color: '#1e40af',
                                borderLeft: '3px solid #3b82f6',
                                textAlign: 'left', overflow: 'hidden', width: '100%',
                              }}
                            >
                              <span style={{ fontSize: 10, flexShrink: 0 }}>📅</span>
                              <span style={{ fontSize: 11, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, lineHeight: 1 }}>
                                {item.event.title}
                              </span>
                            </button>
                          )
                        }
                      })}
                      {extra > 0 && (
                        <button
                          onClick={e => { e.stopPropagation(); onDayClick(new Date(viewYear, viewMonth, day)) }}
                          style={{ flexShrink: 0, height: 20, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', padding: '0 5px', fontSize: 10.5, color: '#64748b', fontWeight: 500 }}
                        >
                          +{extra} daha
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function CalendarSkeleton() {
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#f5f7fa' }}>
      <div className="skeleton" style={{ width: 210, flexShrink: 0 }} />
      <div style={{ flex: 1, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div className="skeleton" style={{ height: 32, width: 160, borderRadius: 8 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="skeleton" style={{ height: 36, width: 120, borderRadius: 10 }} />
            <div className="skeleton" style={{ height: 36, width: 150, borderRadius: 10 }} />
          </div>
        </div>
        <div className="skeleton" style={{ flex: 1, borderRadius: 16 }} />
      </div>
    </div>
  )
}

// ── Ana Bileşen ───────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const router = useRouter()
  const { org, orgRole, userIl, userId, loading: orgLoading } = useOrg()

  const _key   = org?.id && userId ? `calendar:${org.id}:${orgRole}:${userId}` : ''
  const _cache = _key ? getCachedData<TaskWithAssignee[]>(_key) : null

  const [tasks, setTasks]               = useState<TaskWithAssignee[]>(_cache ?? [])
  const [calendarEvents, setCalendarEvents]   = useState<CalendarEvent[]>([])
  const [selectedCalEvent, setSelectedCalEvent] = useState<CalendarEvent | null>(null)
  const [searchQuery, setSearchQuery]   = useState('')
  const [loading, setLoading]           = useState(_cache === null)
  const [view, setView]                 = useState<'month' | 'week' | 'day'>('week')
  const [selectedEvent, setSelectedEvent] = useState<TaskWithAssignee | null>(null)
  const [quickAddDay, setQuickAddDay]   = useState<Date | null>(null)
  const [quickAddHour, setQuickAddHour] = useState<number | null>(null)
  const isMobile = useIsMobile()
  const [mobileSelectedDay, setMobileSelectedDay] = useState<Date>(() => new Date())
  const [mobileViewMode, setMobileViewMode] = useState<'month' | 'week' | 'day'>('month')

  const today = new Date()
  const [viewYear, setViewYear]   = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [weekStart, setWeekStart] = useState(() => startOfWeekMon(today))
  const [viewDay, setViewDay]     = useState(new Date(today))

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') { setSelectedEvent(null); setQuickAddDay(null) } }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [])

  async function loadTasks(bg = false) {
    if (!org || !userId) return
    const cacheKey = `calendar:${org.id}:${orgRole}:${userId}`
    let q = supabase.from('tasks').select('*').eq('organization_id', org.id).order('start_date', { ascending: true, nullsFirst: false })
    // PRD md.2 — kapsam kuralı tek kaynaktan (bkz. lib/taskScope.ts)
    q = applyTaskScope(q, { role: orgRole!, userId, il: userIl })
    const { data } = await q
    const ids = Array.from(new Set((data ?? []).map((t: Task) => t.assignee_id).filter(Boolean))) as string[]
    let pMap: Record<string, { name: string; avatarUrl: string | null }> = {}
    if (ids.length) {
      const { data: profs } = await supabase.from('profiles').select('id, full_name, avatar_url').in('id', ids)
      pMap = Object.fromEntries((profs ?? []).map((p: { id: string; full_name: string | null; avatar_url: string | null }) => [p.id, { name: p.full_name ?? '', avatarUrl: p.avatar_url }]))
    }
    const enriched = (data ?? []).map((t: Task) => ({ ...t, assigneeName: t.assignee_id ? pMap[t.assignee_id]?.name : undefined, assigneeAvatarUrl: t.assignee_id ? pMap[t.assignee_id]?.avatarUrl : undefined }))
    setTasks(enriched); setCachedData(cacheKey, enriched); if (!bg) setLoading(false)
  }

  async function loadCalendarEvents() {
    if (!org) return
    const { data } = await supabase.from('calendar_events').select('*').eq('organization_id', org.id).order('event_date', { ascending: true })
    setCalendarEvents((data ?? []) as CalendarEvent[])
  }

  useEffect(() => {
    if (orgLoading) return
    if (!org || !userId) return
    if (orgRole === 'consultant') { router.replace(`/org/${org.slug}/consultant`); return }
    loadTasks(tasks.length > 0)
    loadCalendarEvents()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgLoading, org?.id, userId, orgRole])

  // ── Navigasyon ──────────────────────────────────────────────────────────────

  function handlePrevious() {
    if (view==='month') { if(viewMonth===0){setViewYear(y=>y-1);setViewMonth(11)}else setViewMonth(m=>m-1) }
    else if (view==='week') setWeekStart(d => addDays(d, -7))
    else setViewDay(d => addDays(d, -1))
  }
  function handleNext() {
    if (view==='month') { if(viewMonth===11){setViewYear(y=>y+1);setViewMonth(0)}else setViewMonth(m=>m+1) }
    else if (view==='week') setWeekStart(d => addDays(d, 7))
    else setViewDay(d => addDays(d, 1))
  }
  function handleToday() {
    setViewYear(today.getFullYear()); setViewMonth(today.getMonth())
    setWeekStart(startOfWeekMon(today)); setViewDay(new Date(today))
  }

  function handleDayClick(d: Date) { setViewDay(d); setView('day') }

  // ── Arama Filtresi ───────────────────────────────────────────────────────────
  const sq = searchQuery.toLowerCase().trim()
  const filteredTasks = sq ? tasks.filter(t => t.title.toLowerCase().includes(sq) || t.assigneeName?.toLowerCase().includes(sq)) : tasks
  const filteredCalEvents = sq ? calendarEvents.filter(e => e.title.toLowerCase().includes(sq)) : calendarEvents

  // ── Ay Grid ─────────────────────────────────────────────────────────────────

  const firstDay = new Date(viewYear, viewMonth, 1), lastDay = new Date(viewYear, viewMonth + 1, 0)
  const startOffset = getWeekdayMon(firstDay), totalDays = lastDay.getDate()
  const cells: (number|null)[] = [...Array(startOffset).fill(null), ...Array.from({ length: totalDays }, (_, i) => i + 1)]
  while (cells.length < 42) cells.push(null)

  const tasksByDay: Record<number, { task: TaskWithAssignee; isStart: boolean; isEnd: boolean; showTitle: boolean }[]> = {}
  const undatedTasks: TaskWithAssignee[] = []

  for (const task of filteredTasks) {
    const r = getEffectiveRange(task)
    if (!r) { undatedTasks.push(task); continue }
    const ms = new Date(viewYear, viewMonth, 1), me = new Date(viewYear, viewMonth + 1, 0)
    if (r.end < ms || r.start > me) continue
    const cs = r.start < ms ? 1 : r.start.getDate(), ce = r.end > me ? totalDays : r.end.getDate()
    for (let d = cs; d <= ce; d++) {
      if (!tasksByDay[d]) tasksByDay[d] = []
      tasksByDay[d].push({ task, showTitle: false, isStart: d===r.start.getDate()&&r.start.getFullYear()===viewYear&&r.start.getMonth()===viewMonth, isEnd: d===r.end.getDate()&&r.end.getFullYear()===viewYear&&r.end.getMonth()===viewMonth })
    }
  }

  const seenW: Record<string, boolean> = {}
  for (let idx = 0; idx < cells.length; idx++) {
    const day = cells[idx]; if (!day) continue
    const col = idx % 7
    for (const span of (tasksByDay[day] ?? [])) {
      const wk = `${span.task.id}_${Math.floor(idx/7)}`
      if (!seenW[wk]) { span.showTitle = true; seenW[wk] = true }
      if (col===0 && !span.isStart) span.isStart = true
      if (col===6 && !span.isEnd)   span.isEnd   = true
    }
  }

  // ── Hafta ───────────────────────────────────────────────────────────────────

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const weekTaskMap: Map<number, TaskWithAssignee[]> = new Map(Array.from({ length: 7 }, (_, i) => [i, []]))
  for (const task of filteredTasks) {
    const r = getEffectiveRange(task); if (!r) continue
    const wEnd = addDays(weekDays[6], 1)
    if (r.end < weekDays[0] || r.start >= wEnd) continue
    for (let di = 0; di < 7; di++) {
      const d=weekDays[di], ds=new Date(d); ds.setHours(0,0,0,0); const de=new Date(d); de.setHours(23,59,59,999)
      if (r.start <= de && r.end >= ds) { weekTaskMap.get(di)!.push(task); break }
    }
  }

  // ── Gün ─────────────────────────────────────────────────────────────────────

  const dayTasks = filteredTasks.filter(t => taskInDay(t, viewDay))

  // ── Başlık Label ────────────────────────────────────────────────────────────

  const currentLabel =
    view==='month' ? `${TR_MONTHS[viewMonth]} ${viewYear}` :
    view==='week'  ? (() => { const s=weekDays[0],e=weekDays[6]; return s.getMonth()===e.getMonth() ? `${TR_MONTHS[s.getMonth()]} ${s.getFullYear()}` : `${TR_MONTHS[s.getMonth()]} – ${TR_MONTHS[e.getMonth()]} ${e.getFullYear()}` })() :
    `${TR_DAYS_FULL[getWeekdayMon(viewDay)]}, ${viewDay.getDate()} ${TR_MONTHS[viewDay.getMonth()]} ${viewDay.getFullYear()}`

  if (orgLoading || loading) return <CalendarSkeleton />

  // ── Mobil Görünüm ──────────────────────────────────────────────────────────
  if (isMobile) {
    // Ay navigasyonu (view state'inden bağımsız)
    const mobilePrevMonth = () => { if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) } else setViewMonth(m => m - 1) }
    const mobileNextMonth = () => { if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) } else setViewMonth(m => m + 1) }
    // Hafta navigasyonu
    const mobileWeekStart = startOfWeekMon(mobileSelectedDay)
    const mobileWeekDays  = Array.from({ length: 7 }, (_, i) => addDays(mobileWeekStart, i))
    const mobilePrevWeek  = () => setMobileSelectedDay(d => addDays(startOfWeekMon(d), -7))
    const mobileNextWeek  = () => setMobileSelectedDay(d => addDays(startOfWeekMon(d), 7))
    // Gün navigasyonu
    const mobilePrevDay   = () => setMobileSelectedDay(d => addDays(d, -1))
    const mobileNextDay   = () => setMobileSelectedDay(d => addDays(d, 1))

    const mobileDayTasks   = filteredTasks.filter(t => taskInDay(t, mobileSelectedDay))
    const mobileDayEvents  = filteredCalEvents.filter(e => isSameDay(parseLocalDate(e.event_date), mobileSelectedDay))
    const mobileFirstDay   = new Date(viewYear, viewMonth, 1)
    const mobileTotalDays  = new Date(viewYear, viewMonth + 1, 0).getDate()
    const mobileStartOff   = getWeekdayMon(mobileFirstDay)
    const mobileCells: (number | null)[] = [...Array(mobileStartOff).fill(null), ...Array.from({ length: mobileTotalDays }, (_, i) => i + 1)]
    while (mobileCells.length % 7 !== 0) mobileCells.push(null)
    const isMobileToday = (day: number) => viewYear === today.getFullYear() && viewMonth === today.getMonth() && day === today.getDate()
    const isMobileSel   = (day: number) => viewYear === mobileSelectedDay.getFullYear() && viewMonth === mobileSelectedDay.getMonth() && day === mobileSelectedDay.getDate()
    const mobileHasEv   = (day: number) => {
      const d = new Date(viewYear, viewMonth, day)
      return filteredTasks.some(t => taskInDay(t, d)) || filteredCalEvents.some(e => isSameDay(parseLocalDate(e.event_date), d))
    }
    const totalItems = mobileDayTasks.length + mobileDayEvents.length

    // Her gün için nokta renkleri (max 3)
    const mobileDayDots = (day: number): string[] => {
      const d = new Date(viewYear, viewMonth, day)
      const dots: string[] = []
      filteredTasks.filter(t => taskInDay(t, d)).forEach(t => { if (dots.length < 3) dots.push(STATUS_META[t.status].bar) })
      filteredCalEvents.filter(e => isSameDay(parseLocalDate(e.event_date), d)).forEach(() => { if (dots.length < 3) dots.push('#3b82f6') })
      return dots
    }
    const weekDayDots = (d: Date): string[] => {
      const dots: string[] = []
      filteredTasks.filter(t => taskInDay(t, d)).forEach(t => { if (dots.length < 3) dots.push(STATUS_META[t.status].bar) })
      filteredCalEvents.filter(e => isSameDay(parseLocalDate(e.event_date), d)).forEach(() => { if (dots.length < 3) dots.push('#3b82f6') })
      return dots
    }

    // Navigasyon etiketi
    const mobileNavLabel =
      mobileViewMode === 'month' ? `${TR_MONTHS[viewMonth]} ${viewYear}` :
      mobileViewMode === 'week'  ? (() => { const s = mobileWeekDays[0], e = mobileWeekDays[6]; return s.getMonth() === e.getMonth() ? `${TR_MONTHS[s.getMonth()]} ${s.getFullYear()}` : `${TR_MONTHS[s.getMonth()]} – ${TR_MONTHS[e.getMonth()]} ${e.getFullYear()}` })() :
      `${mobileSelectedDay.getDate()} ${TR_MONTHS[mobileSelectedDay.getMonth()]} ${mobileSelectedDay.getFullYear()}`

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f5f7fa', overflow: 'hidden' }}>

        {/* ── Başlık + View seçici + Navigasyon ── */}
        <div style={{ background: '#fff', padding: '14px 16px 0', flexShrink: 0, borderBottom: '1px solid #f3f4f6' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: '#111827', letterSpacing: '-0.03em' }}>Takvim</span>
            <button onClick={() => { setQuickAddDay(mobileSelectedDay); setQuickAddHour(null) }}
              style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: '#f3f4f6', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#374151' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
          </div>

          {/* View seçici: Ay / Hafta / Gün */}
          <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: 10, padding: 3, gap: 2, marginBottom: 10 }}>
            {(['month', 'week', 'day'] as const).map(mode => (
              <button key={mode} onClick={() => setMobileViewMode(mode)} style={{
                flex: 1, padding: '6px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 12, fontWeight: 600, transition: 'all 0.15s',
                background: mobileViewMode === mode ? '#fff' : 'transparent',
                color: mobileViewMode === mode ? '#111827' : '#9ca3af',
                boxShadow: mobileViewMode === mode ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
              }}>
                {mode === 'month' ? 'Ay' : mode === 'week' ? 'Hafta' : 'Gün'}
              </button>
            ))}
          </div>

          {/* Navigasyon: önceki / etiket / sonraki */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <button onClick={mobileViewMode === 'month' ? mobilePrevMonth : mobileViewMode === 'week' ? mobilePrevWeek : mobilePrevDay}
              style={{ width: 32, height: 32, border: 'none', background: '#f3f4f6', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontSize: 16 }}>‹</button>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{mobileNavLabel}</span>
            <button onClick={mobileViewMode === 'month' ? mobileNextMonth : mobileViewMode === 'week' ? mobileNextWeek : mobileNextDay}
              style={{ width: 32, height: 32, border: 'none', background: '#f3f4f6', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontSize: 16 }}>›</button>
          </div>

          {/* ── AY görünümü: ay ızgarası ── */}
          {mobileViewMode === 'month' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', marginBottom: 4 }}>
                {TR_DAYS_SHORT.map((d, i) => (
                  <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 600, color: i >= 5 ? '#d1d5db' : '#9ca3af', paddingBottom: 4 }}>{d}</div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', paddingBottom: 8 }}>
                {mobileCells.map((day, idx) => {
                  const col = idx % 7
                  const isToday_   = day ? isMobileToday(day) : false
                  const isSelected = day ? isMobileSel(day) : false
                  const dots       = day ? mobileDayDots(day) : []
                  const isWknd     = col === 5 || col === 6
                  return (
                    <div key={idx} onClick={() => day && setMobileSelectedDay(new Date(viewYear, viewMonth, day))}
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingBottom: 2, cursor: day ? 'pointer' : 'default' }}>
                      {day ? (
                        <>
                          <div style={{
                            width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: isSelected ? '#2288c9' : 'transparent',
                            color: isSelected ? '#fff' : isToday_ ? '#ef4444' : isWknd ? '#d1d5db' : '#374151',
                            fontSize: 12, fontWeight: isSelected || isToday_ ? 700 : 400,
                            border: isToday_ && !isSelected ? '1.5px solid #ef4444' : 'none',
                          }}>{day}</div>
                          <div style={{ display: 'flex', gap: 2, marginTop: 1, height: 5, alignItems: 'center' }}>
                            {dots.map((color, di) => (
                              <div key={di} style={{ width: 3, height: 3, borderRadius: '50%', background: isSelected ? 'rgba(255,255,255,0.7)' : color }} />
                            ))}
                          </div>
                        </>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {/* ── HAFTA görünümü: 7 gün şeridi ── */}
          {mobileViewMode === 'week' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, paddingBottom: 10 }}>
              {mobileWeekDays.map((d, i) => {
                const isToday_   = isSameDay(d, today)
                const isSelected = isSameDay(d, mobileSelectedDay)
                const dots       = weekDayDots(d)
                const isWknd     = i >= 5
                return (
                  <div key={i} onClick={() => setMobileSelectedDay(d)}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', gap: 2 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: isWknd ? '#d1d5db' : '#9ca3af' }}>{TR_DAYS_SHORT[i]}</div>
                    <div style={{
                      width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: isSelected ? '#2288c9' : 'transparent',
                      color: isSelected ? '#fff' : isToday_ ? '#ef4444' : isWknd ? '#d1d5db' : '#374151',
                      fontSize: 13, fontWeight: isSelected || isToday_ ? 700 : 400,
                      border: isToday_ && !isSelected ? '1.5px solid #ef4444' : 'none',
                    }}>{d.getDate()}</div>
                    <div style={{ display: 'flex', gap: 2, height: 5, alignItems: 'center' }}>
                      {dots.map((color, di) => (
                        <div key={di} style={{ width: 3, height: 3, borderRadius: '50%', background: isSelected ? 'rgba(255,255,255,0.7)' : color }} />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Seçilen Gün Başlık Bandı ── */}
        <div style={{ background: '#1a2744', padding: '10px 16px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>
            {TR_DAYS_FULL[getWeekdayMon(mobileSelectedDay)]}, {mobileSelectedDay.getDate()} {TR_MONTHS[mobileSelectedDay.getMonth()]} {mobileSelectedDay.getFullYear()}
          </span>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{totalItems} öğe</span>
        </div>

        {/* ── AY modu: düz liste ── */}
        {mobileViewMode === 'month' && (
          <div style={{ flex: 1, overflowY: 'auto', background: '#fff' }}>
            {totalItems === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 20px', gap: 10 }}>
                <div style={{ fontSize: 32 }}>📅</div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>Bu gün boş</div>
                  <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 3 }}>Etkinlik veya görev yok</div>
                </div>
              </div>
            ) : (
              <>
                {mobileDayTasks.map((task) => {
                  const m = STATUS_META[task.status]
                  const r = getEffectiveRange(task)
                  return (
                    <button key={task.id} onClick={() => setSelectedEvent(task)}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', background: '#fff', border: 'none', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', textAlign: 'left', boxSizing: 'border-box' }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ marginBottom: 4 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: m.bar, color: '#fff' }}>{m.label.toUpperCase()}</span>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 500, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        {r && <div style={{ fontSize: 11, color: '#9ca3af', whiteSpace: 'nowrap' }}>{fmtShort(r.start)}{!isSameDay(r.start, r.end) ? ` – ${fmtShort(r.end)}` : ''}</div>}
                        {task.assigneeName && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{task.assigneeName}</div>}
                      </div>
                    </button>
                  )
                })}
                {mobileDayEvents.map((event) => (
                  <button key={event.id} onClick={() => setSelectedCalEvent(event)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', background: '#fff', border: 'none', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', textAlign: 'left', boxSizing: 'border-box' }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ marginBottom: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: '#3b82f6', color: '#fff' }}>ETKİNLİK</span>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.title}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 11, color: '#9ca3af', whiteSpace: 'nowrap' }}>
                        {event.is_all_day ? 'Tüm gün' : (event.start_slot != null ? TIME_OPTIONS[event.start_slot].label : '')}
                      </div>
                    </div>
                  </button>
                ))}
              </>
            )}
          </div>
        )}

        {/* ── HAFTA / GÜN modu: saatli ızgara ── */}
        {(mobileViewMode === 'week' || mobileViewMode === 'day') && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff' }}>
            {/* Tüm gün şeridi */}
            <div style={{ flexShrink: 0, display: 'flex', borderBottom: '2px solid #f0f0f0', minHeight: 44 }}>
              <div style={{ width: 44, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 7, flexShrink: 0 }}>
                <span style={{ fontSize: 8, fontWeight: 700, color: '#c4c8d0', textTransform: 'uppercase', letterSpacing: '0.05em', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>Tüm Gün</span>
              </div>
              <div style={{ flex: 1, padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {mobileDayTasks.length === 0 && mobileDayEvents.filter(e => e.is_all_day).length === 0 ? (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <button onClick={() => { setQuickAddDay(mobileSelectedDay); setQuickAddHour(null) }}
                      style={{ fontSize: 18, color: '#e5e7eb', background: 'none', border: 'none', cursor: 'pointer' }}>+</button>
                  </div>
                ) : (
                  <>
                    {mobileDayTasks.map(t => <AllDayCard key={t.id} task={t} onClick={() => setSelectedEvent(t)} />)}
                    {mobileDayEvents.filter(e => e.is_all_day).map(e => <CalEventChip key={e.id} event={e} onClick={() => setSelectedCalEvent(e)} />)}
                  </>
                )}
              </div>
            </div>
            {/* Saatli ızgara */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <TimeGrid
                colCount={1}
                todayCols={[isSameDay(mobileSelectedDay, today)]}
                timedEvents={mobileDayEvents
                  .filter(e => !e.is_all_day && e.start_slot != null && e.end_slot != null)
                  .map(e => ({ colIndex: 0, startSlot: e.start_slot!, endSlot: e.end_slot!, title: e.title, id: e.id }))}
                onSlotClick={(_, hour) => { setQuickAddDay(mobileSelectedDay); setQuickAddHour(hour) }}
                onTimedEventClick={(id) => { const ev = mobileDayEvents.find(e => e.id === id); if (ev) setSelectedCalEvent(ev) }}
              />
            </div>
          </div>
        )}

        {/* ── Görev Detay Bottom Sheet ── */}
        {selectedEvent && org?.slug && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}
            onClick={() => setSelectedEvent(null)}
          >
            <div onClick={e => e.stopPropagation()}
              style={{ background: '#fff', borderRadius: '20px 20px 0 0', maxHeight: '85vh', overflow: 'auto' }}
            >
              <div style={{ width: 36, height: 4, borderRadius: 2, background: '#e5e7eb', margin: '12px auto 0' }} />
              <div style={{ padding: '14px 20px 12px', borderBottom: '1px solid #f3f4f6', marginTop: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: STATUS_META[selectedEvent.status].bar, color: '#fff' }}>{STATUS_META[selectedEvent.status].label.toUpperCase()}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 999, background: '#f3f4f6', color: '#374151', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: PRIORITY_META[selectedEvent.priority ?? 'normal'].color, display: 'inline-block' }} />
                    {PRIORITY_META[selectedEvent.priority ?? 'normal'].label}
                  </span>
                </div>
                <div style={{ fontSize: 17, fontWeight: 700, color: '#111827', lineHeight: 1.35 }}>{selectedEvent.title}</div>
              </div>
              <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(() => { const r = getEffectiveRange(selectedEvent); if (!r) return null; return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: '#f9fafb' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    <span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>{isSameDay(r.start, r.end) ? fmtShort(r.start) : `${fmtShort(r.start)} – ${fmtShort(r.end)}`}</span>
                  </div>
                )})()}
                {selectedEvent.assigneeName && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: '#f9fafb' }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: STATUS_META[selectedEvent.status].bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: STATUS_META[selectedEvent.status].text }}>{selectedEvent.assigneeName.charAt(0).toUpperCase()}</div>
                    <span style={{ fontSize: 13, color: '#374151' }}>{selectedEvent.assigneeName}</span>
                  </div>
                )}
                {selectedEvent.description && (
                  <div style={{ padding: '10px 12px', borderRadius: 10, background: '#f9fafb' }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Açıklama</p>
                    <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6 }}>{selectedEvent.description}</p>
                  </div>
                )}
              </div>
              <div style={{ padding: '4px 20px 30px' }}>
                <Link href={`/org/${org.slug}/tasks/${selectedEvent.id}`}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '13px 0', borderRadius: 12, background: '#2288c9', color: '#fff', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}
                >
                  Göreve Git
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* ── Hızlı Etkinlik Ekle ── */}
        {quickAddDay && org?.id && userId && (
          <QuickAddModal
            day={quickAddDay}
            initialHour={quickAddHour ?? undefined}
            orgId={org.id}
            userId={userId}
            onClose={() => { setQuickAddDay(null); setQuickAddHour(null) }}
            onCreated={() => { loadCalendarEvents(); setQuickAddDay(null); setQuickAddHour(null) }}
          />
        )}

        {/* ── Etkinlik Düzenle/Sil ── */}
        {selectedCalEvent && org?.id && userId && (
          <CalEventEditModal
            event={selectedCalEvent}
            orgId={org.id}
            userId={userId}
            onClose={() => setSelectedCalEvent(null)}
            onUpdated={() => { loadCalendarEvents(); setSelectedCalEvent(null) }}
            onDeleted={() => { loadCalendarEvents(); setSelectedCalEvent(null) }}
          />
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#f5f7fa' }}>

      {/* ── Mini Takvim Sidebar (Figma: CalendarSidebar) ──── */}
      <CalendarSidebar tasks={tasks} calendarEvents={calendarEvents} viewDay={viewDay} view={view} onDayClick={handleDayClick} />

      {/* ── Ana İçerik ──────────────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <CalendarHeader currentLabel={currentLabel} view={view} onViewChange={setView} onPrevious={handlePrevious} onNext={handleNext} onToday={handleToday} tasks={tasks} searchQuery={searchQuery} onSearch={setSearchQuery} />

        {/* View içerikleri */}
        {view==='week' && <WeekView weekDays={weekDays} weekTaskMap={weekTaskMap} calendarEvents={filteredCalEvents} today={today} onEventClick={setSelectedEvent} onCalEventClick={setSelectedCalEvent} onDayClick={handleDayClick} onAddEvent={(d, h) => { setQuickAddDay(d); setQuickAddHour(h ?? null) }} />}
        {view==='day'  && <DayView  viewDay={viewDay} dayTasks={dayTasks} calendarEvents={filteredCalEvents} today={today} onEventClick={setSelectedEvent} onCalEventClick={setSelectedCalEvent} onAddEvent={(d, h) => { setQuickAddDay(d); setQuickAddHour(h ?? null) }} />}
        {view==='month' && (
          <>
            <MonthView cells={cells} tasksByDay={tasksByDay} calendarEvents={filteredCalEvents} totalDays={totalDays} viewYear={viewYear} viewMonth={viewMonth} today={today} onEventClick={setSelectedEvent} onCalEventClick={setSelectedCalEvent} onDayClick={handleDayClick} onAddEvent={(d) => { setQuickAddDay(d); setQuickAddHour(null) }} />
            {/* Tarih atanmamış — ay görünümünde göster */}
            {undatedTasks.length > 0 && (
              <div style={{ padding: '0 24px 16px' }}>
                <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 20px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Tarih Atanmamış</span>
                    <span style={{ fontSize: 12, color: '#9ca3af' }}>{undatedTasks.length} görev</span>
                  </div>
                  {undatedTasks.map((t, i) => {
                    const m = STATUS_META[t.status]
                    return (
                      <button key={t.id} onClick={() => setSelectedEvent(t)} style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'9px 20px', cursor:'pointer', border:'none', background:'transparent', borderBottom:i<undatedTasks.length-1?'1px solid #f9fafb':undefined, textAlign:'left' }} onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='#fafafa'}} onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='transparent'}}>
                        <span style={{ width:8, height:8, borderRadius:'50%', background:PRIORITY_META[t.priority??'normal'].color, flexShrink:0 }} />
                        <span style={{ flex:1, fontSize:13, fontWeight:500, color:'#111827', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.title}</span>
                        {t.assigneeName && <span style={{ fontSize:11, color:'#9ca3af' }}>{t.assigneeName}</span>}
                        <span style={{ fontSize:11, fontWeight:600, padding:'2px 8px', borderRadius:999, background:m.bg, color:m.text }}>{m.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Event Modal (Figma: EventModal) ──────────────────── */}
      {selectedEvent && org?.slug && (
        <EventModal task={selectedEvent} orgSlug={org.slug} onClose={() => setSelectedEvent(null)} />
      )}

      {/* ── Hızlı Etkinlik Ekleme ───────────────────────────────── */}
      {quickAddDay && org?.id && userId && (
        <QuickAddModal
          day={quickAddDay}
          initialHour={quickAddHour ?? undefined}
          orgId={org.id}
          userId={userId}
          onClose={() => { setQuickAddDay(null); setQuickAddHour(null) }}
          onCreated={() => {
            loadCalendarEvents()
            setQuickAddDay(null)
            setQuickAddHour(null)
          }}
        />
      )}

      {/* ── Etkinlik Düzenle/Sil ─────────────────────────────── */}
      {selectedCalEvent && org?.id && userId && (
        <CalEventEditModal
          event={selectedCalEvent}
          orgId={org.id}
          userId={userId}
          onClose={() => setSelectedCalEvent(null)}
          onUpdated={() => { loadCalendarEvents(); setSelectedCalEvent(null) }}
          onDeleted={() => { loadCalendarEvents(); setSelectedCalEvent(null) }}
        />
      )}

    </div>
  )
}
