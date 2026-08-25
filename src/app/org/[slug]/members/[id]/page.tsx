'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { getSessionAndRole } from '@/lib/supabase/getSession'
import type { Profile, Task, Checkin } from '@/types/database'

const SKILL_OPTIONS = [
  'Mekanik Tasarım', 'Elektronik', 'Yazılım', 'Gömülü Sistemler',
  'PCB Tasarımı', '3D Modelleme', 'Proje Yönetimi', 'Test & Doğrulama',
  'Araştırma', 'Dokümantasyon', 'Üretim', 'Kalite Kontrol',
]

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  backlog: { label: 'Beklemede', color: '#64748b', bg: '#f1f5f9' },
  doing:   { label: 'Yapılıyor', color: '#2288c9', bg: '#e0f2fe' },
  testing: { label: 'Test',      color: '#d97706', bg: '#fef3c7' },
  blocked: { label: 'Bloke',     color: '#dc2626', bg: '#fee2e2' },
  done:    { label: 'Tamamlandı', color: '#059669', bg: '#d1fae5' },
}

const PRIORITY_LABELS: Record<string, { label: string; color: string }> = {
  critical: { label: 'Kritik',  color: '#dc2626' },
  high:     { label: 'Yüksek', color: '#d97706' },
  normal:   { label: 'Normal',  color: '#2288c9' },
  low:      { label: 'Düşük',   color: '#94a3b8' },
}

