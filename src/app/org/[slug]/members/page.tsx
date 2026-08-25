'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useOrg } from '@/lib/supabase/orgContext'
import { FREE_LIMITS } from '@/lib/featureGate'
import { useIsMobile } from '@/lib/useIsMobile'
import type { OrgRole, Profile } from '@/types/database'

interface MemberRow {
  userId: string
  role: OrgRole
  joinedAt: string
  profile: Profile | null
}

interface InvitationRow {
  id: string
  email: string
  role: OrgRole
  expiresAt: string
  token: string
}

const ROLE_META: Record<OrgRole, { label: string; color: string; bg: string; border: string }> = {
  owner:      { label: 'Sahip',     color: '#92400e', bg: '#fef9ee', border: '#fcd34d' },
  admin:      { label: 'Yönetici',  color: '#1e40af', bg: '#eff6ff', border: '#93c5fd' },
  member:     { label: 'Üye',       color: '#374151', bg: '#f8fafc', border: '#e2e8f0' },
  consultant: { label: 'Danışman',  color: '#5b21b6', bg: '#faf5ff', border: '#c4b5fd' },
}

const AVATAR_COLORS = ['#1d4ed8','#0369a1','#0f766e','#166534','#7c2d12','#6d28d9','#be185d','#b45309']

function avatarBg(str: string) {
  return AVATAR_COLORS[str.charCodeAt(0) % AVATAR_COLORS.length]
}

function Avatar({ profile, name, size = 44 }: { profile: Profile | null; name: string; size?: number }) {
  const initial = name.charAt(0).toUpperCase()
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.28,
      background: profile?.avatar_url ? '#e2eaf2' : avatarBg(name),
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: size * 0.4, color: '#fff',
      flexShrink: 0, overflow: 'hidden',
      boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
    }}>
      {profile?.avatar_url
        ? <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : initial}
    </div>
  )
}

