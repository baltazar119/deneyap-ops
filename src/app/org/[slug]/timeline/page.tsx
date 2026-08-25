'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { useOrg } from '@/lib/supabase/orgContext'
import { useIsMobile } from '@/lib/useIsMobile'
import { getCachedData, setCachedData } from '@/lib/pageDataCache'
import type { Task, Sprint, TaskDependency, TaskStatus } from '@/types/database'

// ── Sabitler ──────────────────────────────────────────────────────────────────

const TR_MONTHS     = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık']
const TR_MONTHS_S   = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara']
const TR_DAYS_S     = ['Pt','Sa','Ça','Pe','Cu','Ct','Pa']

const STATUS_STYLE: Record<TaskStatus, { bar: string; bg: string; text: string; badge: string; badgeText: string; label: string }> = {
  backlog:  { bar: '#a78bfa', bg: '#f5f3ff', text: '#5b21b6', badge: '#ede9fe', badgeText: '#6d28d9', label: 'Beklemede' },
  doing:    { bar: '#3b82f6', bg: '#eff6ff', text: '#1d4ed8', badge: '#dbeafe', badgeText: '#1e40af', label: 'Yapılıyor' },
  testing:  { bar: '#f59e0b', bg: '#fffbeb', text: '#b45309', badge: '#fef3c7', badgeText: '#92400e', label: 'Test' },
  blocked:  { bar: '#ef4444', bg: '#fff1f2', text: '#b91c1c', badge: '#fee2e2', badgeText: '#991b1b', label: 'Bloke' },
  done:     { bar: '#22c55e', bg: '#f0fdf4', text: '#15803d', badge: '#dcfce7', badgeText: '#166534', label: 'Tamamlandı' },
}

const PRIORITY_DOT: Record<string, string> = {
  critical: '#ef4444', high: '#f59e0b', normal: '#3b82f6', low: '#9ca3af',
}
const PRIORITY_LABEL: Record<string, string> = {
  critical: 'Kritik', high: 'Yüksek', normal: 'Normal', low: 'Düşük',
}
void PRIORITY_LABEL

const TYPE_LABELS: Record<string, string> = {
  mechanical:'Mekanik', electrical:'Elektrik', software:'Yazılım',
  research:'Araştırma', documentation:'Dokümantasyon', test:'Test', other:'Diğer',
}

const ROW_H    = 56
const HEADER_H = 68   // 2-row: month (34px) + week/day (34px)
const LEFT_W   = 300

const ZOOM_LEVELS = {
  hafta:   { px: 80, label: 'Hafta' },
  ay:      { px: 28, label: 'Ay' },
  ceyrek:  { px: 9,  label: 'Çeyrek' },
} as const
type ZoomKey = keyof typeof ZOOM_LEVELS

const AVATAR_COLORS = ['#3b82f6','#8b5cf6','#ec4899','#f59e0b','#10b981','#ef4444','#06b6d4']

// ── Yardımcılar ───────────────────────────────────────────────────────────────

function addDays(d: Date, n: number): Date { const r = new Date(d); r.setDate(r.getDate() + n); return r }
function daysBetween(a: Date, b: Date): number { return Math.round((b.getTime() - a.getTime()) / 86400000) }
function parseLocal(s: string): Date {
  const [y, m, d] = s.split('-').map(Number); const dt = new Date(y, m - 1, d); dt.setHours(0,0,0,0); return dt
}
function fmtDate(d: Date): string { return `${d.getDate()} ${TR_MONTHS_S[d.getMonth()]} '${String(d.getFullYear()).slice(2)}` }
function getWeekdayMon(d: Date) { return (d.getDay() + 6) % 7 }
function startOfWeekMon(d: Date): Date { const r = new Date(d); r.setDate(d.getDate() - getWeekdayMon(d)); r.setHours(0,0,0,0); return r }
function isoWeekNum(d: Date): number {
  const tmp = new Date(d); tmp.setHours(0,0,0,0)
  tmp.setDate(tmp.getDate() + 3 - getWeekdayMon(tmp))
  const week1 = new Date(tmp.getFullYear(), 0, 4)
  return 1 + Math.round(((tmp.getTime() - week1.getTime()) / 86400000 - 3 + getWeekdayMon(week1)) / 7)
}

function getEffectiveRange(task: Task): { start: Date; end: Date } | null {
  if (!task.start_date && !task.due_date) return null
  let start: Date, end: Date
  if (task.start_date && task.due_date) { start = parseLocal(task.start_date); end = parseLocal(task.due_date) }
  else if (task.due_date) { start = end = parseLocal(task.due_date) }
  else { start = end = parseLocal(task.start_date!) }
  if (end < start) end = start
  return { start, end }
}

// ── Tipler ────────────────────────────────────────────────────────────────────

