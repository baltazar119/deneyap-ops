'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Plus, Hash, Users, Clock } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { clearAllCache } from '@/lib/roleCache'
import type { Organization, OrgRole } from '@/types/database'

interface WorkspaceItem {
  org: Organization
  role: OrgRole
  memberCount: number
  lastAccessedAt: string | null
}

export default function WorkspacesPage() {
  const router = useRouter()
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([])
  const [loading, setLoading] = useState(true)
  const [isPro, setIsPro] = useState(false)
  const [userName, setUserName] = useState<string | null>(null)

  const [showOnboarding, setShowOnboarding] = useState(false)
  const [joinMode, setJoinMode] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinErr, setJoinErr] = useState<string | null>(null)

  const [hoveredWorkspace, setHoveredWorkspace] = useState<string | null>(null)
  const [hoveredCTA, setHoveredCTA] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.replace('/login'); return }

      const [memberResult, profileResult] = await Promise.all([
        supabase
          .from('organization_members')
          .select(`role, last_accessed_at, organizations!inner (id, name, slug, plan, max_members, logo_url, primary_color, accent_color, created_by, created_at, join_code)`)
          .eq('user_id', session.user.id)
          .order('joined_at', { ascending: true }),
        supabase
          .from('profiles')
          .select('plan, full_name')
          .eq('id', session.user.id)
          .single(),
      ])

      const { data, error } = memberResult
      const userIsPro = (profileResult.data?.plan ?? 'free') === 'pro'
      const name = profileResult.data?.full_name ?? session.user.email?.split('@')[0] ?? null
      setIsPro(userIsPro)
      setUserName(name)

      if (error || !data || data.length === 0) {
        setShowOnboarding(true)
        setLoading(false)
        return
      }

      if (data.length === 1 && !userIsPro) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const org = (data[0].organizations as any) as Organization
        router.replace(`/org/${org.slug}/dashboard`)
        return
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const orgs = data.map(d => (d.organizations as any) as Organization)
      const countResults = await Promise.all(
        orgs.map(o =>
          supabase.from('organization_members').select('id', { count: 'exact', head: true }).eq('organization_id', o.id)
        )
      )

      setWorkspaces(
        data.map((d, i) => ({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          org: (d.organizations as any) as Organization,
          role: d.role as OrgRole,
          memberCount: countResults[i].count ?? 0,
          lastAccessedAt: (d as any).last_accessed_at ?? null,
        }))
      )
      setLoading(false)
    }
    load()
  }, [router])

  async function handleLogout() {
    clearAllCache()
    await supabase.auth.signOut()
    router.replace('/login')
  }

  async function handleJoinByCode(e: React.FormEvent) {
    e.preventDefault()
    const code = joinCode.trim().toUpperCase()
    if (code.length !== 6) return
    setJoining(true)
    setJoinErr(null)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.replace('/login'); return }

    const res = await fetch('/api/join-by-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify({ code }),
    })
    const data = await res.json()
    if (!res.ok) { setJoinErr(data.error ?? 'Katılma başarısız'); setJoining(false) }
    else { router.replace(`/org/${data.slug}/dashboard`) }
  }

  if (loading) {
    return (
      <div className="h-screen bg-[#0d1a2a] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#2288c9] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // ── Onboarding: katılım kodu ──────────────────────────────────────────────
  if (showOnboarding && joinMode) {
    return (
      <PageShell>
        <Header label="Ekibe Katıl" title="Katılım Kodu" subtitle="Yöneticinden aldığın 6 haneli kodu gir" />
        <div className="space-y-2.5">
          <form onSubmit={handleJoinByCode} className="space-y-3">
            <input
              type="text"
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
              placeholder="ABC123"
              maxLength={6}
              required
              autoFocus
              className="w-full bg-[#182c3f] border-2 border-[#2288c9]/30 focus:border-[#2288c9] rounded-xl px-5 py-4 text-white text-2xl font-mono font-bold tracking-[0.4em] text-center outline-none transition-all duration-200 placeholder:text-white/20"
            />
            {joinErr && <p className="text-red-400 text-sm text-center">{joinErr}</p>}
            <button
              type="submit"
              disabled={joining || joinCode.length !== 6}
              className="w-full h-14 rounded-xl bg-[#2288c9] hover:bg-[#1a6fa8] disabled:opacity-40 text-white font-bold text-base transition-all duration-200 flex items-center justify-center gap-2"
            >
              {joining ? 'Katılınıyor...' : <><ArrowRight className="w-4 h-4" /> Ekibe Katıl</>}
            </button>
          </form>
        </div>
        <Footer left={<button onClick={() => setJoinMode(false)} className="hover:text-[#7acfe6] transition-colors duration-200">← Geri</button>} onLogout={handleLogout} />
      </PageShell>
    )
  }

  // ── Onboarding: ilk seçim ─────────────────────────────────────────────────
  if (showOnboarding) {
    return (
      <PageShell>
        <Header label="Hoş Geldin" title={userName ?? 'DENEYAP'} subtitle="Başlamak için bir seçenek belirle" />
        <div className="space-y-2.5">
          <CTACard
            icon={<Plus className="w-5 h-5" strokeWidth={2.5} />}
            title="Yeni Workspace Oluştur"
            subtitle="Ekip workspace'i başlat"
            hovered={hoveredCTA === 'new'}
            onMouseEnter={() => setHoveredCTA('new')}
            onMouseLeave={() => setHoveredCTA(null)}
            onClick={() => router.push('/onboarding/create-org')}
          />
          <CTACard
            icon={<Hash className="w-5 h-5" strokeWidth={2.5} />}
            title="Katılım Koduyla Katıl"
            subtitle="Mevcut workspace'e katıl"
            hovered={hoveredCTA === 'join'}
            onMouseEnter={() => setHoveredCTA('join')}
            onMouseLeave={() => setHoveredCTA(null)}
            onClick={() => setJoinMode(true)}
          />
        </div>
        <Footer left={null} onLogout={handleLogout} />
      </PageShell>
    )
  }

  // ── Çoklu workspace listesi ───────────────────────────────────────────────
  return (
    <PageShell>
      <Header label="Workspace Seçimi" title={userName ?? 'DENEYAP'} subtitle="Workspace seçin veya yeni oluşturun" />

      <div className="space-y-2.5">
        {/* Workspace kartları */}
        {workspaces.map(({ org, role, memberCount, lastAccessedAt }, idx) => {
          const isHov = hoveredWorkspace === org.id
          const orgColor = org.primary_color || '#2288c9'
          return (
            <button
              key={org.id}
              onMouseEnter={() => setHoveredWorkspace(org.id)}
              onMouseLeave={() => setHoveredWorkspace(null)}
              onClick={() => router.push(`/org/${org.slug}/dashboard`)}
              className="w-full group relative text-left"
              style={{ animationDelay: `${idx * 60}ms` }}
            >
              <div
                className="relative overflow-hidden rounded-xl h-[112px] border-2 transition-all duration-300 ease-out"
                style={{
                  background: isHov
                    ? 'linear-gradient(135deg, #1a3347 0%, #152a3a 100%)'
                    : 'linear-gradient(135deg, #182c3f 0%, #111f2e 100%)',
                  borderColor: isHov ? orgColor : 'rgba(34,136,201,0.28)',
                  boxShadow: isHov ? `0 8px 32px ${orgColor}22, 0 2px 8px rgba(0,0,0,0.3)` : '0 2px 8px rgba(0,0,0,0.2)',
                  transform: isHov ? 'translateY(-2px)' : 'translateY(0)',
                }}
              >
                {/* Top accent line */}
                <div
                  className="absolute top-0 left-0 right-0 h-0.5 transition-opacity duration-300"
                  style={{
                    background: `linear-gradient(90deg, ${orgColor}, #2abbd5)`,
                    opacity: isHov ? 1 : 0,
                  }}
                />
                {/* Left color strip */}
                <div
                  className="absolute left-0 top-4 bottom-4 w-0.5 rounded-full transition-opacity duration-300"
                  style={{ background: orgColor, opacity: isHov ? 0.8 : 0.3 }}
                />

                <div className="relative pl-5 pr-5 h-full flex items-center justify-between">
                  <div className="flex-1 min-w-0 pl-2">
                    <div className="flex items-center gap-2.5 mb-2">
                      <h3 className="text-[17px] font-bold text-white truncate">{org.name}</h3>
                      <span
                        className="px-2 py-0.5 text-[10px] font-bold rounded uppercase flex-shrink-0"
                        style={{
                          background: `${orgColor}30`,
                          color: role === 'owner' ? '#7acfe6' : role === 'admin' ? '#5bb8e8' : '#8baac4',
                          border: `1px solid ${orgColor}50`,
                        }}
                      >
                        {roleLabel(role)}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-[#bee5f0]/50">
                      <span className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5" />
                        {memberCount} üye
                      </span>
                      <span className="text-[#2288c9]/40">•</span>
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        {lastAccessedAt ? daysAgo(lastAccessedAt) : 'Henüz girilmedi'}
                      </span>
                    </div>
                  </div>
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-300"
                    style={{
                      background: isHov ? orgColor : `${orgColor}18`,
                      border: `1px solid ${isHov ? orgColor : `${orgColor}40`}`,
                      transform: isHov ? 'scale(1.05)' : 'scale(1)',
                    }}
                  >
                    <ArrowRight className={`w-4 h-4 transition-colors duration-300 ${isHov ? 'text-white' : 'text-[#7acfe6]'}`} strokeWidth={2.5} />
                  </div>
                </div>
              </div>
            </button>
          )
        })}

        {/* Divider */}
        <div className="py-1">
          <div className="border-t border-[#2288c9]/20" />
        </div>

        {/* Yeni Workspace */}
        {isPro && (
          <CTACard
            icon={<Plus className="w-5 h-5" strokeWidth={2.5} />}
            title="Yeni Workspace Oluştur"
            subtitle="Ekip workspace'i başlat"
            hovered={hoveredCTA === 'new'}
            onMouseEnter={() => setHoveredCTA('new')}
            onMouseLeave={() => setHoveredCTA(null)}
            onClick={() => router.push('/onboarding/create-org')}
          />
        )}

        {/* Katılım kodu */}
        {joinMode ? (
          <div className="rounded-xl bg-[#182c3f] border-2 border-[#2288c9]/40 p-5 space-y-3">
            <p className="text-xs font-semibold text-[#7acfe6]">Katılım Kodu ile Ekibe Katıl</p>
            <form onSubmit={handleJoinByCode} className="flex gap-2">
              <input
                type="text"
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                placeholder="ABC123"
                maxLength={6}
                autoFocus
                className="flex-1 bg-[#0d1a2a] border border-[#2288c9]/30 focus:border-[#2288c9] rounded-lg px-3 py-2 text-white font-mono font-bold tracking-widest text-center outline-none transition-all uppercase text-sm"
              />
              <button
                type="submit"
                disabled={joining || joinCode.length !== 6}
                className="bg-[#2288c9] hover:bg-[#1a6fa8] disabled:opacity-40 text-white font-bold px-5 rounded-lg text-sm transition-colors"
              >
                {joining ? '...' : 'Katıl'}
              </button>
              <button
                type="button"
                onClick={() => { setJoinMode(false); setJoinCode(''); setJoinErr(null) }}
                className="text-[#bee5f0]/40 hover:text-[#bee5f0] text-sm px-2 transition-colors"
              >
                İptal
              </button>
            </form>
            {joinErr && <p className="text-red-400 text-xs">{joinErr}</p>}
          </div>
        ) : (
          <CTACard
            icon={<Hash className="w-5 h-5" strokeWidth={2.5} />}
            title="Katılım Koduyla Katıl"
            subtitle="Mevcut workspace'e katıl"
            hovered={hoveredCTA === 'join'}
            onMouseEnter={() => setHoveredCTA('join')}
            onMouseLeave={() => setHoveredCTA(null)}
            onClick={() => setJoinMode(true)}
          />
        )}
      </div>

      <Footer left={<span>Toplam {workspaces.length} workspace</span>} onLogout={handleLogout} />
    </PageShell>
  )
}

// ── Shared components ─────────────────────────────────────────────────────

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0a1628] flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background glow — daha belirgin */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[10%] w-[600px] h-[600px] bg-[#2abbd5] rounded-full blur-[160px] opacity-[0.12]" />
        <div className="absolute bottom-[-5%] left-[5%] w-[500px] h-[500px] bg-[#2288c9] rounded-full blur-[130px] opacity-[0.14]" />
        <div className="absolute top-[40%] left-[40%] w-[300px] h-[300px] bg-[#1a5fa0] rounded-full blur-[100px] opacity-[0.10]" />
      </div>
      <div className="w-full max-w-2xl relative z-10">
        {children}
      </div>
    </div>
  )
}

