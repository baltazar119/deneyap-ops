'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useOrg } from '@/lib/supabase/orgContext'
import { useIsMobile } from '@/lib/useIsMobile'
import FeatureGate from '@/components/FeatureGate'
import type { DraftSet, DraftTask, TaskType, TaskPriority } from '@/types/database'

// ── Sabitler ───────────────────────────────────────────────────────────────────

const CATEGORY_OPTIONS: { value: TaskType; label: string }[] = [
  { value: 'mechanical',    label: 'Mekanik' },
  { value: 'electrical',   label: 'Elektrik' },
  { value: 'software',     label: 'Yazılım' },
  { value: 'research',     label: 'Araştırma' },
  { value: 'documentation',label: 'Dokümantasyon' },
  { value: 'test',         label: 'Test' },
  { value: 'other',        label: 'Diğer' },
]

const PRIORITY_OPTIONS: { value: TaskPriority; label: string; color: string; bg: string }[] = [
  { value: 'critical', label: 'Kritik',  color: '#991b1b', bg: '#fee2e2' },
  { value: 'high',     label: 'Yüksek',  color: '#92400e', bg: '#fef3c7' },
  { value: 'normal',   label: 'Normal',  color: '#1e40af', bg: '#dbeafe' },
  { value: 'low',      label: 'Düşük',   color: '#374151', bg: '#f3f4f6' },
]

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  draft:     { label: 'Taslak',   color: '#374151', bg: '#f1f5f9' },
  reviewing: { label: 'İnceleme', color: '#92400e', bg: '#fef3c7' },
  published: { label: 'Yayında',  color: '#166534', bg: '#dcfce7' },
  archived:  { label: 'Arşiv',    color: '#374151', bg: '#f3f4f6' },
}

const RISK_COLORS: Record<string, { color: string; bg: string; label: string }> = {
  low:      { color: '#166534', bg: '#dcfce7', label: 'Düşük' },
  medium:   { color: '#92400e', bg: '#fef3c7', label: 'Orta' },
  high:     { color: '#c2410c', bg: '#ffedd5', label: 'Yüksek' },
  critical: { color: '#991b1b', bg: '#fee2e2', label: 'Kritik' },
}

type Tab = 'generate' | 'sprint' | 'reports' | 'analysis'

const TABS: { id: Tab; label: string }[] = [
  { id: 'generate', label: 'Görev Üretimi'    },
  { id: 'sprint',   label: 'Sprint & İş Yükü' },
  { id: 'reports',  label: 'Raporlama'         },
  { id: 'analysis', label: 'İçerik Analizi'    },
]

// ── Yardımcı Bileşenler ───────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days  = Math.floor(diff / 86400000)
  if (mins < 2)   return 'Az önce'
  if (mins < 60)  return `${mins} dk önce`
  if (hours < 24) return `${hours} sa önce`
  return `${days} gün önce`
}

function Spinner({ size = 4 }: { size?: number }) {
  return (
    <span
      className="inline-block animate-spin border-2 border-current border-t-transparent rounded-full shrink-0"
      style={{ width: `${size * 4}px`, height: `${size * 4}px` }}
    />
  )
}

function RiskBadge({ level }: { level: string }) {
  const c = RISK_COLORS[level?.toLowerCase()] ?? RISK_COLORS.medium
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-bold shrink-0" style={{ background: c.bg, color: c.color }}>
      {c.label}
    </span>
  )
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="rounded-xl px-4 py-3 text-sm font-medium" style={{ background: '#fee2e2', color: '#dc2626' }}>
      ⚠ {msg}
    </div>
  )
}

// ── Ana İçerik ────────────────────────────────────────────────────────────────

