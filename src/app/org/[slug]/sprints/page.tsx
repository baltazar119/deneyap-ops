'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { createNotificationForAll } from '@/lib/notifications'
import { useOrg } from '@/lib/supabase/orgContext'
import { useIsMobile } from '@/lib/useIsMobile'
import type { Sprint } from '@/types/database'

interface SprintTaskCount {
  total: number
  done: number
  doing: number
  blocked: number
  backlog: number
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default function SprintsPage() {
  const router = useRouter()
  const { org, orgRole, userId, userEmail: orgEmail, avatarUrl: orgAvatarUrl, isAdmin, loading: orgLoading } = useOrg()
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [, setUserEmail] = useState('')
  const [, setUserAvatarUrl] = useState<string | null>(null)
  const [sprints, setSprints] = useState<Sprint[]>([])
  const [sprintTaskCounts, setSprintTaskCounts] = useState<Record<string, SprintTaskCount>>({})
  const [loading, setLoading] = useState(true)

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [editingSprint, setEditingSprint] = useState<Sprint | null>(null)
  const [formName, setFormName] = useState('')
  const [formStartDate, setFormStartDate] = useState('')
  const [formEndDate, setFormEndDate] = useState('')
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const loadSprints = useCallback(async () => {
    if (!org) return
    const { data: sprintsData } = await supabase
      .from('sprints')
      .select('*')
      .eq('organization_id', org.id)
      .order('created_at', { ascending: false })

    const list: Sprint[] = sprintsData || []
    setSprints(list)

    if (list.length > 0) {
      const ids = list.map((s) => s.id)
      const { data: taskRows } = await supabase
        .from('tasks')
        .select('sprint_id, status')
        .eq('organization_id', org.id)
        .in('sprint_id', ids)

      const counts: Record<string, SprintTaskCount> = {}
      for (const row of taskRows || []) {
        const sid = row.sprint_id as string
        if (!counts[sid]) counts[sid] = { total: 0, done: 0, doing: 0, blocked: 0, backlog: 0 }
        counts[sid].total++
        const st = row.status as keyof Omit<SprintTaskCount, 'total'>
        if (st in counts[sid]) counts[sid][st]++
      }
      setSprintTaskCounts(counts)
    }
  }, [org])

  useEffect(() => {
    if (orgLoading) return
    if (!org || !userId) return // OrgProvider handles redirect

    if (!isAdmin) {
      router.replace(orgRole === 'consultant' ? `/org/${org.slug}/consultant` : `/org/${org.slug}/me`)
      return
    }

    setCurrentUserId(userId)
    setUserEmail(orgEmail ?? '')
    setUserAvatarUrl(orgAvatarUrl ?? null)

    loadSprints().then(() => setLoading(false))
  }, [orgLoading, org, userId, isAdmin, orgRole, orgEmail, orgAvatarUrl, router, loadSprints])

  function openCreateForm() {
    setEditingSprint(null)
    setFormName('')
    setFormStartDate('')
    setFormEndDate('')
    setFormError(null)
    setShowForm(true)
  }

  function openEditForm(sprint: Sprint) {
    setEditingSprint(sprint)
    setFormName(sprint.name)
    setFormStartDate(sprint.start_date)
    setFormEndDate(sprint.end_date)
    setFormError(null)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingSprint(null)
  }

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!formName.trim()) { setFormError('Sprint adı zorunludur.'); return }
    if (!formStartDate || !formEndDate) { setFormError('Başlangıç ve bitiş tarihleri zorunludur.'); return }
    if (formEndDate < formStartDate) { setFormError('Bitiş tarihi başlangıç tarihinden önce olamaz.'); return }

    setFormLoading(true)
    setFormError(null)

    if (editingSprint) {
      const { error } = await supabase
        .from('sprints')
        .update({ name: formName.trim(), start_date: formStartDate, end_date: formEndDate })
        .eq('id', editingSprint.id)
      if (error) { setFormError(error.message); setFormLoading(false); return }
    } else {
      const { error } = await supabase
        .from('sprints')
        .insert({ name: formName.trim(), start_date: formStartDate, end_date: formEndDate, created_by: currentUserId!, organization_id: org!.id })
      if (error) { setFormError(error.message); setFormLoading(false); return }
      await createNotificationForAll({
        type: 'sprint', event_type: 'sprint_changed',
        title: 'Yeni Sprint Oluşturuldu',
        description: `"${formName.trim()}" sprinti oluşturuldu.`,
        actor_id: currentUserId!, link: '/kanban',
        org_id: org?.id,
      })
    }