function Header({ label, title, subtitle }: { label: string; title: string; subtitle: string }) {
  return (
    <div className="mb-8">
      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full mb-4"
        style={{ background: 'rgba(34,136,201,0.12)', border: '1px solid rgba(34,136,201,0.35)' }}>
        <div className="w-1.5 h-1.5 bg-[#7acfe6] rounded-full animate-pulse" />
        <span className="text-xs font-semibold text-[#7acfe6] tracking-wide">{label}</span>
      </div>
      <h1 className="text-4xl font-black text-white mb-2 tracking-tight leading-tight">{title}</h1>
      <p className="text-sm text-[#bee5f0]/50">{subtitle}</p>
    </div>
  )
}

function CTACard({
  icon, title, subtitle, hovered, onMouseEnter, onMouseLeave, onClick
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  hovered: boolean
  onMouseEnter: () => void
  onMouseLeave: () => void
  onClick: () => void
}) {
  return (
    <button className="w-full group relative text-left" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} onClick={onClick}>
      <div
        className="relative overflow-hidden rounded-xl h-[112px] border-2 transition-all duration-300 ease-out"
        style={{
          background: hovered
            ? 'linear-gradient(135deg, #1a3347 0%, #152a3a 100%)'
            : '#111f2e',
          borderColor: hovered ? '#2288c9' : 'rgba(34,136,201,0.2)',
          boxShadow: hovered ? '0 8px 32px rgba(34,136,201,0.15)' : 'none',
          transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        }}
      >
        <div
          className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-[#2288c9] to-[#2abbd5] transition-opacity duration-300"
          style={{ opacity: hovered ? 1 : 0 }}
        />
        <div className="relative p-5 h-full flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div
              className="w-12 h-12 rounded-lg flex items-center justify-center transition-all duration-300"
              style={{
                background: hovered ? '#2288c9' : 'rgba(34,136,201,0.1)',
                border: `1px solid ${hovered ? '#2288c9' : 'rgba(34,136,201,0.25)'}`,
                transform: hovered ? 'scale(1.05)' : 'scale(1)',
              }}
            >
              <span className={`transition-colors duration-300 ${hovered ? 'text-white' : 'text-[#7acfe6]'}`}>{icon}</span>
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-[#c0d8ea] mb-0.5">{title}</h3>
              <p className="text-xs text-[#bee5f0]/40">{subtitle}</p>
            </div>
          </div>
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-300"
            style={{
              background: hovered ? '#2288c9' : 'rgba(34,136,201,0.08)',
              border: `1px solid ${hovered ? '#2288c9' : 'rgba(34,136,201,0.2)'}`,
              transform: hovered ? 'scale(1.05)' : 'scale(1)',
            }}
          >
            <ArrowRight className={`w-4 h-4 transition-colors duration-300 ${hovered ? 'text-white' : 'text-[#7acfe6]'}`} strokeWidth={2.5} />
          </div>
        </div>
      </div>
    </button>
  )
}

function Footer({ left, onLogout }: { left: React.ReactNode; onLogout: () => void }) {
  return (
    <div className="mt-8 flex items-center justify-between text-xs text-[#bee5f0]/40">
      <span>{left}</span>
      <button onClick={onLogout} className="hover:text-[#7acfe6] transition-colors duration-200">
        Çıkış yap →
      </button>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────

function daysAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return mins <= 1 ? 'Az önce' : `${mins} dakika önce`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} saat önce`
  const days = Math.floor(hours / 24)
  if (days === 1) return '1 gün önce'
  if (days < 30) return `${days} gün önce`
  return `${Math.floor(days / 30)} ay önce`
}

function roleLabel(role: OrgRole): string {
  const labels: Record<OrgRole, string> = { owner: 'Sahibi', admin: 'Yönetici', member: 'Üye', consultant: 'Danışman' }
  return labels[role] ?? role
}
