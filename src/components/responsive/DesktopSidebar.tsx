'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useOrg } from '@/lib/supabase/orgContext'
import { supabase } from '@/lib/supabase/client'
import { clearAllCache } from '@/lib/roleCache'
import { getNavLinks, ROLE_LABEL, ROLE_COLOR } from '@/lib/navigation'
import NotificationCenter from '@/components/NotificationCenter'
import OperationRiskWidget from '@/components/responsive/OperationRiskWidget'
import { ChevronLeft, ChevronRight, LogOut, ArrowLeftRight, Star, User } from 'lucide-react'
import type { OrgRole } from '@/types/database'

interface DesktopSidebarProps {
  collapsed: boolean
  onToggle: () => void
}

const W_EXPANDED = 240
const W_COLLAPSED = 68
const ACCENT_COLOR = '#2abbd5'

export default function DesktopSidebar({ collapsed, onToggle }: DesktopSidebarProps) {
  const pathname = usePathname()
  const { org, orgRole, userEmail, avatarUrl, isPro, loading } = useOrg()
  const [signingOut, setSigningOut] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)

  const base = org?.slug ? `/org/${org.slug}` : ''
  const role: OrgRole = (orgRole as OrgRole) ?? 'member'

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false)
      }
    }
    if (profileOpen) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [profileOpen])

  async function handleSignOut() {
    setSigningOut(true)
    clearAllCache()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/')

  const isAdminOrOwner = role === 'admin' || role === 'owner'
  const isSuperAdmin =
    !!process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL &&
    userEmail === process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL

  const homeHref = isAdminOrOwner
    ? `${base}/dashboard`
    : role === 'consultant'
      ? `${base}/consultant`
      : `${base}/me`

  const navLinks = getNavLinks({ base, role, isPro })
  const initials = userEmail ? userEmail.split('@')[0].slice(0, 2).toUpperCase() : '?'
  const W = collapsed ? W_COLLAPSED : W_EXPANDED

  if (loading) {
    return (
      <div
        className="fixed left-0 top-0 h-screen z-30 transition-all duration-300 ease-in-out"
        style={{ width: W, background: '#0b1622', borderRight: '1px solid rgba(255,255,255,0.06)' }}
      />
    )
  }

  return (
    <div
      className="fixed left-0 top-0 h-screen z-30 flex flex-col transition-all duration-300 ease-in-out overflow-hidden"
      style={{
        width: W,
        background: '#0b1622',
        borderRight: '1px solid rgba(255,255,255,0.07)',
        boxShadow: '2px 0 20px rgba(0,0,0,0.35)',
      }}
    >
      {/* ── HEADER ── */}
      {collapsed ? (
        <div
          className="flex flex-col items-center shrink-0"
          style={{ padding: '16px 0 12px', gap: 10, borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <Link href="/" className="group" title="DENEYAP Ops">
            <div
              className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center transition-transform duration-200 group-hover:scale-105"
              style={{
                background: 'linear-gradient(135deg,rgba(34,136,201,0.3),rgba(42,187,213,0.18))',
                border: '1px solid rgba(122,207,230,0.22)',
                boxShadow: '0 2px 12px rgba(34,136,201,0.18)',
              }}
            >
              <Image src="/logo.svg" alt="DENEYAP" width={28} height={28} className="w-full h-full object-contain" />
            </div>
          </Link>
          <button
            onClick={onToggle}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-150 hover:scale-110"
            style={{ background: 'rgba(42,187,213,0.1)', border: '1px solid rgba(42,187,213,0.2)', color: 'rgba(122,207,230,0.7)' }}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          {org && (
            <Link href={homeHref} title={org.name} className="group">
              <div
                className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center transition-all duration-150 group-hover:opacity-80"
                style={{ background: 'linear-gradient(135deg,rgba(34,136,201,0.25),rgba(42,187,213,0.15))', border: '1px solid rgba(122,207,230,0.25)' }}
              >
                <Image
                  src={org.logo_url ?? '/logo.svg'}
                  alt={org.name}
                  width={22} height={22}
                  className="w-full h-full object-contain"
                  unoptimized={!!org.logo_url}
                />
              </div>
            </Link>
          )}
        </div>
      ) : (
        <>
          <div
            className="flex items-center justify-between shrink-0"
            style={{ height: 60, padding: '0 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
          >
            <Link href="/" className="flex items-center gap-2.5 min-w-0 group">
              <div
                className="shrink-0 w-9 h-9 rounded-xl overflow-hidden flex items-center justify-center transition-transform duration-200 group-hover:scale-105"
                style={{
                  background: 'linear-gradient(135deg,rgba(34,136,201,0.3),rgba(42,187,213,0.18))',
                  border: '1px solid rgba(122,207,230,0.22)',
                  boxShadow: '0 2px 12px rgba(34,136,201,0.18)',
                }}
              >
                <Image src="/logo.svg" alt="DENEYAP" width={26} height={26} className="w-full h-full object-contain" />
              </div>
              <div className="min-w-0">
                <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1 }}>DENEYAP</div>
                <div style={{ fontSize: 10, color: 'rgba(122,207,230,0.45)', fontWeight: 500, marginTop: 2, letterSpacing: '0.04em' }}>OPS</div>
              </div>
            </Link>
            <button
              onClick={onToggle}
              className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-150 hover:bg-white/[0.07]"
              style={{ color: 'rgba(255,255,255,0.25)' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'rgba(122,207,230,0.8)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.25)' }}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          {org && (
            <Link href={homeHref}
              className="flex items-center gap-2.5 shrink-0 group transition-all duration-150"
              style={{
                margin: '8px 10px 4px', padding: '7px 10px', borderRadius: 12,
                background: `${ACCENT_COLOR}11`, border: `1px solid ${ACCENT_COLOR}28`, textDecoration: 'none',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = `${ACCENT_COLOR}1e` }}
              onMouseLeave={e => { e.currentTarget.style.background = `${ACCENT_COLOR}11` }}
            >
              <div
                className="shrink-0 rounded-lg overflow-hidden flex items-center justify-center"
                style={{ width: 28, height: 28, background: 'linear-gradient(135deg,rgba(34,136,201,0.25),rgba(42,187,213,0.15))', border: '1px solid rgba(122,207,230,0.25)' }}
              >
                <Image
                  src={org.logo_url ?? '/logo.svg'}
                  alt={org.name}
                  width={20} height={20}
                  className="w-full h-full object-contain"
                  unoptimized={!!org.logo_url}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate" style={{ fontSize: 12.5, fontWeight: 600, color: 'rgba(255,255,255,0.8)', letterSpacing: '-0.01em' }}>
                  {org.name}
                </div>
                <div style={{ fontSize: 10, color: isPro ? '#f59e0b' : `${ACCENT_COLOR}99`, fontWeight: 500, marginTop: 1 }}>
                  {isPro ? '✦ Pro' : 'Ücretsiz'}
                </div>
              </div>
            </Link>
          )}
        </>
      )}

      {/* ── NAV ── */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden" style={{ padding: '8px 10px' }}>
        {navLinks.map(({ href, label, icon: Icon }) => (
          <NavItem key={href} href={href} label={label} icon={Icon} active={isActive(href)} collapsed={collapsed} accentColor={ACCENT_COLOR} />
        ))}
      </nav>

      {/* ── Operasyon Risk özeti ── */}
      {!collapsed && role !== 'consultant' && (
        <div className="shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '8px 10px 0' }}>
          <OperationRiskWidget items={[]} />
        </div>
      )}

      {/* ── FOOTER ── */}
      <div className="shrink-0" style={{ padding: '8px 10px 12px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <FooterItem href="/workspaces" icon={ArrowLeftRight} label="Workspace Değiştir" collapsed={collapsed} />
        {isSuperAdmin && (
          <FooterItem href="/admin" icon={Star} label="Admin Paneli" collapsed={collapsed} highlight />
        )}

        <div
          className="flex items-center rounded-xl"
          style={{ height: 44, padding: collapsed ? '0' : '0 12px', justifyContent: collapsed ? 'center' : 'flex-start', gap: 12 }}
        >
          <NotificationCenter
            role={role === 'admin' || role === 'owner' ? 'admin' : role === 'consultant' ? 'consultant' : 'member'}
            orgId={org?.id}
          />
          {!collapsed && <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>Bildirimler</span>}
        </div>

        <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '6px 2px' }} />

        {/* Profil */}
        <div ref={profileRef} className="relative">
          <button
            onClick={() => setProfileOpen(v => !v)}
            className="w-full flex items-center rounded-xl transition-all duration-150"
            style={{
              height: 52,
              padding: collapsed ? '0' : '0 12px',
              justifyContent: collapsed ? 'center' : 'flex-start',
              gap: 12,
              background: profileOpen ? 'rgba(42,187,213,0.1)' : 'transparent',
              border: `1px solid ${profileOpen ? 'rgba(42,187,213,0.2)' : 'transparent'}`,
            }}
            onMouseEnter={e => { if (!profileOpen) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
            onMouseLeave={e => { if (!profileOpen) e.currentTarget.style.background = 'transparent' }}
          >
            <div
              className="shrink-0 rounded-xl overflow-hidden flex items-center justify-center text-sm font-bold"
              style={{
                width: 34, height: 34,
                background: avatarUrl ? 'transparent' : 'linear-gradient(135deg,#1f8fc9,#2abbd5)',
                color: '#fff',
                boxShadow: avatarUrl ? 'none' : '0 2px 10px rgba(42,187,213,0.3)',
              }}
            >
              {avatarUrl ? <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" /> : initials}
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0 text-left">
                <div className="truncate" style={{ fontSize: 13.5, fontWeight: 500, color: 'rgba(255,255,255,0.85)' }}>
                  {userEmail?.split('@')[0]}
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: ROLE_COLOR[role], marginTop: 1 }}>
                  {ROLE_LABEL[role]}
                </div>
              </div>
            )}
          </button>

          {profileOpen && (
            <div
              className="absolute bottom-full mb-2 left-0 right-0 rounded-xl overflow-hidden"
              style={{ background: '#0d1e30', border: '1px solid rgba(122,207,230,0.14)', boxShadow: '0 -16px 40px rgba(0,0,0,0.55)', minWidth: 200 }}
            >
              <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }} className="truncate">
                  {userEmail?.split('@')[0]}
                </div>
                <div style={{ fontSize: 11, marginTop: 2, color: ROLE_COLOR[role], fontWeight: 600 }}>
                  {ROLE_LABEL[role]}
                </div>
              </div>
              <div className="p-2 space-y-0.5">
                <Link
                  href={`${base}/profile`}
                  onClick={() => setProfileOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors"
                  style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.6)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = '#fff' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)' }}
                >
                  <User className="w-4 h-4" /> Profilim
                </Link>
                <button
                  onClick={() => { setProfileOpen(false); handleSignOut() }}
                  disabled={signingOut}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors disabled:opacity-50"
                  style={{ fontSize: 13, fontWeight: 500, color: '#f87171' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(248,113,113,0.09)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  <LogOut className="w-4 h-4" />
                  {signingOut ? 'Çıkış yapılıyor...' : 'Çıkış Yap'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function NavItem({
  href, label, icon: Icon, active, collapsed, accentColor = '#2abbd5',
}: {
  href: string; label: string; icon: React.ElementType; active: boolean; collapsed: boolean; accentColor?: string
}) {
  const [hovered, setHovered] = useState(false)

  const hexToRgb = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `${r},${g},${b}`
  }
  const rgb = accentColor.startsWith('#') && accentColor.length === 7 ? hexToRgb(accentColor) : '42,187,213'

  return (
    <Link
      href={href}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="relative flex items-center rounded-xl mb-1 group"
      style={{
        height: 44,
        padding: collapsed ? '0' : '0 14px',
        justifyContent: collapsed ? 'center' : 'flex-start',
        gap: 12,
        background: active
          ? `linear-gradient(135deg, rgba(${rgb},0.28), rgba(${rgb},0.16))`
          : hovered ? 'rgba(255,255,255,0.06)' : 'transparent',
        border: active ? `1px solid rgba(${rgb},0.35)` : '1px solid transparent',
        transition: 'background 0.12s, border 0.12s',
      }}
    >
      <Icon
        style={{
          width: 18, height: 18, flexShrink: 0,
          color: active ? accentColor : hovered ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.32)',
          transition: 'color 0.12s',
        }}
      />
      {!collapsed && (
        <span style={{
          fontSize: 14, fontWeight: active ? 600 : 400,
          color: active ? '#ffffff' : hovered ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.5)',
          letterSpacing: '-0.01em', transition: 'color 0.12s',
        }}>
          {label}
        </span>
      )}
      {collapsed && (
        <span
          className="absolute left-full ml-3 px-3 py-1.5 rounded-lg text-sm font-medium text-white whitespace-nowrap pointer-events-none z-50 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
          style={{ background: '#0d1e30', border: '1px solid rgba(122,207,230,0.18)', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}
        >
          {label}
        </span>
      )}
    </Link>
  )
}

function FooterItem({
  href, icon: Icon, label, collapsed, highlight,
}: {
  href: string; icon: React.ElementType; label: string; collapsed: boolean; highlight?: boolean
}) {
  return (
    <Link
      href={href}
      className="flex items-center rounded-xl mb-1 group relative"
      style={{
        height: 44,
        padding: collapsed ? '0' : '0 14px',
        justifyContent: collapsed ? 'center' : 'flex-start',
        gap: 12,
        color: highlight ? '#f59e0b' : 'rgba(255,255,255,0.38)',
        background: highlight ? 'rgba(245,158,11,0.08)' : 'transparent',
        border: highlight ? '1px solid rgba(245,158,11,0.14)' : '1px solid transparent',
        transition: 'background 0.12s',
      }}
      onMouseEnter={e => {
        if (!highlight) { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'rgba(255,255,255,0.75)' }
      }}
      onMouseLeave={e => {
        if (!highlight) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.38)' }
      }}
    >
      <Icon style={{ width: 18, height: 18, flexShrink: 0 }} />
      {!collapsed && <span style={{ fontSize: 14, fontWeight: highlight ? 600 : 400 }}>{label}</span>}
      {collapsed && (
        <span
          className="absolute left-full ml-3 px-3 py-1.5 rounded-lg text-sm font-medium text-white whitespace-nowrap pointer-events-none z-50 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
          style={{ background: '#0d1e30', border: '1px solid rgba(122,207,230,0.18)', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}
        >
          {label}
        </span>
      )}
    </Link>
  )
}
