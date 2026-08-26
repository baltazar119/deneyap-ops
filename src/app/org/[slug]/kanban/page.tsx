'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { TASK_TYPES, TASK_TYPE_LABELS } from '@/lib/taskTypes'
import { yazabilirMi } from '@/lib/roller'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { supabase } from '@/lib/supabase/client'
import { createNotification } from '@/lib/notifications'
import { useOrg } from '@/lib/supabase/orgContext'
import { useIsMobile } from '@/lib/useIsMobile'
import StatusBadge from '@/components/StatusBadge'
import { isOverdue } from '@/lib/utils'
import { getCachedData, setCachedData } from '@/lib/pageDataCache'
import type { Task, Profile, TaskStatus, TaskPriority, TaskType, Sprint } from '@/types/database'

/* ── Constants ──────────────────────────────────────────────── */

const COLUMNS: { status: TaskStatus; label: string; color: string; bg: string; topColor: string }[] = [
  { status: 'backlog',  label: 'Beklemede',  color: '#64748b', bg: '#f8fafc', topColor: '#94a3b8' },
  { status: 'doing',   label: 'Yapılıyor',  color: '#2288c9', bg: '#f0f9ff', topColor: '#2288c9' },
  { status: 'testing', label: 'Test',        color: '#b45309', bg: '#fffbeb', topColor: '#f59e0b' },
  { status: 'done',    label: 'Tamamlandı', color: '#059669', bg: '#f0fdf4', topColor: '#10b981' },
]

const PRIORITY_META: Record<TaskPriority, { icon: string; color: string; bg: string; label: string; border: string }> = {
  critical: { icon: '🔴', color: '#dc2626', bg: '#fee2e2', label: 'Kritik',  border: '#fecaca' },
  high:     { icon: '🟡', color: '#b45309', bg: '#fef3c7', label: 'Yüksek', border: '#fde68a' },
  normal:   { icon: '🔵', color: '#2288c9', bg: '#e0f2fe', label: 'Normal', border: '#bae6fd' },
  low:      { icon: '⚪', color: '#94a3b8', bg: '#f1f5f9', label: 'Düşük',  border: '#e2e8f0' },
}


const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'backlog',  label: 'Beklemede' },
  { value: 'doing',   label: 'Yapılıyor' },
  { value: 'testing', label: 'Test' },
  { value: 'blocked', label: 'Bloke' },
  { value: 'done',    label: 'Tamamlandı' },
]

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: 'critical', label: 'Kritik' },
  { value: 'high',     label: 'Yüksek' },
  { value: 'normal',   label: 'Normal' },
  { value: 'low',      label: 'Düşük' },
]


/* ── Types ───────────────────────────────────────────────────── */

interface TaskWithMeta extends Task {
  assigneeName?: string
}

/* ── Component ───────────────────────────────────────────────── */

