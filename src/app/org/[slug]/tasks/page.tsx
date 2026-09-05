'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { kapsamaGoreSuz } from '@/lib/taskScope'
import { raporGorebilirMi, yazabilirMi } from '@/lib/roller'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { createNotification } from '@/lib/notifications'
import { useOrg } from '@/lib/supabase/orgContext'
import { useIsMobile } from '@/lib/useIsMobile'
import { getCachedData, setCachedData } from '@/lib/pageDataCache'
import { useGorevFiltreleri, gorevleriSuz } from '@/lib/useGorevFiltreleri'
import { gorevleriGorunumeGoreSuz, gorulebilirGorunumler, type GorunumBaglami } from '@/lib/gorevGorunumleri'
import { aranabilirMetin, aramaTokenlari, aramaEslesirMi } from '@/lib/gorevArama'
import GorevAramaVeGorunumler from './_components/GorevAramaVeGorunumler'
import GorevFiltrePaneli from './_components/GorevFiltrePaneli'
import GorevListesi from './_components/GorevListesi'
import GorevFormModal, { type GorevFormPayload } from './_components/GorevFormModal'
import { STATUS_OPTIONS, type TaskWithAssignee } from './_components/gorevMeta'
import type { Task, Profile, Sprint } from '@/types/database'

type TasksPageCache = { tasks: TaskWithAssignee[]; members: Profile[]; sprints: Sprint[] }

/**
 * Görevler ekranı.
 *
 * Faz 1'de bu dosya 1157 satırdı ve içinde mobil/masaüstü için İKİ ayrı JSX
 * ağacı vardı — form, filtreler ve liste satırı iki kez yazılmıştı. Artık tek
 * ağaç: bölümler `_components/` altında, filtre durumu
 * `lib/useGorevFiltreleri.ts`'te. `useIsMobile` yalnızca DOM'un gerçekten
 * farklılaştığı yerde (FAB ↔ düğme, kart ↔ satır) kullanılıyor.
 *
 * Faz 2'de sürekli ekranda duran kontrol sayısı 11'den 3'e indi: hazır
 * görünümler, arama ve tek "Filtrele" düğmesi. Detaylar rozetli düğmenin
 * arkasındaki panelde ve artık iki breakpoint'te de AYNI küme.
 */
