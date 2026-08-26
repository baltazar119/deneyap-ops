'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useCallback } from 'react'
import { raporGorebilirMi } from '@/lib/roller'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useOrg } from '@/lib/supabase/orgContext'
import { useIsMobile } from '@/lib/useIsMobile'
import { isCurrentlyIn, isOverdue } from '@/lib/utils'
import { getCachedData, setCachedData } from '@/lib/pageDataCache'
import { Users, CheckCircle2, Clock, Building2, ArrowRight, Columns2, ListTodo, CheckSquare, ChevronRight, X, AlertCircle } from 'lucide-react'
import type { Profile, Task, Checkin, Schedule, Sprint } from '@/types/database'

type DashCache = {
  profiles: Profile[]
  checkins: Checkin[]
  schedules: Schedule[]
  tasks: Task[]
  activeSprint: Sprint | null
}

export default function DashboardPage() {
  const router = useRouter()
  const { org, orgRole, userId, userEmail, isAdmin, loading: orgLoading } = useOrg()
  const isMobile = useIsMobile()
  const [kpiModal, setKpiModal] = useState<'members'|'inoffice'|'done'|'overdue'|null>(null)

  const _initKey   = org?.id ? `dashboard:${org.id}` : ''
  const _initCache = _initKey ? getCachedData<DashCache>(_initKey) : null

  const [profiles, setProfiles]         = useState<Profile[]>(_initCache?.profiles ?? [])
  const [checkins, setCheckins]         = useState<Checkin[]>(_initCache?.checkins ?? [])
  const [tasks, setTasks]               = useState<Task[]>(_initCache?.tasks ?? [])
  const [, setSchedules]                = useState<Schedule[]>(_initCache?.schedules ?? [])
  const [activeSprint, setActiveSprint] = useState<Sprint | null>(_initCache?.activeSprint ?? null)
  const [loading, setLoading]           = useState(_initCache === null)

  const loadData = useCallback(async (background = false) => {
    if (!org) return
    const cacheKey = `dashboard:${org.id}`
    try {
      const now = new Date()
      const rangeStart = new Date(now); rangeStart.setDate(now.getDate() - 28); rangeStart.setHours(0, 0, 0, 0)
      const rangeEnd   = new Date(now); rangeEnd.setDate(now.getDate() + 28);   rangeEnd.setHours(23, 59, 59, 999)

      const membershipsRes = await supabase.from('organization_members').select('user_id').eq('organization_id', org.id)
      const memberIds = membershipsRes.data?.map(m => m.user_id) ?? []

      const [profilesRes, checkinsRes, schedulesRes, tasksRes, sprintRes] = await Promise.all([
        supabase.from('profiles').select('*').in('id', memberIds).order('created_at', { ascending: true }),
        supabase.from('checkins').select('*').eq('organization_id', org.id)
          .gte('timestamp', rangeStart.toISOString()).lte('timestamp', rangeEnd.toISOString()),
        supabase.from('schedules').select('*').eq('organization_id', org.id)
          .gte('start_time', rangeStart.toISOString()).lte('start_time', rangeEnd.toISOString()),
        supabase.from('tasks').select('*').eq('organization_id', org.id),
        supabase.from('sprints').select('*').eq('organization_id', org.id).eq('is_active', true).maybeSingle(),
      ])

      const allProfiles = profilesRes.data ?? []
      const newTasks    = tasksRes.data ?? []
      const newCheckins = checkinsRes.data ?? []
      const newSchedules= schedulesRes.data ?? []
      const newSprint   = sprintRes.data ?? null

      setProfiles(allProfiles)
      setCheckins(newCheckins)
      setSchedules(newSchedules)
      setTasks(newTasks)
      setActiveSprint(newSprint)

      setCachedData<DashCache>(cacheKey, { profiles: allProfiles, checkins: newCheckins, schedules: newSchedules, tasks: newTasks, activeSprint: newSprint })
    } catch (err) {
      console.error('[Dashboard] loadData error:', err)
    } finally {
      if (!background) setLoading(false)
    }
  }, [org])

  useEffect(() => {
    if (orgLoading) return
    if (!org || !userId) { router.replace('/login'); return }
    // Yetkili Yönetici (viewer) raporları görebilir — ekran zaten salt okunur
    if (!raporGorebilirMi(orgRole)) {
      router.replace(orgRole === 'consultant' ? `/org/${org.slug}/consultant` : `/org/${org.slug}/me`)
      return
    }

    // Son erişim zamanını güncelle
    supabase.from('organization_members')
      .update({ last_accessed_at: new Date().toISOString() })
      .eq('user_id', userId).eq('organization_id', org.id)
      .then(() => {})

    const alreadyLoaded = profiles.length > 0
    loadData(alreadyLoaded)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgLoading, org?.id, userId, isAdmin, orgRole])

  /* ── Loading skeleton ── */
  if (loading) {
    return (
      <div className="min-h-screen px-6 py-5 space-y-4" style={{ background: '#f5f7fa' }}>
        <div className="skeleton h-8 w-52 rounded-xl" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[0,1,2,3].map(i => <div key={i} className="skeleton h-24 rounded-2xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-3 space-y-4">
            <div className="skeleton h-36 rounded-2xl" />
            <div className="skeleton h-16 rounded-2xl" />
          </div>
          <div className="lg:col-span-2 skeleton h-64 rounded-2xl" />
        </div>
      </div>
    )
  }

  /* ── Derived stats ── */
  const nonConsultants  = profiles.filter(p => p.role !== 'consultant')
  const memberCount     = profiles.length
  const inCount         = profiles.filter(p => isCurrentlyIn(checkins.filter(c => c.user_id === p.id))).length
  const doneCount       = tasks.filter(t => t.status === 'done').length
  const overdueCount    = tasks.filter(t => t.status !== 'done' && isOverdue(t.due_date)).length

  const sprintTasks     = activeSprint ? tasks.filter(t => t.sprint_id === activeSprint.id && t.status !== 'done') : []
  const sprintTotal     = sprintTasks.length

  const kpis = [
    { key: 'members' as const, label: 'Toplam Üye',    value: memberCount,  icon: Users,        color: '#2288c9', light: '#e0f2fe' },
    { key: 'inoffice' as const, label: 'Sahada',       value: inCount,      icon: Building2,    color: '#059669', light: '#d1fae5' },
    { key: 'done' as const,    label: 'Yapılan Görev', value: doneCount,    icon: CheckCircle2, color: '#7c3aed', light: '#ede9fe' },
    { key: 'overdue' as const, label: 'Gecikmiş',      value: overdueCount, icon: Clock,        color: overdueCount > 0 ? '#b45309' : '#64748b', light: overdueCount > 0 ? '#fef3c7' : '#f1f5f9' },
  ]

  /* ── KPI Modal verisi ── */
  const profileMap = Object.fromEntries(profiles.map(p => [p.id, p]))
  const modalData = {
    members:  { title: 'Tüm Üyeler', items: profiles.map(p => ({ id: p.id, name: p.full_name || 'İsimsiz', sub: p.role === 'admin' ? 'Yönetici' : p.role === 'consultant' ? 'Danışman' : 'Üye', avatar: p.avatar_url, warn: false })) },
    inoffice: { title: 'Şu An Sahada', items: profiles.filter(p => isCurrentlyIn(checkins.filter(c => c.user_id === p.id))).map(p => ({ id: p.id, name: p.full_name || 'İsimsiz', sub: 'Sahada', avatar: p.avatar_url, warn: false })) },
    done:     { title: 'Tamamlanan Görevler', items: tasks.filter(t => t.status === 'done').map(t => ({ id: t.id, name: t.title || 'Görev', sub: profileMap[t.assignee_id ?? '']?.full_name || 'Atanmamış', avatar: null, warn: false })) },
    overdue:  { title: 'Gecikmiş Görevler',  items: tasks.filter(t => t.status !== 'done' && isOverdue(t.due_date)).map(t => ({ id: t.id, name: t.title || 'Görev', sub: `${profileMap[t.assignee_id ?? '']?.full_name || 'Atanmamış'}${t.due_date ? ' · ' + new Date(t.due_date).toLocaleDateString('tr-TR', { day:'numeric', month:'short' }) : ''}`, avatar: null, warn: true })) },
  }

  // ── MOBİL LAYOUT ─────────────────────────────────────────────────────────
  if (isMobile) {
    const today = new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })
    const greeting = (() => {
      const h = new Date().getHours()
      if (h >= 5 && h < 11) return 'Günaydın'
      if (h >= 11 && h < 19) return 'İyi günler'
      return 'İyi akşamlar'
    })()
    const displayName = userEmail?.split('@')[0] ?? ''

    return (
      <div style={{ minHeight: '100%', background: '#f0f4f8', paddingBottom: 24 }}>

        {/* Hero / Karşılama */}
        <div style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)',
          padding: '20px 20px 28px',
          position: 'relative', overflow: 'hidden',
        }}>
          {/* Dekoratif daire */}
          <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: 'rgba(34,136,201,0.12)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: -20, right: 40, width: 70, height: 70, borderRadius: '50%', background: 'rgba(42,187,213,0.08)', pointerEvents: 'none' }} />

          <div style={{ position: 'relative' }}>
            <div style={{ fontSize: 12, color: 'rgba(122,207,230,0.6)', fontWeight: 500, marginBottom: 6, textTransform: 'capitalize' }}>{today}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              {greeting}, <span style={{ color: '#7ae3f5' }}>{displayName}</span> 👋
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 6 }}>{org?.name} · Operasyon Paneli</div>
          </div>
        </div>

        {/* KPI Kartları — 2×2 grid */}
        <div style={{ padding: '16px 16px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {kpis.map(({ key, label, value, icon: Icon, color, light }) => (
            <button key={label} onClick={() => setKpiModal(key)} style={{
              background: '#fff', borderRadius: 16, padding: '14px 16px',
              border: '1px solid #e5e7eb',
              boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
              textAlign: 'left', cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
            }}>
              <div style={{ width: 36, height: 36, borderRadius: 12, background: light, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                <Icon style={{ width: 17, height: 17, color }} />
              </div>
              <div style={{ fontSize: 26, fontWeight: 900, color, letterSpacing: '-0.03em', lineHeight: 1 }}>{value}</div>
              <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 500, marginTop: 4 }}>{label}</div>
            </button>
          ))}
        </div>

        {/* Aktif Sprint */}
        {activeSprint && (
          <div style={{ margin: '12px 16px 0' }}>
            <div style={{
              background: '#111827', borderRadius: 18, padding: '16px 18px',
              border: '1px solid rgba(255,255,255,0.07)',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(122,207,230,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>Aktif Sprint</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>{activeSprint.name}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 3 }}>
                    {new Date(activeSprint.start_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                    {' – '}
                    {new Date(activeSprint.end_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                  </div>
                </div>
                <Link href={`/org/${org?.slug}/kanban`} style={{
                  fontSize: 11, fontWeight: 700, padding: '6px 12px', borderRadius: 10, flexShrink: 0,
                  background: 'rgba(122,207,230,0.1)', color: '#7acfe6', border: '1px solid rgba(122,207,230,0.18)',
                  textDecoration: 'none',
                }}>
                  Kanban →
                </Link>
              </div>
              <div style={{ display: 'flex', gap: 0 }}>
                {[
                  { label: 'Beklemede', count: sprintTasks.filter(t => t.status === 'backlog').length, c: '#94a3b8' },
                  { label: 'Yapılıyor', count: sprintTasks.filter(t => t.status === 'doing').length,   c: '#7acfe6' },
                  { label: 'Test',      count: sprintTasks.filter(t => t.status === 'testing').length, c: '#fbbf24' },
                  { label: 'Bloke',     count: sprintTasks.filter(t => t.status === 'blocked').length, c: '#f87171' },
                ].map((s, i, arr) => (
                  <div key={s.label} style={{
                    flex: 1, textAlign: 'center',
                    borderRight: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none',
                    paddingTop: 2,
                  }}>
                    <div style={{ fontSize: 20, fontWeight: 900, color: s.c, lineHeight: 1 }}>{s.count}</div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 3 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Hızlı Linkler */}
        <div style={{ margin: '12px 16px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            { href: `/org/${org?.slug}/tasks`,   icon: CheckSquare, label: 'Görevler',   color: '#2288c9', bg: '#e0f2fe' },
            { href: `/org/${org?.slug}/kanban`,  icon: Columns2,    label: 'Kanban',     color: '#7c3aed', bg: '#ede9fe' },
            { href: `/org/${org?.slug}/sprints`, icon: ListTodo,    label: 'Sprintler',  color: '#059669', bg: '#d1fae5' },
            { href: `/org/${org?.slug}/members`, icon: Users,       label: 'Ekip',       color: '#b45309', bg: '#fef3c7' },
          ].map(({ href, icon: Icon, label, color, bg }) => (
            <Link key={href} href={href} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: '#fff', borderRadius: 14, padding: '13px 14px',
              border: '1px solid #e5e7eb', textDecoration: 'none',
              boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
            }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon style={{ width: 16, height: 16, color }} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{label}</span>
              <ChevronRight style={{ width: 14, height: 14, color: '#d1d5db', marginLeft: 'auto' }} />
            </Link>
          ))}
        </div>

        {/* Ekip */}
        <div style={{ margin: '12px 16px 0', background: '#fff', borderRadius: 18, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid #f3f4f6' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>
              Ekip <span style={{ fontSize: 12, fontWeight: 400, color: '#9ca3af', marginLeft: 4 }}>{memberCount} üye</span>
            </div>
            <div style={{ fontSize: 12, color: '#059669', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
              {inCount} sahada
            </div>
          </div>
          {nonConsultants.slice(0, 6).map((profile, i) => {
            const isIn = isCurrentlyIn(checkins.filter(c => c.user_id === profile.id))
            const taskCount = tasks.filter(t => t.assignee_id === profile.id).length
            const overdue   = tasks.filter(t => t.assignee_id === profile.id && isOverdue(t.due_date)).length
            const initials  = (profile.full_name || 'U').trim().split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
            return (
              <Link key={profile.id} href={`/org/${org?.slug}/members/${profile.id}`}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderBottom: i < Math.min(nonConsultants.length, 6) - 1 ? '1px solid #f9fafb' : 'none', textDecoration: 'none' }}>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 12, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, background: profile.avatar_url ? undefined : '#e0f2fe', color: '#0369a1' }}>
                    {profile.avatar_url ? <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
                  </div>
                  <span style={{ position: 'absolute', bottom: -1, right: -1, width: 9, height: 9, borderRadius: '50%', background: isIn ? '#22c55e' : '#d1d5db', border: '2px solid #fff' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.full_name || 'İsimsiz Üye'}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>{profile.role === 'admin' ? 'Admin' : 'Üye'}</div>
                </div>
                <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                  {taskCount > 0 && <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 6, background: '#f1f5f9', color: '#64748b', fontWeight: 600 }}>{taskCount}</span>}
                  {overdue > 0 && <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 6, background: '#fee2e2', color: '#dc2626', fontWeight: 700 }}>!{overdue}</span>}
                </div>
              </Link>
            )
          })}
          <div style={{ padding: '11px 16px' }}>
            <Link href={`/org/${org?.slug}/members`} style={{ fontSize: 13, fontWeight: 600, color: '#2288c9', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
              Tüm üyeleri gör <ArrowRight style={{ width: 14, height: 14 }} />
            </Link>
          </div>
        </div>

        {/* KPI Modal */}
        <KpiModal modal={kpiModal} data={modalData} slug={org?.slug ?? ''} onClose={() => setKpiModal(null)} />
      </div>
    )
  }

  // ── MASAÜSTÜ LAYOUT ───────────────────────────────────────────────────────
  return (
    <div className="flex flex-col overflow-hidden" style={{ height: '100vh', background: '#f5f7fa' }}>
      <main className="flex flex-col flex-1 min-h-0 px-6 py-5 gap-4">

        {/* ── Başlık ── */}
        <div className="flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-xl font-bold" style={{ color: '#111827', letterSpacing: '-0.02em' }}>
              {org?.name}
            </h1>
            <p className="text-sm mt-0.5" style={{ color: '#9ca3af' }}>Operasyon paneli</p>
          </div>
          <Link
            href={`/org/${org?.slug}/tasks`}
            className="flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-xl transition-colors"
            style={{ background: '#2288c9', color: '#fff' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#1d78b8' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#2288c9' }}
          >
            Görevler <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* ── KPI Kartları ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
          {kpis.map(({ key, label, value, icon: Icon, color, light }) => (
            <button
              key={label}
              onClick={() => setKpiModal(key)}
              className="rounded-2xl p-4 text-left transition-all cursor-pointer"
              style={{ background: '#fff', border: '1px solid #e5e7eb' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = ''; (e.currentTarget as HTMLElement).style.transform = '' }}
            >
              <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3" style={{ background: light }}>
                <Icon style={{ width: 17, height: 17, color }} />
              </div>
              <div className="text-2xl font-bold" style={{ color, letterSpacing: '-0.02em' }}>{value}</div>
              <div className="text-xs mt-0.5 font-medium" style={{ color: '#9ca3af' }}>{label}</div>
            </button>
          ))}
        </div>

        {/* ── Aktif Sprint — kompakt, sabit yükseklik ── */}
        {activeSprint ? (
          <div
            className="shrink-0 rounded-2xl px-5 py-4"
            style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <div className="flex items-center justify-between gap-4 mb-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-widest mb-0.5" style={{ color: 'rgba(122,207,230,0.5)' }}>
                  Aktif Sprint
                </p>
                <h2 className="text-sm font-bold text-white truncate">{activeSprint.name}</h2>
                <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.28)' }}>
                  {new Date(activeSprint.start_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                  {' – '}
                  {new Date(activeSprint.end_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
              <Link
                href={`/org/${org?.slug}/kanban`}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg shrink-0"
                style={{ background: 'rgba(122,207,230,0.1)', color: '#7acfe6', border: '1px solid rgba(122,207,230,0.15)' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(122,207,230,0.2)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(122,207,230,0.1)' }}
              >
                Kanban →
              </Link>
            </div>

            <div className="flex items-center gap-5">
              {[
                { label: 'Beklemede', count: sprintTasks.filter(t => t.status === 'backlog').length,  c: '#94a3b8' },
                { label: 'Yapılıyor', count: sprintTasks.filter(t => t.status === 'doing').length,    c: '#7acfe6' },
                { label: 'Test',      count: sprintTasks.filter(t => t.status === 'testing').length,  c: '#fbbf24' },
                { label: 'Bloke',     count: sprintTasks.filter(t => t.status === 'blocked').length,  c: '#f87171' },
              ].map(s => (
                <div key={s.label} className="flex items-baseline gap-1.5">
                  <span className="text-xl font-bold" style={{ color: s.c, letterSpacing: '-0.02em' }}>{s.count}</span>
                  <span className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>{s.label}</span>
                </div>
              ))}
              {sprintTotal > 0 && (
                <div className="ml-auto flex items-baseline gap-1.5">
                  <span className="text-xl font-bold text-white opacity-30">{sprintTotal}</span>
                  <span className="text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>toplam</span>
                </div>
              )}
            </div>
          </div>
        ) : null}

        {/* ── Ekip — kalan tüm alanı doldurur ── */}
        <div className="flex-1 min-h-0 flex flex-col rounded-2xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e5e7eb' }}>
          <div className="shrink-0 px-5 py-3.5 flex items-center justify-between" style={{ borderBottom: '1px solid #f3f4f6' }}>
            <h2 className="text-sm font-semibold" style={{ color: '#111827' }}>
              Ekip <span className="ml-1.5 text-xs font-normal" style={{ color: '#9ca3af' }}>{memberCount} üye</span>
            </h2>
            <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: '#059669' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
              {inCount} sahada
            </div>
          </div>

          {nonConsultants.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-sm" style={{ color: '#9ca3af' }}>Henüz üye yok.</div>
          ) : (
            <div className="flex-1 overflow-y-auto min-h-0">
              {nonConsultants.map((profile, i) => {
                const userCheckins = checkins.filter(c => c.user_id === profile.id)
                const isIn      = isCurrentlyIn(userCheckins)
                const taskCount = tasks.filter(t => t.assignee_id === profile.id).length
                const overdue   = tasks.filter(t => t.assignee_id === profile.id && isOverdue(t.due_date)).length
                const initials  = (profile.full_name || 'U').trim().split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
                return (
                  <Link
                    key={profile.id}
                    href={`/org/${org?.slug}/members/${profile.id}`}
                    className="flex items-center gap-3 px-5 py-3 transition-colors"
                    style={{ borderBottom: i < nonConsultants.length - 1 ? '1px solid #f9fafb' : 'none', color: 'inherit', textDecoration: 'none' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#fafafa' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                  >
                    <div className="relative shrink-0">
                      <div className="w-8 h-8 rounded-xl overflow-hidden flex items-center justify-center text-xs font-semibold"
                        style={profile.avatar_url ? undefined : { background: '#e0f2fe', color: '#0369a1' }}>
                        {profile.avatar_url ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" /> : initials}
                      </div>
                      <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border-2 border-white"
                        style={{ background: isIn ? '#22c55e' : '#d1d5db' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium truncate" style={{ color: '#111827' }}>{profile.full_name || 'İsimsiz Üye'}</div>
                      <div className="text-xs" style={{ color: '#9ca3af' }}>{profile.role === 'admin' ? 'Admin' : 'Üye'}</div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {taskCount > 0 && <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: '#f1f5f9', color: '#64748b' }}>{taskCount}</span>}
                      {overdue > 0 && <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: '#fee2e2', color: '#dc2626' }}>!{overdue}</span>}
                    </div>
                  </Link>
                )
              })}
            </div>
          )}

          <div className="shrink-0 px-5 py-2.5" style={{ borderTop: '1px solid #f3f4f6' }}>
            <Link href={`/org/${org?.slug}/members`} className="text-xs font-medium" style={{ color: '#2288c9' }}>
              Tüm üyeleri gör →
            </Link>
          </div>
        </div>

      </main>

      {/* KPI Modal */}
      <KpiModal modal={kpiModal} data={modalData} slug={org?.slug ?? ''} onClose={() => setKpiModal(null)} />
    </div>
  )
}

/* ── KPI Modal bileşeni ──────────────────────────────────────────────────── */
type KpiKey = 'members' | 'inoffice' | 'done' | 'overdue'
type ModalItem = { id: string; name: string; sub: string; avatar: string | null; warn: boolean }
type ModalData = Record<KpiKey, { title: string; items: ModalItem[] }>

function KpiModal({ modal, data, slug, onClose }: {
  modal: KpiKey | null
  data: ModalData
  slug: string
  onClose: () => void
}) {
  const overlayRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!modal) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modal, onClose])

  if (!modal) return null
  const { title, items } = data[modal]

  const ICONS: Record<KpiKey, { color: string; bg: string }> = {
    members:  { color: '#2288c9', bg: '#e0f2fe' },
    inoffice: { color: '#059669', bg: '#d1fae5' },
    done:     { color: '#7c3aed', bg: '#ede9fe' },
    overdue:  { color: '#b45309', bg: '#fef3c7' },
  }
  const cfg = ICONS[modal]

  return (
    <div
      ref={overlayRef}
      onClick={e => { if (e.target === overlayRef.current) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        padding: '0 0 0 0',
      }}
    >
      {/* Panel — bottom sheet on mobile, centered modal on desktop */}
      <div style={{
        background: '#fff',
        borderRadius: '20px 20px 0 0',
        width: '100%',
        maxWidth: 520,
        maxHeight: '80vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 -4px 40px rgba(0,0,0,0.18)',
        animation: 'slideUp 0.22s ease',
      }}>
        {/* Handle bar */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 0' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: '#e5e7eb' }} />
        </div>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px 10px' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#111827', letterSpacing: '-0.02em' }}>{title}</div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 1 }}>{items.length} kayıt</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {modal === 'overdue' && slug && (
              <Link
                href={`/org/${slug}/tasks`}
                onClick={onClose}
                style={{ fontSize: 12, fontWeight: 700, padding: '6px 14px', borderRadius: 10, background: cfg.bg, color: cfg.color, textDecoration: 'none', border: `1px solid ${cfg.color}22` }}
              >
                Görevlere git →
              </Link>
            )}
            {modal === 'members' && slug && (
              <Link
                href={`/org/${slug}/members`}
                onClick={onClose}
                style={{ fontSize: 12, fontWeight: 700, padding: '6px 14px', borderRadius: 10, background: cfg.bg, color: cfg.color, textDecoration: 'none', border: `1px solid ${cfg.color}22` }}
              >
                Ekip sayfası →
              </Link>
            )}
            <button onClick={onClose} style={{ background: '#f3f4f6', border: 'none', borderRadius: 10, padding: '7px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
              <X style={{ width: 15, height: 15, color: '#6b7280' }} />
            </button>
          </div>
        </div>

        <div style={{ width: '100%', height: 1, background: '#f3f4f6' }} />

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0 16px' }}>
          {items.length === 0 ? (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
              {modal === 'overdue'  && '🎉 Gecikmiş görev yok!'}
              {modal === 'inoffice' && 'Şu an sahada kimse yok.'}
              {modal === 'done'     && 'Henüz tamamlanan görev yok.'}
              {modal === 'members'  && 'Henüz üye yok.'}
            </div>
          ) : items.map((item, i) => (
            <div key={item.id} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 20px',
              borderBottom: i < items.length - 1 ? '1px solid #f9fafb' : 'none',
            }}>
              {/* Avatar/icon */}
              <div style={{
                width: 38, height: 38, borderRadius: 12, flexShrink: 0,
                background: item.avatar ? undefined : cfg.bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 700, color: cfg.color,
                overflow: 'hidden',
              }}>
                {item.avatar
                  ? <img src={item.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : item.warn
                    ? <AlertCircle style={{ width: 16, height: 16, color: '#b45309' }} />
                    : item.name.charAt(0).toUpperCase()
                }
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                <div style={{ fontSize: 11, color: item.warn ? '#b45309' : '#9ca3af', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.sub}</div>
              </div>
              {item.warn && (
                <div style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: '#fee2e2', color: '#dc2626', flexShrink: 0 }}>Gecikmiş</div>
              )}
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(40px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
    </div>
  )
}