interface TaskWithMeta extends Task {
  assigneeName?: string
  assigneeAvatarUrl?: string | null
  effectiveStart: Date
  effectiveEnd: Date
}
type TimelineCache = { dated: TaskWithMeta[]; undated: Task[]; sprints: Sprint[]; deps: TaskDependency[] }

// ── Bileşen ────────────────────────────────────────────────────────────────────

export default function TimelinePage() {
  const router = useRouter()
  const { org, orgRole, userId, loading: orgLoading } = useOrg()

  const _key   = org?.id && userId ? `timeline:${org.id}:${orgRole}:${userId}` : ''
  const _cache = _key ? getCachedData<TimelineCache>(_key) : null

  const [datedTasks, setDatedTasks]     = useState<TaskWithMeta[]>(_cache?.dated ?? [])
  const [undatedTasks, setUndatedTasks] = useState<Task[]>(_cache?.undated ?? [])
  const [sprints, setSprints]           = useState<Sprint[]>(_cache?.sprints ?? [])
  const [deps, setDeps]                 = useState<TaskDependency[]>(_cache?.deps ?? [])
  const [loading, setLoading]           = useState(_cache === null)
  const [zoom, setZoom]                 = useState<ZoomKey>('ay')
  const [groupBy, setGroupBy]           = useState<'none' | 'sprint' | 'type'>('none')
  const [tooltip, setTooltip]           = useState<{ task: TaskWithMeta; x: number; y: number } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()

  useEffect(() => {
    if (orgLoading) return
    if (!org || !userId) return
    if (orgRole === 'consultant') { router.replace(`/org/${org.slug}/consultant`); return }
    const cacheKey = _key
    const already  = datedTasks.length > 0 || undatedTasks.length > 0

    async function load(bg = false) {
      let q = supabase.from('tasks').select('*').eq('organization_id', org!.id).order('start_date', { ascending: true, nullsFirst: false })
      if (orgRole === 'member') q = q.eq('assignee_id', userId ?? '')
      const [taskRes, sprintRes, depRes] = await Promise.all([
        q,
        supabase.from('sprints').select('*').eq('organization_id', org!.id).order('start_date'),
        supabase.from('task_dependencies').select('task_id, depends_on, id, created_at'),
      ])
      const ids = Array.from(new Set((taskRes.data ?? []).map((t: Task) => t.assignee_id).filter(Boolean))) as string[]
      let profileMap: Record<string, { name: string; avatarUrl: string | null }> = {}
      if (ids.length) {
        const { data: profs } = await supabase.from('profiles').select('id, full_name, avatar_url').in('id', ids)
        profileMap = Object.fromEntries((profs ?? []).map((p: { id: string; full_name: string | null; avatar_url: string | null }) => [p.id, { name: p.full_name ?? '', avatarUrl: p.avatar_url }]))
      }
      const dated: TaskWithMeta[] = []; const undated: Task[] = []
      for (const t of (taskRes.data ?? []) as Task[]) {
        const range = getEffectiveRange(t)
        if (range) dated.push({ ...t, assigneeName: t.assignee_id ? profileMap[t.assignee_id]?.name : undefined, assigneeAvatarUrl: t.assignee_id ? profileMap[t.assignee_id]?.avatarUrl : undefined, effectiveStart: range.start, effectiveEnd: range.end })
        else undated.push(t)
      }
      const sprintsList = (sprintRes.data ?? []) as Sprint[]
      const depsList    = (depRes.data ?? []) as TaskDependency[]
      setSprints(sprintsList); setDatedTasks(dated); setUndatedTasks(undated); setDeps(depsList)
      setCachedData<TimelineCache>(cacheKey, { dated, undated, sprints: sprintsList, deps: depsList })
      if (!bg) setLoading(false)
    }
    load(already)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgLoading, org?.id, userId, orgRole])

  if (orgLoading || loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#f5f7fa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 36, height: 36, border: '3px solid #2288c9', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    )
  }

  // ── Gantt hesaplama ──────────────────────────────────────────────────────────

  const pxPerDay  = ZOOM_LEVELS[zoom].px
  const sprintMap = Object.fromEntries(sprints.map(s => [s.id, s]))

  let groups: { label: string; tasks: TaskWithMeta[] }[]
  if (groupBy === 'sprint') {
    const gm: Record<string, TaskWithMeta[]> = {}
    for (const t of datedTasks) { const k = t.sprint_id ?? '__none'; if (!gm[k]) gm[k] = []; gm[k].push(t) }
    groups = Object.entries(gm).map(([k, ts]) => ({ label: k === '__none' ? 'Sprint Yok' : (sprintMap[k]?.name ?? k), tasks: ts }))
  } else if (groupBy === 'type') {
    const gm: Record<string, TaskWithMeta[]> = {}
    for (const t of datedTasks) { const k = t.task_type ?? 'other'; if (!gm[k]) gm[k] = []; gm[k].push(t) }
    groups = Object.entries(gm).map(([k, ts]) => ({ label: TYPE_LABELS[k] ?? k, tasks: ts }))
  } else {
    groups = [{ label: '', tasks: datedTasks }]
  }

  const flatTasks    = groups.flatMap(g => g.tasks)
  const taskIndexMap = Object.fromEntries(flatTasks.map((t, i) => [t.id, i]))

  let rowCount = 0
  const groupOffsets: { group: (typeof groups)[0]; rowStart: number }[] = []
  for (const g of groups) {
    groupOffsets.push({ group: g, rowStart: rowCount })
    if (groupBy !== 'none') rowCount++
    rowCount += g.tasks.length
  }
  const ganttH = rowCount * ROW_H

  const today = new Date()
  let rangeStart = addDays(today, -7)
  let rangeEnd   = addDays(today, 30)
  if (datedTasks.length > 0) {
    rangeStart = addDays(new Date(Math.min(...datedTasks.map(t => t.effectiveStart.getTime()))), -7)
    rangeEnd   = addDays(new Date(Math.max(...datedTasks.map(t => t.effectiveEnd.getTime()))), 10)
  }

  const totalDays  = daysBetween(rangeStart, rangeEnd)
  const totalWidth = Math.max(totalDays * pxPerDay, 600)

  function dayX(d: Date) { return daysBetween(rangeStart, d) * pxPerDay }
  const todayX = dayX(today)

  // 2-tier header: top = months, bottom = weeks (hafta/ay zoom) or days (hafta zoom)
  const monthHeaders: { label: string; x: number; width: number }[] = []
  {
    let cur = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1)
    while (cur <= rangeEnd) {
      const monthEnd = new Date(cur.getFullYear(), cur.getMonth() + 1, 0)
      const x    = Math.max(0, dayX(cur))
      const endX = Math.min(totalWidth, dayX(addDays(monthEnd, 1)))
      monthHeaders.push({ label: `${TR_MONTHS[cur.getMonth()]} ${cur.getFullYear()}`, x, width: endX - x })
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
    }
  }

  // Sub-headers depending on zoom
  const subHeaders: { label: string; x: number; width: number; isToday?: boolean }[] = []
  if (zoom === 'hafta') {
    // Day headers
    let cur = new Date(rangeStart)
    while (cur <= rangeEnd) {
      const x = dayX(cur)
      const isT = cur.getFullYear() === today.getFullYear() && cur.getMonth() === today.getMonth() && cur.getDate() === today.getDate()
      subHeaders.push({ label: TR_DAYS_S[getWeekdayMon(cur)] + ' ' + cur.getDate(), x, width: pxPerDay, isToday: isT })
      cur = addDays(cur, 1)
    }
  } else {
    // Week headers
    let cur = startOfWeekMon(rangeStart)
    while (cur <= rangeEnd) {
      const x = Math.max(0, dayX(cur))
      const endX = Math.min(totalWidth, dayX(addDays(cur, 7)))
      const wn = isoWeekNum(cur)
      const containsToday = today >= cur && today < addDays(cur, 7)
      subHeaders.push({ label: `H${wn}`, x, width: endX - x, isToday: containsToday })
      cur = addDays(cur, 7)
    }
  }

  // Dependency arrows
  const depPaths: { d: string; key: string }[] = []
  for (const dep of deps) {
    const fi = taskIndexMap[dep.depends_on], ti = taskIndexMap[dep.task_id]
    if (fi === undefined || ti === undefined) continue
    const ft = flatTasks[fi], tt = flatTasks[ti]
    const fx = dayX(ft.effectiveEnd), fy = fi * ROW_H + ROW_H / 2
    const tx = dayX(tt.effectiveStart), ty = ti * ROW_H + ROW_H / 2
    const mx = fx + Math.max(12, (tx - fx) / 2)
    depPaths.push({ d: `M${fx},${fy} L${mx},${fy} L${mx},${ty} L${tx},${ty}`, key: dep.id })
  }

  // ── Mobil Görünüm — Gantt (dar sol panel + yatay scroll) ───────────────────
  if (isMobile) {
    const M_ROW_H    = 42
    const M_HDR_H    = 50   // 2×25px
    const M_LEFT_W   = 130
    const mGanttH    = rowCount * M_ROW_H
    void M_LEFT_W

    // Mobile dep paths (recompute with mobile row height)
    const mDepPaths: { d: string; key: string }[] = []
    for (const dep of deps) {
      const fi = taskIndexMap[dep.depends_on], ti = taskIndexMap[dep.task_id]
      if (fi === undefined || ti === undefined) continue
      const ft = flatTasks[fi], tt = flatTasks[ti]
      const fx = dayX(ft.effectiveEnd), fy = fi * M_ROW_H + M_ROW_H / 2
      const tx = dayX(tt.effectiveStart), ty = ti * M_ROW_H + M_ROW_H / 2
      const mx = fx + Math.max(10, (tx - fx) / 2)
      mDepPaths.push({ d: `M${fx},${fy} L${mx},${fy} L${mx},${ty} L${tx},${ty}`, key: dep.id })
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f5f7fa', overflow: 'hidden' }}>

        {/* Başlık + kontroller */}
        <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px 10px' }}>
            <h1 style={{ fontSize: 18, fontWeight: 800, color: '#111827', margin: 0, letterSpacing: '-0.02em' }}>Zaman Çizelgesi</h1>
            {/* Zoom */}
            <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: 10, padding: 2, gap: 1 }}>
              {(Object.entries(ZOOM_LEVELS) as [ZoomKey, { px: number; label: string }][]).map(([key, val]) => (
                <button key={key} onClick={() => setZoom(key)}
                  style={{ padding: '4px 10px', fontSize: 11, fontWeight: 700, border: 'none', cursor: 'pointer', borderRadius: 8, background: zoom === key ? '#fff' : 'transparent', color: zoom === key ? '#111827' : '#9ca3af', boxShadow: zoom === key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
                >{val.label}</button>
              ))}
            </div>
          </div>
          {/* Gruplama */}
          <div style={{ display: 'flex', paddingLeft: 8, borderTop: '1px solid #f3f4f6' }}>
            {(['none', 'sprint', 'type'] as const).map(g => (
              <button key={g} onClick={() => setGroupBy(g)}
                style={{ padding: '7px 14px', fontSize: 12, fontWeight: 600, border: 'none', background: 'transparent', cursor: 'pointer', color: groupBy === g ? '#2288c9' : '#9ca3af', borderBottom: groupBy === g ? '2px solid #2288c9' : '2px solid transparent' }}
              >{g === 'none' ? 'Tümü' : g === 'sprint' ? 'Sprint' : 'Tip'}</button>
            ))}
          </div>
        </div>

        {/* Gantt */}
        {datedTasks.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 }}>
            <div style={{ fontSize: 40 }}>📅</div>
            <p style={{ fontSize: 14, fontWeight: 600, color: '#374151', margin: 0 }}>Henüz tarihlendirilmiş görev yok</p>
            <p style={{ fontSize: 12, color: '#9ca3af', margin: 0, textAlign: 'center' }}>Görevlere başlangıç ve/veya son tarih ekleyince burada görünür</p>
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden', background: '#fff' }}>

            {/* Sol panel — sabit */}
            <div style={{ width: M_LEFT_W, flexShrink: 0, borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ height: M_HDR_H, flexShrink: 0, borderBottom: '1px solid #e5e7eb', background: '#fafafa', display: 'flex', alignItems: 'center', padding: '0 12px' }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Görev</span>
              </div>
              <div style={{ flex: 1, overflowY: 'hidden' }}>
                {groupOffsets.map(({ group, rowStart }) => (
                  <div key={group.label + rowStart}>
                    {groupBy !== 'none' && (
                      <div style={{ height: M_ROW_H, display: 'flex', alignItems: 'center', padding: '0 10px', background: '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#374151', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.label}</span>
                      </div>
                    )}
                    {group.tasks.map(task => {
                      const s = STATUS_STYLE[task.status]
                      return (
                        <div key={task.id}
                          onClick={() => router.push(`/org/${org?.slug}/tasks/${task.id}`)}
                          style={{ height: M_ROW_H, display: 'flex', alignItems: 'center', padding: '0 10px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer', gap: 7 }}
                        >
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.bar, flexShrink: 0 }} />
                          <span style={{ fontSize: 11, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, lineHeight: 1.2 }}>{task.title}</span>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* Sağ panel — yatay scroll */}
            <div style={{ flex: 1, overflowX: 'auto', overflowY: 'auto' }}>
              <div style={{ width: totalWidth, position: 'relative', minHeight: M_HDR_H + mGanttH }}>

                {/* Header */}
                <div style={{ position: 'sticky', top: 0, zIndex: 10, height: M_HDR_H, background: '#fafafa', borderBottom: '1px solid #e5e7eb' }}>
                  <div style={{ height: 25, position: 'relative', borderBottom: '1px solid #f0f0f0' }}>
                    {monthHeaders.map((mh, i) => (
                      <div key={i} style={{ position: 'absolute', left: mh.x, width: mh.width, height: 25, display: 'flex', alignItems: 'center', paddingLeft: 8, overflow: 'hidden', borderRight: '1px solid #f0f0f0' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#374151', whiteSpace: 'nowrap' }}>{mh.label}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ height: 25, position: 'relative' }}>
                    {subHeaders.map((sh, i) => (
                      <div key={i} style={{ position: 'absolute', left: sh.x, width: sh.width, height: 25, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid #f3f4f6', background: sh.isToday ? '#eff6ff' : 'transparent', overflow: 'hidden' }}>
                        <span style={{ fontSize: 9, fontWeight: sh.isToday ? 700 : 500, color: sh.isToday ? '#2288c9' : '#9ca3af', whiteSpace: 'nowrap' }}>{sh.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Arkaplan çizgileri */}
                <div style={{ position: 'absolute', top: M_HDR_H, left: 0, width: totalWidth, height: mGanttH, pointerEvents: 'none' }}>
                  {subHeaders.map((sh, i) => (
                    <div key={i} style={{ position: 'absolute', left: sh.x, top: 0, width: sh.width, height: mGanttH, borderRight: '1px solid #f3f4f6', background: sh.isToday ? '#fafcff' : 'transparent' }} />
                  ))}
                </div>

                {/* Sprint şeritleri */}
                {sprints.map(sprint => {
                  const sx = dayX(parseLocal(sprint.start_date))
                  const ex = dayX(addDays(parseLocal(sprint.end_date), 1))
                  return (
                    <div key={sprint.id} style={{ position: 'absolute', left: sx, top: M_HDR_H, width: ex - sx, height: mGanttH, pointerEvents: 'none', background: sprint.is_active ? 'rgba(34,136,201,0.04)' : 'transparent', borderLeft: '1px dashed rgba(34,136,201,0.25)', borderRight: '1px dashed rgba(34,136,201,0.25)' }} />
                  )
                })}

                {/* Bugün çizgisi */}
                {todayX >= 0 && todayX <= totalWidth && (
                  <div style={{ position: 'absolute', left: todayX, top: M_HDR_H, width: 2, height: mGanttH, background: '#2288c9', zIndex: 5, pointerEvents: 'none', borderRadius: 1 }} />
                )}

                {/* Görev barları */}
                <div style={{ position: 'absolute', top: M_HDR_H, left: 0, right: 0 }}>
                  {groupOffsets.map(({ group }) => (
                    <div key={group.label}>
                      {groupBy !== 'none' && (
                        <div style={{ height: M_ROW_H, background: '#f8fafc', borderBottom: '1px solid #e5e7eb' }} />
                      )}
                      {group.tasks.map(task => {
                        const s    = STATUS_STYLE[task.status]
                        const barL = dayX(task.effectiveStart)
                        const barR = dayX(addDays(task.effectiveEnd, 1))
                        const barW = Math.max(pxPerDay, barR - barL)
                        const padV = 7
                        return (
                          <div key={task.id} style={{ height: M_ROW_H, borderBottom: '1px solid #f3f4f6', position: 'relative' }}>
                            <div
                              style={{ position: 'absolute', left: barL, top: padV, width: barW, height: M_ROW_H - padV * 2, background: s.bg, borderLeft: `3px solid ${s.bar}`, borderRadius: 6, opacity: task.status === 'done' ? 0.6 : 1, cursor: 'pointer', overflow: 'hidden', display: 'flex', alignItems: 'center', paddingLeft: 7, paddingRight: 6, gap: 5, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
                              onClick={() => router.push(`/org/${org?.slug}/tasks/${task.id}`)}
                            >
                              {task.status === 'done' && barW > 16 && <span style={{ fontSize: 10, color: s.bar, flexShrink: 0 }}>✓</span>}
                              {barW > 40 && (
                                <span style={{ fontSize: 10, fontWeight: 600, color: s.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{task.title}</span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>

                {/* Bağımlılık okları */}
                <svg style={{ position: 'absolute', top: M_HDR_H, left: 0, width: totalWidth, height: mGanttH, pointerEvents: 'none', overflow: 'visible' }}>
                  <defs>
                    <marker id="arr-m" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                      <path d="M0,0 L6,3 L0,6 Z" fill="#94a3b8" />
                    </marker>
                  </defs>
                  {mDepPaths.map(({ d, key }) => (
                    <path key={key} d={d} fill="none" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 3" markerEnd="url(#arr-m)" />
                  ))}
                </svg>

              </div>
            </div>
          </div>
        )}

        {/* Tarihi belirsiz — alt bölüm */}
        {undatedTasks.length > 0 && datedTasks.length > 0 && (
          <div style={{ background: '#fff', borderTop: '1px solid #e5e7eb', maxHeight: 180, overflowY: 'auto', flexShrink: 0 }}>
            <div style={{ padding: '8px 16px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tarihi Belirsiz</span>
              <span style={{ fontSize: 11, color: '#d1d5db' }}>{undatedTasks.length}</span>
            </div>
            {undatedTasks.map(task => {
              const s = STATUS_STYLE[task.status]
              return (
                <Link key={task.id} href={`/org/${org?.slug}/tasks/${task.id}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid #f9fafb', textDecoration: 'none' }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: PRIORITY_DOT[task.priority ?? 'normal'], flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 99, background: s.badge, color: s.badgeText, flexShrink: 0 }}>{s.label}</span>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#f5f7fa' }}>
      <main style={{ padding: '24px 24px 32px' }}>

        {/* ── Başlık ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#111827', letterSpacing: '-0.03em', margin: 0 }}>Zaman Çizelgesi</h1>
            <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4, marginBottom: 0 }}>
              {datedTasks.length > 0
                ? `${fmtDate(rangeStart)} — ${fmtDate(rangeEnd)} · ${datedTasks.length} görev`
                : 'Görevlere başlangıç ve bitiş tarihi ekle'}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {/* Gruplama */}
            <div style={{ display: 'flex', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 3, gap: 2 }}>
              {(['none', 'sprint', 'type'] as const).map(g => (
                <button key={g} onClick={() => setGroupBy(g)}
                  style={{ padding: '6px 14px', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', borderRadius: 9, transition: 'all 0.15s', background: groupBy === g ? '#111827' : 'transparent', color: groupBy === g ? '#fff' : '#6b7280' }}
                >
                  {g === 'none' ? 'Tümü' : g === 'sprint' ? 'Sprint' : 'Tip'}
                </button>
              ))}
            </div>
            {/* Zoom */}
            <div style={{ display: 'flex', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 3, gap: 2 }}>
              {(Object.entries(ZOOM_LEVELS) as [ZoomKey, { px: number; label: string }][]).map(([key, val]) => (
                <button key={key} onClick={() => setZoom(key)}
                  style={{ padding: '6px 14px', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', borderRadius: 9, transition: 'all 0.15s', background: zoom === key ? '#2288c9' : 'transparent', color: zoom === key ? '#fff' : '#6b7280' }}
                >
                  {val.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Gantt ── */}
        {datedTasks.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #e5e7eb', padding: '64px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📅</div>
            <p style={{ fontSize: 15, fontWeight: 600, color: '#374151', margin: '0 0 6px' }}>Henüz tarihlendirilmiş görev yok</p>
            <p style={{ fontSize: 13, color: '#9ca3af', margin: 0 }}>Görevlere başlangıç ve/veya son tarih ekleyince burada görünür</p>
          </div>
        ) : (
          <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
            <div style={{ display: 'flex', overflow: 'hidden', height: HEADER_H + ganttH }}>

              {/* ── Sol Panel ── */}
              <div style={{ width: LEFT_W, flexShrink: 0, borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {/* Header */}
                <div style={{ height: HEADER_H, flexShrink: 0, borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', padding: '0 20px', background: '#fafafa' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Görev</span>
                </div>
                {/* Rows */}
                <div style={{ flex: 1, overflowY: 'hidden' }}>
                  {groupOffsets.map(({ group, rowStart }) => (
                    <div key={group.label + rowStart}>
                      {groupBy !== 'none' && (
                        <div style={{ height: ROW_H, display: 'flex', alignItems: 'center', padding: '0 20px', background: '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{group.label}</span>
                        </div>
                      )}
                      {group.tasks.map(task => {
                        const s  = STATUS_STYLE[task.status]
                        const ac = AVATAR_COLORS[(task.assigneeName ?? 'A').charCodeAt(0) % AVATAR_COLORS.length]
                        const durDays = daysBetween(task.effectiveStart, task.effectiveEnd)
                        return (
                          <div key={task.id}
                            onClick={() => router.push(`/org/${org?.slug}/tasks/${task.id}`)}
                            style={{ height: ROW_H, display: 'flex', alignItems: 'center', padding: '0 16px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer', gap: 10, transition: 'background 0.1s' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f9fafb' }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                          >
                            {/* Status dot */}
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.bar, flexShrink: 0 }} />
                            {/* Title + subtitle */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: 13, fontWeight: 600, color: '#111827', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}>{task.title}</p>
                              <p style={{ fontSize: 11, color: '#9ca3af', margin: '2px 0 0', lineHeight: 1 }}>
                                {durDays === 0 ? fmtDate(task.effectiveStart) : `${fmtDate(task.effectiveStart)} – ${fmtDate(task.effectiveEnd)}`}
                              </p>
                            </div>
                            {/* Assignee avatar */}
                            {task.assigneeName && (
                              task.assigneeAvatarUrl
                                ? <img src={task.assigneeAvatarUrl} alt={task.assigneeName} style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                                : <div style={{ width: 26, height: 26, borderRadius: '50%', background: ac, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{task.assigneeName.charAt(0).toUpperCase()}</div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Sağ Panel — Gantt ── */}
              <div ref={scrollRef} style={{ flex: 1, overflowX: 'auto', overflowY: 'auto' }}>
                <div style={{ width: totalWidth, position: 'relative', minHeight: HEADER_H + ganttH }}>

                  {/* 2-tier header */}
                  <div style={{ position: 'sticky', top: 0, zIndex: 10, height: HEADER_H, background: '#fafafa', borderBottom: '1px solid #e5e7eb' }}>
                    {/* Top tier: months */}
                    <div style={{ height: 34, position: 'relative', borderBottom: '1px solid #f0f0f0' }}>
                      {monthHeaders.map((mh, i) => (
                        <div key={i} style={{ position: 'absolute', left: mh.x, width: mh.width, height: 34, display: 'flex', alignItems: 'center', paddingLeft: 10, overflow: 'hidden', borderRight: '1px solid #f0f0f0' }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#374151', whiteSpace: 'nowrap' }}>{mh.label}</span>
                        </div>
                      ))}
                    </div>
                    {/* Bottom tier: weeks / days */}
                    <div style={{ height: 34, position: 'relative' }}>
                      {subHeaders.map((sh, i) => (
                        <div key={i} style={{ position: 'absolute', left: sh.x, width: sh.width, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid #f3f4f6', background: sh.isToday ? '#eff6ff' : 'transparent', overflow: 'hidden' }}>
                          <span style={{ fontSize: 11, fontWeight: sh.isToday ? 700 : 500, color: sh.isToday ? '#2288c9' : '#9ca3af', whiteSpace: 'nowrap' }}>{sh.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Arka plan çizgileri (dikey) */}
                  <div style={{ position: 'absolute', top: HEADER_H, left: 0, width: totalWidth, height: ganttH, pointerEvents: 'none' }}>
                    {subHeaders.map((sh, i) => (
                      <div key={i} style={{ position: 'absolute', left: sh.x, top: 0, width: sh.width, height: ganttH, borderRight: '1px solid #f3f4f6', background: sh.isToday ? '#fafcff' : 'transparent' }} />
                    ))}
                  </div>

                  {/* Sprint şeritleri */}
                  {sprints.map(sprint => {
                    const sx = dayX(parseLocal(sprint.start_date))
                    const ex = dayX(addDays(parseLocal(sprint.end_date), 1))
                    return (
                      <div key={sprint.id} style={{ position: 'absolute', left: sx, top: HEADER_H, width: ex - sx, height: ganttH, pointerEvents: 'none', background: sprint.is_active ? 'rgba(34,136,201,0.04)' : 'transparent', borderLeft: '1px dashed rgba(34,136,201,0.25)', borderRight: '1px dashed rgba(34,136,201,0.25)' }} />
                    )
                  })}

                  {/* Bugün çizgisi */}
                  {todayX >= 0 && todayX <= totalWidth && (
                    <>
                      <div style={{ position: 'absolute', left: todayX, top: HEADER_H, width: 2, height: ganttH, background: '#2288c9', zIndex: 5, pointerEvents: 'none', borderRadius: 1 }} />
                      <div style={{ position: 'absolute', left: todayX - 1, top: HEADER_H - 6, width: 4, height: 4, borderRadius: '50%', background: '#2288c9', zIndex: 5, pointerEvents: 'none' }} />
                    </>
                  )}

                  {/* Görev barları */}
                  <div style={{ position: 'absolute', top: HEADER_H, left: 0, right: 0 }}>
                    {groupOffsets.map(({ group }) => (
                      <div key={group.label}>
                        {groupBy !== 'none' && (
                          <div style={{ height: ROW_H, background: '#f8fafc', borderBottom: '1px solid #e5e7eb' }} />
                        )}
                        {group.tasks.map(task => {
                          const s        = STATUS_STYLE[task.status]
                          const barL     = dayX(task.effectiveStart)
                          const barR     = dayX(addDays(task.effectiveEnd, 1))
                          const barW     = Math.max(pxPerDay, barR - barL)
                          const isSingle = daysBetween(task.effectiveStart, task.effectiveEnd) === 0
                          void isSingle
                          const isDone   = task.status === 'done'
                          const padV     = 10

                          return (
                            <div key={task.id} style={{ height: ROW_H, borderBottom: '1px solid #f3f4f6', position: 'relative' }}>
                              <div
                                style={{
                                  position: 'absolute',
                                  left: barL,
                                  top: padV,
                                  width: barW,
                                  height: ROW_H - padV * 2,
                                  background: s.bg,
                                  borderLeft: `4px solid ${s.bar}`,
                                  borderRadius: 8,
                                  opacity: isDone ? 0.6 : 1,
                                  cursor: 'pointer',
                                  overflow: 'hidden',
                                  display: 'flex',
                                  alignItems: 'center',
                                  paddingLeft: 10,
                                  paddingRight: 8,
                                  gap: 6,
                                  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                                  transition: 'box-shadow 0.15s, transform 0.1s',
                                }}
                                onClick={() => router.push(`/org/${org?.slug}/tasks/${task.id}`)}
                                onMouseEnter={e => {
                                  const el = e.currentTarget as HTMLElement
                                  el.style.boxShadow = '0 4px 12px rgba(0,0,0,0.12)'
                                  el.style.transform = 'translateY(-1px)'
                                  const rect = el.getBoundingClientRect()
                                  setTooltip({ task, x: rect.left, y: rect.bottom + 6 })
                                }}
                                onMouseLeave={e => {
                                  const el = e.currentTarget as HTMLElement
                                  el.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)'
                                  el.style.transform = 'translateY(0)'
                                  setTooltip(null)
                                }}
                              >
                                {isDone && barW > 20 && <span style={{ fontSize: 12, color: s.bar, flexShrink: 0 }}>✓</span>}
                                {barW > 50 && (
                                  <span style={{ fontSize: 12, fontWeight: 600, color: s.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, lineHeight: 1 }}>
                                    {task.title}
                                  </span>
                                )}
                                {barW > 120 && task.assigneeName && (
                                  <span style={{ fontSize: 10, color: s.text, opacity: 0.6, flexShrink: 0, whiteSpace: 'nowrap' }}>
                                    {task.assigneeName.split(' ')[0]}
                                  </span>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ))}
                  </div>

                  {/* Dependency okları */}
                  <svg style={{ position: 'absolute', top: HEADER_H, left: 0, width: totalWidth, height: ganttH, pointerEvents: 'none', overflow: 'visible' }}>
                    <defs>
                      <marker id="arr" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                        <path d="M0,0 L7,3.5 L0,7 Z" fill="#94a3b8" />
                      </marker>
                    </defs>
                    {depPaths.map(({ d, key }) => (
                      <path key={key} d={d} fill="none" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="5 3" markerEnd="url(#arr)" />
                    ))}
                  </svg>

                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Tarihi Belirsiz Görevler ── */}
        {undatedTasks.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #e5e7eb', overflow: 'hidden', marginTop: 16 }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#374151' }}>Tarihi Belirsiz</span>
              <span style={{ fontSize: 12, color: '#9ca3af' }}>{undatedTasks.length} görev</span>
            </div>
            <div>
              {undatedTasks.map(task => {
                const s = STATUS_STYLE[task.status]
                return (
                  <Link key={task.id} href={`/org/${org?.slug}/tasks/${task.id}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 24px', borderBottom: '1px solid #f9fafb', textDecoration: 'none', transition: 'background 0.1s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#fafafa' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: PRIORITY_DOT[task.priority ?? 'normal'], flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 99, background: s.badge, color: s.badgeText, flexShrink: 0 }}>{s.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Legend ── */}
        {datedTasks.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', marginTop: 14, paddingBottom: 4 }}>
            {(Object.entries(STATUS_STYLE) as [TaskStatus, typeof STATUS_STYLE[TaskStatus]][]).map(([key, s]) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: s.bar, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: '#6b7280' }}>{s.label}</span>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 24, height: 2, borderTop: '2px dashed #94a3b8' }} />
              <span style={{ fontSize: 12, color: '#6b7280' }}>Bağımlılık</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 3, height: 16, background: '#2288c9', borderRadius: 2 }} />
              <span style={{ fontSize: 12, color: '#6b7280' }}>Bugün</span>
            </div>
          </div>
        )}
      </main>

      {/* ── Tooltip ── */}
      {tooltip && (
        <div style={{ position: 'fixed', zIndex: 9999, pointerEvents: 'none', left: tooltip.x, top: tooltip.y, background: '#0d1a2a', color: '#fff', borderRadius: 12, padding: '10px 14px', boxShadow: '0 8px 24px rgba(0,0,0,0.25)', border: '1px solid #1e3a55', maxWidth: 260, minWidth: 160 }}>
          <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 6px', lineHeight: 1.3 }}>{tooltip.task.title}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 11, color: '#8baac4' }}>
              {daysBetween(tooltip.task.effectiveStart, tooltip.task.effectiveEnd) === 0
                ? fmtDate(tooltip.task.effectiveStart)
                : `${fmtDate(tooltip.task.effectiveStart)} → ${fmtDate(tooltip.task.effectiveEnd)}`}
              {' '}({daysBetween(tooltip.task.effectiveStart, tooltip.task.effectiveEnd) + 1} gün)
            </span>
            {tooltip.task.assigneeName && <span style={{ fontSize: 11, color: '#8baac4' }}>👤 {tooltip.task.assigneeName}</span>}
            {tooltip.task.estimated_hours && <span style={{ fontSize: 11, color: '#8baac4' }}>⏱ {tooltip.task.estimated_hours}s tahmini</span>}
            <span style={{ fontSize: 11, marginTop: 2 }}>
              <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 99, background: STATUS_STYLE[tooltip.task.status].badge, color: STATUS_STYLE[tooltip.task.status].badgeText, fontWeight: 600 }}>
                {STATUS_STYLE[tooltip.task.status].label}
              </span>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
