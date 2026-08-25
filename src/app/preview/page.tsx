'use client'

import { useState } from 'react'
import { OrgContext, type OrgContextValue } from '@/lib/supabase/orgContext'
import DesktopSidebar from '@/components/responsive/DesktopSidebar'
import MobileNavigation, { MOBILE_TOPBAR_H } from '@/components/responsive/MobileNavigation'
import ResponsivePageHeader from '@/components/responsive/ResponsivePageHeader'
import ResponsiveKPIGrid from '@/components/responsive/ResponsiveKPIGrid'
import ResponsiveModal from '@/components/responsive/ResponsiveModal'
import OperationRiskWidget from '@/components/responsive/OperationRiskWidget'

// Faz 1 doğrulama sayfası: gerçek Supabase oturumu olmadan Sidebar/primitive
// bileşenlerini masaüstü + mobil kırılım noktalarında göstermek için sahte
// bir OrgContext değeri sağlar. Faz 2'de gerçek org/[slug] layout'u bu
// sayfanın yerini alacak.
const MOCK_ORG_VALUE: OrgContextValue = {
  org: {
    id: 'demo-org', name: 'DENEYAP Ankara', slug: 'demo', plan: 'pro',
    max_members: 50, logo_url: null, primary_color: '#2288c9', accent_color: '#2abbd5',
    created_by: 'demo-user', created_at: new Date(0).toISOString(), join_code: 'DEMO',
  },
  orgRole: 'owner',
  userId: 'demo-user',
  userEmail: 'il-sorumlusu@deneyap.org',
  avatarUrl: null,
  isPro: true,
  hasAiAddon: true,
  isAdmin: true,
  isOwner: true,
  isConsultant: false,
  loading: false,
}

const MOCK_RISK_ITEMS = [
  { id: '1', label: 'Ankara — termin gecikmesi', level: 'high' as const },
  { id: '2', label: 'İzmir — kaynak yetersizliği', level: 'medium' as const },
  { id: '3', label: 'Bursa — normal seyir', level: 'low' as const },
]

export default function PreviewPage() {
  const [collapsed, setCollapsed] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <OrgContext.Provider value={MOCK_ORG_VALUE}>
      {/* Masaüstü sidebar */}
      <div className="hidden md:block">
        <DesktopSidebar collapsed={collapsed} onToggle={() => setCollapsed(v => !v)} />
      </div>

      {/* Mobil üst bar + drawer */}
      <div className="md:hidden">
        <MobileNavigation />
      </div>

      <main
        className="min-h-screen bg-slate-50 px-4 sm:px-6 py-6 md:py-8"
        style={{
          paddingTop: `calc(${MOBILE_TOPBAR_H}px + 24px)`,
          marginLeft: 0,
          transition: 'margin-left .3s ease',
        }}
      >
        <style>{`
          @media (min-width: 768px) {
            main { padding-top: 32px !important; margin-left: ${collapsed ? 68 : 240}px !important; }
          }
        `}</style>
        <div className="max-w-6xl mx-auto">
          <PreviewContent modalOpen={modalOpen} setModalOpen={setModalOpen} />
        </div>
      </main>
    </OrgContext.Provider>
  )
}

function PreviewContent({ modalOpen, setModalOpen }: { modalOpen: boolean; setModalOpen: (v: boolean) => void }) {
  return (
    <div className="px-2 sm:px-4">
      <ResponsivePageHeader
        title="Operasyon Paneli"
        subtitle="Faz 1 — responsive temel bileşen doğrulaması"
        actions={
          <button className="btn-primary" onClick={() => setModalOpen(true)}>
            Yeni Görev
          </button>
        }
      />

      <div className="mb-6">
        <OperationRiskWidget items={MOCK_RISK_ITEMS} />
      </div>

      <ResponsiveKPIGrid>
        <StatCard label="Açık Görevler" value="24" />
        <StatCard label="Bu Hafta Tamamlanan" value="11" />
        <StatCard label="Geciken" value="3" accent="#ef4444" />
        <StatCard label="Aktif İl Sayısı" value="7" />
      </ResponsiveKPIGrid>

      <ResponsiveModal open={modalOpen} onClose={() => setModalOpen(false)} title="Yeni Görev">
        <div className="space-y-3">
          <input className="input" placeholder="Görev başlığı" />
          <textarea className="input" placeholder="Açıklama" rows={3} />
          <button className="btn-primary w-full" onClick={() => setModalOpen(false)}>Kaydet</button>
        </div>
      </ResponsiveModal>
    </div>
  )
}

function StatCard({ label, value, accent = '#2288c9' }: { label: string; value: string; accent?: string }) {
  return (
    <div className="stat-card">
      <div className="text-2xl font-bold" style={{ color: accent }}>{value}</div>
      <div className="section-title mt-1">{label}</div>
    </div>
  )
}