export default function MemberProfilePage() {
  const router = useRouter()
  const params = useParams()
  const memberId = params?.id as string
  const orgSlug  = params?.slug as string

  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null)
  const [adminEmail, setAdminEmail]       = useState('')
  const [profile, setProfile]             = useState<Profile | null>(null)
  const [tasks, setTasks]                 = useState<Task[]>([])
  const [checkins, setCheckins]           = useState<Checkin[]>([])
  const [loading, setLoading]             = useState(true)
  const [notFound, setNotFound]           = useState(false)

  // Düzenleme state'leri
  const [editName,   setEditName]   = useState('')
  const [editTitle,  setEditTitle]  = useState('')
  const [editBio,    setEditBio]    = useState('')
  const [editSkills, setEditSkills] = useState<string[]>([])
  const [saving,  setSaving]  = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    const [profileRes, tasksRes, checkinsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', memberId).single(),
      supabase.from('tasks').select('*').eq('assignee_id', memberId).order('due_date', { ascending: true }),
      supabase.from('checkins').select('*').eq('user_id', memberId).order('timestamp', { ascending: false }).limit(20),
    ])

    if (profileRes.error || !profileRes.data) {
      setNotFound(true)
      return
    }

    const p = profileRes.data as Profile
    setProfile(p)
    setEditName(p.full_name  || '')
    setEditTitle(p.title     || '')
    setEditBio(p.bio         || '')
    setEditSkills(p.skills   || [])
    setTasks(tasksRes.data   as Task[]    || [])
    setCheckins(checkinsRes.data as Checkin[] || [])
  }, [memberId])

  useEffect(() => {
    async function init() {
      const auth = await getSessionAndRole()
      if (!auth) { router.replace('/login'); return }
      if (auth.role !== 'admin') {
        router.replace(auth.role === 'consultant' ? '/consultant' : '/me')
        return
      }
      setAdminEmail(auth.email)
      setUserAvatarUrl(auth.avatarUrl ?? null)
      await loadData()
      setLoading(false)
    }
    init()
  }, [router, loadData])

  async function handleSave() {
    if (!profile) return
    setSaving(true)
    setSaveMsg(null)

    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: editName  || null,
        title:     editTitle || null,
        bio:       editBio   || null,
        skills:    editSkills,
      })
      .eq('id', profile.id)

    setSaving(false)
    if (error) {
      setSaveMsg(`Hata: ${error.message}`)
    } else {
      setSaveMsg('Kaydedildi ✓')
      setProfile({ ...profile, full_name: editName || null, title: editTitle || null, bio: editBio || null, skills: editSkills })
      setTimeout(() => setSaveMsg(null), 3000)
    }
  }

  function toggleSkill(skill: string) {
    setEditSkills((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill]
    )
  }

  /* ── Skeleton ── */
  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: '#f5f7fa' }}>
        <div
          className="sticky top-0 z-20 h-[60px]"
          style={{ background: 'linear-gradient(135deg, #0d1a2a 0%, #182c3f 100%)' }}
        />
        <main className="max-w-3xl mx-auto px-4 py-8 space-y-5">
          <div className="skeleton h-6 w-28 rounded-xl" />
          <div className="skeleton h-36 rounded-2xl" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[0,1,2,3].map((i) => <div key={i} className="skeleton h-24 rounded-2xl" />)}
          </div>
          <div className="skeleton h-56 rounded-2xl" />
          <div className="skeleton h-64 rounded-2xl" />
        </main>
      </div>
    )
  }

  /* ── 404 ── */
  if (notFound || !profile) {
    return (
      <div className="min-h-screen" style={{ background: '#f5f7fa' }}>
        <main className="max-w-3xl mx-auto px-4 py-20 text-center">
          <div className="text-5xl mb-4">👤</div>
          <p className="text-lg font-bold" style={{ color: '#0d1a2a' }}>Üye bulunamadı</p>
          <p className="text-sm mt-1 mb-6" style={{ color: '#94a3b8' }}>Bu ID'ye sahip bir kullanıcı yok.</p>
          <Link href="/dashboard" className="btn-primary">← Panele Dön</Link>
        </main>
      </div>
    )
  }

  /* ── Türetilmiş istatistikler ── */
  const activeTasks   = tasks.filter((t) => t.status !== 'done')
  const overdueTasks  = tasks.filter((t) => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'done')
  const doneTasks     = tasks.filter((t) => t.status === 'done')
  const nowMonth      = new Date().getMonth()
  const nowYear       = new Date().getFullYear()
  const monthCheckins = checkins.filter((c) => {
    const d = new Date(c.timestamp)
    return d.getMonth() === nowMonth && d.getFullYear() === nowYear
  }).length

  const initials = (profile.full_name || 'U')
    .trim().split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()

  const roleLabel =
    profile.role === 'admin' ? 'Admin' :
    profile.role === 'consultant' ? 'Danışman' : 'Üye'

  const roleStyle =
    profile.role === 'admin'      ? { background: 'rgba(42,187,213,0.15)', color: '#2abbd5' } :
    profile.role === 'consultant' ? { background: '#ede9fe', color: '#7c3aed' } :
                                    { background: 'rgba(34,136,201,0.15)', color: '#2288c9' }

  /* ── Görev grupları ── */
  const statusOrder = ['doing', 'testing', 'blocked', 'backlog', 'done']
  const groupedTasks = statusOrder
    .map((status) => ({ status, items: tasks.filter((t) => t.status === status) }))
    .filter((g) => g.items.length > 0)

  const kpiCards = [
    { label: 'Aktif Görev',  value: activeTasks.length,  icon: '📋', color: '#2288c9',  bg: '#e0f2fe',  border: '#bae6fd' },
    { label: 'Gecikmiş',     value: overdueTasks.length, icon: '⚠️', color: overdueTasks.length > 0 ? '#b45309' : '#64748b', bg: overdueTasks.length > 0 ? '#fef3c7' : '#f1f5f9', border: overdueTasks.length > 0 ? '#fde68a' : '#e2e8f0' },
    { label: 'Tamamlanan',   value: doneTasks.length,    icon: '✅', color: '#059669',  bg: '#d1fae5',  border: '#a7f3d0' },
    { label: 'Bu Ay Sahada', value: monthCheckins,       icon: '🏭', color: '#7c3aed',  bg: '#ede9fe',  border: '#ddd6fe' },
  ]

  return (
    <div className="min-h-screen" style={{ background: '#f5f7fa' }}>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-5">

        {/* ── Geri butonu ── */}
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm font-semibold transition-colors"
          style={{ color: '#64748b' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#2288c9' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#64748b' }}
        >
          ← Panele Dön
        </Link>

        {/* ── Profil başlığı ── */}
        <div
          className="rounded-2xl p-6"
          style={{
            background: 'linear-gradient(135deg, #0d1a2a 0%, #182c3f 100%)',
            border: '1px solid rgba(122,207,230,0.15)',
            boxShadow: '0 8px 32px rgba(13,26,42,0.18)',
          }}
        >
          <div className="flex items-center gap-5">
            {/* Avatar */}
            <div
              className="w-16 h-16 rounded-xl flex items-center justify-center text-xl font-bold shrink-0 overflow-hidden"
              style={profile.avatar_url ? undefined : { background: 'linear-gradient(135deg, #2abbd5, #7acfe6)', color: '#fff' }}
            >
              {profile.avatar_url
                ? <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                : initials
              }
            </div>

            {/* Bilgiler */}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-bold text-white">
                  {profile.full_name || 'İsimsiz Üye'}
                </h1>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-bold" style={roleStyle}>
                  {roleLabel}
                </span>
              </div>
              {profile.title && (
                <p className="text-sm mt-0.5" style={{ color: 'rgba(122,207,230,0.8)' }}>
                  {profile.title}
                </p>
              )}
              {profile.username && (
                <p className="text-xs mt-0.5 font-mono" style={{ color: 'rgba(255,255,255,0.35)' }}>
                  @{profile.username}
                </p>
              )}
              {profile.bio && (
                <p className="text-xs mt-2 leading-relaxed max-w-lg" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  {profile.bio}
                </p>
              )}
            </div>
          </div>

          {/* Yetenekler */}
          {profile.skills && profile.skills.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-5">
              {profile.skills.map((s) => (
                <span
                  key={s}
                  className="text-xs px-2.5 py-1 rounded-full font-medium"
                  style={{ background: 'rgba(122,207,230,0.12)', color: '#7acfe6', border: '1px solid rgba(122,207,230,0.2)' }}
                >
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* ── İstatistik kartları ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {kpiCards.map((kpi) => (
            <div
              key={kpi.label}
              className="stat-card"
              style={{ border: `1px solid ${kpi.border}` }}
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center text-base mb-3"
                style={{ background: kpi.bg }}
              >
                {kpi.icon}
              </div>
              <div className="text-2xl font-bold mb-0.5" style={{ color: kpi.color }}>
                {kpi.value}
              </div>
              <div className="text-xs font-semibold" style={{ color: '#94a3b8' }}>
                {kpi.label}
              </div>
            </div>
          ))}
        </div>

        {/* ── Profil düzenle ── */}
        <div
          className="rounded-2xl p-6"
          style={{
            background: '#fff',
            border: '1px solid rgba(210,228,238,0.8)',
            boxShadow: '0 2px 16px rgba(13,26,42,0.06)',
          }}
        >
          <h2 className="text-sm font-bold mb-5" style={{ color: '#0d1a2a' }}>Profil Düzenle</h2>

          <div className="space-y-4">
            {/* Ad Soyad */}
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: '#64748b' }}>
                Ad Soyad
              </label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                maxLength={80}
                className="input-field w-full"
                placeholder="Ad Soyad"
              />
            </div>

            {/* Unvan */}
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: '#64748b' }}>
                Unvan / Pozisyon
              </label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                maxLength={80}
                className="input-field w-full"
                placeholder="Örn: Mekanik Mühendis, Ekip Lideri"
              />
            </div>

            {/* Hakkında */}
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: '#64748b' }}>
                Hakkında
              </label>
              <textarea
                value={editBio}
                onChange={(e) => setEditBio(e.target.value)}
                maxLength={200}
                rows={3}
                className="input-field w-full resize-none"
                placeholder="Kısa biyografi..."
              />
              <div className="text-right text-xs mt-1" style={{ color: '#94a3b8' }}>
                {editBio.length}/200
              </div>
            </div>

            {/* Yetenekler */}
            <div>
              <label className="block text-xs font-semibold mb-2" style={{ color: '#64748b' }}>
                Yetenekler
              </label>
              <div className="flex flex-wrap gap-2">
                {SKILL_OPTIONS.map((skill) => {
                  const selected = editSkills.includes(skill)
                  return (
                    <button
                      key={skill}
                      type="button"
                      onClick={() => toggleSkill(skill)}
                      className="text-xs px-3 py-1.5 rounded-full font-medium transition-all"
                      style={
                        selected
                          ? { background: 'linear-gradient(135deg, #182c3f, #2288c9)', color: '#fff', border: '1px solid transparent' }
                          : { background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0' }
                      }
                    >
                      {skill}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Kaydet */}
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="btn-primary disabled:opacity-50"
              >
                {saving ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
              {saveMsg && (
                <span
                  className="text-sm font-medium"
                  style={{ color: saveMsg.startsWith('Hata') ? '#dc2626' : '#059669' }}
                >
                  {saveMsg}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Görev listesi ── */}
        {tasks.length > 0 ? (
          <div
            className="rounded-2xl overflow-hidden"
            style={{
              background: '#fff',
              border: '1px solid rgba(210,228,238,0.8)',
              boxShadow: '0 2px 16px rgba(13,26,42,0.06)',
            }}
          >
            <div className="px-6 py-4" style={{ borderBottom: '1px solid #f1f5f9' }}>
              <h2 className="text-sm font-bold" style={{ color: '#0d1a2a' }}>Görevler</h2>
              <p className="text-xs mt-0.5" style={{ color: '#94a3b8' }}>
                {tasks.length} görev toplam · {activeTasks.length} aktif
              </p>
            </div>

            <div>
              {groupedTasks.map(({ status, items }) => {
                const s = STATUS_LABELS[status] || { label: status, color: '#64748b', bg: '#f1f5f9' }
                return (
                  <div key={status}>
                    {/* Grup başlığı */}
                    <div
                      className="px-6 py-2 flex items-center gap-2"
                      style={{ background: '#fafcfe', borderBottom: '1px solid #f1f5f9' }}
                    >
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-bold"
                        style={{ background: s.bg, color: s.color }}
                      >
                        {s.label}
                      </span>
                      <span className="text-xs font-medium" style={{ color: '#94a3b8' }}>
                        {items.length} görev
                      </span>
                    </div>

                    {/* Görevler */}
                    {items.map((task) => {
                      const p    = PRIORITY_LABELS[task.priority] || { label: task.priority, color: '#64748b' }
                      const isOd = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done'
                      return (
                        <Link
                          key={task.id}
                          href={`/org/${orgSlug}/tasks/${task.id}`}
                          className="px-6 py-3.5 flex items-center justify-between gap-4 transition-colors duration-100 block"
                          style={{
                            borderBottom: '1px solid #f8fafc',
                            textDecoration: 'none',
                            color: 'inherit',
                          }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#fafcfe' }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate" style={{ color: '#0d1a2a' }}>
                              {task.title}
                            </div>
                            {task.description && (
                              <div className="text-xs truncate mt-0.5" style={{ color: '#94a3b8' }}>
                                {task.description}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs font-semibold" style={{ color: p.color }}>
                              {p.label}
                            </span>
                            {task.due_date && (
                              <span
                                className="text-xs px-2 py-0.5 rounded-full font-medium"
                                style={
                                  isOd
                                    ? { background: '#fee2e2', color: '#dc2626' }
                                    : { background: '#f1f5f9', color: '#64748b' }
                                }
                              >
                                {new Date(task.due_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                                {isOd ? ' ⚠' : ''}
                              </span>
                            )}
                            <span className="text-xs" style={{ color: '#cbd5e1' }}>→</span>
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div
            className="rounded-2xl p-10 text-center"
            style={{ background: '#fff', border: '1px solid rgba(210,228,238,0.8)' }}
          >
            <div className="text-3xl mb-3">📋</div>
            <p className="text-sm font-semibold" style={{ color: '#0d1a2a' }}>Atanmış görev yok</p>
            <p className="text-xs mt-1" style={{ color: '#94a3b8' }}>Bu üyeye henüz görev atanmamış.</p>
          </div>
        )}

        {/* ── Son atölye girişleri ── */}
        {checkins.length > 0 && (
          <div
            className="rounded-2xl overflow-hidden"
            style={{
              background: '#fff',
              border: '1px solid rgba(210,228,238,0.8)',
              boxShadow: '0 2px 16px rgba(13,26,42,0.06)',
            }}
          >
            <div className="px-6 py-4" style={{ borderBottom: '1px solid #f1f5f9' }}>
              <h2 className="text-sm font-bold" style={{ color: '#0d1a2a' }}>Son Saha Girişleri</h2>
              <p className="text-xs mt-0.5" style={{ color: '#94a3b8' }}>Son {Math.min(checkins.length, 10)} kayıt</p>
            </div>
            <div className="divide-y" style={{ borderColor: '#f8fafc' }}>
              {checkins.slice(0, 10).map((c) => {
                const d = new Date(c.timestamp)
                return (
                  <div key={c.id} className="px-6 py-3 flex items-center gap-3">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: c.type === 'in' ? '#22c55e' : '#94a3b8' }}
                    />
                    <span className="text-sm font-medium" style={{ color: '#0d1a2a' }}>
                      {c.type === 'in' ? 'Giriş' : 'Çıkış'}
                    </span>
                    {c.note && (
                      <span className="text-xs truncate flex-1" style={{ color: '#94a3b8' }}>
                        {c.note}
                      </span>
                    )}
                    <span className="text-xs ml-auto shrink-0" style={{ color: '#94a3b8' }}>
                      {d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {' · '}
                      {d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="h-8" />
      </main>
    </div>
  )
}
