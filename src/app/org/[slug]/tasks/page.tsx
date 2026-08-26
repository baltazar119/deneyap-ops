'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback, useRef } from 'react'
import { TASK_TYPES, TASK_TYPE_FALLBACK } from '@/lib/taskTypes'
import { IL_SECENEKLERI } from '@/lib/iller'
import { raporGorebilirMi, yazabilirMi } from '@/lib/roller'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { createNotification } from '@/lib/notifications'
import { useOrg } from '@/lib/supabase/orgContext'
import { useIsMobile } from '@/lib/useIsMobile'
import StatusBadge from '@/components/StatusBadge'
import { isOverdue } from '@/lib/utils'
import { getCachedData, setCachedData } from '@/lib/pageDataCache'
import type { Task, Profile, TaskStatus, TaskPriority, TaskType, Sprint } from '@/types/database'

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'backlog',  label: 'Beklemede' },
  { value: 'doing',   label: 'Yapılıyor' },
  { value: 'testing', label: 'Test' },
  { value: 'blocked', label: 'Bloke' },
  { value: 'done',    label: 'Tamamlandı' },
]

const PRIORITY_OPTIONS: { value: TaskPriority; label: string; color: string; bg: string; icon: string }[] = [
  { value: 'critical', label: 'Kritik',  color: '#dc2626', bg: '#fee2e2', icon: '🔴' },
  { value: 'high',     label: 'Yüksek',  color: '#d97706', bg: '#fef3c7', icon: '🟡' },
  { value: 'normal',   label: 'Normal',  color: '#2288c9', bg: '#bee5f0', icon: '🔵' },
  { value: 'low',      label: 'Düşük',   color: '#6b7280', bg: '#f3f4f6', icon: '⚪' },
]


function getPriorityMeta(priority: TaskPriority) {
  return PRIORITY_OPTIONS.find(p => p.value === priority) || PRIORITY_OPTIONS[2]
}

function getTypeMeta(type: TaskType) {
  return TASK_TYPES.find(t => t.value === type) || TASK_TYPE_FALLBACK
}

interface TaskWithAssignee extends Task {
  assigneeName?: string
}

type TasksPageCache = { tasks: TaskWithAssignee[]; members: Profile[]; sprints: Sprint[] }