export default function TasksPage() {
  const router = useRouter()
  const { org, orgRole, userIl, userId, loading: orgLoading } = useOrg()
  const isMobile = useIsMobile()

  // Senkron cache init
  const _initKey   = org?.id ? `tasks:${org.id}` : ''
  const _initCache = _initKey ? getCachedData<TasksPageCache>(_initKey) : null

  const [currentUserId, setCurrentUserId] = useState<string | null>(userId ?? null)
  const [tasks, setTasks] = useState<TaskWithAssignee[]>(_initCache?.tasks ?? [])
  const [members, setMembers] = useState<Profile[]>(_initCache?.members ?? [])
  const [sprints, setSprints] = useState<Sprint[]>(_initCache?.sprints ?? [])
  const [loading, setLoading] = useState(_initCache === null)

  // Görünümler role bağlı: İl Sorumlusu "Bana atananlar" ile açılır,
  // "Atanmamış" görünümünü yalnızca atama yetkisi olanlar görür.
  const gorunumBaglami: GorunumBaglami = useMemo(
    () => ({ role: orgRole ?? null, userId: userId ?? '', userIl: userIl ?? null }),
    [orgRole, userId, userIl],
  )

  const {
    filtreler, ayarla, temizle, filtreSayisi,
    gorunum, setGorunum, q, setQ, qUygulanan,
  } = useGorevFiltreleri(gorunumBaglami)

  const [showForm, setShowForm] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [filtrePaneliAcik, setFiltrePaneliAcik] = useState(false)

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
    setShowForm(true)
  }

  function openEditForm(task: Task) {
    setEditingTask(task)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingTask(null)
  }

  /** Drive'a parçalı yükleme. İlk hatayı döndürür (yoksa null). */
  async function uploadTaskFiles(files: File[], taskId: string): Promise<string | null> {
    let ilkHata: string | null = null
    const hata = (m: string) => { if (!ilkHata) ilkHata = m }

    for (const f of files) {
      try {
        const sr = await fetch('/api/drive/upload-session', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: f.name, mimeType: f.type || 'application/octet-stream', orgId: org?.id ?? '' }),
        })
        const sd = await sr.json().catch(() => ({}))
        if (!sr.ok || !sd.uploadUri) { hata(`"${f.name}" yüklenemedi: ${sd.error || 'Oturum hatası'}`); continue }
        const CHUNK = 3 * 1024 * 1024
        const mime = f.type || 'application/octet-stream'
        const proxyBase = `/api/drive/upload-proxy?uploadUri=${encodeURIComponent(sd.uploadUri)}`
        let offset = 0; let df: Record<string, unknown> = {}
        while (offset < f.size) {
          const end = Math.min(offset + CHUNK, f.size)
          const pr = await fetch(proxyBase, { method: 'POST', headers: { 'Content-Type': mime, 'X-Content-Range': `bytes ${offset}-${end - 1}/${f.size}` }, body: f.slice(offset, end) })
          if (!pr.ok) { hata(`"${f.name}" yüklenemedi: Drive hatası (${pr.status}).`); break }
          const res = await pr.json().catch(() => ({}))
          if (res.partial) { offset = res.nextByte ?? end } else { df = res; break }
        }
        if (!df.id) { hata(`"${f.name}" yüklenemedi: Dosya ID alınamadı.`); continue }
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
        if (!cr.ok || cd.error) hata(`"${f.name}" yüklenemedi: ${cd.error || 'Kayıt hatası'}`)
      } catch { hata(`"${f.name}" yüklenemedi: Bağlantı hatası.`) }
    }
    return ilkHata
  }

  /** Formun kaydetme yolu. Hata mesajı döndürürse modal açık kalır. */
  async function handleFormSubmit(payload: GorevFormPayload, files: File[]): Promise<string | null> {
    if (!currentUserId) return 'Oturum bulunamadı.'

    const actorName = members.find((m) => m.id === currentUserId)?.full_name ?? null

    if (editingTask) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('tasks').update(payload).eq('id', editingTask.id)
      if (error) return 'Görev güncellenirken hata oluştu.'

      // Yeni atama bildirimi
      if (payload.assignee_id && payload.assignee_id !== currentUserId && payload.assignee_id !== editingTask.assignee_id) {
        await createNotification({
          user_id: payload.assignee_id, type: 'task', event_type: 'task_assigned',
          title: 'Görev Size Atandı',
          description: `"${payload.title}" görevi size atandı.`,
          actor_id: currentUserId, actor_name: actorName,
          link: `/org/${org!.slug}/tasks/${editingTask.id}`,
          entity_key: `task:${editingTask.id}`,
          org_id: org?.id,
        })
      }
      // Durum değişikliği bildirimi
      if (payload.status !== editingTask.status && editingTask.assignee_id && editingTask.assignee_id !== currentUserId) {
        const statusLabel = STATUS_OPTIONS.find((s) => s.value === payload.status)?.label ?? payload.status
        await createNotification({
          user_id: editingTask.assignee_id, type: 'task', event_type: 'task_status_changed',
          title: 'Görev Durumu Değişti',
          description: `"${payload.title}" görevi "${statusLabel}" durumuna taşındı.`,
          actor_id: currentUserId, actor_name: actorName,
          link: `/org/${org!.slug}/tasks/${editingTask.id}`,
          entity_key: `task:${editingTask.id}:status`,
          org_id: org?.id,
        })
      }

      if (files.length > 0) await uploadTaskFiles(files, editingTask.id)
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: newTask, error } = await (supabase as any).from('tasks').insert({ ...payload, created_by: currentUserId, organization_id: org!.id }).select('id').single()
      if (error) return 'Görev oluşturulurken hata oluştu.'

      // Atama bildirimi
      if (payload.assignee_id && payload.assignee_id !== currentUserId && newTask?.id) {
        await createNotification({
          user_id: payload.assignee_id, type: 'task', event_type: 'task_assigned',
          title: 'Yeni Görev Atandı',
          description: `"${payload.title}" görevi size atandı.`,
          actor_id: currentUserId, actor_name: actorName,
          link: `/org/${org!.slug}/tasks/${newTask.id}`,
          entity_key: `task:${newTask.id}`,
          org_id: org?.id,
        })
      }

      if (files.length > 0 && newTask?.id) await uploadTaskFiles(files, newTask.id)
    }

    closeForm()
    await loadTasks()
    return null
  }

  async function handleDelete(taskId: string) {
    if (!confirm('Bu görevi silmek istediğinize emin misiniz?')) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('tasks').delete().eq('id', taskId)
    await loadTasks()
  }

  // PRD madde 2: "yalnızca ilgili görevleri görür" — kural lib/taskScope.ts'te.
  // Tüm sayaçların tabanı daima bu liste; ham `tasks` değil.
  const gorunurTasks = kapsamaGoreSuz(tasks, { role: orgRole!, userId: userId ?? '', il: userIl })

  const kullanilanIller = Array.from(
    new Set(gorunurTasks.map(t => t.il).filter((il): il is string => !!il))
  ).sort((a, b) => a.localeCompare(b, 'tr'))

  // Süzme sırası: kapsam → filtreler → arama → görünüm.
  // Görünüm en sonda çünkü chip sayaçları "bu görünüme geçersem, ŞU ANKİ
  // filtre ve aramayla kaç görev görürüm" sorusunu yanıtlamalı.
  const filtrelenmis = gorevleriSuz(gorunurTasks, filtreler)

  // Katlanmış metinler görev listesi değişince hesaplanır; her tuş vuruşunda
  // yeniden katlamak arama kutusunu takılmalı hissettiriyordu.
  const aramaMetinleri = useMemo(() => {
    const harita = new Map<string, string>()
    for (const t of gorunurTasks) harita.set(t.id, aranabilirMetin(t))
    return harita
  }, [gorunurTasks])

  const arananlar = useMemo(() => {
    const tokenlar = aramaTokenlari(qUygulanan)
    if (tokenlar.length === 0) return filtrelenmis
    return filtrelenmis.filter(t => aramaEslesirMi(aramaMetinleri.get(t.id) ?? '', tokenlar))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtrelenmis, qUygulanan, aramaMetinleri])

  const filteredTasks = gorevleriGorunumeGoreSuz(arananlar, gorunum, gorunumBaglami)

  const gorunumSayaclari = useMemo(() => {
    const s: Record<string, number> = {}
    for (const g of gorulebilirGorunumler(gorunumBaglami)) {
      s[g.id] = gorevleriGorunumeGoreSuz(arananlar, g.id, gorunumBaglami).length
    }
    return s
  }, [arananlar, gorunumBaglami])

  const yazabilir = yazabilirMi(orgRole)

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

  return (
    <div className="min-h-screen pb-20 md:pb-0 bg-[#f0f4f8] md:bg-[#f5f7fa]">
      <main className="w-full px-4 py-4 md:px-6 md:py-5">

        {/* ── Başlık ── */}
        <div className="flex items-center justify-between gap-3 mb-4 md:mb-5">
          <div className="min-w-0">
            <h1 className="text-lg md:text-xl font-bold" style={{ color: '#111827', letterSpacing: '-0.02em' }}>Görevler</h1>
            <p className="text-xs md:text-sm mt-0.5" style={{ color: '#9ca3af' }}>
              {gorunurTasks.length} görev
              {filteredTasks.length !== gorunurTasks.length && <span> · <span style={{ color: '#2288c9' }}>{filteredTasks.length} gösteriliyor</span></span>}
            </p>
          </div>
          {/* Masaüstünde başlıkta düğmeler, mobilde FAB — mobilde başlık
              satırına iki düğme sığmıyor. */}
          {yazabilir && (
            <div className="hidden md:flex items-center gap-2 shrink-0">
              <Link
                href={`/org/${org?.slug}/tasks/import`}
                className="flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-xl transition-colors"
                style={{ background: '#fff', color: '#0f766e', border: '1px solid #5eead4', textDecoration: 'none' }}
              >
                Excel&apos;den İçe Aktar
              </Link>
              <button
                onClick={openCreateForm}
                className="flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-xl transition-colors"
                style={{ background: '#2288c9', color: '#fff' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#1d78b8' }}
                onMouseLeave={e => { e.currentTarget.style.background = '#2288c9' }}
              >
                + Görev Oluştur
              </button>
            </div>
          )}
        </div>

        {/* ── Görünümler + arama + Filtrele ── */}
        <GorevAramaVeGorunumler
          baglam={gorunumBaglami}
          gorunum={gorunum} setGorunum={setGorunum}
          q={q} setQ={setQ}
          sayaclar={gorunumSayaclari}
          filtreSayisi={filtreSayisi}
          onFiltreAc={() => setFiltrePaneliAcik(true)}
        />

        {/* ── Liste ── */}
        <GorevListesi
          gorevler={filteredTasks}
          slug={org?.slug ?? ''}
          sprints={sprints}
          yazabilir={yazabilir}
          onEdit={openEditForm}
          onDelete={handleDelete}
        />
      </main>

      {/* Mobilde sabit FAB, masaüstünde başlıktaki düğme — DOM gerçekten farklı */}
      {isMobile && yazabilir && (
        <button onClick={openCreateForm} aria-label="Görev oluştur" style={{
          position: 'fixed', bottom: 24, right: 20, zIndex: 20,
          width: 52, height: 52, borderRadius: '50%', border: 'none',
          background: 'linear-gradient(135deg, #2288c9, #1d78b8)',
          color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 6px 20px rgba(34,136,201,0.45)',
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      )}

      <GorevFiltrePaneli
        acik={filtrePaneliAcik}
        onKapat={() => setFiltrePaneliAcik(false)}
        gorunurTasks={gorunurTasks}
        filtreler={filtreler} ayarla={ayarla} temizle={temizle}
        filtreSayisi={filtreSayisi}
        kullanilanIller={kullanilanIller} members={members}
      />

      <GorevFormModal
        open={showForm}
        editingTask={editingTask}
        members={members}
        sprints={sprints}
        onClose={closeForm}
        onSubmit={handleFormSubmit}
      />
    </div>
  )
}