export default function KanbanPage() {
  const router = useRouter()
  const { org, orgRole, userId, userEmail: orgEmail, avatarUrl: orgAvatarUrl, isAdmin, loading: orgLoading } = useOrg()

  // Senkron cache init: OrgContext lazy init ile tab geçişlerinde anında render
  const _initRole  = (isAdmin ? 'admin' : 'member') as 'admin' | 'member'
  const _initKey   = org?.id && userId ? `kanban:${org.id}:${_initRole}:${userId}` : ''
  const _initCache = _initKey ? getCachedData<{ tasks: TaskWithMeta[]; members: Profile[]; sprints: Sprint[] }>(_initKey) : null

  // Auth
  const [currentUserId, setCurrentUserId]   = useState<string | null>(userId ?? null)
  const [currentRole, setCurrentRole]       = useState<'admin' | 'member'>(_initRole)
  const [, setUserEmail]                    = useState(orgEmail ?? '')
  const [, setUserAvatarUrl]                = useState<string | null>(orgAvatarUrl ?? null)

  // Data — cache'den anında init, ilk render'da loading flash yok
  const [tasks, setTasks]       = useState<TaskWithMeta[]>(_initCache?.tasks ?? [])
  const [members, setMembers]   = useState<Profile[]>(_initCache?.members ?? [])
  const [sprints, setSprints]   = useState<Sprint[]>(_initCache?.sprints ?? [])
  const [loading, setLoading]   = useState(_initCache === null)

  // Filters
  const [filterSprint,   setFilterSprint]   = useState<string>('all')
  const [filterMember,   setFilterMember]   = useState<string>('all')
  const [filterOverdue,  setFilterOverdue]  = useState(false)
  const [searchQuery,    setSearchQuery]    = useState('')

  // Mobile — sürükle-bırak dokunmatik ekranda güvenilir olmadığından mobilde
  // kolon sekmeleri + "durumu değiştir" butonları kullanılır (bkz. render altta).
  const isMobile = useIsMobile()
  const [mobileColumn, setMobileColumn] = useState<TaskStatus>('doing')

  // Toast
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  // Slide-over panel
  const [selectedTask, setSelectedTask]     = useState<TaskWithMeta | null>(null)
  const [panelStatus,  setPanelStatus]      = useState<TaskStatus>('backlog')
  const [panelAssignee, setPanelAssignee]   = useState<string>('')
  const [panelSaving,  setPanelSaving]      = useState(false)

  // Create modal
  const [showCreateForm,     setShowCreateForm]     = useState(false)
  const [formTitle,          setFormTitle]          = useState('')
  const [formDescription,    setFormDescription]    = useState('')
  const [formStatus,         setFormStatus]         = useState<TaskStatus>('backlog')
  const [formPriority,       setFormPriority]       = useState<TaskPriority>('normal')
  const [formType,           setFormType]           = useState<TaskType>('other')
  const [formAssignee,       setFormAssignee]       = useState('')
  const [formDueDate,        setFormDueDate]        = useState('')
  const [formSprintId,       setFormSprintId]       = useState('')
  const [formEstimatedHours, setFormEstimatedHours] = useState('')
  const [formLoading,        setFormLoading]        = useState(false)
  const [formError,          setFormError]          = useState<string | null>(null)

  /* ── Data loading ────────────────────────────────────────── */

  useEffect(() => {
    if (orgLoading) return
    if (!org || !userId) return // OrgProvider handles redirect

    if (orgRole === 'consultant') {
      router.replace(`/org/${org.slug}/consultant`)
      return
    }

    const role = (isAdmin ? 'admin' : 'member') as 'admin' | 'member'
    setCurrentRole(role)
    setCurrentUserId(userId)
    setUserEmail(orgEmail ?? '')
    setUserAvatarUrl(orgAvatarUrl ?? null)

    const cacheKey = `kanban:${org.id}:${role}:${userId}`

    // State zaten senkron init edildi — sadece background/foreground kararı ver
    const alreadyLoaded = tasks.length > 0 || members.length > 0

    async function init(background = false) {
      try {
        // Adım 1: Üye ID'leri ve sprint'leri paralel çek
        const [membershipsRes, sprintsRes] = await Promise.all([
          supabase.from('organization_members').select('user_id').eq('organization_id', org!.id),
          supabase.from('sprints').select('*').eq('organization_id', org!.id).order('start_date', { ascending: false }),
        ])

        const memberIds = membershipsRes.data?.map(m => m.user_id) ?? []

        // Adım 2: Profiller ve görevleri paralel çek
        let tasksQuery = supabase.from('tasks').select('*').eq('organization_id', org!.id).order('created_at', { ascending: false })
        if (role === 'member') tasksQuery = tasksQuery.eq('assignee_id', userId!)

        const [profilesRes, tasksRes] = await Promise.all([
          supabase.from('profiles').select('*').in('id', memberIds).order('created_at'),
          tasksQuery,
        ])

        const profilesList: Profile[] = profilesRes.data || []
        const enriched: TaskWithMeta[] = (tasksRes.data || []).map((t: Task) => ({
          ...t,
          assigneeName: profilesList.find(p => p.id === t.assignee_id)?.full_name || undefined,
        }))
        const sprintsList: Sprint[] = sprintsRes.data || []

        setMembers(profilesList)
        setSprints(sprintsList)
        setTasks(enriched)
        setCachedData(cacheKey, { tasks: enriched, members: profilesList, sprints: sprintsList })
      } catch (err) {
        console.error('[Kanban] init error:', err)
      } finally {
        if (!background) setLoading(false)
      }
    }

    init(alreadyLoaded)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgLoading, org?.id, userId, orgRole, isAdmin])

  /* ── Toast helper ────────────────────────────────────────── */

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 2500)
  }

  /* ── Filtered tasks ──────────────────────────────────────── */

  const filteredTasks = tasks.filter((t) => {
    if (filterSprint !== 'all' && t.sprint_id !== filterSprint) return false
    if (filterMember !== 'all' && t.assignee_id !== filterMember) return false
    if (filterOverdue && (!isOverdue(t.due_date) || t.status === 'done')) return false
    if (searchQuery && !t.title.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  function tasksForColumn(status: TaskStatus) {
    return filteredTasks.filter((t) => t.status === status)
  }

  /* ── Drag & Drop ─────────────────────────────────────────── */

  async function onDragEnd(result: DropResult) {
    if (!result.destination) return
    const taskId    = result.draggableId
    const newStatus = result.destination.droppableId as TaskStatus
    const task      = tasks.find((t) => t.id === taskId)
    if (!task || task.status === newStatus) return

    setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: newStatus } : t))

    const { error } = await supabase.from('tasks').update({ status: newStatus }).eq('id', taskId)
    if (error) {
      setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: task.status } : t))
      showToast('Güncellenemedi', false)
    } else {
      showToast('Durum güncellendi', true)
      if (task.assignee_id && task.assignee_id !== currentUserId) {
        const statusLabel = COLUMNS.find((c) => c.status === newStatus)?.label ?? newStatus
        await createNotification({
          user_id: task.assignee_id, type: 'task', event_type: 'task_status_changed',
          title: 'Görev Durumu Değişti',
          description: `"${task.title}" görevi "${statusLabel}" durumuna taşındı.`,
          actor_id: currentUserId!, actor_name: members.find((m) => m.id === currentUserId)?.full_name ?? null,
          link: `/org/${org!.slug}/tasks/${taskId}`,
          entity_key: `task:${taskId}:status`,
          org_id: org?.id,
        })
      }
    }
  }

  /* ── Slide-over panel ────────────────────────────────────── */

  function openPanel(task: TaskWithMeta) {
    setSelectedTask(task)
    setPanelStatus(task.status)
    setPanelAssignee(task.assignee_id || '')
  }

  function closePanel() { setSelectedTask(null) }

  async function savePanelChanges() {
    if (!selectedTask) return
    setPanelSaving(true)
    const oldStatus   = selectedTask.status
    const oldAssignee = selectedTask.assignee_id || ''
    const actorName   = members.find((m) => m.id === currentUserId)?.full_name ?? null

    const { error } = await supabase
      .from('tasks')
      .update({ status: panelStatus, assignee_id: panelAssignee || null })
      .eq('id', selectedTask.id)
    if (error) {
      showToast('Güncellenemedi', false)
    } else {
      setTasks((prev) => prev.map((t) =>
        t.id === selectedTask.id
          ? { ...t, status: panelStatus, assignee_id: panelAssignee || null,
              assigneeName: members.find((m) => m.id === panelAssignee)?.full_name || undefined }
          : t
      ))
      setSelectedTask((prev) => prev ? { ...prev, status: panelStatus, assignee_id: panelAssignee || null } : null)
      showToast('Kaydedildi', true)

      // Durum değişikliği bildirimi
      if (panelStatus !== oldStatus && panelAssignee && panelAssignee !== currentUserId) {
        const statusLabel = STATUS_OPTIONS.find((s) => s.value === panelStatus)?.label ?? panelStatus
        await createNotification({
          user_id: panelAssignee, type: 'task', event_type: 'task_status_changed',
          title: 'Görev Durumu Değişti',
          description: `"${selectedTask.title}" görevi "${statusLabel}" durumuna taşındı.`,
          actor_id: currentUserId!, actor_name: actorName,
          link: `/org/${org!.slug}/tasks/${selectedTask.id}`,
          entity_key: `task:${selectedTask.id}:status`,
          org_id: org?.id,
        })
      }
      // Yeni atama bildirimi
      if (panelAssignee && panelAssignee !== oldAssignee && panelAssignee !== currentUserId) {
        await createNotification({
          user_id: panelAssignee, type: 'task', event_type: 'task_assigned',
          title: 'Görev Size Atandı',
          description: `"${selectedTask.title}" görevi size atandı.`,
          actor_id: currentUserId!, actor_name: actorName,
          link: `/org/${org!.slug}/tasks/${selectedTask.id}`,
          entity_key: `task:${selectedTask.id}`,
          org_id: org?.id,
        })
      }
    }
    setPanelSaving(false)
  }

  /* ── Create form ─────────────────────────────────────────── */

  function openCreateForm() {
    setFormTitle(''); setFormDescription(''); setFormStatus('backlog')
    setFormPriority('normal'); setFormType('other'); setFormAssignee('')
    setFormDueDate(''); setFormSprintId(''); setFormEstimatedHours('')
    setFormError(null); setShowCreateForm(true)
  }

  async function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!formTitle.trim()) { setFormError('Başlık zorunludur.'); return }
    if (!currentUserId) return
    setFormLoading(true); setFormError(null)

    const { data: newTask, error } = await supabase.from('tasks').insert({
      title: formTitle.trim(),
      description: formDescription || null,
      status: formStatus,
      priority: formPriority,
      task_type: formType,
      assignee_id: formAssignee || null,
      due_date: formDueDate || null,
      estimated_hours: formEstimatedHours ? parseFloat(formEstimatedHours) : null,
      sprint_id: formSprintId || null,
      created_by: currentUserId,
      organization_id: org!.id,
    }).select('id').single()

    if (error) {
      setFormError('Görev oluşturulurken hata oluştu.')
    } else {
      setShowCreateForm(false)
      const { data } = await supabase.from('tasks').select('*').order('created_at', { ascending: false })
      const enriched: TaskWithMeta[] = (data || []).map((t: Task) => ({
        ...t,
        assigneeName: members.find((p) => p.id === t.assignee_id)?.full_name || undefined,
      }))
      if (currentRole === 'member') {
        setTasks(enriched.filter((t) => t.assignee_id === currentUserId))
      } else {
        setTasks(enriched)
      }
      showToast('Görev oluşturuldu', true)
      if (formAssignee && formAssignee !== currentUserId && newTask?.id) {
        await createNotification({
          user_id: formAssignee, type: 'task', event_type: 'task_assigned',
          title: 'Yeni Görev Atandı',
          description: `"${formTitle.trim()}" görevi size atandı.`,
          actor_id: currentUserId!, actor_name: members.find((m) => m.id === currentUserId)?.full_name ?? null,
          link: `/org/${org!.slug}/tasks/${newTask.id}`,
          entity_key: `task:${newTask.id}`,
          org_id: org?.id,
        })
      }
    }
    setFormLoading(false)
  }

  /* ── Mobile status quick-change ──────────────────────────── */

  async function handleMobileStatusChange(taskId: string, newStatus: TaskStatus) {
    const task = tasks.find((t) => t.id === taskId)
    if (!task) return
    setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: newStatus } : t))
    const { error } = await supabase.from('tasks').update({ status: newStatus }).eq('id', taskId)
    if (error) {
      setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: task.status } : t))
      showToast('Güncellenemedi', false)
    } else {
      showToast('Durum güncellendi', true)
      if (task.assignee_id && task.assignee_id !== currentUserId) {
        const statusLabel = STATUS_OPTIONS.find((s) => s.value === newStatus)?.label ?? newStatus
        await createNotification({
          user_id: task.assignee_id, type: 'task', event_type: 'task_status_changed',
          title: 'Görev Durumu Değişti',
          description: `"${task.title}" görevi "${statusLabel}" durumuna taşındı.`,
          actor_id: currentUserId!, actor_name: members.find((m) => m.id === currentUserId)?.full_name ?? null,
          link: '/kanban',
          org_id: org?.id,
        })
      }
    }
  }

  /* ── Loading skeleton ─────────────────────────────────────── */

  if (loading) {
    return (
      <div className="min-h-screen px-6 py-5" style={{ background: '#f5f7fa' }}>
        <div className="flex items-center justify-between mb-5">
          <div className="space-y-2">
            <div className="skeleton h-7 w-40 rounded-xl" />
            <div className="skeleton h-4 w-56 rounded-xl" />
          </div>
          <div className="skeleton h-9 w-32 rounded-xl" />
        </div>
        <div className="skeleton h-10 rounded-xl mb-4" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[0,1,2,3].map((i) => (
            <div key={i} className="rounded-2xl overflow-hidden" style={{ border: '1px solid #e5e7eb' }}>
              <div className="skeleton h-10 rounded-none" style={{ borderRadius: 0 }} />
              <div className="p-3 space-y-3" style={{ background: '#fff' }}>
                {[0,1,2].map((j) => <div key={j} className="skeleton h-20 rounded-xl" />)}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const activeSprint = sprints.find((s) => s.is_active)

  /* ── Sprint progress ──────────────────────────────────────── */
  const sprintTasksAll   = activeSprint ? tasks.filter((t) => t.sprint_id === activeSprint.id) : []
  const sprintDone       = sprintTasksAll.filter((t) => t.status === 'done').length
  const sprintTotal      = sprintTasksAll.length
  const sprintProgress   = sprintTotal > 0 ? Math.round((sprintDone / sprintTotal) * 100) : 0

  /* ── Render ──────────────────────────────────────────────── */

  // ── MOBİL LAYOUT ─────────────────────────────────────────────────────────
  if (isMobile) {
    const mobileColTasks = filteredTasks.filter(t => t.status === mobileColumn)
    const nextStatus: Record<TaskStatus, TaskStatus | null> = {
      backlog: 'doing', doing: 'testing', testing: 'done', blocked: 'doing', done: null,
    }
    const prevStatus: Record<TaskStatus, TaskStatus | null> = {
      backlog: null, doing: 'backlog', testing: 'doing', blocked: null, done: 'testing',
    }

    return (
      <div style={{ minHeight: '100%', background: '#f0f4f8', paddingBottom: 80 }}>

        {/* Header */}
        <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '14px 16px 0' }}>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#111827', letterSpacing: '-0.02em' }}>Kanban</div>
          </div>

          {/* Kolon sekmeleri */}
          <div style={{ display: 'flex', overflowX: 'auto', scrollbarWidth: 'none', gap: 0 }}>
            {COLUMNS.map(col => {
              const count = filteredTasks.filter(t => t.status === col.status).length
              const active = mobileColumn === col.status
              return (
                <button key={col.status} onClick={() => setMobileColumn(col.status)} style={{
                  flexShrink: 0, padding: '8px 14px', border: 'none', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 12, fontWeight: 600, background: 'transparent',
                  color: active ? col.topColor : '#9ca3af',
                  borderBottom: active ? `2.5px solid ${col.topColor}` : '2.5px solid transparent',
                  transition: 'all 0.15s',
                }}>
                  {col.label}
                  <span style={{
                    marginLeft: 5, fontSize: 10, fontWeight: 700,
                    padding: '1px 6px', borderRadius: 99,
                    background: active ? col.topColor + '18' : '#f1f5f9',
                    color: active ? col.topColor : '#9ca3af',
                  }}>{count}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Sprint kartı */}
        {activeSprint && sprintTotal > 0 && (
          <div style={{ margin: '12px 16px 0' }}>
            <div style={{
              background: 'linear-gradient(135deg, #0f172a, #1e3a5f)',
              borderRadius: 16, padding: '14px 16px',
              border: '1px solid rgba(122,207,230,0.12)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(122,207,230,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 3 }}>Aktif Sprint</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>{activeSprint.name}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 24, fontWeight: 900, color: '#10b981', lineHeight: 1 }}>{sprintProgress}%</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{sprintDone}/{sprintTotal} tamamlandı</div>
                </div>
              </div>
              <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 99,
                  background: 'linear-gradient(90deg, #10b981, #34d399)',
                  width: `${sprintProgress}%`, transition: 'width 0.5s ease',
                }} />
              </div>
            </div>
          </div>
        )}

        {/* Filtre chips */}
        <div style={{ display: 'flex', gap: 6, padding: '10px 16px', overflowX: 'auto', scrollbarWidth: 'none' }}>
          {/* Arama */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 99, padding: '5px 12px', flexShrink: 0 }}>
            <span style={{ fontSize: 12, color: '#9ca3af' }}>🔍</span>
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Ara..." style={{ border: 'none', outline: 'none', fontSize: 12, color: '#111827', background: 'transparent', width: 80, fontFamily: 'inherit' }} />
          </div>
          {sprints.filter(s => s.is_active).map(s => (
            <button key={s.id} onClick={() => setFilterSprint(filterSprint === s.id ? 'all' : s.id)} style={{
              flexShrink: 0, padding: '5px 12px', borderRadius: 99, fontSize: 11, fontWeight: 600, border: '1px solid', cursor: 'pointer', fontFamily: 'inherit',
              background: filterSprint === s.id ? '#ede9fe' : '#fff',
              color: filterSprint === s.id ? '#7c3aed' : '#6b7280',
              borderColor: filterSprint === s.id ? '#7c3aed' : '#e5e7eb',
            }}>🏃 {s.name}</button>
          ))}
          <button onClick={() => setFilterOverdue(!filterOverdue)} style={{
            flexShrink: 0, padding: '5px 12px', borderRadius: 99, fontSize: 11, fontWeight: 600, border: '1px solid', cursor: 'pointer', fontFamily: 'inherit',
            background: filterOverdue ? '#fee2e2' : '#fff',
            color: filterOverdue ? '#dc2626' : '#6b7280',
            borderColor: filterOverdue ? '#dc2626' : '#e5e7eb',
          }}>⚠ Gecikmiş</button>
        </div>

        {/* Görev kartları */}
        <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {mobileColTasks.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>
                {COLUMNS.find(c => c.status === mobileColumn)?.label === 'Tamamlandı' ? '🎉' : '📭'}
              </div>
              <div style={{ fontSize: 14 }}>Bu kolonda görev yok</div>
            </div>
          ) : mobileColTasks.map(task => {
            const pMeta = PRIORITY_META[task.priority ?? 'normal']
            const overdue = isOverdue(task.due_date) && task.status !== 'done'
            const next = nextStatus[task.status]
            const prev = prevStatus[task.status]
            const nextLabel = next ? COLUMNS.find(c => c.status === next)?.label : null
            const prevLabel = prev ? COLUMNS.find(c => c.status === prev)?.label : null
            return (
              <div key={task.id} style={{
                background: '#fff', borderRadius: 14,
                border: '1px solid #e5e7eb',
                boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                overflow: 'hidden',
              }}>
                {/* Öncelik çizgisi */}
                <div style={{ height: 3, background: pMeta.color }} />
                <div style={{ padding: '12px 14px 10px' }}>
                  {/* Başlık + detay linki */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                    <Link href={`/org/${org?.slug}/tasks/${task.id}`} style={{ fontSize: 14, fontWeight: 700, color: '#111827', textDecoration: 'none', flex: 1, lineHeight: 1.4 }}>
                      {task.title}
                    </Link>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: pMeta.bg, color: pMeta.color, flexShrink: 0 }}>
                      {pMeta.label}
                    </span>
                  </div>

                  {/* Meta */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                    {task.assigneeName && (
                      <span style={{ fontSize: 11, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 3 }}>
                        <span style={{ width: 16, height: 16, borderRadius: '50%', background: '#e0f2fe', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: '#0369a1' }}>
                          {task.assigneeName[0].toUpperCase()}
                        </span>
                        {task.assigneeName}
                      </span>
                    )}
                    {task.due_date && (
                      <span style={{ fontSize: 11, fontWeight: 600, color: overdue ? '#dc2626' : '#9ca3af' }}>
                        {overdue && '⚠ '}{new Date(task.due_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                      </span>
                    )}
                    {task.sprint_id && (() => { const sp = sprints.find(s => s.id === task.sprint_id); return sp ? <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 99, background: '#ede9fe', color: '#7c3aed' }}>{sp.name}</span> : null })()}
                  </div>

                  {/* Durum değişim butonları */}
                  <div style={{ display: 'flex', gap: 6 }}>
                    {prevLabel && (
                      <button onClick={() => handleMobileStatusChange(task.id, prev!)} style={{
                        flex: 1, padding: '6px 0', borderRadius: 9, border: '1px solid #e5e7eb',
                        background: '#f8fafc', fontSize: 11, fontWeight: 600, color: '#64748b',
                        cursor: 'pointer', fontFamily: 'inherit',
                      }}>← {prevLabel}</button>
                    )}
                    {nextLabel && (
                      <button onClick={() => handleMobileStatusChange(task.id, next!)} style={{
                        flex: 1, padding: '6px 0', borderRadius: 9, border: 'none',
                        background: COLUMNS.find(c => c.status === next)?.topColor + '18',
                        color: COLUMNS.find(c => c.status === next)?.topColor,
                        fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                      }}>{nextLabel} →</button>
                    )}
                    {task.status === 'done' && (
                      <div style={{ flex: 1, textAlign: 'center', fontSize: 11, color: '#10b981', fontWeight: 700, padding: '6px 0' }}>✓ Tamamlandı</div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* FAB */}
        <button onClick={openCreateForm} style={{
          position: 'fixed', bottom: 24, right: 20, zIndex: 20,
          width: 52, height: 52, borderRadius: '50%', border: 'none',
          background: 'linear-gradient(135deg, #2288c9, #1d78b8)',
          color: '#fff', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 6px 20px rgba(34,136,201,0.45)',
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>

        {/* Toast */}
        {toast && (
          <div style={{
            position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)', zIndex: 60,
            padding: '10px 20px', borderRadius: 12, fontSize: 13, fontWeight: 600, color: '#fff',
            background: toast.ok ? '#10b981' : '#ef4444',
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          }}>{toast.ok ? '✓' : '✗'} {toast.msg}</div>
        )}

        {/* Bottom sheet form */}
        {showCreateForm && (
          <div onClick={() => setShowCreateForm(false)} style={{
            position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(13,26,42,0.55)',
            display: 'flex', alignItems: 'flex-end',
          }}>
            <div onClick={e => e.stopPropagation()} style={{
              width: '100%', background: '#fff', borderRadius: '20px 20px 0 0',
              maxHeight: '92vh', overflowY: 'auto',
              boxShadow: '0 -8px 40px rgba(0,0,0,0.25)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #f3f4f6', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#111827' }}>Yeni Görev</div>
                <button onClick={() => setShowCreateForm(false)} style={{ width: 32, height: 32, borderRadius: 9, border: 'none', background: '#f1f5f9', color: '#64748b', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
              </div>
              <form onSubmit={handleCreateSubmit} style={{ padding: '16px 20px 32px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Başlık *</label>
                  <input type="text" value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="Görev başlığı" required className="input" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Öncelik</label>
                    <select value={formPriority} onChange={e => setFormPriority(e.target.value as TaskPriority)} className="input">
                      {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Durum</label>
                    <select value={formStatus} onChange={e => setFormStatus(e.target.value as TaskStatus)} className="input">
                      {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Tür</label>
                  <select value={formType} onChange={e => setFormType(e.target.value as TaskType)} className="input">
                    {TASK_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Son Tarih</label>
                  <input type="date" value={formDueDate} onChange={e => setFormDueDate(e.target.value)} className="input" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Atanan Üye</label>
                  <select value={formAssignee} onChange={e => setFormAssignee(e.target.value)} className="input">
                    <option value="">-- Seçilmedi --</option>
                    {members.map(m => <option key={m.id} value={m.id}>{m.full_name || m.id}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Sprint</label>
                  <select value={formSprintId} onChange={e => setFormSprintId(e.target.value)} className="input">
                    <option value="">-- Sprint'e atama yok --</option>
                    {sprints.map(s => <option key={s.id} value={s.id}>{s.is_active ? '● ' : ''}{s.name}</option>)}
                  </select>
                </div>
                {formError && <div style={{ fontSize: 12, borderRadius: 10, padding: '10px 14px', background: '#fee2e2', color: '#dc2626' }}>{formError}</div>}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button type="button" onClick={() => setShowCreateForm(false)} className="btn-secondary" style={{ flex: 1 }}>İptal</button>
                  <button type="submit" disabled={formLoading} className="btn-primary" style={{ flex: 1 }}>
                    {formLoading ? 'Oluşturuluyor...' : 'Oluştur'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── MASAÜSTÜ LAYOUT ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen" style={{ background: '#f5f7fa' }}>

      <main className="w-full px-6 py-5">

        {/* ── Header ─────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-4 gap-4">
          <h1 className="text-xl font-bold" style={{ color: '#111827', letterSpacing: '-0.02em' }}>Kanban</h1>
          <div className="flex items-center gap-2 shrink-0">
            {currentRole === 'admin' && (
              <Link
                href={`/org/${org?.slug}/sprints`}
                className="text-sm font-medium px-3.5 py-2 rounded-xl transition-colors"
                style={{ background: '#fff', color: '#374151', border: '1px solid #e5e7eb' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#2288c9'; e.currentTarget.style.color = '#2288c9' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.color = '#374151' }}
              >
                Sprint Yönetimi
              </Link>
            )}
            {/* PRD: görev oluşturma merkezi bir yetki. RLS de (is_org_admin)
                aynı kuralı uyguluyor — buton yalnızca gerçekten yetkisi
                olanlara gösteriliyor. */}
            {yazabilirMi(orgRole) && (
              <button
                onClick={openCreateForm}
                className="text-sm font-medium px-4 py-2 rounded-xl transition-colors"
                style={{ background: '#2288c9', color: '#fff' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#1d78b8' }}
                onMouseLeave={e => { e.currentTarget.style.background = '#2288c9' }}
              >
                + Görev Oluştur
              </button>
            )}
          </div>
        </div>

        {/* ── Active Sprint Banner ─────────────────────────── */}
        {activeSprint ? (
          <div
            className="flex items-center gap-6 mb-4 px-5 py-3.5 rounded-xl"
            style={{ background: '#111827' }}
          >
            <div className="flex-1 min-w-0">
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#60a5fa' }}>
                Aktif Sprint
              </span>
              <p className="truncate mt-0.5" style={{ fontSize: 14, fontWeight: 600, color: '#f9fafb' }}>
                {activeSprint.name}
              </p>
            </div>
            <span style={{ fontSize: 12, color: '#9ca3af', whiteSpace: 'nowrap' }}>
              {new Date(activeSprint.start_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
              {' – '}
              {new Date(activeSprint.end_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
            </span>
            {sprintTotal > 0 ? (
              <div className="flex items-center gap-2.5 shrink-0">
                <div className="rounded-full overflow-hidden" style={{ height: 4, width: 110, background: '#374151' }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${sprintProgress}%`, background: sprintProgress === 100 ? '#10b981' : '#2288c9' }}
                  />
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#e5e7eb' }}>{sprintProgress}%</span>
                <span style={{ fontSize: 12, color: '#6b7280' }}>{sprintDone}/{sprintTotal}</span>
              </div>
            ) : (
              <span style={{ fontSize: 12, color: '#4b5563' }}>Henüz görev yok</span>
            )}
          </div>
        ) : (
          <div className="mb-4 px-4 py-2.5 rounded-xl" style={{ background: '#1e293b' }}>
            <p className="text-xs" style={{ color: '#64748b' }}>
              Aktif sprint yok
              {currentRole === 'admin' && (
                <> — <Link href={`/org/${org?.slug}/sprints`} style={{ color: '#60a5fa' }}>Sprint oluştur →</Link></>
              )}
            </p>
          </div>
        )}

        {/* ── Filter bar ─────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <select
            value={filterSprint}
            onChange={(e) => setFilterSprint(e.target.value)}
            className="text-xs font-medium px-3 py-1.5 rounded-xl appearance-none cursor-pointer"
            style={{ background: '#fff', border: '1px solid #e5e7eb', color: '#374151', outline: 'none', maxWidth: 200 }}
          >
            <option value="all">Tüm Görevler</option>
            {sprints.map((s) => (
              <option key={s.id} value={s.id}>
                {s.is_active ? '● ' : ''}{s.name}
                {' ('}
                {new Date(s.start_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                {' – '}
                {new Date(s.end_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                {')'}
              </option>
            ))}
          </select>

          {currentRole === 'admin' && (
            <select
              value={filterMember}
              onChange={(e) => setFilterMember(e.target.value)}
              className="text-xs font-medium px-3 py-1.5 rounded-xl appearance-none cursor-pointer"
              style={{ background: '#fff', border: '1px solid #e5e7eb', color: '#374151', outline: 'none', maxWidth: 160 }}
            >
              <option value="all">Tüm Üyeler</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.full_name || m.id}</option>
              ))}
            </select>
          )}

          <button
            onClick={() => setFilterOverdue(!filterOverdue)}
            className="text-xs px-3 py-1.5 rounded-xl font-medium transition-all duration-150"
            style={
              filterOverdue
                ? { background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca' }
                : { background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0' }
            }
          >
            {filterOverdue ? '⚠ Sadece Gecikmiş' : 'Tüm Durumlar'}
          </button>

          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Görev ara..."
            className="text-xs font-medium px-3 py-1.5 rounded-xl w-44"
            style={{ background: '#fff', border: '1px solid #e5e7eb', color: '#374151', outline: 'none' }}
          />

          {(filterSprint !== 'all' || filterMember !== 'all' || filterOverdue || searchQuery) && (
            <button
              onClick={() => { setFilterSprint('all'); setFilterMember('all'); setFilterOverdue(false); setSearchQuery('') }}
              className="text-xs px-3 py-1.5 rounded-xl font-medium transition-all"
              style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca' }}
            >
              Temizle ×
            </button>
          )}

          {/* Task count info */}
          <div className="ml-auto text-xs font-medium" style={{ color: '#94a3b8' }}>
            {filteredTasks.length} görev
          </div>
        </div>

        {/* ── Board ──────────────────────────────────────── */}
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:items-start">

            {COLUMNS.map((col) => {
              const colTasks = tasksForColumn(col.status)
              return (
                <div key={col.status} className="flex flex-col min-w-0">
                  {/* Column header with colored top border */}
                  <div
                    className="rounded-xl mb-2 overflow-hidden"
                    style={{
                      border: `1px solid ${col.topColor}22`,
                      background: '#fff',
                      boxShadow: '0 1px 4px rgba(13,26,42,0.05)',
                    }}
                  >
                    {/* Colored top strip */}
                    <div
                      className="h-1 w-full"
                      style={{ background: `linear-gradient(90deg, ${col.topColor}, ${col.topColor}88)` }}
                    />
                    <div className="flex items-center justify-between px-3 py-2.5">
                      <span className="text-sm font-bold" style={{ color: col.color }}>{col.label}</span>
                      <span
                        className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{
                          background: `${col.topColor}16`,
                          color: col.color,
                          border: `1px solid ${col.topColor}25`,
                        }}
                      >
                        {colTasks.length}
                      </span>
                    </div>
                  </div>

                  {/* Droppable area */}
                  <Droppable droppableId={col.status}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className="flex flex-col gap-2 min-h-[120px] p-1 rounded-xl transition-all duration-150"
                        style={{
                          background: snapshot.isDraggingOver ? `${col.topColor}08` : 'transparent',
                          border: snapshot.isDraggingOver
                            ? `2px dashed ${col.topColor}50`
                            : '2px dashed transparent',
                        }}
                      >
                        {colTasks.length === 0 && !snapshot.isDraggingOver && (
                          <div className="flex items-center justify-center py-10">
                            <p className="text-xs" style={{ color: '#d1d5db' }}>Görev yok</p>
                          </div>
                        )}

                        {colTasks.map((task, index) => (
                          <TaskCard
                            key={task.id}
                            task={task}
                            index={index}
                            onOpen={() => openPanel(task)}
                            onStatusChange={handleMobileStatusChange}
                          />
                        ))}

                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              )
            })}
          </div>
        </DragDropContext>
      </main>

      {/* ── Toast ────────────────────────────────────────── */}
      {toast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl text-sm font-semibold shadow-2xl"
          style={{
            background: toast.ok ? '#0d1a2a' : '#dc2626',
            color: '#fff',
            border: `1px solid ${toast.ok ? 'rgba(122,207,230,0.25)' : 'rgba(255,255,255,0.15)'}`,
            backdropFilter: 'blur(8px)',
          }}
        >
          {toast.ok ? '✓ ' : '✕ '}{toast.msg}
        </div>
      )}

      {/* ── Slide-over detail panel ───────────────────────── */}
      {selectedTask && (
        <>
          <div
            className="fixed inset-0 z-40 transition-opacity duration-200"
            style={{ background: 'rgba(13,26,42,0.4)', backdropFilter: 'blur(2px)' }}
            onClick={closePanel}
          />
          <div
            className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-sm overflow-y-auto shadow-2xl"
            style={{ background: '#fff', borderLeft: '1px solid #e8f0f5' }}
          >
            {/* Panel header */}
            <div
              className="sticky top-0 px-5 py-4 flex items-start justify-between"
              style={{
                background: '#fff',
                borderBottom: '1px solid #f3f4f6',
              }}
            >
              <div className="flex-1 min-w-0 pr-3">
                <h3 className="font-bold text-base leading-snug" style={{ color: '#111827' }}>
                  {selectedTask.title}
                </h3>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <StatusBadge status={selectedTask.status} />
                  {selectedTask.priority && (
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-semibold"
                      style={{
                        background: PRIORITY_META[selectedTask.priority].bg,
                        color: PRIORITY_META[selectedTask.priority].color,
                        border: `1px solid ${PRIORITY_META[selectedTask.priority].border}`,
                      }}
                    >
                      {PRIORITY_META[selectedTask.priority].icon} {PRIORITY_META[selectedTask.priority].label}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={closePanel}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-lg transition-all"
                style={{ color: '#94a3b8', background: '#f8fafc' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#0d1a2a'; e.currentTarget.style.background = '#f1f5f9' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.background = '#f8fafc' }}
              >
                ×
              </button>
            </div>

            {/* Panel body */}
            <div className="p-5 space-y-5">
              {selectedTask.description && (
                <div>
                  <p className="section-title mb-1.5">Açıklama</p>
                  <p className="text-sm leading-relaxed" style={{ color: '#374151' }}>{selectedTask.description}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                {selectedTask.task_type && (
                  <div>
                    <p className="section-title mb-1">Tür</p>
                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd' }}>
                      {TASK_TYPE_LABELS[selectedTask.task_type]}
                    </span>
                  </div>
                )}
                {selectedTask.due_date && (
                  <div>
                    <p className="section-title mb-1">Son Tarih</p>
                    <span
                      className="text-xs font-semibold"
                      style={{ color: isOverdue(selectedTask.due_date) && selectedTask.status !== 'done' ? '#dc2626' : '#374151' }}
                    >
                      {new Date(selectedTask.due_date).toLocaleDateString('tr-TR')}
                      {isOverdue(selectedTask.due_date) && selectedTask.status !== 'done' && ' ⚠'}
                    </span>
                  </div>
                )}
                {(selectedTask.estimated_hours != null || selectedTask.actual_hours != null) && (
                  <div>
                    <p className="section-title mb-1">Süre</p>
                    <span className="text-xs font-semibold" style={{ color: '#374151' }}>
                      {selectedTask.actual_hours ?? '–'}s / {selectedTask.estimated_hours ?? '–'}s
                    </span>
                  </div>
                )}
              </div>

              <hr style={{ borderColor: '#f1f5f9' }} />

              {/* Quick edit */}
              <div>
                <p className="section-title mb-3">Hızlı Güncelleme</p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: '#374151' }}>Durum</label>
                    <select value={panelStatus} onChange={(e) => setPanelStatus(e.target.value as TaskStatus)} className="input">
                      {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: '#374151' }}>Atanan Üye</label>
                    <select value={panelAssignee} onChange={(e) => setPanelAssignee(e.target.value)} className="input">
                      <option value="">-- Seçilmedi --</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>{m.full_name || m.id}</option>
                      ))}
                    </select>
                  </div>

                  <button
                    onClick={savePanelChanges}
                    disabled={panelSaving}
                    className="btn-primary w-full disabled:opacity-50"
                  >
                    {panelSaving ? 'Kaydediliyor...' : 'Kaydet'}
                  </button>
                </div>
              </div>

              <Link
                href={`/org/${org?.slug}/tasks/${selectedTask.id}`}
                className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all"
                style={{
                  background: '#f8fafc',
                  color: '#2288c9',
                  border: '1px solid #e2e8f0',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#e0f2fe'
                  e.currentTarget.style.borderColor = '#bae6fd'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#f8fafc'
                  e.currentTarget.style.borderColor = '#e2e8f0'
                }}
              >
                Tam Detay →
              </Link>
            </div>
          </div>
        </>
      )}

      {/* ── Create Task Modal ─────────────────────────────── */}
      {showCreateForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(13,26,42,0.55)', backdropFilter: 'blur(4px)' }}
          onClick={() => setShowCreateForm(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl overflow-hidden"
            style={{
              background: '#fff',
              boxShadow: '0 32px 80px rgba(13,26,42,0.3), 0 8px 24px rgba(13,26,42,0.15)',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="px-6 py-4 flex items-center justify-between"
              style={{
                borderBottom: '1px solid #f1f5f9',
                background: 'linear-gradient(135deg, #f8fafc, #fff)',
              }}
            >
              <div>
                <h2 className="text-base font-bold" style={{ color: '#111827' }}>Yeni Görev Oluştur</h2>
                <p className="text-xs mt-0.5" style={{ color: '#94a3b8' }}>Görevi tanımla ve ekibe ata</p>
              </div>
              <button
                onClick={() => setShowCreateForm(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-lg transition-all"
                style={{ background: '#f1f5f9', color: '#64748b' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.color = '#dc2626' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#64748b' }}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-6 space-y-4">
              {formError && (
                <div className="text-xs rounded-xl px-4 py-3" style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca' }}>
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: '#374151' }}>Başlık *</label>
                <input type="text" value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="Görev başlığı" className="input" required autoFocus />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: '#374151' }}>Açıklama</label>
                <textarea value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="Görev detayları..." className="input resize-none" rows={3} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: '#374151' }}>Öncelik</label>
                  <select value={formPriority} onChange={(e) => setFormPriority(e.target.value as TaskPriority)} className="input">
                    {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: '#374151' }}>Tür</label>
                  <select value={formType} onChange={(e) => setFormType(e.target.value as TaskType)} className="input">
                    {TASK_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: '#374151' }}>Durum</label>
                  <select value={formStatus} onChange={(e) => setFormStatus(e.target.value as TaskStatus)} className="input">
                    {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: '#374151' }}>Son Tarih</label>
                  <input type="date" value={formDueDate} onChange={(e) => setFormDueDate(e.target.value)} className="input" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: '#374151' }}>Atanan Üye</label>
                <select value={formAssignee} onChange={(e) => setFormAssignee(e.target.value)} className="input">
                  <option value="">-- Seçilmedi --</option>
                  {members.map((m) => <option key={m.id} value={m.id}>{m.full_name || m.id}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: '#374151' }}>Sprint <span style={{ color: '#94a3b8', fontWeight: 400 }}>(opsiyonel)</span></label>
                <select value={formSprintId} onChange={(e) => setFormSprintId(e.target.value)} className="input">
                  <option value="">-- Sprint'e atama yok --</option>
                  {sprints.map((s) => <option key={s.id} value={s.id}>{s.is_active ? '● ' : ''}{s.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: '#374151' }}>Tahmini Süre (saat)</label>
                <input type="number" min="0" step="0.5" value={formEstimatedHours} onChange={(e) => setFormEstimatedHours(e.target.value)} placeholder="ör. 4.5" className="input" />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowCreateForm(false)} className="btn-secondary flex-1">İptal</button>
                <button type="submit" disabled={formLoading} className="btn-primary flex-1 disabled:opacity-50">
                  {formLoading ? 'Oluşturuluyor...' : 'Oluştur'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── TaskCard sub-component ─────────────────────────────────── */

interface TaskCardProps {
  task: TaskWithMeta
  index: number
  onOpen: () => void
  onStatusChange: (taskId: string, status: TaskStatus) => void
}

function TaskCard({ task, index, onOpen, onStatusChange }: TaskCardProps) {
  const [showMobileMenu, setShowMobileMenu] = useState(false)
  const overdue = isOverdue(task.due_date) && task.status !== 'done'
  const pMeta = task.priority ? PRIORITY_META[task.priority] : null

  // Assignee initials
  const assigneeInitials = task.assigneeName
    ? task.assigneeName.trim().split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
    : null

  return (
    <Draggable draggableId={task.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={() => !showMobileMenu && onOpen()}
          className="rounded-2xl cursor-pointer select-none transition-all duration-200"
          style={{
            background: '#fff',
            border: overdue || task.status === 'blocked'
              ? '1px solid #fecaca'
              : '1px solid #e5e7eb',
            borderLeft: overdue ? '3px solid #ef4444' : undefined,
            boxShadow: snapshot.isDragging
              ? '0 16px 40px rgba(0,0,0,0.15), 0 4px 12px rgba(0,0,0,0.08)'
              : '0 1px 3px rgba(0,0,0,0.05)',
            transform: snapshot.isDragging ? 'rotate(1.5deg) scale(1.02)' : 'none',
            ...provided.draggableProps.style,
          }}
          onMouseEnter={(e) => {
            if (!snapshot.isDragging) {
              e.currentTarget.style.transform = 'translateY(-1px)'
              e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'
              e.currentTarget.style.borderColor = overdue ? '#fecaca' : '#d1d5db'
            }
          }}
          onMouseLeave={(e) => {
            if (!snapshot.isDragging) {
              e.currentTarget.style.transform = 'none'
              e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)'
              e.currentTarget.style.borderColor = overdue ? '#fecaca' : '#e5e7eb'
            }
          }}
        >
          <div className="p-3.5">
            {/* Top row: badges */}
            <div className="flex items-start justify-between gap-1 mb-2">
              <div className="flex items-center gap-1 flex-wrap min-w-0">
                {overdue && (
                  <span
                    className="text-xs px-1.5 py-0.5 rounded font-bold shrink-0"
                    style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca' }}
                  >
                    ⚠ Gecikti
                  </span>
                )}
                {task.status === 'blocked' && (
                  <span
                    className="text-xs px-1.5 py-0.5 rounded font-bold shrink-0"
                    style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca' }}
                  >
                    Bloke
                  </span>
                )}
              </div>
              {pMeta && (
                <span
                  className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-semibold shrink-0"
                  style={{ background: pMeta.bg, color: pMeta.color }}
                >
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: pMeta.color }} />
                  {pMeta.label}
                </span>
              )}
            </div>

            {/* Title */}
            <p className="text-[13px] font-semibold leading-snug mb-2 line-clamp-2" style={{ color: '#111827' }}>
              {task.title}
            </p>

            {/* Type badge */}
            {task.task_type && (
              <div className="mb-2.5">
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{
                    background: '#e0f2fe',
                    color: '#0369a1',
                    border: '1px solid #bae6fd',
                  }}
                >
                  {TASK_TYPE_LABELS[task.task_type]}
                </span>
              </div>
            )}

            {/* Bottom row: assignee avatar + due date + mobile menu */}
            <div className="flex items-center justify-between gap-2 mt-1">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {/* Assignee avatar */}
                {assigneeInitials && (
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center text-white font-bold shrink-0"
                    style={{
                      fontSize: 8,
                      background: 'linear-gradient(135deg, #2abbd5, #2288c9)',
                    }}
                    title={task.assigneeName}
                  >
                    {assigneeInitials}
                  </div>
                )}
                {task.assigneeName && (
                  <span className="text-xs truncate font-medium" style={{ color: '#64748b' }}>
                    {task.assigneeName.split(' ')[0]}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {/* Due date */}
                {task.due_date && (
                  <span
                    className="text-xs font-medium flex items-center gap-1"
                    style={{ color: overdue ? '#dc2626' : '#94a3b8' }}
                  >
                    <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M11 6.5a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5v-1zM2 3a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v11a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3zm9-1H5v1h6V2zm1 0v1a1 1 0 0 0 1-1h-1zm-9 0H2a1 1 0 0 0 1 1V2z"/>
                    </svg>
                    {new Date(task.due_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                  </span>
                )}

                {/* Mobile quick-status button */}
                <div className="relative">
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowMobileMenu(!showMobileMenu) }}
                    className="w-6 h-6 flex items-center justify-center rounded-lg transition-all text-xs"
                    style={{ color: '#94a3b8', background: '#f8fafc', border: '1px solid #e2e8f0' }}
                    title="Durumu değiştir"
                  >
                    ⋯
                  </button>
                  {showMobileMenu && (
                    <div
                      className="absolute right-0 bottom-8 z-20 w-36 rounded-xl shadow-xl overflow-hidden"
                      style={{
                        background: '#fff',
                        border: '1px solid #e8f0f5',
                        boxShadow: '0 16px 40px rgba(13,26,42,0.15)',
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {STATUS_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          className="w-full text-left px-3 py-2 text-xs font-medium transition-colors"
                          style={{
                            color: task.status === opt.value ? '#2288c9' : '#374151',
                            fontWeight: task.status === opt.value ? 700 : 500,
                            background: task.status === opt.value ? '#e0f2fe' : 'transparent',
                          }}
                          onMouseEnter={(e) => { if (task.status !== opt.value) e.currentTarget.style.background = '#f8fafc' }}
                          onMouseLeave={(e) => { if (task.status !== opt.value) e.currentTarget.style.background = 'transparent' }}
                          onClick={() => { onStatusChange(task.id, opt.value); setShowMobileMenu(false) }}
                        >
                          {task.status === opt.value ? '✓ ' : ''}{opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </Draggable>
  )
}