export default function TasksPage() {
  const router = useRouter()
  const { org, orgRole, userIl, userId, userEmail: orgEmail, avatarUrl: orgAvatarUrl, isAdmin, loading: orgLoading } = useOrg()
  const isMobile = useIsMobile()

  // Senkron cache init
  const _initKey   = org?.id ? `tasks:${org.id}` : ''
  const _initCache = _initKey ? getCachedData<TasksPageCache>(_initKey) : null

  const [currentUserId, setCurrentUserId] = useState<string | null>(userId ?? null)
  const [, setUserEmail] = useState(orgEmail ?? '')
  const [, setUserAvatarUrl] = useState<string | null>(orgAvatarUrl ?? null)
  const [tasks, setTasks] = useState<TaskWithAssignee[]>(_initCache?.tasks ?? [])
  const [members, setMembers] = useState<Profile[]>(_initCache?.members ?? [])
  const [loading, setLoading] = useState(_initCache === null)

  // Filters
  const [filterStatus, setFilterStatus] = useState<TaskStatus | 'all'>('all')
  const [filterPriority, setFilterPriority] = useState<TaskPriority | 'all'>('all')
  const [filterType, setFilterType] = useState<TaskType | 'all'>('all')
  const [filterIl, setFilterIl] = useState<string>('all')
  const [filterAssignee, setFilterAssignee] = useState<string>('all')

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [formTitle, setFormTitle] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formStatus, setFormStatus] = useState<TaskStatus>('backlog')
  const [formPriority, setFormPriority] = useState<TaskPriority>('normal')
  const [formType, setFormType] = useState<TaskType>('other')
  const [formAssignee, setFormAssignee] = useState<string>('')
  const [formStartDate, setFormStartDate] = useState('')
  const [formDueDate, setFormDueDate] = useState('')
  const [formEstimatedHours, setFormEstimatedHours] = useState<string>('')
  const [formActualHours, setFormActualHours] = useState<string>('')
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [sprints, setSprints] = useState<Sprint[]>(_initCache?.sprints ?? [])
  const [formSprintId, setFormSprintId] = useState<string>('')
  const [formIl, setFormIl] = useState<string>('')
  const [formFiles, setFormFiles] = useState<File[]>([])
  const [uploadingFiles, setUploadingFiles] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadTasks = useCallback(async () => {
    if (!org) return
    const { data: tasksData } = await supabase
      .from('tasks')
      .select('*')
      .eq('organization_id', org.id)
      .order('created_at', { ascending: false })

    const enriched: TaskWithAssignee[] = (tasksData || []).map((t: Task) => ({
      ...t,
      assigneeName: members.find((p) => p.id === t.assignee_id)?.full_name || undefined,
    }))
    setTasks(enriched)
    return enriched
  }, [org, members])

  useEffect(() => {
    if (orgLoading) return
    if (!org || !userId) return

    // Yetkili Yönetici (viewer) listeyi salt okunur görebilir; yazma
    // aksiyonları aşağıda yazabilirMi() ile gizleniyor, RLS de engelliyor.
    if (!raporGorebilirMi(orgRole)) {
      router.replace(orgRole === 'consultant' ? `/org/${org.slug}/consultant` : `/org/${org.slug}/me`)
      return
    }

    setCurrentUserId(userId)
    setUserEmail(orgEmail ?? '')
    setUserAvatarUrl(orgAvatarUrl ?? null)

    const cacheKey = `tasks:${org.id}`
    const alreadyLoaded = tasks.length > 0 || members.length > 0

    async function init(background = false) {
      try {
        // Adım 1: Üye ID'leri ve sprint'ler paralel
        const [membershipsRes, sprintsRes] = await Promise.all([
          supabase.from('organization_members').select('user_id').eq('organization_id', org!.id),
          supabase.from('sprints').select('*').eq('organization_id', org!.id).order('start_date', { ascending: false }),
        ])
        const memberIds = membershipsRes.data?.map(m => m.user_id) ?? []

        // Adım 2: Profiller ve görevler paralel
        const [profilesRes, tasksData] = await Promise.all([
          supabase.from('profiles').select('*').in('id', memberIds).order('created_at'),
          supabase.from('tasks').select('*').eq('organization_id', org!.id).order('created_at', { ascending: false }),
        ])

        const profilesList: Profile[] = profilesRes.data || []
        const enriched: TaskWithAssignee[] = (tasksData.data || []).map((t: Task) => ({
          ...t,
          assigneeName: profilesList.find(p => p.id === t.assignee_id)?.full_name || undefined,
        }))
        const sprintsList: Sprint[] = sprintsRes.data || []

        setMembers(profilesList)
        setSprints(sprintsList)
        setTasks(enriched)
        setCachedData<TasksPageCache>(cacheKey, { tasks: enriched, members: profilesList, sprints: sprintsList })
      } catch (err) {
        console.error('[Tasks] init error:', err)
      } finally {
        if (!background) setLoading(false)
      }
    }
    init(alreadyLoaded)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgLoading, org?.id, userId, orgRole])

  function openCreateForm() {
    setEditingTask(null)
    setFormTitle('')
    setFormDescription('')
    setFormStatus('backlog')
    setFormPriority('normal')
    setFormType('other')
    setFormAssignee('')
    setFormStartDate('')
    setFormDueDate('')
    setFormEstimatedHours('')
    setFormActualHours('')
    setFormSprintId('')
    setFormIl('')
    setFormFiles([])
    setFormError(null)
    setShowForm(true)
  }

  function openEditForm(task: Task) {
    setEditingTask(task)
    setFormTitle(task.title)
    setFormDescription(task.description || '')
    setFormStatus(task.status)
    setFormPriority(task.priority || 'normal')
    setFormType(task.task_type || 'other')
    setFormAssignee(task.assignee_id || '')
    setFormStartDate(task.start_date || '')
    setFormDueDate(task.due_date || '')
    setFormEstimatedHours(task.estimated_hours != null ? String(task.estimated_hours) : '')
    setFormActualHours(task.actual_hours != null ? String(task.actual_hours) : '')
    setFormSprintId(task.sprint_id || '')
    setFormIl(task.il || '')
    setFormFiles([])
    setFormError(null)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingTask(null)
    setFormFiles([])
  }

  async function uploadTaskFiles(files: File[], taskId: string) {
    setUploadingFiles(true)
    for (const f of files) {
      try {
        const sr = await fetch('/api/drive/upload-session', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: f.name, mimeType: f.type || 'application/octet-stream', orgId: org?.id ?? '' }),
        })
        const sd = await sr.json().catch(() => ({}))
        if (!sr.ok || !sd.uploadUri) { setFormError(`"${f.name}" yüklenemedi: ${sd.error || 'Oturum hatası'}`); continue }
        const CHUNK = 3 * 1024 * 1024
        const mime = f.type || 'application/octet-stream'
        const proxyBase = `/api/drive/upload-proxy?uploadUri=${encodeURIComponent(sd.uploadUri)}`
        let offset = 0; let df: Record<string, unknown> = {}
        while (offset < f.size) {
          const end = Math.min(offset + CHUNK, f.size)
          const pr = await fetch(proxyBase, { method: 'POST', headers: { 'Content-Type': mime, 'X-Content-Range': `bytes ${offset}-${end - 1}/${f.size}` }, body: f.slice(offset, end) })
          if (!pr.ok) { setFormError(`"${f.name}" yüklenemedi: Drive hatası (${pr.status}).`); break }
          const res = await pr.json().catch(() => ({}))
          if (res.partial) { offset = res.nextByte ?? end } else { df = res; break }
        }
        if (!df.id) { setFormError(`"${f.name}" yüklenemedi: Dosya ID alınamadı.`); continue }
        const cr = await fetch('/api/drive/upload-complete', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            driveFileId: df.id, driveWebViewLink: (df.webViewLink as string) ?? null,
            fileName: (df.name as string) || f.name, fileSize: df.size ? Number(df.size) : f.size,
            mimeType: (df.mimeType as string) || f.type, orgId: org!.id,
            taskId, userId: currentUserId ?? '',
          }),
        })
        const cd = await cr.json().catch(() => ({}))
        if (!cr.ok || cd.error) setFormError(`"${f.name}" yüklenemedi: ${cd.error || 'Kayıt hatası'}`)
      } catch { setFormError(`"${f.name}" yüklenemedi: Bağlantı hatası.`) }
    }
    setUploadingFiles(false)
  }

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!currentUserId) return
    setFormLoading(true)
    setFormError(null)

    const payload = {
      title: formTitle,
      description: formDescription || null,
      status: formStatus,
      priority: formPriority,
      task_type: formType,
      assignee_id: formAssignee || null,
      start_date: formStartDate || null,
      due_date: formDueDate || null,
      estimated_hours: formEstimatedHours ? parseFloat(formEstimatedHours) : null,
      actual_hours: formActualHours ? parseFloat(formActualHours) : null,
      sprint_id: formSprintId || null,
      il: formIl || null,
    }

    const actorName = members.find((m) => m.id === currentUserId)?.full_name ?? null

    if (editingTask) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('tasks').update(payload).eq('id', editingTask.id)
      if (error) { setFormError('Görev güncellenirken hata oluştu.'); setFormLoading(false); return }

      // Yeni atama bildirimi
      if (formAssignee && formAssignee !== currentUserId && formAssignee !== editingTask.assignee_id) {
        await createNotification({
          user_id: formAssignee, type: 'task', event_type: 'task_assigned',
          title: 'Görev Size Atandı',
          description: `"${formTitle}" görevi size atandı.`,
          actor_id: currentUserId!, actor_name: actorName,
          link: `/org/${org!.slug}/tasks/${editingTask.id}`,
          entity_key: `task:${editingTask.id}`,
          org_id: org?.id,
        })
      }
      // Durum değişikliği bildirimi
      if (formStatus !== editingTask.status && editingTask.assignee_id && editingTask.assignee_id !== currentUserId) {
        const statusLabel = STATUS_OPTIONS.find((s) => s.value === formStatus)?.label ?? formStatus
        await createNotification({
          user_id: editingTask.assignee_id, type: 'task', event_type: 'task_status_changed',
          title: 'Görev Durumu Değişti',
          description: `"${formTitle}" görevi "${statusLabel}" durumuna taşındı.`,
          actor_id: currentUserId!, actor_name: actorName,
          link: `/org/${org!.slug}/tasks/${editingTask.id}`,
          entity_key: `task:${editingTask.id}:status`,
          org_id: org?.id,
        })
      }

      if (formFiles.length > 0) await uploadTaskFiles(formFiles, editingTask.id)
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: newTask, error } = await (supabase as any).from('tasks').insert({ ...payload, created_by: currentUserId, organization_id: org!.id }).select('id').single()
      if (error) { setFormError('Görev oluşturulurken hata oluştu.'); setFormLoading(false); return }

      // Atama bildirimi
      if (formAssignee && formAssignee !== currentUserId && newTask?.id) {
        await createNotification({
          user_id: formAssignee, type: 'task', event_type: 'task_assigned',
          title: 'Yeni Görev Atandı',
          description: `"${formTitle}" görevi size atandı.`,
          actor_id: currentUserId!, actor_name: actorName,
          link: `/org/${org!.slug}/tasks/${newTask.id}`,
          entity_key: `task:${newTask.id}`,
          org_id: org?.id,
        })
      }

      if (formFiles.length > 0 && newTask?.id) await uploadTaskFiles(formFiles, newTask.id)
    }

    closeForm()
    await loadTasks()
    setFormLoading(false)
  }

  async function handleDelete(taskId: string) {
    if (!confirm('Bu görevi silmek istediğinize emin misiniz?')) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('tasks').delete().eq('id', taskId)
    await loadTasks()
  }

  // PRD madde 2: "yalnızca ilgili görevleri görür".
  // İl Sorumlusu (member) kendi iline ait görevleri ve kendisine atanan
  // görevleri görür. İl atanmamışsa yalnızca kendisine atananları görür.
  // Koordinatör / Merkez / Yetkili Yönetici tüm görevleri görür.
  const gorunurTasks = orgRole === 'member'
    ? tasks.filter(t => t.assignee_id === userId || (!!userIl && t.il === userIl))
    : tasks

  const kullanilanIller = Array.from(
    new Set(gorunurTasks.map(t => t.il).filter((il): il is string => !!il))
  ).sort((a, b) => a.localeCompare(b, 'tr'))

  const filteredTasks = gorunurTasks.filter((t) => {
    if (filterStatus !== 'all' && t.status !== filterStatus) return false
    if (filterPriority !== 'all' && t.priority !== filterPriority) return false
    if (filterType !== 'all' && t.task_type !== filterType) return false
    if (filterIl !== 'all' && (t.il ?? '') !== filterIl) return false
    if (filterAssignee !== 'all' && t.assignee_id !== filterAssignee) return false
    return true
  })

  if (loading) {
    return (
      <div className="min-h-screen px-6 py-5 space-y-4" style={{ background: '#f5f7fa' }}>
        <div className="skeleton h-8 w-48 rounded-xl" />
        <div className="flex gap-2">
          {[0,1,2,3].map(i => <div key={i} className="skeleton h-7 w-20 rounded-full" />)}
        </div>
        <div className="skeleton h-10 rounded-xl" />
        {[0,1,2,3,4].map(i => <div key={i} className="skeleton h-16 rounded-2xl" />)}
      </div>
    )
  }

  // ── MOBİL LAYOUT ─────────────────────────────────────────────────────────
  if (isMobile) {
    const statusTabs: { value: TaskStatus | 'all'; label: string; color: string }[] = [
      { value: 'all',      label: 'Tümü',       color: '#6b7280' },
      { value: 'backlog',  label: 'Beklemede',  color: '#94a3b8' },
      { value: 'doing',    label: 'Yapılıyor',  color: '#2288c9' },
      { value: 'testing',  label: 'Test',       color: '#f59e0b' },
      { value: 'blocked',  label: 'Bloke',      color: '#ef4444' },
      { value: 'done',     label: 'Tamam',      color: '#10b981' },
    ]

    return (
      <div style={{ minHeight: '100%', background: '#f0f4f8', paddingBottom: 80 }}>

        {/* Header */}
        <div style={{ background: '#fff', padding: '14px 16px 0', borderBottom: '1px solid #e5e7eb' }}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#111827', letterSpacing: '-0.02em' }}>Görevler</div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
              {filteredTasks.length} görev
              {filterStatus !== 'all' && ` · ${statusTabs.find(s => s.value === filterStatus)?.label}`}
            </div>
          </div>

          {/* Status sekmeleri */}
          <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 0, scrollbarWidth: 'none' }}>
            {statusTabs.map(tab => {
              const count = tab.value === 'all' ? tasks.length : tasks.filter(t => t.status === tab.value).length
              const active = filterStatus === tab.value
              return (
                <button key={tab.value} onClick={() => setFilterStatus(tab.value as TaskStatus | 'all')} style={{
                  flexShrink: 0, padding: '7px 12px', border: 'none', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
                  background: 'transparent',
                  color: active ? tab.color : '#9ca3af',
                  borderBottom: active ? `2.5px solid ${tab.color}` : '2.5px solid transparent',
                  transition: 'all 0.15s',
                }}>
                  {tab.label}
                  <span style={{
                    marginLeft: 5, fontSize: 10, fontWeight: 700,
                    padding: '1px 5px', borderRadius: 99,
                    background: active ? tab.color + '18' : '#f1f5f9',
                    color: active ? tab.color : '#9ca3af',
                  }}>{count}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Öncelik filtre chips */}
        <div style={{ display: 'flex', gap: 6, padding: '10px 16px', overflowX: 'auto', scrollbarWidth: 'none' }}>
          <button onClick={() => setFilterPriority('all')} style={{
            flexShrink: 0, padding: '5px 12px', borderRadius: 99, fontSize: 11, fontWeight: 600,
            border: '1px solid', cursor: 'pointer', fontFamily: 'inherit',
            background: filterPriority === 'all' ? '#111827' : '#fff',
            color: filterPriority === 'all' ? '#fff' : '#6b7280',
            borderColor: filterPriority === 'all' ? '#111827' : '#e5e7eb',
          }}>Tüm Öncelikler</button>
          {PRIORITY_OPTIONS.map(p => (
            <button key={p.value} onClick={() => setFilterPriority(filterPriority === p.value ? 'all' : p.value)} style={{
              flexShrink: 0, padding: '5px 12px', borderRadius: 99, fontSize: 11, fontWeight: 600,
              border: `1px solid`, cursor: 'pointer', fontFamily: 'inherit',
              background: filterPriority === p.value ? p.bg : '#fff',
              color: filterPriority === p.value ? p.color : '#6b7280',
              borderColor: filterPriority === p.value ? p.color : '#e5e7eb',
            }}>
              {p.label}
            </button>
          ))}
        </div>

        {/* Görev kartları */}
        <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filteredTasks.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
              <div style={{ fontSize: 14 }}>Görev bulunamadı</div>
            </div>
          ) : filteredTasks.map(task => {
            const pMeta = getPriorityMeta(task.priority || 'normal')
            const tMeta = getTypeMeta(task.task_type || 'other')
            const overdue = isOverdue(task.due_date) && task.status !== 'done'
            const statusColor: Record<string, string> = { backlog: '#94a3b8', doing: '#2288c9', testing: '#f59e0b', blocked: '#ef4444', done: '#10b981' }
            const statusLabel: Record<string, string> = { backlog: 'Beklemede', doing: 'Yapılıyor', testing: 'Test', blocked: 'Bloke', done: 'Tamam' }
            const sc = statusColor[task.status] ?? '#94a3b8'

            return (
              <div key={task.id} style={{
                background: '#fff', borderRadius: 14,
                border: '1px solid #e5e7eb',
                boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                overflow: 'hidden',
              }}>
                {/* Öncelik çizgisi */}
                <div style={{ height: 3, background: `linear-gradient(90deg, ${pMeta.color}, ${pMeta.color}66)` }} />
                <div style={{ padding: '12px 14px' }}>
                  {/* Başlık + edit */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                    <Link href={`/org/${org?.slug}/tasks/${task.id}`} style={{ fontSize: 14, fontWeight: 700, color: '#111827', textDecoration: 'none', flex: 1, lineHeight: 1.4 }}>
                      {task.title}
                    </Link>
                    {yazabilirMi(orgRole) && (
                      <button onClick={() => openEditForm(task)} style={{
                        flexShrink: 0, background: '#f1f5f9', border: 'none', borderRadius: 7,
                        padding: '4px 8px', fontSize: 11, fontWeight: 600, color: '#2288c9', cursor: 'pointer',
                      }}>Düzenle</button>
                    )}
                  </div>

                  {/* Badges */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: pMeta.bg, color: pMeta.color }}>{pMeta.label}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: '#f1f5f9', color: '#64748b' }}>{tMeta.label}</span>
                    {task.il && <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: '#f0fdfa', color: '#0f766e' }}>📍 {task.il}</span>}
                    {task.sprint_id && (() => { const sp = sprints.find(s => s.id === task.sprint_id); return sp ? <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: '#ede9fe', color: '#7c3aed' }}>{sp.name}</span> : null })()}
                  </div>

                  {/* Alt satır: kişi + tarih + durum */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 99, background: sc + '18', color: sc }}>
                      {statusLabel[task.status] ?? task.status}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* FAB — sabit alt sağ */}
        <button onClick={openCreateForm} style={{
          position: 'fixed', bottom: 24, right: 20, zIndex: 20,
          width: 52, height: 52, borderRadius: '50%', border: 'none',
          background: 'linear-gradient(135deg, #2288c9, #1d78b8)',
          color: '#fff', fontSize: 26, fontWeight: 300,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 6px 20px rgba(34,136,201,0.45)',
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>

        {/* Form Modal — bottom sheet */}
        {showForm && (
          <div onClick={closeForm} style={{
            position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(13,26,42,0.55)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          }}>
            <div onClick={e => e.stopPropagation()} style={{
              width: '100%', background: '#fff',
              borderRadius: '20px 20px 0 0',
              maxHeight: '92vh', overflowY: 'auto',
              boxShadow: '0 -8px 40px rgba(0,0,0,0.25)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #f3f4f6', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#111827' }}>
                  {editingTask ? 'Görevi Düzenle' : 'Yeni Görev'}
                </div>
                <button onClick={closeForm} style={{ width: 32, height: 32, borderRadius: 9, border: 'none', background: '#f1f5f9', color: '#64748b', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
              </div>
              <form onSubmit={handleFormSubmit} style={{ padding: '16px 20px 32px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Başlık *</label>
                  <input type="text" value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="Görev başlığı" required className="input" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Açıklama</label>
                  <textarea value={formDescription} onChange={e => setFormDescription(e.target.value)} placeholder="Görev detayları..." className="input resize-y" rows={3} style={{ color: '#111827', minHeight: 80 }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Öncelik</label>
                    <select value={formPriority} onChange={e => setFormPriority(e.target.value as TaskPriority)} className="input">
                      {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.icon} {o.label}</option>)}
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Başlangıç</label>
                    <input type="date" value={formStartDate} onChange={e => setFormStartDate(e.target.value)} className="input" />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Son Tarih</label>
                    <input type="date" value={formDueDate} onChange={e => setFormDueDate(e.target.value)} className="input" />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Atanan Üye</label>
                  <select value={formAssignee} onChange={e => setFormAssignee(e.target.value)} className="input">
                    <option value="">-- Seçilmedi --</option>
                    {members.map(m => <option key={m.id} value={m.id}>{m.full_name || m.id}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>İl / Birim</label>
                  <select value={formIl} onChange={e => setFormIl(e.target.value)} className="input">
                    <option value="">-- İl atanmamış --</option>
                    {IL_SECENEKLERI.map(il => <option key={il} value={il}>{il}</option>)}
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
                  <button type="button" onClick={closeForm} className="btn-secondary" style={{ flex: 1 }}>İptal</button>
                  <button type="submit" disabled={formLoading || uploadingFiles} className="btn-primary" style={{ flex: 1 }}>
                    {uploadingFiles ? 'Yükleniyor...' : formLoading ? 'Kaydediliyor...' : editingTask ? 'Güncelle' : 'Oluştur'}
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

        {/* ── Başlık ── */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-bold" style={{ color: '#111827', letterSpacing: '-0.02em' }}>Görevler</h1>
            <p className="text-sm mt-0.5" style={{ color: '#9ca3af' }}>
              {tasks.length} görev
              {filteredTasks.length !== tasks.length && <span> · <span style={{ color: '#2288c9' }}>{filteredTasks.length} gösteriliyor</span></span>}
            </p>
          </div>
          {yazabilirMi(orgRole) && (
            <button
              onClick={openCreateForm}
              className="flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-xl transition-colors"
              style={{ background: '#2288c9', color: '#fff' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#1d78b8' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#2288c9' }}
            >
              + Görev Oluştur
            </button>
          )}
        </div>

        {/* ── Öncelik filtreleri ── */}
        <div className="flex items-center gap-2 flex-wrap mb-4">
          {PRIORITY_OPTIONS.map((p) => {
            const count = tasks.filter(t => t.priority === p.value && t.status !== 'done').length
            const active = filterPriority === p.value
            return (
              <button
                key={p.value}
                onClick={() => setFilterPriority(active ? 'all' : p.value)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
                style={{
                  background: active ? p.bg : '#fff',
                  color: active ? p.color : '#6b7280',
                  border: `1px solid ${active ? p.color : '#e5e7eb'}`,
                }}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
                {p.label}
                <span className="font-bold" style={{ color: active ? p.color : '#9ca3af' }}>{count}</span>
              </button>
            )
          })}
        </div>

        {/* ── Filtreler ── */}
        <div className="flex flex-wrap gap-2 mb-5">
          {[
            {
              value: filterStatus,
              onChange: (v: string) => setFilterStatus(v as TaskStatus | 'all'),
              options: [{ value: 'all', label: 'Tüm Durumlar' }, ...STATUS_OPTIONS],
            },
            {
              value: filterType,
              onChange: (v: string) => setFilterType(v as TaskType | 'all'),
              options: [{ value: 'all', label: 'Tüm Türler' }, ...TASK_TYPES],
            },
            {
              value: filterIl,
              onChange: (v: string) => setFilterIl(v),
              // Yalnızca görevlerde fiilen kullanılan iller listeleniyor —
              // 82 seçenekli bir filtre kullanışsız olurdu
              options: [
                { value: 'all', label: 'Tüm İller' },
                { value: '', label: 'İl atanmamış' },
                ...kullanilanIller.map(il => ({ value: il, label: il })),
              ],
            },
            {
              value: filterAssignee,
              onChange: (v: string) => setFilterAssignee(v),
              options: [{ value: 'all', label: 'Tüm Üyeler' }, { value: '', label: 'Atanmamış' }, ...members.map(m => ({ value: m.id, label: m.full_name || m.id }))],
            },
          ].map((sel, idx) => (
            <select
              key={idx}
              value={sel.value}
              onChange={e => sel.onChange(e.target.value)}
              className="text-xs font-medium px-3 py-1.5 rounded-xl appearance-none cursor-pointer"
              style={{ background: '#fff', border: '1px solid #e5e7eb', color: '#374151', outline: 'none' }}
            >
              {sel.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ))}
          {(filterStatus !== 'all' || filterPriority !== 'all' || filterType !== 'all' || filterIl !== 'all' || filterAssignee !== 'all') && (
            <button
              onClick={() => { setFilterStatus('all'); setFilterPriority('all'); setFilterType('all'); setFilterIl('all'); setFilterAssignee('all') }}
              className="text-xs px-3 py-1.5 rounded-xl font-medium"
              style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca' }}
            >
              Temizle ×
            </button>
          )}
        </div>

        {/* ── Görev listesi ── */}
        <div className="rounded-2xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e5e7eb' }}>
          {filteredTasks.length === 0 ? (
            <div className="px-5 py-16 text-center text-sm" style={{ color: '#9ca3af' }}>
              Görev bulunamadı.
            </div>
          ) : filteredTasks.map((task, i) => {
            const pMeta = getPriorityMeta(task.priority || 'normal')
            const tMeta = getTypeMeta(task.task_type || 'other')
            const overdue = isOverdue(task.due_date) && task.status !== 'done'

            return (
              <div
                key={task.id}
                className="flex items-center gap-3 px-5 py-3.5"
                style={{ borderBottom: i < filteredTasks.length - 1 ? '1px solid #f3f4f6' : 'none' }}
              >
                {/* Öncelik çizgisi */}
                <div className="w-0.5 self-stretch rounded-full shrink-0" style={{ background: pMeta.color, minHeight: 36 }} />

                {/* İçerik */}
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/org/${org?.slug}/tasks/${task.id}`}
                    className="text-[13px] font-semibold hover:underline truncate block"
                    style={{ color: '#111827' }}
                  >
                    {task.title}
                  </Link>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: pMeta.bg, color: pMeta.color }}>
                      {pMeta.label}
                    </span>
                    <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: '#f1f5f9', color: '#64748b' }}>
                      {tMeta.label}
                    </span>
                    {task.il && (
                      <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: '#f0fdfa', color: '#0f766e' }}>
                        📍 {task.il}
                      </span>
                    )}
                    {task.assigneeName && (
                      <span className="text-xs" style={{ color: '#9ca3af' }}>{task.assigneeName}</span>
                    )}
                    {task.due_date && (
                      <span className="text-xs font-medium" style={{ color: overdue ? '#dc2626' : '#9ca3af' }}>
                        {overdue && '⚠ '}{new Date(task.due_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                        {overdue && ' gecikmiş'}
                      </span>
                    )}
                    {task.sprint_id && (() => {
                      const sp = sprints.find(s => s.id === task.sprint_id)
                      return sp ? (
                        <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: '#ede9fe', color: '#7c3aed' }}>
                          {sp.name}
                        </span>
                      ) : null
                    })()}
                  </div>
                </div>

                {/* Sağ: durum + aksiyonlar */}
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={task.status} />
                  <button
                    onClick={() => openEditForm(task)}
                    className="text-xs px-2.5 py-1 rounded-lg font-medium"
                    style={{ color: '#2288c9', background: '#eff6ff', border: '1px solid #dbeafe', display: yazabilirMi(orgRole) ? undefined : 'none' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#dbeafe' }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#eff6ff' }}
                  >
                    Düzenle
                  </button>
                  <button
                    onClick={() => handleDelete(task.id)}
                    className="text-xs px-2.5 py-1 rounded-lg font-medium"
                    style={{ color: '#dc2626', background: '#fff1f1', border: '1px solid #fecaca', display: yazabilirMi(orgRole) ? undefined : 'none' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#fee2e2' }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#fff1f1' }}
                  >
                    Sil
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </main>

      {/* Create / Edit Form Modal */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(13,26,42,0.5)' }}
          onClick={closeForm}
        >
          <div
            className="w-full max-w-lg rounded-2xl overflow-hidden"
            style={{ background: '#fff', boxShadow: '0 24px 60px rgba(13,26,42,0.25)', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid #f3f4f6' }}>
              <h2 className="text-base font-bold" style={{ color: '#111827' }}>
                {editingTask ? 'Görevi Düzenle' : 'Yeni Görev'}
              </h2>
              <button
                onClick={closeForm}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-lg"
                style={{ background: '#f1f5f9', color: '#64748b' }}
              >×</button>
            </div>

            <form onSubmit={handleFormSubmit} className="p-6 space-y-4">
              {/* Title */}
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: '#374151' }}>Başlık *</label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Görev başlığı"
                  className="input"
                  required
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: '#374151' }}>Açıklama</label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Görev detayları..."
                  className="input resize-y"
                  rows={5}
                  style={{ color: '#111827', minHeight: '100px' }}
                />
              </div>

              {/* Priority + Type */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: '#374151' }}>Öncelik</label>
                  <select
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value as TaskPriority)}
                    className="input"
                  >
                    {PRIORITY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.icon} {opt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: '#374151' }}>Tür</label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as TaskType)}
                    className="input"
                  >
                    {TASK_TYPES.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: '#374151' }}>Durum</label>
                <select
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value as TaskStatus)}
                  className="input"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Start + Due date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: '#374151' }}>Başlangıç Tarihi</label>
                  <input
                    type="date"
                    value={formStartDate}
                    onChange={(e) => setFormStartDate(e.target.value)}
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: '#374151' }}>Son Tarih</label>
                  <input
                    type="date"
                    value={formDueDate}
                    onChange={(e) => setFormDueDate(e.target.value)}
                    className="input"
                  />
                </div>
              </div>

              {/* Assignee */}
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: '#374151' }}>Atanan Üye</label>
                <select
                  value={formAssignee}
                  onChange={(e) => setFormAssignee(e.target.value)}
                  className="input"
                >
                  <option value="">-- Seçilmedi --</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.full_name || m.id} ({m.role === 'admin' ? 'Admin' : 'Üye'})
                    </option>
                  ))}
                </select>
              </div>

              {/* İl / Birim */}
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: '#374151' }}>İl / Birim</label>
                <select
                  value={formIl}
                  onChange={(e) => setFormIl(e.target.value)}
                  className="input"
                >
                  <option value="">-- İl atanmamış --</option>
                  {IL_SECENEKLERI.map((il) => (
                    <option key={il} value={il}>{il}</option>
                  ))}
                </select>
              </div>

              {/* Sprint */}
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: '#374151' }}>Sprint</label>
                <select
                  value={formSprintId}
                  onChange={(e) => setFormSprintId(e.target.value)}
                  className="input"
                >
                  <option value="">-- Sprint'e atama yok --</option>
                  {sprints.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.is_active ? '● ' : ''}{s.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Hours */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: '#374151' }}>Tahmini Süre (saat)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={formEstimatedHours}
                    onChange={(e) => setFormEstimatedHours(e.target.value)}
                    placeholder="ör. 4.5"
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: '#374151' }}>Gerçekleşen Süre (saat)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={formActualHours}
                    onChange={(e) => setFormActualHours(e.target.value)}
                    placeholder="ör. 3.0"
                    className="input"
                  />
                </div>
              </div>

              {/* File Upload */}
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: '#374151' }}>Dosya Ekle</label>
                <div
                  className="border-2 border-dashed rounded-xl p-3 text-center cursor-pointer transition-colors"
                  style={{ borderColor: '#e5e7eb', background: '#f9fafb' }}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault()
                    const dropped = Array.from(e.dataTransfer.files).filter(f => {
                      if (f.size > 50 * 1024 * 1024) { setFormError(`"${f.name}" 50MB sınırını aşıyor.`); return false }
                      return true
                    })
                    setFormFiles(prev => [...prev, ...dropped])
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    hidden
                    onChange={(e) => {
                      const selected = Array.from(e.target.files || []).filter(f => {
                        if (f.size > 50 * 1024 * 1024) { setFormError(`"${f.name}" 50MB sınırını aşıyor.`); return false }
                        return true
                      })
                      setFormFiles(prev => [...prev, ...selected])
                      e.target.value = ''
                    }}
                  />
                  <p className="text-xs" style={{ color: '#9ca3af' }}>Dosyaları sürükleyin veya tıklayarak seçin</p>
                </div>
                {formFiles.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {formFiles.map((f, i) => (
                      <div key={i} className="flex items-center justify-between rounded-lg px-3 py-1.5" style={{ background: '#f1f5f9' }}>
                        <span className="text-xs truncate max-w-[80%]" style={{ color: '#111827' }}>{f.name}</span>
                        <button
                          type="button"
                          onClick={() => setFormFiles(prev => prev.filter((_, j) => j !== i))}
                          className="text-sm font-bold ml-2"
                          style={{ color: '#dc2626' }}
                        >×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {formError && (
                <div className="text-xs rounded-xl px-4 py-3" style={{ background: '#fee2e2', color: '#dc2626' }}>
                  {formError}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeForm} className="btn-secondary flex-1">
                  İptal
                </button>
                <button type="submit" disabled={formLoading || uploadingFiles} className="btn-primary flex-1">
                  {uploadingFiles ? 'Dosyalar yükleniyor...' : formLoading ? 'Kaydediliyor...' : editingTask ? 'Güncelle' : 'Oluştur'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
