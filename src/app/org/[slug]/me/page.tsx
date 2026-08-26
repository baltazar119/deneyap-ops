'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { useOrg } from '@/lib/supabase/orgContext'
import StatusBadge from '@/components/StatusBadge'
import WeekCalendar from '@/components/WeekCalendar'
import { isCurrentlyIn, isOverdue } from '@/lib/utils'
import type { Schedule, Task, Sprint } from '@/types/database'

export default function MePage() {
  const router = useRouter()
  const { org, orgRole, userIl, userId: orgUserId, userEmail: orgEmail, avatarUrl: orgAvatarUrl, isPro, loading: orgLoading } = useOrg()
  const [userId, setUserId] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState('')
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null)
  const [isIn, setIsIn] = useState(false)
  const [checkinLoading, setCheckinLoading] = useState(false)
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  // PRD madde 2: il sorumlusu, kendi iline ait ama başkasına atanmış
  // (ya da hiç atanmamış) görevleri de görmeli
  const [ilTasks, setIlTasks] = useState<Task[]>([])
  const [activeSprint, setActiveSprint] = useState<Sprint | null>(null)
  const [sprintTasks, setSprintTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [installPrompt, setInstallPrompt] = useState<any>(null)
  const [isIos, setIsIos] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) { setIsStandalone(true); return }
    const ua = window.navigator.userAgent
    if (/iphone|ipad|ipod/i.test(ua) && !/CriOS/i.test(ua)) setIsIos(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler = (e: any) => { e.preventDefault(); setInstallPrompt(e) }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  async function handleInstall() {
    if (!installPrompt) return
    installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') setInstallPrompt(null)
  }

  const loadSchedules = useCallback(async (uid: string) => {
    const now = new Date()
    const rangeStart = new Date(now)
    rangeStart.setDate(now.getDate() - 7)
    rangeStart.setHours(0, 0, 0, 0)
    const rangeEnd = new Date(now)
    rangeEnd.setDate(now.getDate() + 28)
    rangeEnd.setHours(23, 59, 59, 999)

    const { data } = await supabase
      .from('schedules')
      .select('*')
      .eq('user_id', uid)
      .gte('start_time', rangeStart.toISOString())
      .lte('start_time', rangeEnd.toISOString())
      .order('start_time', { ascending: true })

    setSchedules(data || [])
  }, [])

  const loadAll = useCallback(async (uid: string, il: string | null) => {
    // loadSchedules diğer 3 sorguyla aynı anda başlar (waterfall yok)
    const [checkinsRes, tasksRes, sprintRes, , ilRes] = await Promise.all([
      supabase
        .from('checkins')
        .select('*')
        .eq('user_id', uid)
        .order('timestamp', { ascending: false })
        .limit(20),
      supabase
        .from('tasks')
        .select('*')
        .eq('assignee_id', uid)
        .eq('organization_id', org!.id)
        .order('due_date', { ascending: true }),
      supabase
        .from('sprints')
        .select('*')
        .eq('organization_id', org!.id)
        .eq('is_active', true)
        .maybeSingle(),
      loadSchedules(uid),
      il
        ? supabase
            .from('tasks')
            .select('*')
            .eq('organization_id', org!.id)
            .eq('il', il)
            .neq('status', 'done')
            .order('due_date', { ascending: true })
        : Promise.resolve({ data: [] as Task[] }),
    ])
    setIsIn(isCurrentlyIn(checkinsRes.data || []))
    const myTasks: Task[] = tasksRes.data || []
    setTasks(myTasks)
    // Bana zaten atanmış olanları tekrar listeleme
    setIlTasks(((ilRes?.data as Task[]) || []).filter(t => t.assignee_id !== uid))

    if (sprintRes.data) {
      setActiveSprint(sprintRes.data)
      setSprintTasks(myTasks.filter((t) => t.sprint_id === sprintRes.data!.id && t.status !== 'done'))
    } else {
      setActiveSprint(null)
      setSprintTasks([])
    }
  }, [loadSchedules])

  useEffect(() => {
    if (orgLoading) return
    if (!org || !orgUserId) return // OrgProvider handles redirect

    setUserId(orgUserId)
    setUserEmail(orgEmail ?? '')
    setUserAvatarUrl(orgAvatarUrl ?? null)

    // Son erişim zamanını güncelle
    supabase
      .from('organization_members')
      .update({ last_accessed_at: new Date().toISOString() })
      .eq('user_id', orgUserId)
      .eq('organization_id', org.id)
      .then(() => {})

    loadAll(orgUserId, userIl).then(() => setLoading(false))
  }, [orgLoading, org, orgUserId, orgEmail, orgAvatarUrl, userIl, loadAll])

  async function handleCheckin(type: 'in' | 'out') {
    if (!userId) return
    setCheckinLoading(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from('checkins').insert({ user_id: userId, type, organization_id: org!.id })
    if (!error) setIsIn(type === 'in')
    setCheckinLoading(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: '#f5f7fa' }}>
        <div
          className="sticky top-0 z-20 h-[60px]"
          style={{ background: 'linear-gradient(135deg, #0d1a2a 0%, #182c3f 100%)' }}
        />
        <main className="max-w-2xl mx-auto px-4 py-8 space-y-4">
          {[80, 120, 200, 160].map((h, i) => (
            <div key={i} className="skeleton rounded-2xl" style={{ height: h }} />
          ))}
        </main>
      </div>
    )
  }

  const openTasks    = tasks.filter((t) => t.status !== 'done')
  const doneTasks    = tasks.filter((t) => t.status === 'done')
  const overdueTasks = openTasks.filter((t) => isOverdue(t.due_date))

  // KPI stats
  const kpiCards = [
    {
      label: 'Aktif Görev',
      value: openTasks.length,
      icon: '⚡',
      color: '#2288c9',
      bg: '#e0f2fe',
      border: '#bae6fd',
    },
    {
      label: 'Tamamlanan',
      value: doneTasks.length,
      icon: '✅',
      color: '#059669',
      bg: '#d1fae5',
      border: '#a7f3d0',
    },
    {
      label: 'Geciken',
      value: overdueTasks.length,
      icon: '⚠',
      color: overdueTasks.length > 0 ? '#dc2626' : '#64748b',
      bg: overdueTasks.length > 0 ? '#fee2e2' : '#f1f5f9',
      border: overdueTasks.length > 0 ? '#fecaca' : '#e2e8f0',
    },
    {
      label: 'Sprint Görevi',
      value: sprintTasks.length,
      icon: '🏃',
      color: activeSprint ? '#7c3aed' : '#64748b',
      bg: activeSprint ? '#ede9fe' : '#f1f5f9',
      border: activeSprint ? '#c4b5fd' : '#e2e8f0',
    },
  ]

  return (
    <div className="min-h-screen" style={{ background: '#f5f7fa' }}>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-5">

        {/* ── Ana Ekrana Ekle ── */}
        {!isStandalone && (
          installPrompt ? (
            <button
              type="button"
              onClick={handleInstall}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', padding: '11px 16px', borderRadius: 14,
                border: '1px solid #bae6fd',
                background: '#f0f9ff', cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span style={{ fontSize: 20, lineHeight: 1 }}>📲</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0369a1' }}>Ana Ekrana Ekle</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>Uygulamayı telefonuna yükle</div>
              </div>
              <span style={{ fontSize: 18, color: '#7dd3fc' }}>›</span>
            </button>
          ) : (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '11px 16px', borderRadius: 14,
              border: '1px solid #bae6fd', background: '#f0f9ff',
            }}>
              <span style={{ fontSize: 20, lineHeight: 1 }}>📲</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0369a1' }}>Ana Ekrana Ekle</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
                  {isIos
                    ? <>Safari → Paylaş ⬆ → &quot;Ana Ekrana Ekle&quot;</>
                    : <>Tarayıcı menüsü → &quot;Ana ekrana ekle&quot;</>}
                </div>
              </div>
            </div>
          )
        )}

        {/* ── KPI Kartları ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {kpiCards.map((kpi) => (
            <div
              key={kpi.label}
              className="stat-card flex flex-col items-center text-center gap-1"
              style={{
                background: '#fff',
                border: `1px solid ${kpi.border}`,
              }}
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center text-base mb-1"
                style={{ background: kpi.bg }}
              >
                {kpi.icon}
              </div>
              <div className="text-2xl font-bold" style={{ color: kpi.color }}>
                {kpi.value}
              </div>
              <div className="text-xs font-semibold" style={{ color: '#94a3b8' }}>
                {kpi.label}
              </div>
            </div>
          ))}
        </div>

        {/* ── Saha Durumu — Modern Toggle ── */}
        <div className="card" style={{ padding: '20px 24px' }}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold" style={{ color: '#0d1a2a' }}>Saha Durumu</h2>
              <div className="flex items-center gap-2 mt-1">
                {/* Status dot */}
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{
                    background: isIn ? '#22c55e' : '#94a3b8',
                    boxShadow: isIn ? '0 0 0 3px rgba(34,197,94,0.2)' : 'none',
                  }}
                />
                <span className="text-sm font-medium" style={{ color: isIn ? '#16a34a' : '#64748b' }}>
                  {isIn ? 'Sahadasın' : 'Sahada değilsin'}
                </span>
              </div>
            </div>

            {/* Toggle button group */}
            <div
              className="flex rounded-xl overflow-hidden"
              style={{ border: '1px solid #e2e8f0', background: '#f8fafc' }}
            >
              <button
                onClick={() => handleCheckin('in')}
                disabled={isIn || checkinLoading}
                className="px-4 py-2 text-sm font-semibold transition-all duration-200 disabled:cursor-not-allowed"
                style={{
                  background: isIn
                    ? 'linear-gradient(135deg, #10b981, #059669)'
                    : 'transparent',
                  color: isIn ? '#fff' : '#94a3b8',
                  boxShadow: isIn ? '0 2px 8px rgba(16,185,129,0.3)' : 'none',
                }}
              >
                {checkinLoading && !isIn ? '...' : '↗ Giriş'}
              </button>
              <button
                onClick={() => handleCheckin('out')}
                disabled={!isIn || checkinLoading}
                className="px-4 py-2 text-sm font-semibold transition-all duration-200 disabled:cursor-not-allowed"
                style={{
                  background: !isIn
                    ? 'transparent'
                    : 'transparent',
                  color: !isIn ? '#94a3b8' : '#dc2626',
                  borderLeft: '1px solid #e2e8f0',
                }}
                onMouseEnter={(e) => {
                  if (isIn) {
                    e.currentTarget.style.background = '#fee2e2'
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                }}
              >
                {checkinLoading && isIn ? '...' : '↙ Çıkış'}
              </button>
            </div>
          </div>
        </div>

        {/* ── Aktif Sprint ── */}
        {activeSprint && (
          <div
            className="rounded-2xl p-5"
            style={{
              background: 'linear-gradient(135deg, #0d1a2a 0%, #182c3f 100%)',
              border: '1px solid rgba(122,207,230,0.15)',
              boxShadow: '0 8px 32px rgba(13,26,42,0.18)',
            }}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'rgba(122,207,230,0.7)' }}>
                  Aktif Sprint
                </span>
                <h2 className="text-base font-bold text-white mt-0.5">{activeSprint.name}</h2>
                <p className="text-xs mt-0.5" style={{ color: 'rgba(122,207,230,0.6)' }}>
                  {new Date(activeSprint.start_date).toLocaleDateString('tr-TR')} –{' '}
                  {new Date(activeSprint.end_date).toLocaleDateString('tr-TR')}
                </p>
              </div>
              <span
                className="text-xs px-2 py-0.5 rounded-full font-bold"
                style={{
                  background: 'rgba(122,207,230,0.15)',
                  color: '#7acfe6',
                  border: '1px solid rgba(122,207,230,0.25)',
                }}
              >
                {sprintTasks.length} görev
              </span>
            </div>

            {sprintTasks.length === 0 ? (
              <p className="text-sm text-center py-3" style={{ color: 'rgba(122,207,230,0.5)' }}>
                Bu sprint'te sana atanmış açık görev yok 🎉
              </p>
            ) : (
              <div className="space-y-2">
                {sprintTasks.map((task) => (
                  <Link
                    key={task.id}
                    href={`/org/${org?.slug}/tasks/${task.id}`}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl transition-all duration-150"
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(122,207,230,0.12)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
                      e.currentTarget.style.borderColor = 'rgba(122,207,230,0.25)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
                      e.currentTarget.style.borderColor = 'rgba(122,207,230,0.12)'
                    }}
                  >
                    <span className="text-sm font-medium text-white truncate">{task.title}</span>
                    <StatusBadge status={task.status} />
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Haftalık Takvim ── */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold" style={{ color: '#0d1a2a' }}>Saha Planım</h2>
              <p className="text-xs mt-0.5" style={{ color: '#94a3b8' }}>
                Geleceğiniz günlere tıklayarak saat planı ekleyin
              </p>
            </div>
          </div>
          {userId && (
            <WeekCalendar
              userId={userId}
              schedules={schedules}
              onRefresh={() => loadSchedules(userId)}
            />
          )}
        </div>

        {/* ── Görevlerim ── */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold" style={{ color: '#0d1a2a' }}>Bana Atanan Görevler</h2>
            {openTasks.length > 0 && (
              <span
                className="text-xs px-2.5 py-0.5 rounded-full font-semibold"
                style={{ background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd' }}
              >
                {openTasks.length} açık
              </span>
            )}
          </div>

          {tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl"
                style={{ background: '#f0f9ff' }}
              >
                📋
              </div>
              <p className="text-sm font-medium" style={{ color: '#94a3b8' }}>Henüz görev atanmamış</p>
            </div>
          ) : (
            <div className="space-y-2">
              {openTasks.map((task) => {
                const od = isOverdue(task.due_date)
                return (
                  <Link
                    key={task.id}
                    href={`/org/${org?.slug}/tasks/${task.id}`}
                    className="flex items-start justify-between gap-3 p-3.5 rounded-xl transition-all duration-150"
                    style={{
                      background: od ? '#fff5f5' : '#f8fafc',
                      border: od ? '1px solid #fecaca' : '1px solid #e8f0f5',
                      borderLeft: od ? '3px solid #ef4444' : undefined,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = od ? '#fee2e2' : '#f0f9ff'
                      e.currentTarget.style.borderColor = od ? '#fca5a5' : '#bee5f0'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = od ? '#fff5f5' : '#f8fafc'
                      e.currentTarget.style.borderColor = od ? '#fecaca' : '#e8f0f5'
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold truncate" style={{ color: '#0d1a2a' }}>
                        {task.title}
                      </div>
                      {task.description && (
                        <div className="text-xs mt-0.5 truncate" style={{ color: '#94a3b8' }}>
                          {task.description}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusBadge status={task.status} />
                      {task.due_date && (
                        <span
                          className="text-xs font-semibold flex items-center gap-1"
                          style={{ color: od ? '#dc2626' : '#94a3b8' }}
                        >
                          {od ? '⚠ ' : ''}
                          {new Date(task.due_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                        </span>
                      )}
                    </div>
                  </Link>
                )
              })}

              {doneTasks.length > 0 && (
                <>
                  <div
                    className="flex items-center gap-2 pt-4 pb-1"
                  >
                    <div className="flex-1 h-px" style={{ background: '#e8f0f5' }} />
                    <span className="text-xs font-bold uppercase tracking-widest" style={{ color: '#cbd5e1' }}>
                      Tamamlananlar · {doneTasks.length}
                    </span>
                    <div className="flex-1 h-px" style={{ background: '#e8f0f5' }} />
                  </div>
                  {doneTasks.map((task) => (
                    <Link
                      key={task.id}
                      href={`/org/${org?.slug}/tasks/${task.id}`}
                      className="flex items-center justify-between gap-3 p-3 rounded-xl opacity-50 hover:opacity-70 transition-all"
                      style={{ background: '#f8fafc', border: '1px solid #e8f0f5' }}
                    >
                      <div className="text-sm line-through truncate" style={{ color: '#64748b' }}>
                        {task.title}
                      </div>
                      <StatusBadge status={task.status} />
                    </Link>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* ── İlimin Görevleri (PRD: sorumlu olduğu il/birim) ── */}
        {userIl && (
          <div className="card mt-5">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-base font-bold" style={{ color: '#0d1a2a' }}>
                {userIl} — İlimin Görevleri
              </h2>
              {ilTasks.length > 0 && (
                <span
                  className="text-xs px-2.5 py-0.5 rounded-full font-semibold"
                  style={{ background: '#f0fdfa', color: '#0f766e', border: '1px solid #5eead4' }}
                >
                  {ilTasks.length} açık
                </span>
              )}
            </div>
            <p className="text-xs mb-4" style={{ color: '#94a3b8' }}>
              Sorumlu olduğunuz ile ait, size atanmamış açık görevler.
            </p>

            {ilTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl"
                  style={{ background: '#f0fdfa' }}
                >
                  📍
                </div>
                <p className="text-sm font-medium" style={{ color: '#94a3b8' }}>
                  {userIl} için açık görev yok
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {ilTasks.map((task) => {
                  const od = isOverdue(task.due_date)
                  return (
                    <Link
                      key={task.id}
                      href={`/org/${org?.slug}/tasks/${task.id}`}
                      className="flex items-start justify-between gap-3 p-3.5 rounded-xl transition-all duration-150"
                      style={{
                        background: od ? '#fff5f5' : '#f8fafc',
                        border: od ? '1px solid #fecaca' : '1px solid #e8f0f5',
                        borderLeft: od ? '3px solid #ef4444' : undefined,
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold truncate" style={{ color: '#0d1a2a' }}>
                          {task.title}
                        </div>
                        {task.description && (
                          <div className="text-xs mt-0.5 truncate" style={{ color: '#94a3b8' }}>
                            {task.description}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <StatusBadge status={task.status} />
                        {task.due_date && (
                          <span
                            className="text-xs font-semibold flex items-center gap-1"
                            style={{ color: od ? '#dc2626' : '#94a3b8' }}
                          >
                            {od ? '⚠ ' : ''}
                            {new Date(task.due_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                          </span>
                        )}
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