    setFormLoading(false)
    closeForm()
    await loadSprints()
  }

  async function handleActivate(sprint: Sprint) {
    const { error } = await supabase
      .from('sprints')
      .update({ is_active: true })
      .eq('id', sprint.id)
    if (!error) {
      await loadSprints()
      await createNotificationForAll({
        type: 'sprint', event_type: 'sprint_changed',
        title: 'Aktif Sprint Değişti',
        description: `"${sprint.name}" sprinti aktif hale getirildi.`,
        actor_id: currentUserId!, link: '/kanban',
        org_id: org?.id,
      })
    }
  }

  async function handleDeactivate(sprint: Sprint) {
    const { error } = await supabase
      .from('sprints')
      .update({ is_active: false })
      .eq('id', sprint.id)
    if (!error) await loadSprints()
  }

  async function handleDelete(sprint: Sprint) {
    if (!confirm(`"${sprint.name}" sprintini silmek istediğinize emin misiniz? Bu sprint'e atanmış görevlerin sprint bağlantısı kaldırılacak.`)) return
    const { error } = await supabase
      .from('sprints')
      .delete()
      .eq('id', sprint.id)
    if (!error) await loadSprints()
  }

  const isMobile = useIsMobile()

  const activeSprint = sprints.find((s) => s.is_active)
  const inactiveSprints = sprints.filter((s) => !s.is_active)

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f7fa' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid #e5e7eb', borderTopColor: '#2288c9', animation: 'spin 0.8s linear infinite' }} />
          <span style={{ fontSize: 13, color: '#9ca3af' }}>Yükleniyor...</span>
        </div>
      </div>
    )
  }

  // ── Mobil Görünüm ──────────────────────────────────────────────────────────
  if (isMobile) {
    const MobileForm = showForm && (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}
        onClick={(e) => { if (e.target === e.currentTarget) closeForm() }}
      >
        <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', maxHeight: '90vh', overflow: 'auto' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: '#e5e7eb', margin: '12px auto 0' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px 12px', borderBottom: '1px solid #f3f4f6' }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#0d1a2a' }}>{editingSprint ? 'Sprint Düzenle' : 'Yeni Sprint'}</span>
            <button onClick={closeForm} style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: '#f1f5f9', color: '#64748b', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
          </div>
          <form onSubmit={handleFormSubmit} style={{ padding: '16px 20px 32px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {formError && <div style={{ fontSize: 13, padding: '10px 14px', borderRadius: 10, background: '#fee2e2', color: '#dc2626' }}>{formError}</div>}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Sprint Adı <span style={{ color: '#dc2626' }}>*</span></label>
              <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="örn. Sprint 1, Mayıs Haftası..." autoFocus
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Başlangıç <span style={{ color: '#dc2626' }}>*</span></label>
                <input type="date" value={formStartDate} onChange={(e) => setFormStartDate(e.target.value)}
                  style={{ width: '100%', padding: '10px 10px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Bitiş <span style={{ color: '#dc2626' }}>*</span></label>
                <input type="date" value={formEndDate} onChange={(e) => setFormEndDate(e.target.value)}
                  style={{ width: '100%', padding: '10px 10px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 4 }}>
              <button type="button" onClick={closeForm} style={{ padding: '12px 0', borderRadius: 12, border: '1px solid #e5e7eb', background: '#f8fafc', color: '#64748b', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>İptal</button>
              <button type="submit" disabled={formLoading} style={{ padding: '12px 0', borderRadius: 12, border: 'none', background: '#2288c9', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: formLoading ? 0.6 : 1 }}>
                {formLoading ? 'Kaydediliyor...' : editingSprint ? 'Güncelle' : 'Oluştur'}
              </button>
            </div>
          </form>
        </div>
      </div>
    )

    return (
      <div style={{ minHeight: '100vh', background: '#f0f4f8' }}>
        <div style={{ padding: '16px 14px 90px' }}>

          {/* Başlık */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0d1a2a', margin: 0 }}>Sprintler</h1>
            <span style={{ fontSize: 12, color: '#9ca3af' }}>{sprints.length} sprint</span>
          </div>

          {/* Boş durum */}
          {sprints.length === 0 && (
            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', padding: '48px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>🏃</div>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#374151', margin: '0 0 4px' }}>Henüz sprint yok</p>
              <p style={{ fontSize: 12, color: '#9ca3af', margin: '0 0 16px' }}>İlk sprintinizi oluşturun</p>
              <button onClick={openCreateForm} style={{ padding: '10px 24px', borderRadius: 12, border: 'none', background: '#2288c9', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                + İlk Sprint
              </button>
            </div>
          )}

          {/* Aktif Sprint */}
          {activeSprint && (() => {
            const c = sprintTaskCounts[activeSprint.id]
            const pct = c && c.total > 0 ? Math.round((c.done / c.total) * 100) : 0
            const now = new Date()
            const end = new Date(activeSprint.end_date)
            const start = new Date(activeSprint.start_date)
            const totalMs = end.getTime() - start.getTime()
            const passedMs = now.getTime() - start.getTime()
            const timePct = totalMs > 0 ? Math.min(100, Math.max(0, Math.round((passedMs / totalMs) * 100))) : 0
            const daysLeft = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86400000))
            return (
              <div style={{ background: 'linear-gradient(135deg, #0d1a2a 0%, #1a2f45 100%)', border: '1px solid rgba(122,207,230,0.15)', borderRadius: 18, padding: '18px 18px', marginBottom: 14, boxShadow: '0 4px 20px rgba(0,0,0,0.12)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div>
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#7acfe6', display: 'block', marginBottom: 3 }}>● Aktif Sprint</span>
                    <h2 style={{ fontSize: 18, fontWeight: 700, color: '#fff', margin: '0 0 3px' }}>{activeSprint.name}</h2>
                    <span style={{ fontSize: 11, color: 'rgba(122,207,230,0.8)' }}>
                      {formatDate(activeSprint.start_date)} – {formatDate(activeSprint.end_date)}
                    </span>
                    {daysLeft > 0 && <span style={{ display: 'inline-block', marginLeft: 8, background: 'rgba(122,207,230,0.15)', borderRadius: 6, padding: '1px 7px', fontSize: 10, color: '#7acfe6' }}>{daysLeft} gün kaldı</span>}
                  </div>
                  <button onClick={() => handleDeactivate(activeSprint)}
                    style={{ fontSize: 11, fontWeight: 500, padding: '5px 11px', borderRadius: 8, border: '1px solid rgba(122,207,230,0.25)', background: 'rgba(122,207,230,0.08)', color: '#7acfe6', cursor: 'pointer', flexShrink: 0 }}
                  >Pasifleştir</button>
                </div>

                {/* Progress */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Görev tamamlanma</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#4ade80' }}>{pct}%</span>
                  </div>
                  <div style={{ height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg, #22c55e, #4ade80)', borderRadius: 999 }} />
                  </div>
                  <div style={{ marginTop: 5, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${timePct}%`, background: 'rgba(122,207,230,0.4)', borderRadius: 999 }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>Zaman geçişi</span>
                    <span style={{ fontSize: 10, color: 'rgba(122,207,230,0.6)' }}>{timePct}%</span>
                  </div>
                </div>

                {/* Stats grid 2×2 */}
                {c ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {[
                      { label: 'Toplam', value: c.total, bg: 'rgba(255,255,255,0.08)', color: '#e2e8f0' },
                      { label: 'Tamamlandı', value: c.done, bg: 'rgba(74,222,128,0.12)', color: '#4ade80' },
                      { label: 'Yapılıyor', value: c.doing, bg: 'rgba(251,191,36,0.12)', color: '#fbbf24' },
                      { label: 'Bloke', value: c.blocked, bg: 'rgba(248,113,113,0.12)', color: '#f87171' },
                    ].map(stat => (
                      <div key={stat.label} style={{ display: 'flex', alignItems: 'center', gap: 8, background: stat.bg, borderRadius: 10, padding: '8px 12px' }}>
                        <span style={{ fontSize: 18, fontWeight: 700, color: stat.color }}>{stat.value}</span>
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{stat.label}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', margin: 0 }}>Bu sprint&apos;e henüz görev atanmamış.</p>
                )}

                {/* Düzenle butonu */}
                <button onClick={() => openEditForm(activeSprint)}
                  style={{ width: '100%', marginTop: 14, padding: '10px 0', borderRadius: 10, border: '1px solid rgba(122,207,230,0.2)', background: 'rgba(255,255,255,0.05)', color: '#7acfe6', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                >Düzenle</button>
              </div>
            )
          })()}

          {/* Diğer Sprintler */}
          {inactiveSprints.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '4px 2px' }}>Diğer Sprintler · {inactiveSprints.length}</div>
              {inactiveSprints.map((sprint, idx) => {
                const c = sprintTaskCounts[sprint.id]
                const pct = c && c.total > 0 ? Math.round((c.done / c.total) * 100) : 0
                const isExpired = new Date(sprint.end_date) < new Date()
                return (
                  <div key={sprint.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                    {/* Üst satır */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#94a3b8', flexShrink: 0 }}>
                        {inactiveSprints.length - idx}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                          <span style={{ fontSize: 14, fontWeight: 600, color: '#0d1a2a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sprint.name}</span>
                          {isExpired && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 5, background: '#fef2f2', color: '#ef4444', flexShrink: 0 }}>Süresi doldu</span>}
                        </div>
                        <span style={{ fontSize: 11, color: '#9ca3af' }}>📅 {formatDate(sprint.start_date)} – {formatDate(sprint.end_date)}</span>
                      </div>
                    </div>

                    {/* Progress bar */}
                    {c ? (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 11, color: '#9ca3af' }}>{c.done}/{c.total} görev</span>
                          <span style={{ fontSize: 11, fontWeight: 600, color: pct === 100 ? '#16a34a' : '#374151' }}>{pct}%</span>
                        </div>
                        <div style={{ height: 5, background: '#f1f5f9', borderRadius: 999 }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#22c55e' : '#2288c9', borderRadius: 999 }} />
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 11, color: '#d1d5db', marginBottom: 12 }}>Görev atanmamış</div>
                    )}

                    {/* Aksiyon butonları */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                      <button onClick={() => handleActivate(sprint)}
                        style={{ padding: '8px 0', borderRadius: 9, border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#16a34a', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                      >Aktifleştir</button>
                      <button onClick={() => openEditForm(sprint)}
                        style={{ padding: '8px 0', borderRadius: 9, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#64748b', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                      >Düzenle</button>
                      <button onClick={() => handleDelete(sprint)}
                        style={{ padding: '8px 0', borderRadius: 9, border: '1px solid #fee2e2', background: '#fff5f5', color: '#ef4444', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                      >Sil</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* FAB */}
        <button onClick={openCreateForm}
          style={{ position: 'fixed', right: 20, bottom: 28, width: 52, height: 52, borderRadius: 16, background: '#2288c9', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px rgba(34,136,201,0.4)', zIndex: 30 }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>

        {MobileForm}
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f7fa' }}>
      <main style={{ padding: '24px 28px', maxWidth: 900, margin: '0 auto' }}>

        {/* Başlık */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0d1a2a', margin: 0 }}>Sprintler</h1>
            <p style={{ fontSize: 13, color: '#9ca3af', margin: '3px 0 0' }}>Sprint oluşturun, aktifleştirin ve görevleri sprint&apos;lere atayın.</p>
          </div>
          <button
            onClick={openCreateForm}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 10, border: 'none', background: '#2288c9', color: '#fff', cursor: 'pointer' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#1d78b8' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#2288c9' }}
          >
            <span style={{ fontSize: 16, fontWeight: 300 }}>+</span> Yeni Sprint
          </button>
        </div>

        {/* Boş durum */}
        {sprints.length === 0 && (
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: '60px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🏃</div>
            <p style={{ fontSize: 14, fontWeight: 600, color: '#374151', margin: '0 0 6px' }}>Henüz sprint oluşturulmamış</p>
            <p style={{ fontSize: 13, color: '#9ca3af', margin: '0 0 20px' }}>İlk sprintinizi oluşturarak görevlerinizi organize etmeye başlayın.</p>
            <button onClick={openCreateForm} style={{ fontSize: 13, fontWeight: 600, padding: '9px 20px', borderRadius: 10, border: 'none', background: '#2288c9', color: '#fff', cursor: 'pointer' }}>
              İlk Sprint&apos;i Oluştur
            </button>
          </div>
        )}

        {/* Aktif Sprint Kartı */}
        {activeSprint && (() => {
          const c = sprintTaskCounts[activeSprint.id]
          const pct = c && c.total > 0 ? Math.round((c.done / c.total) * 100) : 0
          const now = new Date()
          const end = new Date(activeSprint.end_date)
          const start = new Date(activeSprint.start_date)
          const totalMs = end.getTime() - start.getTime()
          const passedMs = now.getTime() - start.getTime()
          const timePct = totalMs > 0 ? Math.min(100, Math.max(0, Math.round((passedMs / totalMs) * 100))) : 0
          const daysLeft = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86400000))
          return (
            <div style={{ background: 'linear-gradient(135deg, #0d1a2a 0%, #1a2f45 100%)', border: '1px solid rgba(122,207,230,0.15)', borderRadius: 16, padding: '22px 24px', marginBottom: 20, boxShadow: '0 4px 20px rgba(0,0,0,0.12)' }}>
              {/* Üst satır */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 }}>
                <div>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#7acfe6', display: 'block', marginBottom: 4 }}>● Aktif Sprint</span>
                  <h2 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: '0 0 4px' }}>{activeSprint.name}</h2>
                  <span style={{ fontSize: 12, color: 'rgba(122,207,230,0.8)' }}>
                    {formatDate(activeSprint.start_date)} – {formatDate(activeSprint.end_date)}
                    {daysLeft > 0 && <span style={{ marginLeft: 8, background: 'rgba(122,207,230,0.15)', borderRadius: 6, padding: '1px 7px', fontSize: 11 }}>{daysLeft} gün kaldı</span>}
                  </span>
                </div>
                <button
                  onClick={() => handleDeactivate(activeSprint)}
                  style={{ fontSize: 12, fontWeight: 500, padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(122,207,230,0.25)', background: 'rgba(122,207,230,0.08)', color: '#7acfe6', cursor: 'pointer' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(122,207,230,0.15)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(122,207,230,0.08)' }}
                >
                  Pasifleştir
                </button>
              </div>

              {/* İlerleme barı */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Görev tamamlanma</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#4ade80' }}>{pct}%</span>
                </div>
                <div style={{ height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg, #22c55e, #4ade80)', borderRadius: 999, transition: 'width 0.5s ease' }} />
                </div>
                <div style={{ marginTop: 6, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${timePct}%`, background: 'rgba(122,207,230,0.4)', borderRadius: 999 }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>Zaman geçişi</span>
                  <span style={{ fontSize: 10, color: 'rgba(122,207,230,0.6)' }}>{timePct}%</span>
                </div>
              </div>

              {/* İstatistik pilleri */}
              {c ? (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {[
                    { label: 'Toplam', value: c.total, bg: 'rgba(255,255,255,0.08)', color: '#e2e8f0' },
                    { label: 'Tamamlandı', value: c.done, bg: 'rgba(74,222,128,0.12)', color: '#4ade80' },
                    { label: 'Yapılıyor', value: c.doing, bg: 'rgba(251,191,36,0.12)', color: '#fbbf24' },
                    { label: 'Bloke', value: c.blocked, bg: 'rgba(248,113,113,0.12)', color: '#f87171' },
                    { label: 'Beklemede', value: c.backlog, bg: 'rgba(167,139,250,0.12)', color: '#a78bfa' },
                  ].map(stat => (
                    <div key={stat.label} style={{ display: 'flex', alignItems: 'center', gap: 6, background: stat.bg, borderRadius: 8, padding: '5px 11px' }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: stat.color }}>{stat.value}</span>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{stat.label}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', margin: 0 }}>Bu sprint&apos;e henüz görev atanmamış.</p>
              )}
            </div>
          )
        })()}

        {/* Diğer Sprintler */}
        {inactiveSprints.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {inactiveSprints.map((sprint, idx) => {
              const c = sprintTaskCounts[sprint.id]
              const pct = c && c.total > 0 ? Math.round((c.done / c.total) * 100) : 0
              const isExpired = new Date(sprint.end_date) < new Date()
              return (
                <div
                  key={sprint.id}
                  style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
                >
                  {/* Sol: index + isim */}
                  <div style={{ width: 32, height: 32, borderRadius: 10, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#94a3b8', flexShrink: 0 }}>
                    {inactiveSprints.length - idx}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#0d1a2a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sprint.name}</span>
                      {isExpired && <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 5, background: '#fef2f2', color: '#ef4444', flexShrink: 0 }}>Süresi doldu</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 11.5, color: '#9ca3af' }}>📅 {formatDate(sprint.start_date)} – {formatDate(sprint.end_date)}</span>
                    </div>
                  </div>

                  {/* Progress */}
                  <div style={{ width: 120, flexShrink: 0 }}>
                    {c ? (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 11, color: '#9ca3af' }}>{c.done}/{c.total} görev</span>
                          <span style={{ fontSize: 11, fontWeight: 600, color: pct === 100 ? '#16a34a' : '#374151' }}>{pct}%</span>
                        </div>
                        <div style={{ height: 5, background: '#f1f5f9', borderRadius: 999 }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#22c55e' : '#2288c9', borderRadius: 999 }} />
                        </div>
                      </>
                    ) : (
                      <span style={{ fontSize: 11, color: '#d1d5db' }}>Görev yok</span>
                    )}
                  </div>

                  {/* Aksiyonlar */}
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button
                      onClick={() => handleActivate(sprint)}
                      style={{ fontSize: 12, fontWeight: 500, padding: '5px 12px', borderRadius: 8, border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#16a34a', cursor: 'pointer' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#dcfce7' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#f0fdf4' }}
                    >
                      Aktifleştir
                    </button>
                    <button
                      onClick={() => openEditForm(sprint)}
                      style={{ fontSize: 12, fontWeight: 500, padding: '5px 10px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#64748b', cursor: 'pointer' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f1f5f9' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#f8fafc' }}
                    >
                      Düzenle
                    </button>
                    <button
                      onClick={() => handleDelete(sprint)}
                      style={{ fontSize: 12, fontWeight: 500, padding: '5px 10px', borderRadius: 8, border: '1px solid #fee2e2', background: '#fff5f5', color: '#ef4444', cursor: 'pointer' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#fee2e2' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fff5f5' }}
                    >
                      Sil
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

      </main>

      {/* Form Modal */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={(e) => { if (e.target === e.currentTarget) closeForm() }}
        >
          <div
            className="w-full max-w-md rounded-2xl shadow-2xl"
            style={{ background: '#fff', border: '1px solid #e5e7eb' }}
          >
            <div
              className="px-6 py-4 flex items-center justify-between"
              style={{ borderBottom: '1px solid #f3f4f6' }}
            >
              <h2 className="text-base font-bold" style={{ color: '#0d1a2a' }}>
                {editingSprint ? 'Sprint Düzenle' : 'Yeni Sprint'}
              </h2>
              <button
                onClick={closeForm}
                className="text-gray-400 hover:text-gray-600 text-xl font-light leading-none"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="p-6 space-y-4">
              {formError && (
                <div className="text-sm px-4 py-3 rounded-xl" style={{ background: '#fee2e2', color: '#dc2626' }}>
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: '#182c3f' }}>
                  Sprint Adı <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="örn. Sprint 1, Mayıs Haftası..."
                  className="input"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: '#182c3f' }}>
                    Başlangıç Tarihi <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <input
                    type="date"
                    value={formStartDate}
                    onChange={(e) => setFormStartDate(e.target.value)}
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: '#182c3f' }}>
                    Bitiş Tarihi <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <input
                    type="date"
                    value={formEndDate}
                    onChange={(e) => setFormEndDate(e.target.value)}
                    className="input"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeForm} className="btn-secondary flex-1">
                  İptal
                </button>
                <button type="submit" disabled={formLoading} className="btn-primary flex-1 disabled:opacity-50">
                  {formLoading ? 'Kaydediliyor...' : editingSprint ? 'Güncelle' : 'Oluştur'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
