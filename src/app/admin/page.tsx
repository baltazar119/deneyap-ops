'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'

// ── Types ─────────────────────────────────────────────────────────────────────

interface UserOrg {
  orgId: string
  orgName: string
  orgSlug: string
  plan: string
  role: string
  joinedAt: string
}

interface CreatedOrg {
  orgId: string
  orgName: string
  orgSlug: string
  plan: string
}

interface AdminUser {
  id: string
  email: string
  createdAt: string
  lastSignIn: string | null
  plan: 'free' | 'pro'
  ai_addon: boolean
  profile: {
    id: string
    full_name: string | null
    username: string | null
    avatar_url: string | null
    title: string | null
    bio: string | null
    skills: string[] | null
    plan: 'free' | 'pro'
    ai_addon: boolean
  } | null
  orgs: UserOrg[]
  createdOrgs: CreatedOrg[]
}

interface AdminOrg {
  id: string
  name: string
  slug: string
  plan: string
  max_members: number
  created_by: string
  created_at: string
  join_code: string
  memberCount: number
  createdByEmail: string
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const [activeTab, setActiveTab] = useState<'users' | 'orgs' | 'chat'>('users')
  const [token, setToken] = useState<string | null>(null)

  // Users
  const [users, setUsers] = useState<AdminUser[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [expandedUser, setExpandedUser] = useState<string | null>(null)

  // Orgs
  const [orgs, setOrgs] = useState<AdminOrg[]>([])
  const [orgsLoading, setOrgsLoading] = useState(false)

  // Chat
  interface AdminChatChannel {
    id: string
    type: 'workspace' | 'dm'
    organization_id: string
    participant_a: string | null
    participant_b: string | null
    created_at: string
    org: { id: string; name: string; slug: string } | null
    participantAProfile: { id: string; full_name: string | null; username: string | null; avatar_url: string | null } | null
    participantBProfile: { id: string; full_name: string | null; username: string | null; avatar_url: string | null } | null
    lastMessageAt: string | null
    messageCount: number
  }
  interface AdminChatMessage {
    id: string
    channel_id: string
    sender_id: string | null
    content: string
    created_at: string
    sender: { id: string; full_name: string | null; username: string | null; avatar_url: string | null } | null
  }
  const [chatChannels, setChatChannels] = useState<AdminChatChannel[]>([])
  const [chatLoading, setChatLoading] = useState(false)
  const [selectedChannel, setSelectedChannel] = useState<AdminChatChannel | null>(null)
  const [channelMessages, setChannelMessages] = useState<AdminChatMessage[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)

  // Inline feedback: { [id]: 'ok' | 'err' | 'loading' }
  const [feedback, setFeedback] = useState<Record<string, string>>({})

  // ── Auth check ────────────────────────────────────────────────────────────

  useEffect(() => {
    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.replace('/login'); return }

      const superEmail = process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL
      if (!superEmail || session.user.email !== superEmail) {
        router.replace('/workspaces')
        return
      }

      setToken(session.access_token)
      setAuthorized(true)
      setLoading(false)
    }
    checkAuth()
  }, [router])

  // ── Data fetching ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!authorized || !token) return
    if (activeTab === 'users') loadUsers()
    else if (activeTab === 'orgs') loadOrgs()
    else loadChat()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorized, token, activeTab])

  async function loadUsers() {
    if (!token) return
    setUsersLoading(true)
    const res = await fetch('/api/admin/users', {
      headers: { 'Authorization': `Bearer ${token}` },
    })
    const data = await res.json()
    if (res.ok) setUsers(data.users ?? [])
    setUsersLoading(false)
  }

  async function loadChat() {
    if (!token) return
    setChatLoading(true)
    const res = await fetch('/api/admin/chat', {
      headers: { 'Authorization': `Bearer ${token}` },
    })
    const data = await res.json()
    if (res.ok) setChatChannels(data.channels ?? [])
    setChatLoading(false)
  }

  async function loadChannelMessages(channelId: string) {
    if (!token) return
    setMessagesLoading(true)
    const res = await fetch(`/api/admin/chat?channelId=${channelId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
    const data = await res.json()
    if (res.ok) setChannelMessages(data.messages ?? [])
    setMessagesLoading(false)
  }

  async function loadOrgs() {
    if (!token) return
    setOrgsLoading(true)
    const res = await fetch('/api/admin/orgs', {
      headers: { 'Authorization': `Bearer ${token}` },
    })
    const data = await res.json()
    if (res.ok) setOrgs(data.orgs ?? [])
    setOrgsLoading(false)
  }

  // ── User plan değiştir ────────────────────────────────────────────────────

  async function handleUserPlan(userId: string, plan: 'free' | 'pro') {
    if (!token) return
    const key = `plan_${userId}`
    setFeedback(prev => ({ ...prev, [key]: 'loading' }))

    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ action: 'set_plan', plan }),
    })

    if (res.ok) {
      // Lokal state'i hemen güncelle (anlık geri bildirim)
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, plan } : u))
      setFeedback(prev => ({ ...prev, [key]: 'ok' }))
      // 2 sn sonra feedback'i temizle ve listeyi taze veri ile yenile
      setTimeout(() => {
        setFeedback(prev => { const n = { ...prev }; delete n[key]; return n })
        loadUsers()
      }, 2000)
    } else {
      const body = await res.json().catch(() => ({}))
      console.error('[Admin] set_plan hata:', body)
      setFeedback(prev => ({ ...prev, [key]: 'err' }))
      setTimeout(() => setFeedback(prev => { const n = { ...prev }; delete n[key]; return n }), 3000)
    }
  }

  // ── AI addon aç/kapat ─────────────────────────────────────────────────────

  async function handleAiAddon(userId: string, ai_addon: boolean) {
    if (!token) return
    const key = `ai_${userId}`
    setFeedback(prev => ({ ...prev, [key]: 'loading' }))

    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ action: 'set_ai_addon', ai_addon }),
    })

    const respBody = await res.json().catch(() => ({}))

    if (res.ok) {
      // API'den dönen gerçek DB değerini kullan (verify sonrası)
      const actualValue = typeof respBody.ai_addon === 'boolean' ? respBody.ai_addon : ai_addon
      console.log('[Admin] set_ai_addon response:', respBody)
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, ai_addon: actualValue } : u))
      setFeedback(prev => ({ ...prev, [key]: actualValue === ai_addon ? 'ok' : 'err' }))
      setTimeout(() => setFeedback(prev => { const n = { ...prev }; delete n[key]; return n }), 2000)
    } else {
      console.error('[Admin] set_ai_addon hata:', respBody)
      setFeedback(prev => ({ ...prev, [key]: 'err' }))
      setTimeout(() => setFeedback(prev => { const n = { ...prev }; delete n[key]; return n }), 3000)
    }
  }

  // ── User rol değiştir ─────────────────────────────────────────────────────

  async function handleUserRole(userId: string, organizationId: string, role: string) {
    if (!token) return
    const key = `role_${userId}_${organizationId}`
    setFeedback(prev => ({ ...prev, [key]: 'loading' }))

    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ organization_id: organizationId, role }),
    })

    setFeedback(prev => ({ ...prev, [key]: res.ok ? 'ok' : 'err' }))
    setTimeout(() => setFeedback(prev => { const n = { ...prev }; delete n[key]; return n }), 2000)
    if (res.ok) loadUsers()
  }

  // ── User orgdan çıkar ─────────────────────────────────────────────────────

  async function handleUserRemoveFromOrg(userId: string, organizationId: string) {
    if (!token || !confirm('Bu kullanıcıyı orgdan çıkarmak istediğinize emin misiniz?')) return
    const key = `remove_${userId}_${organizationId}`
    setFeedback(prev => ({ ...prev, [key]: 'loading' }))

    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ organization_id: organizationId, action: 'remove' }),
    })

    setFeedback(prev => ({ ...prev, [key]: res.ok ? 'ok' : 'err' }))
    setTimeout(() => setFeedback(prev => { const n = { ...prev }; delete n[key]; return n }), 2000)
    if (res.ok) loadUsers()
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-[#060e18] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#2288c9] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!authorized) return null

  const proUserCount = users.filter(u => u.plan === 'pro').length
  const aiAddonCount = users.filter(u => u.ai_addon).length

  return (
    <div className="min-h-screen" style={{ background: '#f5f7fa' }}>
      {/* Header */}
      <div className="bg-[#0d1a2a] border-b border-[#1a2f45] px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-400 font-bold text-sm">
              ★
            </div>
            <div>
              <h1 className="text-white font-bold">DENEYAP Süper Admin</h1>
              <p className="text-[#8baac4] text-xs">Platform Yönetim Paneli</p>
            </div>
          </div>
          <button
            onClick={() => router.push('/workspaces')}
            className="text-[#8baac4] hover:text-white text-sm transition-colors"
          >
            ← Workspaces
          </button>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {/* İstatistikler */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Toplam Kullanıcı', value: users.length || '…' },
            { label: 'Pro Kullanıcı', value: proUserCount || '—', accent: true },
            { label: 'AI Eklentili', value: aiAddonCount || '—', ai: true },
            { label: 'Toplam Workspace', value: orgs.length || '…' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl border border-[#e5e7eb] p-4">
              <div className={`text-2xl font-bold ${s.accent ? 'text-amber-500' : (s as any).ai ? 'text-[#2abbd5]' : 'text-[#0d1a2a]'}`}>
                {s.value}
              </div>
              <div className="text-xs text-[#6b7280] mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Sekmeler */}
        <div className="flex gap-1 bg-white border border-[#e5e7eb] rounded-xl p-1 w-fit">
          <button
            onClick={() => setActiveTab('users')}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'users' ? 'bg-[#2288c9] text-white shadow-sm' : 'text-[#6b7280] hover:text-[#0d1a2a]'
            }`}
          >
            Kullanıcılar ({users.length})
          </button>
          <button
            onClick={() => setActiveTab('orgs')}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'orgs' ? 'bg-[#2288c9] text-white shadow-sm' : 'text-[#6b7280] hover:text-[#0d1a2a]'
            }`}
          >
            Workspaceler ({orgs.length})
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'chat' ? 'bg-[#2288c9] text-white shadow-sm' : 'text-[#6b7280] hover:text-[#0d1a2a]'
            }`}
          >
            Sohbet
          </button>
        </div>

        {/* ── Kullanıcılar Sekmesi ── */}
        {activeTab === 'users' && (
          <div className="bg-white rounded-2xl border border-[#e5e7eb] overflow-hidden">
            <div className="px-6 py-4 border-b border-[#e5e7eb] flex items-center justify-between">
              <h2 className="font-semibold text-[#0d1a2a]">Tüm Kullanıcılar</h2>
              <button onClick={loadUsers} className="text-[#2288c9] text-sm hover:underline">
                Yenile
              </button>
            </div>

            {usersLoading ? (
              <div className="p-8 text-center text-[#9ca3af]">Yükleniyor…</div>
            ) : (
              <div className="divide-y divide-[#e5e7eb]">
                {users.map(u => {
                  const planKey = `plan_${u.id}`
                  const aiKey  = `ai_${u.id}`
                  const planFb = feedback[planKey]
                  const aiFb   = feedback[aiKey]
                  const isExpanded = expandedUser === u.id

                  return (
                    <div key={u.id}>
                      {/* Kullanıcı satırı */}
                      <div
                        className="flex items-center gap-4 px-6 py-4 hover:bg-[#fafafa] cursor-pointer"
                        onClick={() => setExpandedUser(isExpanded ? null : u.id)}
                      >
                        {/* Avatar */}
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#2abbd5] to-[#2288c9] flex items-center justify-center text-white font-bold text-sm flex-shrink-0 overflow-hidden">
                          {u.profile?.avatar_url
                            ? <img src={u.profile.avatar_url} alt="" className="w-full h-full object-cover" />
                            : (u.profile?.full_name ?? u.email ?? '?').charAt(0).toUpperCase()
                          }
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-[#0d1a2a] truncate">
                              {u.profile?.full_name ?? u.profile?.username ?? '—'}
                            </span>
                            {/* Plan rozeti */}
                            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${
                              u.plan === 'pro'
                                ? 'bg-amber-100 text-amber-700 border border-amber-200'
                                : 'bg-gray-100 text-gray-500'
                            }`}>
                              {u.plan === 'pro' ? '✦ PRO' : 'Ücretsiz'}
                            </span>
                            {/* AI addon rozeti */}
                            {u.ai_addon && (
                              <span className="text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0 bg-cyan-100 text-cyan-700 border border-cyan-200">
                                🤖 AI
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-[#6b7280] truncate">{u.email}</div>
                          {u.profile?.title && (
                            <div className="text-xs text-[#9ca3af] truncate">{u.profile.title}</div>
                          )}
                        </div>

                        {/* Plan değiştir butonu */}
                        <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                          {planFb === 'ok' && <span className="text-green-500 text-sm font-bold">✓</span>}
                          {planFb === 'err' && <span className="text-red-500 text-sm font-bold">✕</span>}
                          {u.plan !== 'pro' ? (
                            <button
                              onClick={() => handleUserPlan(u.id, 'pro')}
                              disabled={planFb === 'loading'}
                              className="text-xs font-semibold px-3 py-1.5 rounded-xl text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-colors disabled:opacity-50"
                            >
                              {planFb === 'loading' ? '…' : '↑ PRO Yap'}
                            </button>
                          ) : (
                            <button
                              onClick={() => handleUserPlan(u.id, 'free')}
                              disabled={planFb === 'loading'}
                              className="text-xs font-medium px-3 py-1.5 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-500 border border-gray-200 transition-colors disabled:opacity-50"
                            >
                              {planFb === 'loading' ? '…' : '↓ Ücretsiz'}
                            </button>
                          )}
                        </div>

                        {/* AI addon toggle */}
                        {u.plan === 'pro' && (
                          <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                            {aiFb === 'ok' && <span className="text-green-500 text-sm font-bold">✓</span>}
                            {aiFb === 'err' && <span className="text-red-500 text-sm font-bold">✕</span>}
                            {u.ai_addon ? (
                              <button
                                onClick={() => handleAiAddon(u.id, false)}
                                disabled={aiFb === 'loading'}
                                className="text-xs font-medium px-2.5 py-1.5 rounded-xl bg-cyan-50 hover:bg-red-50 text-cyan-700 hover:text-red-600 border border-cyan-200 hover:border-red-200 transition-colors disabled:opacity-50"
                              >
                                {aiFb === 'loading' ? '…' : '🤖 Kaldır'}
                              </button>
                            ) : (
                              <button
                                onClick={() => handleAiAddon(u.id, true)}
                                disabled={aiFb === 'loading'}
                                className="text-xs font-medium px-2.5 py-1.5 rounded-xl bg-gray-50 hover:bg-cyan-50 text-gray-500 hover:text-cyan-700 border border-gray-200 hover:border-cyan-200 transition-colors disabled:opacity-50"
                              >
                                {aiFb === 'loading' ? '…' : '🤖 AI Ekle'}
                              </button>
                            )}
                          </div>
                        )}

                        {/* Org sayısı + tarih */}
                        <div className="text-right flex-shrink-0 hidden sm:block">
                          {u.createdOrgs.length > 0 && (
                            <div className="text-xs font-semibold text-amber-600">
                              {u.createdOrgs.length} oluşturdu
                            </div>
                          )}
                          <div className="text-sm text-[#0d1a2a] font-medium">{u.orgs.length} üyelik</div>
                          <div className="text-xs text-[#9ca3af]">
                            {new Date(u.createdAt).toLocaleDateString('tr-TR')}
                          </div>
                        </div>

                        {/* Expand arrow */}
                        <svg
                          className={`w-4 h-4 text-[#9ca3af] transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
                          fill="none" stroke="currentColor" viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>

                      {/* Genişletilmiş profil + org listesi */}
                      {isExpanded && (
                        <div className="bg-[#f9fafb] border-t border-[#e5e7eb] px-6 py-5 space-y-4">
                          {/* Profil Detayı */}
                          <div className="bg-white rounded-xl border border-[#e5e7eb] p-4">
                            <h3 className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide mb-3">Profil Bilgileri</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                              <div>
                                <span className="text-[#9ca3af] text-xs">Ad Soyad</span>
                                <p className="text-[#0d1a2a] font-medium">{u.profile?.full_name ?? '—'}</p>
                              </div>
                              <div>
                                <span className="text-[#9ca3af] text-xs">Kullanıcı Adı</span>
                                <p className="text-[#0d1a2a]">{u.profile?.username ? `@${u.profile.username}` : '—'}</p>
                              </div>
                              <div>
                                <span className="text-[#9ca3af] text-xs">Ünvan</span>
                                <p className="text-[#0d1a2a]">{u.profile?.title ?? '—'}</p>
                              </div>
                              <div>
                                <span className="text-[#9ca3af] text-xs">Abonelik</span>
                                <p className={`font-semibold ${u.plan === 'pro' ? 'text-amber-600' : 'text-gray-500'}`}>
                                  {u.plan === 'pro' ? '✦ Pro Plan' : 'Ücretsiz Plan'}
                                </p>
                              </div>
                              <div>
                                <span className="text-[#9ca3af] text-xs">AI Eklentisi</span>
                                <p className={`font-semibold ${u.ai_addon ? 'text-cyan-600' : 'text-gray-400'}`}>
                                  {u.ai_addon ? '🤖 Aktif' : 'Pasif'}
                                </p>
                              </div>
                              {u.profile?.bio && (
                                <div className="sm:col-span-2">
                                  <span className="text-[#9ca3af] text-xs">Hakkında</span>
                                  <p className="text-[#374151] text-sm mt-0.5">{u.profile.bio}</p>
                                </div>
                              )}
                              {u.profile?.skills && u.profile.skills.length > 0 && (
                                <div className="sm:col-span-2">
                                  <span className="text-[#9ca3af] text-xs">Yetenekler</span>
                                  <div className="flex flex-wrap gap-1.5 mt-1">
                                    {u.profile.skills.map(s => (
                                      <span key={s} className="text-xs bg-[#f0f7ff] text-[#2288c9] border border-[#bfdbfe] px-2 py-0.5 rounded-full">
                                        {s}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              <div>
                                <span className="text-[#9ca3af] text-xs">Kayıt Tarihi</span>
                                <p className="text-[#374151]">{new Date(u.createdAt).toLocaleString('tr-TR')}</p>
                              </div>
                              {u.lastSignIn && (
                                <div>
                                  <span className="text-[#9ca3af] text-xs">Son Giriş</span>
                                  <p className="text-[#374151]">{new Date(u.lastSignIn).toLocaleString('tr-TR')}</p>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Oluşturduğu Workspaceler */}
                          {u.createdOrgs.length > 0 && (
                            <div>
                              <h3 className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide mb-2">
                                Oluşturduğu Workspaceler ({u.createdOrgs.length})
                              </h3>
                              <div className="space-y-2">
                                {u.createdOrgs.map(org => (
                                  <div key={org.orgId} className="flex items-center gap-3 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                                    <div className="w-7 h-7 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-600 font-bold text-sm flex-shrink-0">
                                      {org.orgName.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="font-medium text-sm text-[#0d1a2a]">{org.orgName}</div>
                                      <div className="text-xs text-[#9ca3af]">/{org.orgSlug}</div>
                                    </div>
                                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-700 border border-amber-200 flex-shrink-0">
                                      Sahip
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Workspace üyelikleri */}
                          <div>
                            <h3 className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide mb-2">
                              Workspace Üyelikleri ({u.orgs.length})
                            </h3>
                            {u.orgs.length === 0 ? (
                              <p className="text-sm text-[#9ca3af]">Hiçbir workspace'e üye değil.</p>
                            ) : (
                              <div className="space-y-2">
                                {u.orgs.map(org => {
                                  const roleKey = `role_${u.id}_${org.orgId}`
                                  const removeKey = `remove_${u.id}_${org.orgId}`
                                  const roleFb = feedback[roleKey]
                                  const removeFb = feedback[removeKey]
                                  return (
                                    <div key={org.orgId} className="flex items-center gap-3 flex-wrap bg-white rounded-xl border border-[#e5e7eb] px-4 py-3">
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                          <span className="font-medium text-sm text-[#0d1a2a]">{org.orgName}</span>
                                        </div>
                                        <div className="text-xs text-[#9ca3af] mt-0.5">/{org.orgSlug}</div>
                                      </div>

                                      {/* Rol değiştir */}
                                      <div className="flex items-center gap-2">
                                        <select
                                          value={org.role}
                                          onChange={e => handleUserRole(u.id, org.orgId, e.target.value)}
                                          className="text-xs border border-[#e5e7eb] rounded-lg px-2 py-1.5 outline-none focus:border-[#2288c9] bg-white"
                                          disabled={roleFb === 'loading'}
                                        >
                                          <option value="owner">Sahip</option>
                                          <option value="admin">Yönetici</option>
                                          <option value="member">Üye</option>
                                          <option value="consultant">Danışman</option>
                                        </select>
                                        {roleFb && (
                                          <span className={`text-sm font-bold ${roleFb === 'ok' ? 'text-green-500' : roleFb === 'loading' ? 'text-[#2288c9]' : 'text-red-500'}`}>
                                            {roleFb === 'ok' ? '✓' : roleFb === 'loading' ? '…' : '✕'}
                                          </span>
                                        )}
                                      </div>

                                      {/* Workspace'den çıkar */}
                                      {org.role !== 'owner' && (
                                        <button
                                          onClick={() => handleUserRemoveFromOrg(u.id, org.orgId)}
                                          disabled={removeFb === 'loading'}
                                          className="text-red-400 hover:text-red-600 text-xs px-2 py-1.5 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                                        >
                                          {removeFb === 'loading' ? '…' : 'Çıkar'}
                                        </button>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Workspaceler Sekmesi ── */}
        {activeTab === 'orgs' && (
          <div className="bg-white rounded-2xl border border-[#e5e7eb] overflow-hidden">
            <div className="px-6 py-4 border-b border-[#e5e7eb] flex items-center justify-between">
              <h2 className="font-semibold text-[#0d1a2a]">Tüm Workspaceler</h2>
              <button onClick={loadOrgs} className="text-[#2288c9] text-sm hover:underline">
                Yenile
              </button>
            </div>

            {orgsLoading ? (
              <div className="p-8 text-center text-[#9ca3af]">Yükleniyor…</div>
            ) : (
              <div className="divide-y divide-[#e5e7eb]">
                {orgs.map(org => (
                  <div key={org.id} className="flex items-center gap-4 px-6 py-4">
                    {/* Org avatar */}
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#2288c9] to-[#1a6fa0] flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                      {org.name.charAt(0).toUpperCase()}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-[#0d1a2a] truncate">{org.name}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-[#9ca3af]">
                        <span>/{org.slug}</span>
                        <span>{org.memberCount} üye</span>
                        {org.join_code && <span className="font-mono">#{org.join_code}</span>}
                      </div>
                    </div>

                    {/* Oluşturulma tarihi */}
                    <div className="text-right flex-shrink-0">
                      <div className="text-xs text-[#9ca3af]">
                        {new Date(org.created_at).toLocaleDateString('tr-TR')}
                      </div>
                      {org.createdByEmail && (
                        <div className="text-xs text-[#9ca3af] truncate max-w-[140px]">{org.createdByEmail}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {/* ── Sohbet Sekmesi ── */}
        {activeTab === 'chat' && (
          <div className="flex gap-4">
            {/* Kanal listesi */}
            <div className="bg-white rounded-2xl border border-[#e5e7eb] overflow-hidden flex-1">
              <div className="px-6 py-4 border-b border-[#e5e7eb] flex items-center justify-between">
                <h2 className="font-semibold text-[#0d1a2a]">Tüm Sohbet Kanalları</h2>
                <button onClick={loadChat} className="text-[#2288c9] text-sm hover:underline">
                  Yenile
                </button>
              </div>

              {chatLoading ? (
                <div className="p-8 text-center text-[#9ca3af]">Yükleniyor…</div>
              ) : chatChannels.length === 0 ? (
                <div className="p-8 text-center text-[#9ca3af]">Henüz sohbet kanalı yok.</div>
              ) : (
                <div className="divide-y divide-[#e5e7eb]">
                  {/* Workspace kanalları */}
                  <div className="px-6 py-2 bg-[#f9fafb] text-xs font-semibold text-[#6b7280] uppercase tracking-wider">
                    Ekip Kanalları ({chatChannels.filter(c => c.type === 'workspace').length})
                  </div>
                  {chatChannels.filter(c => c.type === 'workspace').map(ch => (
                    <button
                      key={ch.id}
                      onClick={() => { setSelectedChannel(ch); loadChannelMessages(ch.id) }}
                      className={`w-full flex items-center gap-4 px-6 py-4 text-left transition-colors hover:bg-[#f0f7ff] ${selectedChannel?.id === ch.id ? 'bg-[#e8f2ff]' : ''}`}
                    >
                      <div className="w-9 h-9 rounded-xl bg-[#dbeafe] flex items-center justify-center flex-shrink-0">
                        <span className="text-[#2563eb] font-bold text-sm">E</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-[#0d1a2a] truncate">
                          Ekip Kanalı — {ch.org?.name ?? ch.organization_id.slice(0, 8)}
                        </div>
                        <div className="text-xs text-[#9ca3af]">
                          {ch.messageCount} mesaj
                          {ch.lastMessageAt && ` · Son: ${new Date(ch.lastMessageAt).toLocaleDateString('tr-TR')}`}
                        </div>
                      </div>
                      <span className="text-xs text-[#2288c9] font-medium flex-shrink-0">Görüntüle →</span>
                    </button>
                  ))}

                  {/* DM kanalları */}
                  <div className="px-6 py-2 bg-[#f9fafb] text-xs font-semibold text-[#6b7280] uppercase tracking-wider">
                    Özel Mesajlar ({chatChannels.filter(c => c.type === 'dm').length})
                  </div>
                  {chatChannels.filter(c => c.type === 'dm').map(ch => {
                    const nameA = ch.participantAProfile?.full_name ?? ch.participantAProfile?.username ?? '?'
                    const nameB = ch.participantBProfile?.full_name ?? ch.participantBProfile?.username ?? '?'
                    return (
                      <button
                        key={ch.id}
                        onClick={() => { setSelectedChannel(ch); loadChannelMessages(ch.id) }}
                        className={`w-full flex items-center gap-4 px-6 py-4 text-left transition-colors hover:bg-[#f0f7ff] ${selectedChannel?.id === ch.id ? 'bg-[#e8f2ff]' : ''}`}
                      >
                        <div className="w-9 h-9 rounded-xl bg-[#ede9fe] flex items-center justify-center flex-shrink-0">
                          <span className="text-[#7c3aed] font-bold text-sm">D</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-[#0d1a2a] truncate">
                            {nameA} ↔ {nameB}
                          </div>
                          <div className="text-xs text-[#9ca3af]">
                            {ch.org?.name ?? ''} · {ch.messageCount} mesaj
                            {ch.lastMessageAt && ` · Son: ${new Date(ch.lastMessageAt).toLocaleDateString('tr-TR')}`}
                          </div>
                        </div>
                        <span className="text-xs text-[#2288c9] font-medium flex-shrink-0">Görüntüle →</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Mesaj görüntüleyici */}
            {selectedChannel && (
              <div className="w-96 bg-white rounded-2xl border border-[#e5e7eb] overflow-hidden flex flex-col">
                <div className="px-5 py-4 border-b border-[#e5e7eb] bg-[#eef3f8]" style={{ borderLeft: '3px solid #2563eb' }}>
                  <div className="font-semibold text-[#0d1a2a] text-sm">
                    {selectedChannel.type === 'workspace'
                      ? `Ekip Kanalı — ${selectedChannel.org?.name ?? ''}`
                      : `${selectedChannel.participantAProfile?.full_name ?? selectedChannel.participantAProfile?.username ?? '?'} ↔ ${selectedChannel.participantBProfile?.full_name ?? selectedChannel.participantBProfile?.username ?? '?'}`
                    }
                  </div>
                  <div className="text-xs text-[#64748b] mt-0.5">Salt okunur görünüm</div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ maxHeight: 480 }}>
                  {messagesLoading ? (
                    <div className="flex items-center justify-center h-full text-[#9ca3af]">Yükleniyor…</div>
                  ) : channelMessages.length === 0 ? (
                    <div className="text-center text-[#9ca3af] text-sm pt-8">Henüz mesaj yok.</div>
                  ) : (
                    channelMessages.map(msg => {
                      const p = msg.sender
                      const name = p?.full_name ?? p?.username ?? 'Bilinmeyen'
                      const ts = new Date(msg.created_at).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                      return (
                        <div key={msg.id} className="flex gap-3">
                          <div className="w-7 h-7 rounded-full bg-[#dbeafe] flex items-center justify-center text-xs font-bold text-[#2563eb] flex-shrink-0 overflow-hidden">
                            {p?.avatar_url
                              ? <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
                              : name.slice(0, 1).toUpperCase()
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2">
                              <span className="text-xs font-semibold text-[#1e293b]">{name}</span>
                              <span className="text-[10px] text-[#94a3b8]">{ts}</span>
                            </div>
                            <div className="text-sm text-[#334155] break-words">{msg.content}</div>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
