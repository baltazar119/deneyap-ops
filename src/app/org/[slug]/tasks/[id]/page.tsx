'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { getSessionAndRole } from '@/lib/supabase/getSession'
import StatusBadge from '@/components/StatusBadge'
import { formatDateTime, isOverdue } from '@/lib/utils'
import type { Task, TaskOutput, Profile, UserRole, TaskDependency } from '@/types/database'
import TaskFiles from '@/components/TaskFiles'

const PRIORITY_LABELS: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  critical: { label: 'Kritik',  color: '#dc2626', bg: '#fee2e2', icon: '🔴' },
  high:     { label: 'Yüksek',  color: '#d97706', bg: '#fef3c7', icon: '🟡' },
  normal:   { label: 'Normal',  color: '#2288c9', bg: '#bee5f0', icon: '🔵' },
  low:      { label: 'Düşük',   color: '#6b7280', bg: '#f3f4f6', icon: '⚪' },
}

const TYPE_LABELS: Record<string, string> = {
  mechanical: 'Mekanik', electrical: 'Elektrik', software: 'Yazılım',
  research: 'Araştırma', documentation: 'Dokümantasyon', test: 'Test', other: 'Diğer',
}

export default function TaskDetailPage() {
  const router = useRouter()
  const params = useParams()
  const taskId = params.id as string
  const orgSlug = params.slug as string

  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<UserRole>('member')
  const [task, setTask] = useState<Task | null>(null)
  const [assignee, setAssignee] = useState<Profile | null>(null)
  const [outputs, setOutputs] = useState<TaskOutput[]>([])
  const [outputAuthors, setOutputAuthors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // Dependencies
  const [dependencies, setDependencies] = useState<(TaskDependency & { dependsOnTask: Task })[]>([])
  const [allTasks, setAllTasks] = useState<Task[]>([])
  const [showDepForm, setShowDepForm] = useState(false)
  const [selectedDepId, setSelectedDepId] = useState('')
  const [depLoading, setDepLoading] = useState(false)

  // Output form
  const [showOutputForm, setShowOutputForm] = useState(false)
  const [outputKind, setOutputKind] = useState<'link' | 'note'>('note')
  const [outputValue, setOutputValue] = useState('')
  const [outputLoading, setOutputLoading] = useState(false)
  const [outputError, setOutputError] = useState<string | null>(null)

  const loadOutputs = useCallback(async (profileMap: Record<string, string>) => {
    const { data } = await supabase
      .from('task_outputs')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false })

    setOutputs(data || [])

    const newIds = (data || []).map((o: TaskOutput) => o.created_by).filter((id: string) => !profileMap[id])
    if (newIds.length > 0) {
      const { data: newProfiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', newIds)

      const updated = { ...profileMap }
      ;(newProfiles || []).forEach((p: { id: string; full_name: string | null }) => {
        updated[p.id] = p.full_name || 'Bilinmeyen'
      })
      setOutputAuthors(updated)
    }
  }, [taskId])

  const loadDependencies = useCallback(async (tasksList: Task[]) => {
    const { data } = await supabase
      .from('task_dependencies')
      .select('*')
      .eq('task_id', taskId)

    const enriched = (data || []).map((dep: TaskDependency) => ({
      ...dep,
      dependsOnTask: tasksList.find((t) => t.id === dep.depends_on) as Task,
    })).filter((d: { dependsOnTask: Task | undefined }) => d.dependsOnTask)

    setDependencies(enriched)
  }, [taskId])

  useEffect(() => {
    async function init() {
      const auth = await getSessionAndRole()
      if (!auth) { router.replace('/login'); return }

      if (auth.role === 'consultant') { router.replace('/consultant'); return }

      setCurrentUserId(auth.userId)
      const role = auth.role as UserRole
      setUserRole(role)

      // Load task
      const { data: taskData, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', taskId)
        .single()

      if (error || !taskData) {
        setNotFound(true)
        setLoading(false)
        return
      }

      setTask(taskData)

      // Load all tasks for dependency selection
      const { data: tasksData } = await supabase
        .from('tasks')
        .select('*')
        .neq('id', taskId)
        .order('created_at', { ascending: false })

      const tasksList = tasksData || []
      setAllTasks(tasksList)

      const profileMap: Record<string, string> = {}
      if (taskData.assignee_id) {
        const { data: assigneeData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', taskData.assignee_id)
          .single()
        if (assigneeData) {
          setAssignee(assigneeData)
          profileMap[assigneeData.id] = assigneeData.full_name || 'Bilinmeyen'
        }
      }

      setOutputAuthors(profileMap)
      await Promise.all([
        loadOutputs(profileMap),
        loadDependencies(tasksList),
      ])
      setLoading(false)
    }

    init()
  }, [taskId, router, loadOutputs, loadDependencies])

  async function handleAddDependency() {
    if (!selectedDepId) return
    setDepLoading(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('task_dependencies').insert({
      task_id: taskId,
      depends_on: selectedDepId,
    })
    setSelectedDepId('')
    setShowDepForm(false)
    await loadDependencies(allTasks)
    setDepLoading(false)
  }

  async function handleRemoveDependency(depId: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('task_dependencies').delete().eq('id', depId)
    await loadDependencies(allTasks)
  }

  async function handleOutputSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!currentUserId || !task) return
    setOutputLoading(true)
    setOutputError(null)

    if (outputKind === 'link' && !outputValue.startsWith('http')) {
      setOutputError('Link http:// veya https:// ile başlamalıdır.')
      setOutputLoading(false)
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from('task_outputs').insert({
      task_id: task.id,
      kind: outputKind,
      value: outputValue,
      created_by: currentUserId,
    })

    if (error) {
      setOutputError('Çıktı eklenirken hata oluştu.')
      setOutputLoading(false)
      return
    }

    setOutputValue('')
    setShowOutputForm(false)
    await loadOutputs(outputAuthors)
    setOutputLoading(false)
  }

  async function handleDeleteOutput(outputId: string) {
    if (!confirm('Bu çıktıyı silmek istediğinize emin misiniz?')) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('task_outputs').delete().eq('id', outputId)
    await loadOutputs(outputAuthors)
  }

  const canAddOutput = userRole === 'admin' || (task?.assignee_id === currentUserId)
  const pMeta = PRIORITY_LABELS[task?.priority || 'normal'] || PRIORITY_LABELS.normal

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#f0fbff' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: '#bee5f0', borderTopColor: '#2288c9' }} />
          <div className="text-sm font-medium" style={{ color: '#2288c9' }}>Yükleniyor...</div>
        </div>
      </div>
    )
  }

  if (notFound || !task) {
    return (
      <div className="min-h-screen" style={{ background: '#f0fbff' }}>
        <main className="max-w-2xl mx-auto px-4 py-16 text-center">
          <div className="text-5xl mb-4">🔍</div>
          <h1 className="text-lg font-bold mb-2" style={{ color: '#0d1a2a' }}>Görev bulunamadı</h1>
          <p className="text-sm mb-6" style={{ color: '#7acfe6' }}>Bu görev mevcut değil veya erişim yetkiniz yok.</p>
          <Link href={userRole === 'admin' ? `/org/${orgSlug}/tasks` : `/org/${orgSlug}/me`} className="btn-secondary">← Geri Dön</Link>
        </main>
      </div>
    )
  }

  const availableForDep = allTasks.filter(
    (t) => !dependencies.some((d) => d.depends_on === t.id)
  )

  return (
    <div className="min-h-screen" style={{ background: '#f0fbff' }}>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-5">
        {/* Back */}
        <Link href={userRole === 'admin' ? `/org/${orgSlug}/tasks` : `/org/${orgSlug}/me`} className="text-xs font-semibold inline-flex items-center gap-1" style={{ color: '#2288c9' }}>
          ← Geri
        </Link>

        {/* Task card */}
        <div className="card">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: pMeta.bg, color: pMeta.color }}>
                  {pMeta.icon} {pMeta.label}
                </span>
                {task.task_type && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: '#f0fbff', color: '#2288c9', border: '1px solid #bee5f0' }}>
                    {TYPE_LABELS[task.task_type] || task.task_type}
                  </span>
                )}
              </div>
              <h1 className="text-lg font-bold" style={{ color: '#0d1a2a' }}>{task.title}</h1>
              {task.description && (
                <p className="text-sm mt-1" style={{ color: '#7acfe6' }}>{task.description}</p>
              )}
            </div>
            <StatusBadge status={task.status} />
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4" style={{ borderTop: '1px solid rgba(190,229,240,0.5)' }}>
            <div>
              <div className="text-xs font-semibold mb-1" style={{ color: '#7acfe6' }}>Atanan Kişi</div>
              <div className="text-sm font-medium" style={{ color: '#0d1a2a' }}>{assignee?.full_name || 'Atanmamış'}</div>
            </div>
            <div>
              <div className="text-xs font-semibold mb-1" style={{ color: '#7acfe6' }}>Son Tarih</div>
              <div className={`text-sm font-medium ${task.due_date && isOverdue(task.due_date) && task.status !== 'done' ? 'text-red-500' : ''}`} style={{ color: task.due_date && isOverdue(task.due_date) && task.status !== 'done' ? undefined : '#0d1a2a' }}>
                {task.due_date
                  ? new Date(task.due_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
                  : 'Belirtilmemiş'}
                {task.due_date && isOverdue(task.due_date) && task.status !== 'done' && <span className="ml-1 text-xs">⚠ Gecikmiş</span>}
              </div>
            </div>
            {/* Hours */}
            {(task.estimated_hours != null || task.actual_hours != null) && (
              <>
                <div>
                  <div className="text-xs font-semibold mb-1" style={{ color: '#7acfe6' }}>Tahmini Süre</div>
                  <div className="text-sm font-medium" style={{ color: '#0d1a2a' }}>
                    {task.estimated_hours != null ? `${task.estimated_hours} saat` : '–'}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold mb-1" style={{ color: '#7acfe6' }}>Gerçekleşen Süre</div>
                  <div className="text-sm font-medium" style={{ color: '#0d1a2a' }}>
                    {task.actual_hours != null ? `${task.actual_hours} saat` : '–'}
                    {task.estimated_hours != null && task.actual_hours != null && (
                      <span className="ml-1 text-xs" style={{ color: task.actual_hours > task.estimated_hours ? '#dc2626' : '#059669' }}>
                        ({task.actual_hours > task.estimated_hours ? '+' : ''}{(task.actual_hours - task.estimated_hours).toFixed(1)}s)
                      </span>
                    )}
                  </div>
                </div>
              </>
            )}
            <div>
              <div className="text-xs font-semibold mb-1" style={{ color: '#7acfe6' }}>Oluşturulma</div>
              <div className="text-sm" style={{ color: '#182c3f' }}>{formatDateTime(task.created_at)}</div>
            </div>
          </div>
        </div>

        {/* Dependencies */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold" style={{ color: '#0d1a2a' }}>Bağımlı Görevler</h2>
              <p className="text-xs mt-0.5" style={{ color: '#7acfe6' }}>Bu görev başlamadan önce tamamlanması gerekenler</p>
            </div>
            {userRole === 'admin' && (
              <button
                onClick={() => setShowDepForm(!showDepForm)}
                className="text-xs px-3 py-1.5 rounded-xl font-semibold"
                style={{ background: '#f0fbff', color: '#2288c9', border: '1px solid #bee5f0' }}
              >
                {showDepForm ? 'İptal' : '+ Bağımlılık Ekle'}
              </button>
            )}
          </div>

          {/* Add dependency form */}
          {showDepForm && userRole === 'admin' && (
            <div className="flex gap-2 mb-4">
              <select
                value={selectedDepId}
                onChange={(e) => setSelectedDepId(e.target.value)}
                className="input flex-1 text-sm"
              >
                <option value="">-- Görev seçin --</option>
                {availableForDep.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title} ({t.status === 'done' ? '✓ Tamamlandı' : t.status === 'doing' ? 'Yapılıyor' : 'Beklemede'})
                  </option>
                ))}
              </select>
              <button
                onClick={handleAddDependency}
                disabled={!selectedDepId || depLoading}
                className="btn-primary text-sm"
              >
                {depLoading ? '...' : 'Ekle'}
              </button>
            </div>
          )}

          {dependencies.length === 0 ? (
            <div className="text-sm text-center py-4" style={{ color: '#bee5f0' }}>
              Bağımlılık tanımlanmamış.
            </div>
          ) : (
            <div className="space-y-2">
              {dependencies.map((dep) => {
                const depTask = dep.dependsOnTask
                const isDone = depTask.status === 'done'
                return (
                  <div
                    key={dep.id}
                    className="flex items-center justify-between rounded-xl px-3 py-2.5"
                    style={{
                      background: isDone ? '#f0fdf4' : '#fff8f0',
                      border: `1px solid ${isDone ? '#6ee7b7' : '#fcd34d'}`,
                    }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-base">{isDone ? '✅' : '⏳'}</span>
                      <div className="min-w-0">
                        <Link
                          href={`/org/${orgSlug}/tasks/${depTask.id}`}
                          className="text-sm font-semibold hover:underline truncate block"
                          style={{ color: '#0d1a2a' }}
                        >
                          {depTask.title}
                        </Link>
                        <div className="text-xs" style={{ color: isDone ? '#059669' : '#d97706' }}>
                          {isDone ? 'Tamamlandı — başlayabilirsiniz' : 'Henüz tamamlanmadı'}
                        </div>
                      </div>
                    </div>
                    {userRole === 'admin' && (
                      <button
                        onClick={() => handleRemoveDependency(dep.id)}
                        className="text-xs ml-2 shrink-0"
                        style={{ color: '#dc2626' }}
                      >
                        Kaldır
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Drive Files */}
        {currentUserId && task && (
          <TaskFiles
            taskId={taskId}
            userId={currentUserId}
            userRole={userRole === 'consultant' ? 'member' : userRole}
            orgSlug={orgSlug}
            orgId={task.organization_id}
          />
        )}

        {/* Outputs */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold" style={{ color: '#0d1a2a' }}>Görev Çıktıları</h2>
            {canAddOutput && (
              <button
                onClick={() => setShowOutputForm(!showOutputForm)}
                className="text-xs px-3 py-1.5 rounded-xl font-semibold"
                style={{ background: '#f0fbff', color: '#2288c9', border: '1px solid #bee5f0' }}
              >
                {showOutputForm ? 'İptal' : '+ Çıktı Ekle'}
              </button>
            )}
          </div>

          {showOutputForm && canAddOutput && (
            <form onSubmit={handleOutputSubmit} className="mb-4 space-y-3 p-4 rounded-xl" style={{ background: '#f8fcff', border: '1px solid #e0f4fb' }}>
              <div className="flex gap-2">
                {(['note', 'link'] as const).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => setOutputKind(kind)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                    style={outputKind === kind
                      ? { background: '#2288c9', color: '#fff' }
                      : { background: '#fff', color: '#7acfe6', border: '1px solid #bee5f0' }}
                  >
                    {kind === 'note' ? '📝 Not' : '🔗 Link'}
                  </button>
                ))}
              </div>
              <div>
                {outputKind === 'link' ? (
                  <input type="url" value={outputValue} onChange={(e) => setOutputValue(e.target.value)} placeholder="https://..." className="input" required />
                ) : (
                  <textarea value={outputValue} onChange={(e) => setOutputValue(e.target.value)} placeholder="Notunuzu yazın..." className="input resize-none" rows={3} required />
                )}
              </div>
              {outputError && <div className="text-xs" style={{ color: '#dc2626' }}>{outputError}</div>}
              <button type="submit" disabled={outputLoading} className="btn-primary w-full">
                {outputLoading ? 'Ekleniyor...' : 'Kaydet'}
              </button>
            </form>
          )}

          {outputs.length === 0 ? (
            <div className="text-sm text-center py-4" style={{ color: '#bee5f0' }}>Henüz çıktı eklenmemiş.</div>
          ) : (
            <div className="space-y-2">
              {outputs.map((output) => (
                <div key={output.id} className="rounded-xl p-3" style={{ background: '#f8fcff', border: '1px solid #e0f4fb' }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <span className={`inline-block mb-1 text-xs px-2 py-0.5 rounded-full font-semibold ${output.kind === 'link' ? 'text-blue-700 bg-blue-50' : 'text-amber-700 bg-amber-50'}`}>
                        {output.kind === 'link' ? '🔗 Link' : '📝 Not'}
                      </span>
                      {output.kind === 'link' ? (
                        <a href={output.value} target="_blank" rel="noopener noreferrer" className="block text-sm font-medium hover:underline break-all" style={{ color: '#2288c9' }}>
                          {output.value}
                        </a>
                      ) : (
                        <p className="text-sm whitespace-pre-wrap" style={{ color: '#182c3f' }}>{output.value}</p>
                      )}
                      <div className="text-xs mt-1" style={{ color: '#7acfe6' }}>
                        {outputAuthors[output.created_by] || 'Bilinmeyen'} · {formatDateTime(output.created_at)}
                      </div>
                    </div>
                    {userRole === 'admin' && (
                      <button onClick={() => handleDeleteOutput(output.id)} className="text-xs shrink-0" style={{ color: '#dc2626' }}>Sil</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