export default function MembersPage() {
  const router = useRouter()
  const { org, orgRole, userId, isAdmin, isPro, loading: orgLoading } = useOrg()

  const [members, setMembers] = useState<MemberRow[]>([])
  const [invitations, setInvitations] = useState<InvitationRow[]>([])
  const [loading, setLoading] = useState(true)
  const isMobile = useIsMobile()

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<OrgRole>('member')
  const [inviting, setInviting] = useState(false)
  const [inviteMsg, setInviteMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [roleChangeMsgs, setRoleChangeMsgs] = useState<Record<string, 'ok' | 'err'>>({})
  const [copyMsg, setCopyMsg] = useState<string | null>(null)
  const [rotatingCode, setRotatingCode] = useState(false)
  const [localJoinCode, setLocalJoinCode] = useState<string | null>(null)

  useEffect(() => {
    if (orgLoading) return
    if (!org || !userId) { router.replace('/login'); return }
    if (!isAdmin) { router.replace(`/org/${org.slug}/dashboard`); return }
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgLoading, org, userId, isAdmin])

  async function loadData() {
    if (!org) return
    setLoading(true)
    const { data: memberData } = await supabase
      .from('organization_members')
      .select('user_id, role, joined_at')
      .eq('organization_id', org.id)
      .order('joined_at', { ascending: true })

    if (memberData) {
      const userIds = memberData.map(m => m.user_id)
      const { data: profiles } = await supabase.from('profiles').select('*').in('id', userIds)
      const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]))
      setMembers(memberData.map(m => ({
        userId: m.user_id, role: m.role as OrgRole,
        joinedAt: m.joined_at, profile: profileMap[m.user_id] ?? null,
      })))
    }

    const { data: invData } = await supabase
      .from('organization_invitations')
      .select('id, email, role, expires_at, token')
      .eq('organization_id', org.id)
      .is('accepted_at', null)
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })

    setInvitations((invData ?? []).map(i => ({
      id: i.id, email: i.email, role: i.role as OrgRole,
      expiresAt: i.expires_at, token: i.token,
    })))
    setLoading(false)
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!org || !inviteEmail.trim()) return
    setInviting(true); setInviteMsg(null)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const res = await fetch('/api/org/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify({ organization_id: org.id, email: inviteEmail.trim(), role: inviteRole }),
    })
    const data = await res.json()
    if (!res.ok) {
      setInviteMsg({ type: 'err', text: data.error ?? 'Davet gönderilemedi' })
    } else {
      setInviteMsg({ type: 'ok', text: `Davet gönderildi: ${inviteEmail}` })
      setInviteEmail(''); loadData()
    }
    setInviting(false)
  }

  async function handleRoleChange(targetUserId: string, newRole: OrgRole) {
    if (!org) return
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const res = await fetch(`/api/org/${org.slug}/members/${targetUserId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify({ role: newRole }),
    })
    setRoleChangeMsgs(prev => ({ ...prev, [targetUserId]: res.ok ? 'ok' : 'err' }))
    setTimeout(() => setRoleChangeMsgs(prev => { const next = { ...prev }; delete next[targetUserId]; return next }), 2000)
    if (res.ok) loadData()
  }

  async function handleRemove(targetUserId: string) {
    if (!org || !confirm('Bu üyeyi çıkarmak istediğinize emin misiniz?')) return
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    await fetch(`/api/org/${org.slug}/members/${targetUserId}`, {
      method: 'DELETE', headers: { 'Authorization': `Bearer ${session.access_token}` },
    })
    loadData()
  }

  async function handleRevokeInvite(invId: string) {
    if (!org) return
    await supabase.from('organization_invitations').delete().eq('id', invId)
    loadData()
  }

  async function handleCopyCode() {
    const code = localJoinCode ?? org?.join_code
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      setCopyMsg('Kopyalandı!')
      setTimeout(() => setCopyMsg(null), 2000)
    } catch {
      setCopyMsg('Kopyalanamadı')
      setTimeout(() => setCopyMsg(null), 2000)
    }
  }

  async function handleRotateCode() {
    if (!org || !isAdmin) return
    setRotatingCode(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const res = await fetch(`/api/org/${org.slug}/rotate-join-code`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      })
      const data = await res.json()
      if (res.ok && data.join_code) {
        setLocalJoinCode(data.join_code)
        setCopyMsg('Kod yenilendi!')
        setTimeout(() => setCopyMsg(null), 2500)
      } else {
        setCopyMsg(data.error || 'Yenileme başarısız')
        setTimeout(() => setCopyMsg(null), 2500)
      }
    } catch {
      setCopyMsg('Bağlantı hatası')
      setTimeout(() => setCopyMsg(null), 2500)
    } finally {
      setRotatingCode(false)
    }
  }

  const atLimit = !isPro && members.length >= FREE_LIMITS.maxMembers

  if (orgLoading || loading) {
    return (
      <div className="min-h-screen" style={{ background: '#f4f6f9' }}>
        <main style={{ padding: 24 }} className="space-y-4">
          <div className="skeleton h-10 w-48 rounded-xl" />
          <div className="skeleton h-28 w-full rounded-2xl" />
          <div className="skeleton h-64 w-full rounded-2xl" />
        </main>
      </div>
    )
  }

  const pad = isMobile ? 16 : 24

  return (
    <div className="min-h-screen" style={{ background: '#f0f4f8' }}>
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }
        .mem-card { animation: fadeUp 0.2s cubic-bezier(0.16,1,0.3,1) both; }
        .mem-card:hover { box-shadow: 0 4px 20px rgba(15,23,42,0.10) !important; transform: translateY(-1px); }
        .remove-btn:hover { background: #fee2e2 !important; }
      `}</style>

      <main style={{ padding: pad, maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── Başlık ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: isMobile ? 20 : 22, fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.3px' }}>
              Ekip Yönetimi
            </h1>
            <p style={{ fontSize: 13, color: '#64748b', marginTop: 3 }}>
              {org?.name} · {members.length} üye
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {!isPro && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: '#fef9ee', color: '#92400e', border: '1px solid #fcd34d' }}>
                Free
              </span>
            )}
            <span style={{ fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 20, background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe' }}>
              {members.length} / {isPro ? '∞' : FREE_LIMITS.maxMembers} üye
            </span>
          </div>
        </div>

        {/* ── Katılım Kodu ── */}
        {(localJoinCode ?? org?.join_code) && (
          <div style={{
            background: 'linear-gradient(135deg, #0f172a 0%, #0c4a6e 100%)',
            borderRadius: 16,
            padding: '18px 20px',
            marginBottom: 24,
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            flexWrap: 'wrap',
          }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(122,207,230,0.7)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
                Katılım Kodu
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                {isAdmin ? 'Bu kodu paylaşarak ekibinizi davet edin' : 'Bu kodu arkadaşlarınızla paylaşın'}
              </div>
            </div>
            <div style={{
              fontFamily: 'monospace',
              fontSize: 24,
              fontWeight: 900,
              letterSpacing: '0.18em',
              color: '#7ae3f5',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(122,207,230,0.2)',
              borderRadius: 10,
              padding: '8px 18px',
            }}>
              {localJoinCode ?? org?.join_code}
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button
                onClick={handleCopyCode}
                style={{
                  background: '#0ea5e9', color: '#fff',
                  border: 'none', borderRadius: 8,
                  padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >
                {copyMsg === 'Kopyalandı!' ? '✓ Kopyalandı' : 'Kopyala'}
              </button>
              {isAdmin && (
                <button
                  onClick={handleRotateCode}
                  disabled={rotatingCode}
                  style={{
                    background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)',
                    border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8,
                    padding: '8px 14px', fontSize: 13, cursor: 'pointer',
                  }}
                >
                  {rotatingCode ? '...' : 'Yenile'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Davet Formu ── */}
        <div style={{
          background: 'linear-gradient(135deg, #1e40af 0%, #2563eb 100%)',
          borderRadius: 20, padding: isMobile ? 20 : 24,
          boxShadow: '0 4px 24px rgba(37,99,235,0.25)',
        }}>
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#fff', margin: 0 }}>Ekibe Üye Davet Et</p>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 3 }}>E-posta adresine davet bağlantısı gönderilir</p>
          </div>

          {atLimit && (
            <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#fff', backdropFilter: 'blur(4px)' }}>
              ⚠ Ücretsiz planda maks. {FREE_LIMITS.maxMembers} üye. Pro&apos;ya geçin.
            </div>
          )}

          <form onSubmit={handleInvite} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input
              type="email"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              placeholder="ornek@email.com"
              required
              disabled={atLimit}
              style={{
                width: '100%', padding: '11px 16px', borderRadius: 12, border: '1.5px solid rgba(255,255,255,0.3)',
                background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 14, outline: 'none',
                backdropFilter: 'blur(4px)', boxSizing: 'border-box',
              }}
              onFocus={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.8)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)')}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <select
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value as OrgRole)}
                disabled={atLimit}
                style={{
                  flex: 1, padding: '10px 12px', borderRadius: 12, border: '1.5px solid rgba(255,255,255,0.3)',
                  background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 13, outline: 'none',
                }}
              >
                <option value="member" style={{ color: '#000' }}>Üye</option>
                <option value="admin" style={{ color: '#000' }}>Yönetici</option>
                {isPro && <option value="consultant" style={{ color: '#000' }}>Danışman</option>}
              </select>
              <button
                type="submit"
                disabled={inviting || atLimit || !inviteEmail.trim()}
                style={{
                  flex: isMobile ? 1 : undefined,
                  padding: '10px 20px', borderRadius: 12, border: 'none', cursor: 'pointer',
                  background: 'rgba(255,255,255,0.95)', color: '#1e40af',
                  fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
                  opacity: (inviting || atLimit || !inviteEmail.trim()) ? 0.5 : 1,
                  transition: 'opacity 0.15s',
                }}
              >
                {inviting ? '...' : '+ Davet Gönder'}
              </button>
            </div>
          </form>

          {inviteMsg && (
            <p style={{ marginTop: 10, fontSize: 13, fontWeight: 600, color: inviteMsg.type === 'ok' ? '#bbf7d0' : '#fecaca' }}>
              {inviteMsg.type === 'ok' ? '✓' : '✕'} {inviteMsg.text}
            </p>
          )}
        </div>

        {/* ── Üye Kartları ── */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
              Üyeler
            </h2>
            <span style={{ fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: '#e2eaf2', color: '#475569' }}>
              {members.length}
            </span>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)',
            gap: 12,
          }}>
            {members.map((m, idx) => {
              const isMe = m.userId === userId
              const canEdit = m.role !== 'owner' && !isMe
              const feedback = roleChangeMsgs[m.userId]
              const name = m.profile?.full_name ?? m.profile?.email ?? m.userId
              const rm = ROLE_META[m.role]
              return (
                <div
                  key={m.userId}
                  className="mem-card"
                  style={{
                    background: '#fff', borderRadius: 16,
                    border: '1px solid #e2eaf2',
                    boxShadow: '0 1px 4px rgba(15,23,42,0.06)',
                    padding: 16, display: 'flex', alignItems: 'flex-start', gap: 14,
                    animationDelay: `${idx * 35}ms`,
                    transition: 'box-shadow 0.2s, transform 0.2s',
                  }}
                >
                  <Avatar profile={m.profile} name={name} size={46} />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* İsim satırı */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {name}
                      </span>
                      {isMe && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: '#f1f5f9', color: '#64748b' }}>
                          siz
                        </span>
                      )}
                    </div>
                    {/* E-posta */}
                    <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.profile?.email ?? ''}
                    </p>
                    {/* Rol + Aksiyonlar */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                      {canEdit ? (
                        <select
                          value={m.role}
                          onChange={e => handleRoleChange(m.userId, e.target.value as OrgRole)}
                          style={{
                            fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 8,
                            border: `1.5px solid ${rm.border}`, background: rm.bg, color: rm.color, outline: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          <option value="member">Üye</option>
                          <option value="admin">Yönetici</option>
                          {isPro && <option value="consultant">Danışman</option>}
                        </select>
                      ) : (
                        <span style={{
                          fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 8,
                          border: `1.5px solid ${rm.border}`, background: rm.bg, color: rm.color,
                        }}>
                          {rm.label}
                        </span>
                      )}
                      {feedback && (
                        <span style={{ fontSize: 14, fontWeight: 700, color: feedback === 'ok' ? '#16a34a' : '#dc2626' }}>
                          {feedback === 'ok' ? '✓' : '✕'}
                        </span>
                      )}
                      {canEdit && orgRole === 'owner' && (
                        <button
                          onClick={() => handleRemove(m.userId)}
                          className="remove-btn"
                          style={{
                            fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 8,
                            border: '1.5px solid #fca5a5', background: 'transparent', color: '#dc2626',
                            cursor: 'pointer', transition: 'background 0.15s',
                          }}
                        >
                          Çıkar
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Katılma tarihi */}
                  <div style={{ flexShrink: 0, textAlign: 'right' }}>
                    <p style={{ fontSize: 10, color: '#cbd5e1', fontWeight: 500 }}>
                      {new Date(m.joinedAt).toLocaleDateString('tr-TR', { month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Bekleyen Davetler ── */}
        {invitations.length > 0 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
                Bekleyen Davetler
              </h2>
              <span style={{ fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: '#fef9ee', color: '#92400e', border: '1px solid #fcd34d' }}>
                {invitations.length}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {invitations.map((inv) => {
                const rm = ROLE_META[inv.role]
                return (
                  <div
                    key={inv.id}
                    style={{
                      background: '#fff', borderRadius: 14, border: '1px dashed #e2eaf2',
                      padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14,
                    }}
                  >
                    <div style={{
                      width: 40, height: 40, borderRadius: 12, background: '#f8fafc',
                      border: '1.5px solid #e2eaf2', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', fontSize: 18, flexShrink: 0,
                    }}>
                      ✉
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontWeight: 600, fontSize: 13, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
                        {inv.email}
                      </p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: rm.bg, color: rm.color, border: `1px solid ${rm.border}` }}>
                          {rm.label}
                        </span>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>
                          {new Date(inv.expiresAt).toLocaleDateString('tr-TR')} tarihine kadar
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRevokeInvite(inv.id)}
                      style={{
                        fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 8,
                        border: '1.5px solid #fca5a5', background: '#fee2e2', color: '#dc2626',
                        cursor: 'pointer', flexShrink: 0,
                      }}
                    >
                      İptal
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

      </main>
    </div>
  )
}