function AIAssistantContent() {
  const router = useRouter()
  const { org, userId: ctxUserId, userEmail: ctxEmail, avatarUrl, isAdmin, loading: orgLoading } = useOrg()

  const [, setUserEmail]     = useState(ctxEmail ?? '')
  const [, setUserAvatarUrl] = useState<string | null>(avatarUrl ?? null)
  const [sessionToken,  setSessionToken]  = useState<string | null>(null)
  const [loading,       setLoading]       = useState(true)

  const [activeTab, setActiveTab] = useState<Tab>('generate')
  const isMobile = useIsMobile()

  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const showToast = useCallback((msg: string, type: 'success' | 'error') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }, [])

  // ── Tab 1: Görev Üretimi ──────────────────────────────────────────────────
  const [projectContext,  setProjectContext]  = useState('')
  const [contextExpanded, setContextExpanded] = useState(false)
  const [savingContext,   setSavingContext]   = useState(false)
  const [contextDirty,    setContextDirty]   = useState(false)
  const [savedContext,    setSavedContext]   = useState('')

  const [goal,       setGoal]       = useState('')
  const [context,    setContext]    = useState('')
  const [taskCount,  setTaskCount]  = useState(5)
  const [generating, setGenerating] = useState(false)

  const [draftSets,   setDraftSets]   = useState<DraftSet[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [selectedSet, setSelectedSet] = useState<DraftSet | null>(null)
  const [draftTasks,  setDraftTasks]  = useState<DraftTask[]>([])
  const [editedTasks, setEditedTasks] = useState<DraftTask[]>([])
  const [savingEdits, setSavingEdits] = useState(false)
  const [editsDirty,  setEditsDirty]  = useState(false)

  const [taskReviseInputs, setTaskReviseInputs] = useState<Record<string, string>>({})
  const [revisingTaskIds,  setRevisingTaskIds]  = useState<Set<string>>(new Set())
  const [openReviseIds,    setOpenReviseIds]    = useState<Set<string>>(new Set())
  const [deletingTaskIds,  setDeletingTaskIds]  = useState<Set<string>>(new Set())
  const [deletingSetId,    setDeletingSetId]    = useState<string | null>(null)
  const [revisionNote,     setRevisionNote]     = useState('')
  const [revising,         setRevising]         = useState(false)
  const [publishing,       setPublishing]       = useState(false)
  const [expandedCriteria, setExpandedCriteria] = useState<Set<string>>(new Set())

  // ── Tab 2: Sprint & İş Yükü ──────────────────────────────────────────────
  const [sprints,          setSprints]         = useState<any[]>([])
  const [selectedSprintId, setSelectedSprintId]= useState<string>('')
  const [sprintResult,     setSprintResult]    = useState<any>(null)
  const [sprintLoading,    setSprintLoading]   = useState(false)
  const [sprintError,      setSprintError]     = useState('')
  const [workloadResult,   setWorkloadResult]  = useState<any>(null)
  const [workloadLoading,  setWorkloadLoading] = useState(false)
  const [workloadError,    setWorkloadError]   = useState('')

  // ── Tab 3: Raporlama ─────────────────────────────────────────────────────
  const [weeklyResult,  setWeeklyResult]  = useState<any>(null)
  const [weeklyLoading, setWeeklyLoading] = useState(false)
  const [weeklyError,   setWeeklyError]   = useState('')
  const [delayResult,   setDelayResult]   = useState<any>(null)
  const [delayLoading,  setDelayLoading]  = useState(false)
  const [delayError,    setDelayError]    = useState('')

  // ── Tab 4: İçerik Analizi ────────────────────────────────────────────────
  const [meetingNotes,   setMeetingNotes]   = useState('')
  const [meetingResult,  setMeetingResult]  = useState<any>(null)
  const [meetingLoading, setMeetingLoading] = useState(false)
  const [meetingError,   setMeetingError]   = useState('')
  const [addingDraft,    setAddingDraft]    = useState(false)
  const [docFile,        setDocFile]        = useState<File | null>(null)
  const [docResult,      setDocResult]      = useState<any>(null)
  const [docLoading,     setDocLoading]     = useState(false)
  const [docError,       setDocError]       = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (orgLoading) return
    if (!org || !ctxUserId) { router.replace('/login'); return }
    if (!isAdmin) { router.replace(`/org/${org.slug}/dashboard`); return }

    async function init() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session) setSessionToken(session.access_token)
        setUserEmail(ctxEmail ?? '')
        setUserAvatarUrl(avatarUrl ?? null)
        await Promise.all([loadDraftSets(), loadProjectContext(), loadSprints()])
      } catch (err) {
        console.error('[AI Assistant] init error:', err)
      } finally {
        setLoading(false)
      }
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgLoading, org, ctxUserId, isAdmin])

  // ── Proje Bağlamı ─────────────────────────────────────────────────────────

  async function loadProjectContext() {
    try {
      const res = await fetch('/api/ai-tasks/context')
      const data = await res.json()
      const content = data?.content ?? ''
      setProjectContext(content)
      setSavedContext(content)
    } catch {}
  }

  async function saveProjectContext() {
    if (!sessionToken) return
    setSavingContext(true)
    try {
      const res = await fetch('/api/ai-tasks/context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionToken}` },
        body: JSON.stringify({ content: projectContext }),
      })
      const data = await res.json()
      if (!res.ok || data.error) { showToast(data.error || 'Bağlam kaydedilemedi.', 'error'); return }
      setSavedContext(projectContext)
      setContextDirty(false)
      showToast('Proje bağlamı kaydedildi.', 'success')
    } finally {
      setSavingContext(false)
    }
  }

  // ── Draft Setleri ─────────────────────────────────────────────────────────

  async function loadDraftSets() {
    setLoadingList(true)
    const { data } = await supabase
      .from('draft_sets').select('*')
      .order('created_at', { ascending: false }).limit(50)
    setDraftSets(data ?? [])
    setLoadingList(false)
  }

  async function openDraftSet(set: DraftSet) {
    setSelectedSet(set)
    setRevisionNote('')
    setExpandedCriteria(new Set())
    setOpenReviseIds(new Set())
    setTaskReviseInputs({})
    setEditsDirty(false)
    const { data } = await supabase
      .from('draft_tasks').select('*')
      .eq('draft_set_id', set.id)
      .order('order_index', { ascending: true })
    const tasks = (data ?? []).map((t: any) => ({
      ...t,
      acceptance_criteria: Array.isArray(t.acceptance_criteria) ? t.acceptance_criteria : [],
    })) as DraftTask[]
    setDraftTasks(tasks)
    setEditedTasks(tasks)
  }

  async function handleGenerate() {
    if (!goal.trim() || !sessionToken) return
    setGenerating(true)
    try {
      const res = await fetch('/api/ai-tasks/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionToken}` },
        body: JSON.stringify({ goal: goal.trim(), context: context.trim(), taskCount, projectContext: savedContext, org_id: org?.id }),
      })
      const data = await res.json()
      if (!res.ok || data.error) { showToast(data.error || 'Görev oluşturulamadı.', 'error'); return }
      const newTasks = (data.tasks ?? []).map((t: any) => ({
        ...t,
        acceptance_criteria: Array.isArray(t.acceptance_criteria) ? t.acceptance_criteria : [],
      }))
      setDraftSets((prev) => [data.draft_set, ...prev])
      setGoal(''); setContext('')
      setSelectedSet(data.draft_set)
      setDraftTasks(newTasks)
      setEditedTasks(newTasks)
      setOpenReviseIds(new Set())
      setTaskReviseInputs({})
      setEditsDirty(false)
      showToast(`${newTasks.length} görev oluşturuldu!`, 'success')
    } finally {
      setGenerating(false)
    }
  }

  function updateTask(id: string, field: keyof DraftTask, value: unknown) {
    setEditedTasks((prev) => prev.map((t) => t.id === id ? { ...t, [field]: value } : t))
    setEditsDirty(true)
  }

  function updateCriterion(taskId: string, idx: number, value: string) {
    setEditedTasks((prev) => prev.map((t) => {
      if (t.id !== taskId) return t
      const crit = [...t.acceptance_criteria]; crit[idx] = value
      return { ...t, acceptance_criteria: crit }
    }))
    setEditsDirty(true)
  }

  function addCriterion(taskId: string) {
    setEditedTasks((prev) => prev.map((t) =>
      t.id === taskId ? { ...t, acceptance_criteria: [...t.acceptance_criteria, ''] } : t,
    ))
    setEditsDirty(true)
  }

  function removeCriterion(taskId: string, idx: number) {
    setEditedTasks((prev) => prev.map((t) => {
      if (t.id !== taskId) return t
      return { ...t, acceptance_criteria: t.acceptance_criteria.filter((_, i) => i !== idx) }
    }))
    setEditsDirty(true)
  }

  async function deleteTask(taskId: string) {
    setDeletingTaskIds((prev) => new Set(Array.from(prev).concat(taskId)))
    try {
      const { error } = await supabase.from('draft_tasks').delete().eq('id', taskId)
      if (error) { showToast('Görev silinemedi.', 'error'); return }
      setEditedTasks((prev) => prev.filter((t) => t.id !== taskId))
      setDraftTasks((prev) => prev.filter((t) => t.id !== taskId))
      showToast('Görev silindi.', 'success')
    } finally {
      setDeletingTaskIds((prev) => { const next = new Set(prev); next.delete(taskId); return next })
    }
  }

  function toggleReviseInput(taskId: string) {
    setOpenReviseIds((prev) => {
      const next = new Set(prev)
      next.has(taskId) ? next.delete(taskId) : next.add(taskId)
      return next
    })
  }

  async function handleReviseTask(taskId: string) {
    const note = taskReviseInputs[taskId]?.trim()
    if (!note || !sessionToken) return
    setRevisingTaskIds((prev) => new Set(Array.from(prev).concat(taskId)))
    try {
      const res = await fetch('/api/ai-tasks/revise-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionToken}` },
        body: JSON.stringify({ draft_task_id: taskId, revision_note: note, org_id: org?.id }),
      })
      const data = await res.json()
      if (!res.ok || data.error) { showToast(data.error || 'Görev revize edilemedi.', 'error'); return }
      const updated = {
        ...data.task,
        acceptance_criteria: Array.isArray(data.task.acceptance_criteria) ? data.task.acceptance_criteria : [],
      } as DraftTask
      setEditedTasks((prev) => prev.map((t) => t.id === taskId ? updated : t))
      setDraftTasks((prev) => prev.map((t) => t.id === taskId ? updated : t))
      setTaskReviseInputs((prev) => ({ ...prev, [taskId]: '' }))
      setOpenReviseIds((prev) => { const next = new Set(prev); next.delete(taskId); return next })
      showToast('Görev revize edildi.', 'success')
    } finally {
      setRevisingTaskIds((prev) => { const next = new Set(prev); next.delete(taskId); return next })
    }
  }

  async function saveEdits() {
    if (!editsDirty) return
    setSavingEdits(true)
    try {
      await Promise.all(editedTasks.map((t) =>
        supabase.from('draft_tasks').update({
          title: t.title, description: t.description, category: t.category,
          priority: t.priority, due_date: t.due_date || null,
          estimated_hours: t.estimated_hours || null,
          acceptance_criteria: t.acceptance_criteria.filter(Boolean),
        }).eq('id', t.id),
      ))
      setDraftTasks(editedTasks)
      setEditsDirty(false)
      showToast('Değişiklikler kaydedildi.', 'success')
    } catch {
      showToast('Kayıt sırasında hata oluştu.', 'error')
    } finally {
      setSavingEdits(false)
    }
  }

  async function handleRevise() {
    if (!selectedSet || !revisionNote.trim() || !sessionToken) return
    setRevising(true)
    try {
      const res = await fetch('/api/ai-tasks/revise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionToken}` },
        body: JSON.stringify({ draft_set_id: selectedSet.id, revision_note: revisionNote.trim(), projectContext: savedContext, org_id: org?.id }),
      })
      const data = await res.json()
      if (!res.ok || data.error) { showToast(data.error || 'Revize başarısız.', 'error'); return }
      const newTasks = (data.tasks ?? []).map((t: any) => ({
        ...t,
        acceptance_criteria: Array.isArray(t.acceptance_criteria) ? t.acceptance_criteria : [],
      }))
      setDraftSets((prev) => [data.draft_set, ...prev])
      setRevisionNote('')
      setSelectedSet(data.draft_set)
      setDraftTasks(newTasks)
      setEditedTasks(newTasks)
      setOpenReviseIds(new Set())
      setTaskReviseInputs({})
      setEditsDirty(false)
      showToast(`v${data.draft_set.version} oluşturuldu!`, 'success')
    } finally {
      setRevising(false)
    }
  }

  async function handlePublish() {
    if (!selectedSet || !sessionToken) return
    if (!window.confirm(`${editedTasks.length} görevi gerçek görev listesine eklemek istiyor musunuz?\n\nBu işlem geri alınamaz.`)) return
    setPublishing(true)
    try {
      const res = await fetch('/api/ai-tasks/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionToken}` },
        body: JSON.stringify({ draft_set_id: selectedSet.id }),
      })
      const data = await res.json()
      if (!res.ok || data.error) { showToast(data.error || 'Yayınlama başarısız.', 'error'); return }
      const updated = { ...selectedSet, status: 'published' as const }
      setSelectedSet(updated)
      setDraftSets((prev) => prev.map((s) => s.id === selectedSet.id ? updated : s))
      showToast(`${data.published_count} görev yayınlandı!`, 'success')
    } finally {
      setPublishing(false)
    }
  }

  async function deleteDraftSet(setId: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!window.confirm('Bu taslak setini ve tüm görevlerini kalıcı olarak silmek istiyor musunuz?')) return
    setDeletingSetId(setId)
    try {
      const { error } = await supabase.from('draft_sets').delete().eq('id', setId)
      if (error) { showToast('Taslak silinemedi.', 'error'); return }
      setDraftSets((prev) => prev.filter((s) => s.id !== setId))
      if (selectedSet?.id === setId) { setSelectedSet(null); setDraftTasks([]); setEditedTasks([]) }
      showToast('Taslak silindi.', 'success')
    } finally {
      setDeletingSetId(null)
    }
  }

  async function handleArchive(setId: string) {
    if (!window.confirm('Bu taslağı arşivlemek istiyor musunuz?')) return
    await supabase.from('draft_sets').update({ status: 'archived' }).eq('id', setId)
    setDraftSets((prev) => prev.map((s) => s.id === setId ? { ...s, status: 'archived' as const } : s))
    if (selectedSet?.id === setId) setSelectedSet((prev) => prev ? { ...prev, status: 'archived' } : prev)
    showToast('Taslak arşivlendi.', 'success')
  }

  function toggleCriteria(taskId: string) {
    setExpandedCriteria((prev) => {
      const next = new Set(prev)
      next.has(taskId) ? next.delete(taskId) : next.add(taskId)
      return next
    })
  }

  // ── Tab 2: Sprint Fonksiyonları ───────────────────────────────────────────

  async function loadSprints() {
    if (!org?.id) return
    const { data } = await supabase
      .from('sprints')
      .select('id, name, start_date, end_date, status')
      .eq('organization_id', org.id)
      .order('created_at', { ascending: false })
      .limit(20)
    setSprints(data ?? [])
    const active = (data ?? []).find((s: any) => s.status === 'active')
    if (active) setSelectedSprintId(active.id)
    else if (data && data.length > 0) setSelectedSprintId(data[0].id)
  }

  async function handleSprintAnalysis() {
    if (!sessionToken || !org?.id) return
    setSprintLoading(true); setSprintError(''); setSprintResult(null)
    try {
      const res = await fetch('/api/ai-tasks/sprint-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionToken}` },
        body: JSON.stringify({ orgId: org.id, sprintId: selectedSprintId || undefined }),
      })
      const data = await res.json()
      if (!res.ok || data.error) { setSprintError(data.error || 'Analiz başarısız.'); return }
      setSprintResult(data.analysis)
    } finally {
      setSprintLoading(false)
    }
  }

  async function handleWorkload() {
    if (!sessionToken || !org?.id) return
    setWorkloadLoading(true); setWorkloadError(''); setWorkloadResult(null)
    try {
      const res = await fetch('/api/ai-tasks/workload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionToken}` },
        body: JSON.stringify({ orgId: org.id }),
      })
      const data = await res.json()
      if (!res.ok || data.error) { setWorkloadError(data.error || 'Analiz başarısız.'); return }
      setWorkloadResult(data.analysis)
    } finally {
      setWorkloadLoading(false)
    }
  }

  // ── Tab 3: Rapor Fonksiyonları ────────────────────────────────────────────

  async function handleWeeklyReport() {
    if (!sessionToken || !org?.id) return
    setWeeklyLoading(true); setWeeklyError(''); setWeeklyResult(null)
    try {
      const res = await fetch('/api/ai-tasks/weekly-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionToken}` },
        body: JSON.stringify({ orgId: org.id }),
      })
      const data = await res.json()
      if (!res.ok || data.error) { setWeeklyError(data.error || 'Rapor oluşturulamadı.'); return }
      setWeeklyResult(data.report)
    } finally {
      setWeeklyLoading(false)
    }
  }

  async function handleDownloadPDF() {
    if (!weeklyResult) return
    try {
      const { default: jsPDF } = await import('jspdf')
      const doc = new jsPDF()
      doc.setFontSize(18); doc.setFont('helvetica', 'bold')
      doc.text('Haftalik Proje Raporu', 20, 20)
      doc.setFontSize(11); doc.setFont('helvetica', 'normal')
      doc.text(`${org?.name ?? ''} - ${weeklyResult.week ?? ''}`, 20, 30)
      doc.setFontSize(13); doc.setFont('helvetica', 'bold')
      doc.text('Ozet', 20, 45)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
      doc.text(
        `Tamamlanan: ${weeklyResult.completed_count}  |  Geciken: ${weeklyResult.overdue_count}  |  Kritik: ${weeklyResult.critical_count}  |  Performans: ${weeklyResult.performance_score}/100`,
        20, 53,
      )
      let y = 65
      if (weeklyResult.ai_comment) {
        doc.setFontSize(13); doc.setFont('helvetica', 'bold')
        doc.text('AI Yorumu', 20, y); y += 8
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
        const lines = doc.splitTextToSize(weeklyResult.ai_comment, 170)
        doc.text(lines, 20, y); y += lines.length * 5 + 8
      }
      if (weeklyResult.highlights?.length) {
        doc.setFontSize(12); doc.setFont('helvetica', 'bold')
        doc.text('Basarilar', 20, y); y += 6
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
        weeklyResult.highlights.forEach((h: string) => { doc.text(`- ${h}`, 22, y); y += 5 })
        y += 4
      }
      if (weeklyResult.concerns?.length) {
        doc.setFontSize(12); doc.setFont('helvetica', 'bold')
        doc.text('Endiseler', 20, y); y += 6
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
        weeklyResult.concerns.forEach((c: string) => { doc.text(`- ${c}`, 22, y); y += 5 })
      }
      doc.save(`haftalik-rapor-${new Date().toISOString().slice(0, 10)}.pdf`)
      showToast('PDF indirildi.', 'success')
    } catch {
      showToast('PDF oluşturulamadı.', 'error')
    }
  }

  async function handleDelayPrediction() {
    if (!sessionToken || !org?.id) return
    setDelayLoading(true); setDelayError(''); setDelayResult(null)
    try {
      const res = await fetch('/api/ai-tasks/delay-prediction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionToken}` },
        body: JSON.stringify({ orgId: org.id }),
      })
      const data = await res.json()
      if (!res.ok || data.error) { setDelayError(data.error || 'Tahmin başarısız.'); return }
      setDelayResult(data.predictions)
    } finally {
      setDelayLoading(false)
    }
  }

  // ── Tab 4: Analiz Fonksiyonları ───────────────────────────────────────────

  async function handleMeetingSummary() {
    if (!sessionToken || !org?.id || !meetingNotes.trim()) return
    setMeetingLoading(true); setMeetingError(''); setMeetingResult(null)
    try {
      const res = await fetch('/api/ai-tasks/meeting-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionToken}` },
        body: JSON.stringify({ orgId: org.id, notes: meetingNotes }),
      })
      const data = await res.json()
      if (!res.ok || data.error) { setMeetingError(data.error || 'Özet alınamadı.'); return }
      setMeetingResult(data.summary)
    } finally {
      setMeetingLoading(false)
    }
  }

  async function handleAddSuggestedTasks() {
    if (!meetingResult?.suggested_tasks?.length || !sessionToken || !org?.id) return
    setAddingDraft(true)
    try {
      const res = await fetch('/api/ai-tasks/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionToken}` },
        body: JSON.stringify({
          goal: 'Toplantı Özeti — Önerilen Görevler',
          context: meetingNotes.slice(0, 500),
          taskCount: Math.min(meetingResult.suggested_tasks.length, 10),
          projectContext: savedContext,
          org_id: org.id,
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) { showToast(data.error || 'Draft oluşturulamadı.', 'error'); return }
      setDraftSets((prev) => [data.draft_set, ...prev])
      showToast("Öneriler Draft'a eklendi! Görev Üretimi sekmesinden görebilirsiniz.", 'success')
      setActiveTab('generate')
    } finally {
      setAddingDraft(false)
    }
  }

  async function handleDocumentAnalysis() {
    if (!sessionToken || !org?.id || !docFile) return
    setDocLoading(true); setDocError(''); setDocResult(null)
    try {
      const formData = new FormData()
      formData.append('file', docFile)
      formData.append('orgId', org.id)
      const res = await fetch('/api/ai-tasks/document-analysis', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${sessionToken}` },
        body: formData,
      })
      const data = await res.json()
      if (!res.ok || data.error) { setDocError(data.error || 'Analiz başarısız.'); return }
      setDocResult(data)
    } finally {
      setDocLoading(false)
    }
  }

  // ── Yükleniyor ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: '#f4f6f9' }}>
        <main className="w-full px-6 py-8 space-y-4">
          <div className="skeleton h-24 rounded-2xl" />
          <div className="skeleton h-64 rounded-2xl" />
        </main>
      </div>
    )
  }

  const cardStyle: React.CSSProperties = {
    background: '#fff',
    border: '1px solid #d8e3ec',
    boxShadow: '0 1px 3px rgba(15,23,42,0.06), 0 4px 12px rgba(15,23,42,0.04)',
    transition: 'box-shadow 0.2s ease, transform 0.2s ease',
  }
  const hg: React.CSSProperties = { background: '#eef3f8' }

  return (
    <div className="min-h-screen" style={{ background: '#f4f6f9' }}>

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes toastSlideIn {
          from { opacity: 0; transform: translateY(16px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes barGrow {
          from { width: 0%; }
        }
        .ai-card:hover {
          box-shadow: 0 4px 16px rgba(15,23,42,0.10), 0 1px 4px rgba(15,23,42,0.06) !important;
          transform: translateY(-1px);
        }
        .ai-tab-content { animation: fadeInUp 0.22s cubic-bezier(0.16,1,0.3,1); }
        .ai-result-item { animation: fadeInUp 0.28s cubic-bezier(0.16,1,0.3,1) both; }
        .ai-bar-fill { animation: barGrow 0.7s cubic-bezier(0.4,0,0.2,1) both; }
      `}</style>

      {toast && (
        <div
          className="fixed bottom-6 right-6 z-50 px-5 py-3.5 rounded-2xl text-sm font-semibold flex items-center gap-3"
          style={{ background: toast.type === 'success' ? '#166534' : '#991b1b', color: '#fff', boxShadow: '0 8px 32px rgba(0,0,0,0.22)', animation: 'toastSlideIn 0.3s cubic-bezier(0.16,1,0.3,1)' }}
        >
          <span style={{ fontSize: 15 }}>{toast.type === 'success' ? '✓' : '⚠'}</span>
          <span>{toast.msg}</span>
        </div>
      )}

      <main className="w-full space-y-5" style={{ padding: isMobile ? '12px' : '24px' }}>

        {/* ── Header + Tab Bar ─────────────────────────────────────────────── */}
        <div className="rounded-2xl overflow-hidden" style={{ background: '#fff', border: '1px solid #d0dce8', boxShadow: '0 1px 3px rgba(15,23,42,0.06)' }}>
          <div style={{ padding: isMobile ? '12px 16px' : '16px 24px', borderBottom: '1px solid #e2eaf2', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="flex items-center gap-3">
              <div className="rounded-xl flex items-center justify-center shrink-0" style={{ width: isMobile ? 34 : 40, height: isMobile ? 34 : 40, background: 'linear-gradient(135deg, #1d4ed8, #2563eb)', boxShadow: '0 2px 8px rgba(37,99,235,0.3)' }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              </div>
              <div>
                <h1 className="font-bold tracking-tight" style={{ color: '#0f172a', fontSize: isMobile ? 14 : 15 }}>AI Görev Asistanı</h1>
                {!isMobile && <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>Gemini 2.5-flash · Yalnızca admin · Günlük 10 analiz</p>}
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-lg text-xs font-semibold" style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' }}>Pro</span>
          </div>
          {isMobile ? (
            <div style={{ overflowX: 'auto', display: 'flex', background: '#fafbfd', scrollbarWidth: 'none' }}>
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    flexShrink: 0,
                    padding: '10px 16px',
                    fontSize: 12,
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    color: activeTab === tab.id ? '#1d4ed8' : '#64748b',
                    background: activeTab === tab.id ? '#eff6ff' : 'transparent',
                    borderBottom: activeTab === tab.id ? '2px solid #2563eb' : '2px solid transparent',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex" style={{ background: '#fafbfd' }}>
              {TABS.map((tab, idx) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="flex-1 flex items-center justify-center py-3.5 text-xs font-semibold transition-all duration-150"
                  style={{
                    color: activeTab === tab.id ? '#1d4ed8' : '#64748b',
                    background: activeTab === tab.id ? '#eff6ff' : 'transparent',
                    borderBottom: activeTab === tab.id ? '2px solid #2563eb' : '2px solid transparent',
                    borderRight: idx < 3 ? '1px solid #e8eef5' : 'none',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ════════════════════════════════════════════════════════════════════
            TAB 1 — Görev Üretimi
        ════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'generate' && (
          <div className="ai-tab-content grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-5 items-start">

            {/* SOL PANEL */}
            <div className="flex flex-col gap-4">

              {/* Proje Bağlamı */}
              <div className="rounded-2xl overflow-hidden" style={{ ...cardStyle, border: contextExpanded ? '1px solid rgba(42,187,213,0.35)' : '1px solid rgba(210,228,238,0.8)' }}>
                <button onClick={() => setContextExpanded((v) => !v)} className="w-full px-5 py-4 flex items-center justify-between" style={{ ...hg, borderBottom: contextExpanded ? '1px solid #e8f0f6' : 'none' }}>
                  <div className="text-left flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: savedContext.trim() ? '#d1fae5' : '#f1f5f9', border: '1px solid #e2e8f0' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={savedContext.trim() ? '#059669' : '#64748b'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
                    </div>
                    <div>
                      <h2 className="text-sm font-bold flex items-center gap-2" style={{ color: '#374151' }}>
                        Proje Bağlamı
                        {savedContext.trim()
                          ? <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: '#d1fae5', color: '#059669' }}>✓ Aktif</span>
                          : <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: '#f1f5f9', color: '#94a3b8' }}>Boş</span>}
                      </h2>
                      <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>
                        {savedContext.trim() ? `${savedContext.length} kar. · Tüm üretimlerde kullanılıyor` : "AI'ın projenizi tanıması için tanımlayın"}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs shrink-0 transition-transform duration-200" style={{ color: '#94a3b8', transform: contextExpanded ? 'rotate(180deg)' : 'none' }}>▼</span>
                </button>
                {contextExpanded && (
                  <div className="p-5 space-y-4">
                    <div className="rounded-xl px-4 py-3 flex items-start gap-3" style={{ background: 'rgba(34,136,201,0.05)', border: '1px solid rgba(34,136,201,0.15)' }}>
                      <span className="text-sm mt-0.5 shrink-0 font-bold" style={{ color: '#2288c9' }}>i</span>
                      <p className="text-xs leading-relaxed" style={{ color: '#64748b' }}>Projeniz hakkında bilgi girin — ekip yapısı, teknoloji, sprint düzeni, hedefler. AI her üretimde bu bağlamı kullanır.</p>
                    </div>
                    <div className="relative">
                      <textarea
                        className="w-full text-sm leading-relaxed resize-none rounded-xl px-4 py-3" rows={7}
                        value={projectContext}
                        onChange={(e) => { setProjectContext(e.target.value); setContextDirty(e.target.value !== savedContext) }}
                        placeholder={`Örneğin:\n\nDENEYAP Ankara Atölyesi, 3 ekip: Mekanik, Elektronik, Yazılım.\nOtonom forklift projesi. Sprint 2 hafta. ROS2, Python, SolidWorks.`}
                        style={{ border: contextDirty ? '2px solid rgba(34,136,201,0.5)' : '1px solid #e2e8f0', background: '#f8fafc', color: '#374151', outline: 'none' }}
                      />
                      <div className="absolute bottom-2 right-3 text-xs" style={{ color: '#cbd5e1' }}>{projectContext.length} kar.</div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold" style={{ color: contextDirty ? '#d97706' : savedContext.trim() ? '#059669' : '#94a3b8' }}>
                        {contextDirty ? '● Kaydedilmemiş' : savedContext.trim() ? '✓ Kaydedildi' : 'Henüz ayarlanmadı'}
                      </span>
                      <div className="flex gap-2">
                        {projectContext.trim() && (
                          <button onClick={() => { setProjectContext(''); setContextDirty(savedContext !== '') }} className="px-3 py-1.5 rounded-xl text-xs font-semibold" style={{ background: '#fee2e2', color: '#dc2626' }}>Temizle</button>
                        )}
                        <button onClick={saveProjectContext} disabled={savingContext || !contextDirty} className="px-4 py-1.5 rounded-xl text-xs font-bold text-white disabled:opacity-40" style={{ background: 'linear-gradient(135deg, #2abbd5, #2288c9)' }}>
                          {savingContext ? 'Kaydediliyor…' : '✓ Kaydet'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Hedef Formu */}
              <div className="ai-card rounded-2xl overflow-hidden" style={cardStyle}>
                <div className="px-5 py-4" style={{ ...hg, borderBottom: '1px solid #dce8f0', borderLeft: '3px solid #2563eb', paddingLeft: '18px' }}>
                  <h2 className="text-sm font-bold tracking-tight" style={{ color: '#0f172a' }}>Yeni Görev Seti Oluştur</h2>
                  <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>AI projeyi görevlere böler</p>
                </div>
                <div className="p-5 space-y-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: '#64748b' }}>Hedef <span style={{ color: '#dc2626' }}>*</span></label>
                    <textarea className="input text-sm w-full resize-none" rows={3} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Örn: Elektrik motorunun ısıl yönetim sistemini tasarla ve dokümanla" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: '#64748b' }}>
                      Ek Bağlam <span className="font-normal" style={{ color: '#94a3b8' }}>(isteğe bağlı)</span>
                    </label>
                    <textarea className="input text-sm w-full resize-none" rows={2} value={context} onChange={(e) => setContext(e.target.value)} placeholder="Bu göreve özel kısıtlar, öncelikler…" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-semibold" style={{ color: '#64748b' }}>Görev Sayısı</label>
                      <span className="text-sm font-bold px-2.5 py-0.5 rounded-lg" style={{ background: 'linear-gradient(135deg, #2abbd5, #2288c9)', color: '#fff', minWidth: 32, textAlign: 'center' }}>{taskCount}</span>
                    </div>
                    <input type="range" min={1} max={15} step={1} value={taskCount} onChange={(e) => setTaskCount(Number(e.target.value))} className="w-full" style={{ accentColor: '#2288c9', cursor: 'pointer' }} />
                    <div className="flex justify-between mt-1">
                      <span className="text-xs" style={{ color: '#cbd5e1' }}>1</span>
                      <span className="text-xs" style={{ color: '#cbd5e1' }}>15</span>
                    </div>
                  </div>
                  <button onClick={handleGenerate} disabled={generating || !goal.trim()} className="btn-primary w-full disabled:opacity-50" style={{ justifyContent: 'center' }}>
                    {generating ? <><Spinner size={4} /> Oluşturuluyor…</> : <>{taskCount} Görev Oluştur</>}
                  </button>
                </div>
              </div>

              {/* Taslak Listesi */}
              <div className="ai-card rounded-2xl overflow-hidden" style={cardStyle}>
                <div className="px-5 py-4" style={{ ...hg, borderBottom: '1px solid #dce8f0', borderLeft: '3px solid #2563eb', paddingLeft: '18px' }}>
                  <h2 className="text-sm font-bold tracking-tight" style={{ color: '#0f172a' }}>Taslak Setleri</h2>
                  <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>{draftSets.length} taslak</p>
                </div>
                <div className="p-2 max-h-[500px] overflow-y-auto">
                  {loadingList ? (
                    <div className="p-4 space-y-2"><div className="skeleton h-14 rounded-xl" /><div className="skeleton h-14 rounded-xl" /></div>
                  ) : draftSets.length === 0 ? (
                    <div className="py-8 text-center">
                      <p className="text-sm" style={{ color: '#94a3b8' }}>Henüz taslak yok</p>
                      <p className="text-xs mt-1" style={{ color: '#cbd5e1' }}>Yukarıdan bir hedef girerek başlayın</p>
                    </div>
                  ) : draftSets.map((set) => {
                    const st = STATUS_MAP[set.status] ?? STATUS_MAP.draft
                    const isSel = selectedSet?.id === set.id
                    const isDel = deletingSetId === set.id
                    return (
                      <div key={set.id} className="flex items-stretch gap-1 mb-1">
                        <button onClick={() => openDraftSet(set)} className="flex-1 text-left px-3 py-3 rounded-xl transition-all duration-150"
                          style={{ background: isSel ? 'rgba(34,136,201,0.08)' : 'transparent', border: `1px solid ${isSel ? 'rgba(34,136,201,0.3)' : 'transparent'}`, opacity: isDel ? 0.4 : 1 }}>
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-semibold leading-snug" style={{ color: '#374151' }}>{set.title}</p>
                            <span className="shrink-0 px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: st.bg, color: st.color }}>{st.label}</span>
                          </div>
                          <p className="text-xs mt-1" style={{ color: '#94a3b8' }}>v{set.version} · {timeAgo(set.created_at)}</p>
                        </button>
                        <button onClick={(e) => deleteDraftSet(set.id, e)} disabled={isDel} title="Taslağı sil"
                          className="w-7 rounded-xl flex items-center justify-center text-xs transition-all shrink-0 disabled:opacity-40"
                          style={{ background: 'transparent', color: '#ef4444' }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#fee2e2' }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
                          {isDel ? '…' : '×'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* SAĞ PANEL */}
            {selectedSet ? (
              <div className="flex flex-col gap-4">
                <div className="ai-card rounded-2xl overflow-hidden" style={cardStyle}>
                  <div className="px-5 py-4" style={{ ...hg, borderBottom: '1px solid #dce8f0', borderLeft: '3px solid #2563eb', paddingLeft: '18px' }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h2 className="text-sm font-bold truncate" style={{ color: '#374151' }}>{selectedSet.title}</h2>
                        <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>v{selectedSet.version} · {editedTasks.length} görev · {STATUS_MAP[selectedSet.status]?.label}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {selectedSet.status === 'draft' && (
                          <>
                            <button onClick={handlePublish} disabled={publishing || editedTasks.length === 0} className="px-4 py-1.5 rounded-xl text-xs font-bold text-white disabled:opacity-50" style={{ background: 'linear-gradient(135deg, #2abbd5, #2288c9)' }}>
                              {publishing ? 'Yayınlanıyor…' : '↑ Yayınla'}
                            </button>
                            <button onClick={() => handleArchive(selectedSet.id)} className="px-3 py-1.5 rounded-xl text-xs font-semibold" style={{ background: 'rgba(255,255,255,0.1)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.12)' }}>Arşivle</button>
                          </>
                        )}
                        {selectedSet.status === 'published' && (
                          <a href="/tasks" className="px-4 py-1.5 rounded-xl text-xs font-bold" style={{ background: '#dcfce7', color: '#059669' }}>Görevleri Gör →</a>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="px-5 py-3" style={{ borderBottom: '1px solid #e8f0f6' }}>
                    <p className="text-xs" style={{ color: '#64748b' }}><span className="font-semibold">Hedef: </span>{selectedSet.goal_summary}</p>
                  </div>
                  {selectedSet.status === 'draft' && (
                    <div className="px-5 py-3 flex justify-between items-center">
                      <p className="text-xs" style={{ color: editsDirty ? '#d97706' : '#94a3b8' }}>{editsDirty ? '● Kaydedilmemiş değişiklikler var' : 'Görev kartlarını düzenleyin'}</p>
                      <button onClick={saveEdits} disabled={!editsDirty || savingEdits} className="px-4 py-1.5 rounded-xl text-xs font-bold text-white disabled:opacity-40" style={{ background: 'linear-gradient(135deg, #2abbd5, #2288c9)' }}>
                        {savingEdits ? 'Kaydediliyor…' : 'Kaydet'}
                      </button>
                    </div>
                  )}
                </div>

                {editedTasks.length === 0 ? (
                  <div className="rounded-2xl p-8 text-center" style={{ background: '#fff', border: '1px solid rgba(210,228,238,0.8)' }}>
                    <p className="text-sm" style={{ color: '#94a3b8' }}>Bu taslakta görev yok</p>
                  </div>
                ) : editedTasks.map((task, taskIdx) => {
                  const prio = PRIORITY_OPTIONS.find((p) => p.value === task.priority) ?? PRIORITY_OPTIONS[2]
                  const cat  = CATEGORY_OPTIONS.find((c) => c.value === task.category) ?? CATEGORY_OPTIONS[6]
                  const isOpen = expandedCriteria.has(task.id)
                  const isReadOnly = selectedSet.status !== 'draft'
                  const isRevisingThis = revisingTaskIds.has(task.id)
                  const isDeletingThis = deletingTaskIds.has(task.id)
                  const isReviseOpen = openReviseIds.has(task.id)
                  return (
                    <div key={task.id} className="ai-card rounded-2xl overflow-hidden" style={{ background: '#fff', border: '1px solid #d8e3ec', boxShadow: '0 1px 3px rgba(15,23,42,0.06)', opacity: isDeletingThis ? 0.5 : 1, transition: 'opacity 0.2s, box-shadow 0.2s, transform 0.2s', animationDelay: `${taskIdx * 40}ms`, animation: 'fadeInUp 0.22s cubic-bezier(0.16,1,0.3,1) both' }}>
                      <div className="px-5 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid #eaf0f7', background: '#fafbfd' }}>
                        <span className="text-xs font-bold w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#e2eaf2', color: '#374151' }}>{taskIdx + 1}</span>
                        {isReadOnly
                          ? <p className="text-sm font-semibold flex-1" style={{ color: '#374151' }}>{task.title}</p>
                          : <input className="flex-1 text-sm font-semibold bg-transparent border-none outline-none" style={{ color: '#374151' }} value={task.title} onChange={(e) => updateTask(task.id, 'title', e.target.value)} placeholder="Görev başlığı" />
                        }
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold shrink-0" style={{ background: prio.bg, color: prio.color }}>{prio.label}</span>
                        {!isReadOnly && (
                          <div className="flex items-center gap-1 shrink-0 ml-1">
                            <button onClick={() => toggleReviseInput(task.id)} title="AI ile revize et" className="w-6 h-6 rounded-lg flex items-center justify-center text-xs transition-all"
                              style={{ background: isReviseOpen ? 'rgba(34,136,201,0.15)' : 'transparent', color: isReviseOpen ? '#2288c9' : '#94a3b8', border: `1px solid ${isReviseOpen ? 'rgba(34,136,201,0.3)' : 'transparent'}` }}>✎</button>
                            <button onClick={() => deleteTask(task.id)} disabled={isDeletingThis} title="Görevi sil" className="w-6 h-6 rounded-lg flex items-center justify-center text-xs transition-all"
                              style={{ background: 'transparent', color: '#ef4444', border: '1px solid transparent' }}
                              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#fee2e2'; (e.currentTarget as HTMLElement).style.borderColor = '#fca5a5' }}
                              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.borderColor = 'transparent' }}>×</button>
                          </div>
                        )}
                      </div>
                      <div className="px-5 py-4 space-y-4">
                        {isReadOnly
                          ? <p className="text-sm leading-relaxed" style={{ color: '#475569' }}>{task.description}</p>
                          : <textarea className="input text-sm w-full resize-none" rows={2} value={task.description} onChange={(e) => updateTask(task.id, 'description', e.target.value)} placeholder="Görev açıklaması…" />
                        }
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div>
                            <label className="block text-xs font-semibold mb-1" style={{ color: '#64748b' }}>Kategori</label>
                            {isReadOnly
                              ? <span className="text-xs font-medium" style={{ color: '#374151' }}>{cat.label}</span>
                              : <select className="input text-xs py-1.5" value={task.category} onChange={(e) => updateTask(task.id, 'category', e.target.value as TaskType)}>{CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
                            }
                          </div>
                          <div>
                            <label className="block text-xs font-semibold mb-1" style={{ color: '#64748b' }}>Öncelik</label>
                            {isReadOnly
                              ? <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: prio.bg, color: prio.color }}>{prio.label}</span>
                              : <select className="input text-xs py-1.5" value={task.priority} onChange={(e) => updateTask(task.id, 'priority', e.target.value as TaskPriority)}>{PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
                            }
                          </div>
                          <div>
                            <label className="block text-xs font-semibold mb-1" style={{ color: '#64748b' }}>Bitiş Tarihi</label>
                            {isReadOnly
                              ? <span className="text-xs" style={{ color: '#374151' }}>{task.due_date || '—'}</span>
                              : <input type="date" className="input text-xs py-1.5" value={task.due_date || ''} onChange={(e) => updateTask(task.id, 'due_date', e.target.value || null)} />
                            }
                          </div>
                          <div>
                            <label className="block text-xs font-semibold mb-1" style={{ color: '#64748b' }}>Tahmin (sa)</label>
                            {isReadOnly
                              ? <span className="text-xs" style={{ color: '#374151' }}>{task.estimated_hours ?? '—'}</span>
                              : <input type="number" min="0" step="0.5" className="input text-xs py-1.5" value={task.estimated_hours ?? ''} onChange={(e) => updateTask(task.id, 'estimated_hours', e.target.value ? parseFloat(e.target.value) : null)} placeholder="0" />
                            }
                          </div>
                        </div>
                        {(task.acceptance_criteria.length > 0 || !isReadOnly) && (
                          <div>
                            <button onClick={() => toggleCriteria(task.id)} className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: '#64748b' }}>
                              <span style={{ transform: isOpen ? 'rotate(90deg)' : 'none', display: 'inline-block', transition: 'transform 0.15s' }}>▶</span>
                              Kabul Kriterleri ({task.acceptance_criteria.length})
                            </button>
                            {isOpen && (
                              <div className="mt-2 space-y-1.5">
                                {task.acceptance_criteria.map((crit, ci) => (
                                  <div key={ci} className="flex items-center gap-2">
                                    <span className="text-xs" style={{ color: '#2288c9' }}>✓</span>
                                    {isReadOnly
                                      ? <span className="text-xs flex-1" style={{ color: '#374151' }}>{crit}</span>
                                      : <>
                                          <input className="flex-1 text-xs px-2 py-1 rounded-lg" style={{ border: '1px solid #e2e8f0', background: '#f8fafc', color: '#374151' }} value={crit} onChange={(e) => updateCriterion(task.id, ci, e.target.value)} placeholder="Kriter…" />
                                          <button onClick={() => removeCriterion(task.id, ci)} className="text-xs shrink-0" style={{ color: '#dc2626' }}>✕</button>
                                        </>
                                    }
                                  </div>
                                ))}
                                {!isReadOnly && <button onClick={() => addCriterion(task.id)} className="text-xs font-semibold mt-1" style={{ color: '#2288c9' }}>+ Kriter Ekle</button>}
                              </div>
                            )}
                          </div>
                        )}
                        {!isReadOnly && isReviseOpen && (
                          <div className="rounded-xl p-3 space-y-2" style={{ background: 'rgba(34,136,201,0.06)', border: '1px solid rgba(34,136,201,0.2)' }}>
                            <p className="text-xs font-semibold" style={{ color: '#2288c9' }}>✎ Bu görevi revize et</p>
                            <textarea className="input text-xs w-full resize-none" rows={2} value={taskReviseInputs[task.id] ?? ''} onChange={(e) => setTaskReviseInputs((prev) => ({ ...prev, [task.id]: e.target.value }))} placeholder="Örn: Açıklamayı daha teknik yap, önceliği yükselt…" disabled={isRevisingThis} />
                            <div className="flex gap-2">
                              <button onClick={() => handleReviseTask(task.id)} disabled={isRevisingThis || !taskReviseInputs[task.id]?.trim()} className="px-3 py-1.5 rounded-lg text-xs font-bold text-white disabled:opacity-40 flex items-center gap-1.5" style={{ background: 'linear-gradient(135deg, #2abbd5, #2288c9)' }}>
                                {isRevisingThis ? <><Spinner size={3} /> Revize ediliyor…</> : '↻ Revize Et'}
                              </button>
                              <button onClick={() => toggleReviseInput(task.id)} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: '#f1f5f9', color: '#64748b' }}>İptal</button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}

                {selectedSet.status === 'draft' && (
                  <div className="ai-card rounded-2xl overflow-hidden" style={cardStyle}>
                    <div className="px-5 py-4" style={{ ...hg, borderBottom: '1px solid #dce8f0', borderLeft: '3px solid #2563eb', paddingLeft: '18px' }}>
                      <h3 className="text-sm font-bold tracking-tight" style={{ color: '#0f172a' }}>AI — Tüm Listeyi Revize Et</h3>
                      <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>Notunuzu girin, AI yeni versiyon oluştursun (önceki korunur)</p>
                    </div>
                    <div className="p-5 space-y-3">
                      <textarea className="input text-sm w-full resize-none" rows={3} value={revisionNote} onChange={(e) => setRevisionNote(e.target.value)} placeholder="Örn: Test görevlerini çıkar, belgeleme görevlerini daha detaylı hale getir…" />
                      <button onClick={handleRevise} disabled={revising || !revisionNote.trim()} className="btn-secondary w-full disabled:opacity-50" style={{ justifyContent: 'center' }}>
                        {revising ? <><Spinner size={4} /> Revize ediliyor…</> : '↻ AI Revize Et'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-2xl flex flex-col items-center justify-center text-center p-12 lg:min-h-[400px]" style={{ background: '#fff', border: '1px dashed #e2e8f0' }}>
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: '#f1f5f9' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 12h8M12 8v8"/></svg>
                </div>
                <p className="text-base font-semibold" style={{ color: '#374151' }}>Taslak seçin veya yeni oluşturun</p>
                <p className="text-sm mt-2" style={{ color: '#94a3b8' }}>Soldaki listeden bir taslak seçin ya da hedef girerek yeni bir görev seti oluşturun</p>
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            TAB 2 — Sprint & İş Yükü
        ════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'sprint' && (
          <div className="ai-tab-content grid grid-cols-1 lg:grid-cols-2 gap-5">

            {/* Sprint Risk Analizi */}
            <div className="ai-card rounded-2xl overflow-hidden" style={cardStyle}>
              <div className="px-5 py-4" style={{ ...hg, borderBottom: '1px solid #dce8f0', borderLeft: '3px solid #2563eb', paddingLeft: '18px' }}>
                <h2 className="text-sm font-bold tracking-tight" style={{ color: '#0f172a' }}>Sprint Risk Analizi</h2>
                <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>Sprint görevlerini analiz et, risk hesapla</p>
              </div>
              <div className="p-5 space-y-4">
                {sprints.length > 0 && (
                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: '#64748b' }}>Sprint Seç</label>
                    <select className="input text-sm w-full" value={selectedSprintId} onChange={(e) => setSelectedSprintId(e.target.value)}>
                      <option value="">— Aktif sprint —</option>
                      {sprints.map((s: any) => <option key={s.id} value={s.id}>{s.name}{s.status === 'active' ? ' (Aktif)' : ''}</option>)}
                    </select>
                  </div>
                )}
                <button onClick={handleSprintAnalysis} disabled={sprintLoading} className="btn-primary w-full disabled:opacity-50" style={{ justifyContent: 'center' }}>
                  {sprintLoading ? <><Spinner size={4} /> Analiz ediliyor…</> : 'Analiz Et'}
                </button>
                {sprintError && <ErrorBox msg={sprintError} />}
                {sprintResult && (
                  <div className="ai-result-item space-y-4">
                    <div className="rounded-xl p-4" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold" style={{ color: '#374151' }}>Risk Skoru</span>
                        <RiskBadge level={sprintResult.risk_level} />
                      </div>
                      <div className="h-3 rounded-full overflow-hidden" style={{ background: '#e2e8f0' }}>
                        <div className="ai-bar-fill h-full rounded-full" style={{ width: `${sprintResult.risk_score}%`, background: sprintResult.risk_score > 70 ? '#dc2626' : sprintResult.risk_score > 40 ? '#d97706' : '#16a34a' }} />
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-xs" style={{ color: '#94a3b8' }}>0</span>
                        <span className="text-xs font-bold" style={{ color: '#374151' }}>{sprintResult.risk_score}/100</span>
                        <span className="text-xs" style={{ color: '#94a3b8' }}>100</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between rounded-xl px-4 py-3" style={{ background: 'rgba(34,136,201,0.06)', border: '1px solid rgba(34,136,201,0.15)' }}>
                      <span className="text-sm font-semibold" style={{ color: '#374151' }}>Başarı Olasılığı</span>
                      <span className="text-xl font-bold" style={{ color: sprintResult.success_probability >= 60 ? '#059669' : '#dc2626' }}>%{sprintResult.success_probability}</span>
                    </div>
                    <p className="text-sm leading-relaxed" style={{ color: '#64748b' }}>{sprintResult.summary}</p>
                    {sprintResult.at_risk_tasks?.length > 0 && (
                      <div>
                        <h3 className="text-xs font-bold mb-2" style={{ color: '#374151' }}>Risk Altındaki Görevler ({sprintResult.at_risk_tasks.length})</h3>
                        <div className="space-y-2">
                          {sprintResult.at_risk_tasks.map((t: any, i: number) => (
                            <div key={i} className="rounded-lg px-3 py-2" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-xs font-semibold" style={{ color: '#374151' }}>{t.title}</p>
                                <RiskBadge level={t.risk_level} />
                              </div>
                              <p className="text-xs mt-1" style={{ color: '#64748b' }}>{t.risk_reason}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {sprintResult.recommendations?.length > 0 && (
                      <div>
                        <h3 className="text-xs font-bold mb-2" style={{ color: '#374151' }}>Öneriler</h3>
                        <ul className="space-y-1">
                          {sprintResult.recommendations.map((r: string, i: number) => (
                            <li key={i} className="text-xs flex items-start gap-2" style={{ color: '#64748b' }}><span className="shrink-0" style={{ color: '#2288c9' }}>→</span>{r}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* İş Yükü Optimizasyonu */}
            <div className="ai-card rounded-2xl overflow-hidden" style={cardStyle}>
              <div className="px-5 py-4" style={{ ...hg, borderBottom: '1px solid #dce8f0', borderLeft: '3px solid #2563eb', paddingLeft: '18px' }}>
                <h2 className="text-sm font-bold tracking-tight" style={{ color: '#0f172a' }}>İş Yükü Optimizasyonu</h2>
                <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>Kişi bazlı yük dağılımı ve öneriler</p>
              </div>
              <div className="p-5 space-y-4">
                <button onClick={handleWorkload} disabled={workloadLoading} className="btn-primary w-full disabled:opacity-50" style={{ justifyContent: 'center' }}>
                  {workloadLoading ? <><Spinner size={4} /> Analiz ediliyor…</> : 'Analiz Et'}
                </button>
                {workloadError && <ErrorBox msg={workloadError} />}
                {workloadResult && (
                  <div className="ai-result-item space-y-4">
                    <p className="text-sm leading-relaxed" style={{ color: '#64748b' }}>{workloadResult.summary}</p>
                    {workloadResult.team?.length > 0 && (
                      <div>
                        <h3 className="text-xs font-bold mb-2" style={{ color: '#374151' }}>Ekip İş Yükü</h3>
                        <div className="space-y-2">
                          {workloadResult.team.map((m: any, i: number) => {
                            const sc: Record<string, { bg: string; color: string; label: string }> = {
                              ok:          { bg: '#d1fae5', color: '#059669', label: 'Dengeli' },
                              busy:        { bg: '#fef3c7', color: '#d97706', label: 'Yoğun' },
                              overloaded:  { bg: '#fee2e2', color: '#dc2626', label: 'Aşırı' },
                              underloaded: { bg: '#f1f5f9', color: '#64748b', label: 'Az' },
                            }
                            const s = sc[m.status] ?? sc.ok
                            return (
                              <div key={i} className="rounded-lg px-3 py-2 flex items-center gap-3" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold truncate" style={{ color: '#374151' }}>{m.name}</p>
                                  <p className="text-xs" style={{ color: '#94a3b8' }}>{m.task_count} görev · {m.estimated_hours} sa</p>
                                </div>
                                <span className="px-2 py-0.5 rounded-full text-xs font-bold shrink-0" style={{ background: s.bg, color: s.color }}>{s.label}</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                    {workloadResult.suggestions?.length > 0 && (
                      <div>
                        <h3 className="text-xs font-bold mb-2" style={{ color: '#374151' }}>Yeniden Atama Önerileri</h3>
                        <div className="space-y-2">
                          {workloadResult.suggestions.map((s: any, i: number) => (
                            <div key={i} className="rounded-lg px-3 py-2" style={{ background: 'rgba(34,136,201,0.04)', border: '1px solid rgba(34,136,201,0.12)' }}>
                              <p className="text-xs font-semibold" style={{ color: '#374151' }}>{s.task_title}</p>
                              <p className="text-xs mt-0.5" style={{ color: '#64748b' }}><span style={{ color: '#dc2626' }}>{s.from}</span> → <span style={{ color: '#059669' }}>{s.to}</span></p>
                              <p className="text-xs mt-0.5" style={{ color: '#94a3b8' }}>{s.reason}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            TAB 3 — Raporlama
        ════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'reports' && (
          <div className="ai-tab-content grid grid-cols-1 lg:grid-cols-2 gap-5">

            {/* Haftalık Rapor */}
            <div className="ai-card rounded-2xl overflow-hidden" style={cardStyle}>
              <div className="px-5 py-4" style={{ ...hg, borderBottom: '1px solid #dce8f0', borderLeft: '3px solid #2563eb', paddingLeft: '18px' }}>
                <h2 className="text-sm font-bold tracking-tight" style={{ color: '#0f172a' }}>Haftalık Rapor</h2>
                <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>Son 7 günün özeti + AI yorumu + PDF indir</p>
              </div>
              <div className="p-5 space-y-4">
                <button onClick={handleWeeklyReport} disabled={weeklyLoading} className="btn-primary w-full disabled:opacity-50" style={{ justifyContent: 'center' }}>
                  {weeklyLoading ? <><Spinner size={4} /> Rapor oluşturuluyor…</> : 'Rapor Oluştur'}
                </button>
                {weeklyError && <ErrorBox msg={weeklyError} />}
                {weeklyResult && (
                  <div className="ai-result-item space-y-4">
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 8 }}>
                      {[
                        { label: 'Tamamlanan', value: weeklyResult.completed_count,   color: '#166534', bg: '#dcfce7', border: '#86efac' },
                        { label: 'Geciken',    value: weeklyResult.overdue_count,     color: '#991b1b', bg: '#fee2e2', border: '#fca5a5' },
                        { label: 'Kritik',     value: weeklyResult.critical_count,    color: '#92400e', bg: '#fef3c7', border: '#fcd34d' },
                        { label: 'Performans', value: weeklyResult.performance_score, color: '#1e40af', bg: '#dbeafe', border: '#93c5fd' },
                      ].map((s) => (
                        <div key={s.label} className="rounded-xl p-3 text-center" style={{ background: s.bg, border: `1px solid ${s.border}` }}>
                          <p className="text-xl font-bold" style={{ color: s.color }}>{s.value}</p>
                          <p className="text-xs mt-0.5 font-medium" style={{ color: s.color, opacity: 0.8 }}>{s.label}</p>
                        </div>
                      ))}
                    </div>
                    {weeklyResult.ai_comment && (
                      <div className="rounded-xl px-4 py-3" style={{ background: 'rgba(34,136,201,0.05)', border: '1px solid rgba(34,136,201,0.15)' }}>
                        <p className="text-xs font-bold mb-1" style={{ color: '#2288c9' }}>AI Yorumu</p>
                        <p className="text-sm leading-relaxed" style={{ color: '#475569' }}>{weeklyResult.ai_comment}</p>
                      </div>
                    )}
                    {weeklyResult.highlights?.length > 0 && (
                      <div>
                        <h3 className="text-xs font-bold mb-1" style={{ color: '#059669' }}>✓ Başarılar</h3>
                        <ul className="space-y-1">{weeklyResult.highlights.map((h: string, i: number) => <li key={i} className="text-xs" style={{ color: '#64748b' }}>• {h}</li>)}</ul>
                      </div>
                    )}
                    {weeklyResult.concerns?.length > 0 && (
                      <div>
                        <h3 className="text-xs font-bold mb-1" style={{ color: '#dc2626' }}>⚠ Endişeler</h3>
                        <ul className="space-y-1">{weeklyResult.concerns.map((c: string, i: number) => <li key={i} className="text-xs" style={{ color: '#64748b' }}>• {c}</li>)}</ul>
                      </div>
                    )}
                    {weeklyResult.next_week_focus && (
                      <div>
                        <h3 className="text-xs font-bold mb-1" style={{ color: '#374151' }}>Önümüzdeki Hafta</h3>
                        <p className="text-xs" style={{ color: '#64748b' }}>{weeklyResult.next_week_focus}</p>
                      </div>
                    )}
                    <button onClick={handleDownloadPDF} className="w-full py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2" style={{ background: 'linear-gradient(135deg, #2abbd5, #2288c9)', color: '#fff' }}>
                      ↓ PDF İndir
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Gecikme Tahmini */}
            <div className="ai-card rounded-2xl overflow-hidden" style={cardStyle}>
              <div className="px-5 py-4" style={{ ...hg, borderBottom: '1px solid #dce8f0', borderLeft: '3px solid #2563eb', paddingLeft: '18px' }}>
                <h2 className="text-sm font-bold tracking-tight" style={{ color: '#0f172a' }}>Gecikme Tahmini</h2>
                <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>Geçmiş veriye göre gecikme olasılığı</p>
              </div>
              <div className="p-5 space-y-4">
                <button onClick={handleDelayPrediction} disabled={delayLoading} className="btn-primary w-full disabled:opacity-50" style={{ justifyContent: 'center' }}>
                  {delayLoading ? <><Spinner size={4} /> Tahmin yapılıyor…</> : 'Tahmin Yap'}
                </button>
                {delayError && <ErrorBox msg={delayError} />}
                {delayResult && (
                  <div className="space-y-4">
                    {delayResult.overall_risk && (
                      <div className="flex items-center justify-between rounded-xl px-4 py-3" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                        <span className="text-sm font-semibold" style={{ color: '#374151' }}>Genel Risk</span>
                        <RiskBadge level={delayResult.overall_risk} />
                      </div>
                    )}
                    {delayResult.summary && <p className="text-sm leading-relaxed" style={{ color: '#64748b' }}>{delayResult.summary}</p>}
                    {delayResult.predictions?.length > 0 && (
                      <div>
                        <h3 className="text-xs font-bold mb-2" style={{ color: '#374151' }}>Görev Tahminleri ({delayResult.predictions.length})</h3>
                        <div className="space-y-3">
                          {delayResult.predictions.map((p: any, i: number) => (
                            <div key={i} className="rounded-lg p-3 space-y-2" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-xs font-semibold" style={{ color: '#374151' }}>{p.title}</p>
                                <span className="text-xs font-bold shrink-0" style={{ color: p.delay_probability >= 70 ? '#dc2626' : p.delay_probability >= 40 ? '#d97706' : '#059669' }}>%{p.delay_probability}</span>
                              </div>
                              <div className="h-2 rounded-full" style={{ background: '#e2e8f0' }}>
                                <div className="ai-bar-fill h-full rounded-full" style={{ width: `${p.delay_probability}%`, background: p.delay_probability >= 70 ? '#dc2626' : p.delay_probability >= 40 ? '#d97706' : '#16a34a' }} />
                              </div>
                              {p.assignee && <p className="text-xs" style={{ color: '#94a3b8' }}>Kişi: {p.assignee}</p>}
                              {p.reason && <p className="text-xs" style={{ color: '#64748b' }}>{p.reason}</p>}
                              {p.suggested_action && <p className="text-xs px-2 py-1 rounded-lg" style={{ background: 'rgba(34,136,201,0.06)', color: '#2288c9' }}>→ {p.suggested_action}</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            TAB 4 — İçerik Analizi
        ════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'analysis' && (
          <div className="ai-tab-content grid grid-cols-1 lg:grid-cols-2 gap-5">

            {/* Toplantı Özeti */}
            <div className="ai-card rounded-2xl overflow-hidden" style={cardStyle}>
              <div className="px-5 py-4" style={{ ...hg, borderBottom: '1px solid #dce8f0', borderLeft: '3px solid #2563eb', paddingLeft: '18px' }}>
                <h2 className="text-sm font-bold tracking-tight" style={{ color: '#0f172a' }}>Toplantı Özeti</h2>
                <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>Notları yapıştır → özet + aksiyonlar + görev önerileri</p>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: '#64748b' }}>Toplantı Notları</label>
                  <textarea className="input text-sm w-full" rows={8} value={meetingNotes} onChange={(e) => setMeetingNotes(e.target.value)} placeholder={`Toplantı notlarını buraya yapıştırın…\n\nTarih, katılımcılar, kararlar, aksiyon maddeleri…`} />
                </div>
                <button onClick={handleMeetingSummary} disabled={meetingLoading || !meetingNotes.trim()} className="btn-primary w-full disabled:opacity-50" style={{ justifyContent: 'center' }}>
                  {meetingLoading ? <><Spinner size={4} /> Özet oluşturuluyor…</> : 'Özet Çıkar'}
                </button>
                {meetingError && <ErrorBox msg={meetingError} />}
                {meetingResult && (
                  <div className="ai-result-item space-y-4">
                    {meetingResult.summary && (
                      <div>
                        <h3 className="text-xs font-bold mb-1" style={{ color: '#374151' }}>Özet</h3>
                        <p className="text-sm leading-relaxed" style={{ color: '#64748b' }}>{meetingResult.summary}</p>
                      </div>
                    )}
                    {meetingResult.key_topics?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {meetingResult.key_topics.map((t: string, i: number) => (
                          <span key={i} className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: 'rgba(34,136,201,0.1)', color: '#2288c9' }}>{t}</span>
                        ))}
                      </div>
                    )}
                    {meetingResult.decisions?.length > 0 && (
                      <div>
                        <h3 className="text-xs font-bold mb-1" style={{ color: '#374151' }}>Kararlar</h3>
                        <ul className="space-y-1">
                          {meetingResult.decisions.map((d: string, i: number) => (
                            <li key={i} className="text-xs flex items-start gap-2" style={{ color: '#64748b' }}><span className="shrink-0" style={{ color: '#2288c9' }}>✓</span>{d}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {meetingResult.action_items?.length > 0 && (
                      <div>
                        <h3 className="text-xs font-bold mb-2" style={{ color: '#374151' }}>Aksiyon Maddeleri</h3>
                        <div className="space-y-2">
                          {meetingResult.action_items.map((a: any, i: number) => (
                            <div key={i} className="rounded-lg px-3 py-2" style={{ background: 'rgba(34,136,201,0.05)', border: '1px solid rgba(34,136,201,0.12)' }}>
                              <p className="text-xs font-semibold" style={{ color: '#374151' }}>{a.item}</p>
                              {(a.owner || a.due) && <p className="text-xs mt-0.5" style={{ color: '#94a3b8' }}>{a.owner}{a.due ? ` · ${a.due}` : ''}</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {meetingResult.suggested_tasks?.length > 0 && (
                      <div>
                        <h3 className="text-xs font-bold mb-2" style={{ color: '#374151' }}>Önerilen Görevler ({meetingResult.suggested_tasks.length})</h3>
                        <div className="space-y-2">
                          {meetingResult.suggested_tasks.map((t: any, i: number) => {
                            const prio = PRIORITY_OPTIONS.find((p) => p.value === t.priority) ?? PRIORITY_OPTIONS[2]
                            return (
                              <div key={i} className="rounded-lg px-3 py-2" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                                <div className="flex items-start justify-between gap-2">
                                  <p className="text-xs font-semibold" style={{ color: '#374151' }}>{t.title}</p>
                                  <span className="px-1.5 py-0.5 rounded-full text-xs font-bold shrink-0" style={{ background: prio.bg, color: prio.color }}>{prio.label}</span>
                                </div>
                                {t.description && <p className="text-xs mt-0.5" style={{ color: '#94a3b8' }}>{t.description}</p>}
                                {t.estimated_hours && <p className="text-xs mt-0.5" style={{ color: '#94a3b8' }}>{t.estimated_hours} sa tahmini</p>}
                              </div>
                            )
                          })}
                        </div>
                        <button onClick={handleAddSuggestedTasks} disabled={addingDraft} className="mt-3 w-full py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2" style={{ background: 'linear-gradient(135deg, #2abbd5, #2288c9)', color: '#fff' }}>
                          {addingDraft ? <><Spinner size={3} /> Ekleniyor…</> : "+ Görevleri Draft'a Ekle"}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Doküman Analizi */}
            <div className="ai-card rounded-2xl overflow-hidden" style={cardStyle}>
              <div className="px-5 py-4" style={{ ...hg, borderBottom: '1px solid #dce8f0', borderLeft: '3px solid #2563eb', paddingLeft: '18px' }}>
                <h2 className="text-sm font-bold tracking-tight" style={{ color: '#0f172a' }}>Doküman Analizi</h2>
                <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>PDF/TXT yükle → riskler, boşluklar, tutarsızlıklar</p>
              </div>
              <div className="p-5 space-y-4">
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-xl p-6 text-center cursor-pointer transition-all"
                  style={{ border: `2px dashed ${docFile ? 'rgba(42,187,213,0.5)' : '#cbd5e1'}`, background: docFile ? 'rgba(42,187,213,0.04)' : '#f8fafc' }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) { setDocFile(f); setDocResult(null) } }}
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-2" style={{ background: docFile ? 'rgba(34,136,201,0.08)' : '#f1f5f9' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={docFile ? '#2288c9' : '#94a3b8'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  </div>
                  {docFile ? (
                    <>
                      <p className="text-sm font-semibold" style={{ color: '#374151' }}>{docFile.name}</p>
                      <p className="text-xs mt-1" style={{ color: '#94a3b8' }}>{(docFile.size / 1024).toFixed(1)} KB</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-semibold" style={{ color: '#374151' }}>Dosyayı buraya sürükleyin</p>
                      <p className="text-xs mt-1" style={{ color: '#94a3b8' }}>veya tıklayarak seçin · PDF, TXT · Max 10MB</p>
                    </>
                  )}
                  <input ref={fileInputRef} type="file" accept=".pdf,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setDocFile(f); setDocResult(null) } }} />
                </div>
                {docFile && (
                  <button onClick={() => { setDocFile(null); setDocResult(null); if (fileInputRef.current) fileInputRef.current.value = '' }} className="text-xs font-semibold" style={{ color: '#dc2626' }}>
                    ✕ Dosyayı Kaldır
                  </button>
                )}
                <button onClick={handleDocumentAnalysis} disabled={docLoading || !docFile} className="btn-primary w-full disabled:opacity-50" style={{ justifyContent: 'center' }}>
                  {docLoading ? <><Spinner size={4} /> Analiz ediliyor…</> : 'Analiz Et'}
                </button>
                {docError && <ErrorBox msg={docError} />}
                {docResult && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between rounded-xl px-4 py-3" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                      <div>
                        <p className="text-xs font-bold" style={{ color: '#374151' }}>{docResult.analysis.document_type}</p>
                        <p className="text-xs mt-0.5" style={{ color: '#94a3b8' }}>{docResult.fileName}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold" style={{ color: '#2288c9' }}>{docResult.analysis.readiness_score}</p>
                        <p className="text-xs" style={{ color: '#94a3b8' }}>Hazırlık</p>
                      </div>
                    </div>
                    {docResult.analysis.summary && <p className="text-sm leading-relaxed" style={{ color: '#64748b' }}>{docResult.analysis.summary}</p>}
                    {docResult.analysis.risks?.length > 0 && (
                      <div>
                        <h3 className="text-xs font-bold mb-2" style={{ color: '#dc2626' }}>Riskler ({docResult.analysis.risks.length})</h3>
                        <div className="space-y-2">
                          {docResult.analysis.risks.map((r: any, i: number) => (
                            <div key={i} className="rounded-lg px-3 py-2" style={{ background: '#fff7f7', border: '1px solid #fecaca' }}>
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-xs font-semibold" style={{ color: '#374151' }}>{r.title}</p>
                                <RiskBadge level={r.severity} />
                              </div>
                              <p className="text-xs mt-1" style={{ color: '#64748b' }}>{r.description}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {docResult.analysis.gaps?.length > 0 && (
                      <div>
                        <h3 className="text-xs font-bold mb-2" style={{ color: '#d97706' }}>Eksiklikler ({docResult.analysis.gaps.length})</h3>
                        <div className="space-y-2">
                          {docResult.analysis.gaps.map((g: any, i: number) => (
                            <div key={i} className="rounded-lg px-3 py-2" style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
                              <p className="text-xs font-semibold" style={{ color: '#374151' }}>{g.title ?? g}</p>
                              {g.description && <p className="text-xs mt-1" style={{ color: '#64748b' }}>{g.description}</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {docResult.analysis.inconsistencies?.length > 0 && (
                      <div>
                        <h3 className="text-xs font-bold mb-2" style={{ color: '#7c3aed' }}>Tutarsızlıklar ({docResult.analysis.inconsistencies.length})</h3>
                        <div className="space-y-2">
                          {docResult.analysis.inconsistencies.map((inc: any, i: number) => (
                            <div key={i} className="rounded-lg px-3 py-2" style={{ background: '#faf5ff', border: '1px solid #ddd6fe' }}>
                              <p className="text-xs font-semibold" style={{ color: '#374151' }}>{inc.title ?? inc}</p>
                              {inc.description && <p className="text-xs mt-1" style={{ color: '#64748b' }}>{inc.description}</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {docResult.analysis.recommendations?.length > 0 && (
                      <div>
                        <h3 className="text-xs font-bold mb-1" style={{ color: '#059669' }}>✓ Öneriler</h3>
                        <ul className="space-y-1">
                          {docResult.analysis.recommendations.map((r: string, i: number) => (
                            <li key={i} className="text-xs flex items-start gap-2" style={{ color: '#64748b' }}><span className="shrink-0" style={{ color: '#059669' }}>→</span>{r}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  )
}

export default function AIAssistantPage() {
  return (
    <FeatureGate feature="ai_assistant">
      <AIAssistantContent />
    </FeatureGate>
  )
}
