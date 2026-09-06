'use client'

import { useState, useEffect } from 'react'
import { OrgProvider } from '@/lib/supabase/orgContext'
import DesktopSidebar from '@/components/responsive/DesktopSidebar'
import MobileNavigation, { MOBILE_TOPBAR_H } from '@/components/responsive/MobileNavigation'
import DuyuruPopup from '@/components/DuyuruPopup'

const COLLAPSED_KEY = 'deneyap-sidebar-collapsed'
const SIDEBAR_W_EXPANDED = 240
const SIDEBAR_W_COLLAPSED = 68

export default function OrgLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem(COLLAPSED_KEY)
    if (saved === 'true') setCollapsed(true)
  }, [])

  function handleToggle() {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem(COLLAPSED_KEY, String(next))
  }

  const w = collapsed ? SIDEBAR_W_COLLAPSED : SIDEBAR_W_EXPANDED

  return (
    <OrgProvider>
      {/* Duyuru popup'ı — kendi içinde yalnızca rolün ana ekranında açılıyor. */}
      <DuyuruPopup />
      {/* Masaüstü: sabit sidebar. Mobil: üst bar + drawer. Geçiş saf CSS
          breakpoint'i ile yapılır — hangi navigasyonun DOM'da olduğu
          davranışsal bir fark olduğundan (farklı bileşenler) ikisi de
          render edilip görünürlük Tailwind ile kontrol edilir. */}
      <div className="hidden md:block">
        <DesktopSidebar collapsed={collapsed} onToggle={handleToggle} />
      </div>
      <div className="md:hidden">
        <MobileNavigation />
      </div>

      <div
        className="min-h-screen transition-all duration-300 ease-in-out pt-[68px] md:pt-0 md:ml-[var(--sidebar-w)]"
        style={{ ['--sidebar-w' as string]: `${w}px`, ['--mobile-topbar-h' as string]: `${MOBILE_TOPBAR_H}px` } as React.CSSProperties}
      >
        {children}
      </div>
    </OrgProvider>
  )
}
