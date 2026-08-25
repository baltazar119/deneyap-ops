'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useOrg } from '@/lib/supabase/orgContext'
import { supabase } from '@/lib/supabase/client'
import { clearAllCache } from '@/lib/roleCache'
import { getNavLinks, ROLE_LABEL, ROLE_COLOR } from '@/lib/navigation'
import NotificationCenter from '@/components/NotificationCenter'
import { Menu, X as XIcon, LogOut, ArrowLeftRight } from 'lucide-react'
import type { OrgRole } from '@/types/database'

export const MOBILE_TOPBAR_H = 68

export default function MobileNavigation() {
  const pathname = usePathname()
  const { org, orgRole, userEmail, avatarUrl, isPro, loading } = useOrg()
  const [signingOut, setSigningOut] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const role: OrgRole = (orgRole as OrgRole) ?? 'member'
  const navLinks = getNavLinks({ base: org?.slug ? `/org/${org.slug}` : '', role, isPro })

  async function handleSignOut() {
    setSigningOut(true)
    clearAllCache()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  const initials = userEmail ? userEmail.split('@')[0].slice(0, 2).toUpperCase() : '?'

  if (loading) {
    return (
      <div className="fixed top-0 left-0 right-0 z-40 flex items-center"
        style={{ height: MOBILE_TOPBAR_H, background: '#0b1622', borderBottom: '1px solid rgba(255,255,255,0.07)' }} />
    )
  }

  return (
    <>
      {/* Sabit üst bar */}
      <div className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between"
        style={{
          height: MOBILE_TOPBAR_H, padding: '0 14px',
          background: '#0b1622',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          boxShadow: '0 2px 16px rgba(0,0,0,0.4)',
        }}>
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <div className="w-9 h-9 rounded-xl overflow-hidden flex items-center justify-center shrink-0"
            style={{
              background: 'linear-gradient(135deg,rgba(34,136,201,0.35),rgba(42,187,213,0.2))',
              border: '1px solid rgba(122,207,230,0.28)',
              boxShadow: '0 2px 10px rgba(34,136,201,0.25)',
            }}>
            <Image src="/logo.svg" alt="DENEYAP" width={24} height={24} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1 }}>DENEYAP</div>
            <div style={{ fontSize: 10, color: 'rgba(122,207,230,0.5)', fontWeight: 500, marginTop: 2, letterSpacing: '0.04em' }}>OPS</div>
          </div>
        </Link>

        <div className="flex items-center gap-2">
          <NotificationCenter role={role === 'admin' || role === 'owner' ? 'admin' : role === 'consultant' ? 'consultant' : 'member'} orgId={org?.id} />
          <button onClick={() => setDrawerOpen(v => !v)}
            className="flex items-center justify-center rounded-xl"
            style={{
              width: 36, height: 36,
              background: drawerOpen ? 'rgba(42,187,213,0.15)' : 'rgba(255,255,255,0.07)',
              border: `1px solid ${drawerOpen ? 'rgba(42,187,213,0.3)' : 'rgba(255,255,255,0.1)'}`,
              color: drawerOpen ? '#7ae3f5' : 'rgba(255,255,255,0.6)',
            }}>
            {drawerOpen ? <XIcon size={16} /> : <Menu size={16} />}
          </button>
        </div>
      </div>

      {/* Overlay */}
      {drawerOpen && (
        <div className="fixed inset-0 z-30" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
          onClick={() => setDrawerOpen(false)} />
      )}

      {/* Drawer — sağdan açılır */}
      <div className="fixed top-0 right-0 h-full z-40 flex flex-col transition-transform duration-300 ease-in-out overflow-hidden"
        style={{
          width: 260,
          background: '#0b1622',
          borderLeft: '1px solid rgba(255,255,255,0.07)',
          boxShadow: '-8px 0 40px rgba(0,0,0,0.5)',
          transform: drawerOpen ? 'translateX(0)' : 'translateX(100%)',
        }}>
        <div className="flex items-center justify-between shrink-0"
          style={{ height: MOBILE_TOPBAR_H, padding: '0 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Menü</span>
          <button onClick={() => setDrawerOpen(false)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', padding: 4 }}>
            <XIcon size={18} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto" style={{ padding: '10px 10px' }}>
          {navLinks.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} onClick={() => setDrawerOpen(false)}
              className="flex items-center gap-3 rounded-xl mb-1"
              style={{
                height: 46, padding: '0 14px',
                background: isActive(href)
                  ? 'linear-gradient(135deg, rgba(34,136,201,0.35), rgba(42,187,213,0.22))'
                  : 'transparent',
                border: isActive(href) ? '1px solid rgba(42,187,213,0.3)' : '1px solid transparent',
              }}>
              <Icon style={{ width: 18, height: 18, flexShrink: 0, color: isActive(href) ? '#7ae3f5' : 'rgba(255,255,255,0.35)' }} />
              <span style={{
                fontSize: 14, fontWeight: isActive(href) ? 600 : 400,
                color: isActive(href) ? '#fff' : 'rgba(255,255,255,0.55)',
              }}>{label}</span>
            </Link>
          ))}
        </nav>

        <div className="shrink-0" style={{ padding: '8px 10px 16px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <Link href="/workspaces" onClick={() => setDrawerOpen(false)}
            className="flex items-center gap-3 rounded-xl mb-1"
            style={{ height: 44, padding: '0 14px', color: 'rgba(255,255,255,0.4)' }}>
            <ArrowLeftRight style={{ width: 17, height: 17 }} />
            <span style={{ fontSize: 13 }}>Workspace Değiştir</span>
          </Link>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '4px 2px 6px' }} />
          <div className="flex items-center gap-3 rounded-xl" style={{ padding: '0 14px', height: 52 }}>
            <div className="shrink-0 rounded-xl overflow-hidden flex items-center justify-center text-sm font-bold"
              style={{ width: 34, height: 34, background: avatarUrl ? 'transparent' : 'linear-gradient(135deg,#1f8fc9,#2abbd5)', color: '#fff' }}>
              {avatarUrl ? <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" /> : initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="truncate" style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.8)' }}>
                {userEmail?.split('@')[0]}
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: ROLE_COLOR[role] }}>{ROLE_LABEL[role]}</div>
            </div>
            <button onClick={handleSignOut} disabled={signingOut}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', padding: 4 }}>
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
