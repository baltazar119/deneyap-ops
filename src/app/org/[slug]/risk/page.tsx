'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, Clock, Ban, UserX, PauseCircle, ShieldCheck } from 'lucide-react'
import { useOrg } from '@/lib/supabase/orgContext'
import { getCachedData, setCachedData } from '@/lib/pageDataCache'
import { computeRisk, fetchRiskInput, RISK_RENK, type RiskResult } from '@/lib/operationRisk'
import ResponsivePageHeader from '@/components/responsive/ResponsivePageHeader'
import ResponsiveKPIGrid from '@/components/responsive/ResponsiveKPIGrid'

export default function OperasyonRiskPage() {
  const router = useRouter()
  const { org, orgRole, userId, isAdmin, loading: orgLoading } = useOrg()

  const cacheKey = org?.id ? `risk:${org.id}` : ''
  const onbellek = cacheKey ? getCachedData<RiskResult>(cacheKey) : null

  const [sonuc, setSonuc] = useState<RiskResult | null>(onbellek)
  const [loading, setLoading] = useState(onbellek === null)

  useEffect(() => {
    if (orgLoading) return
    if (!org || !userId) return
    if (!isAdmin) {
      router.replace(orgRole === 'consultant' ? `/org/${org.slug}/consultant` : `/org/${org.slug}/me`)
      return
    }

    let iptal = false
    async function yukle() {
      try {
        const girdi = await fetchRiskInput(org!.id)
        if (iptal) return
        const r = computeRisk(girdi)
        setSonuc(r)
        setCachedData(`risk:${org!.id}`, r)
      } catch (err) {
        console.error('[Operasyon Risk] veri yüklenemedi:', err)
      } finally {
        if (!iptal) setLoading(false)
      }
    }
    yukle()
    return () => { iptal = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgLoading, org?.id, userId, isAdmin, orgRole])

  if (loading) {
    return (
      <div className="min-h-screen px-4 sm:px-6 py-5 space-y-4" style={{ background: '#f5f7fa' }}>
        <div className="skeleton h-8 w-56 rounded-xl" />
        <div className="skeleton h-28 rounded-2xl" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-24 rounded-2xl" />)}
        </div>
        {[0, 1, 2].map((i) => <div key={i} className="skeleton h-20 rounded-2xl" />)}
      </div>
    )
  }

  if (!sonuc) return null

  const renk = RISK_RENK[sonuc.level]
  const temiz = sonuc.signals.length === 0

  const kpiler = [
    { etiket: 'Termini Geçen', deger: sonuc.counts.overdue,            icon: Clock,        renk: '#dc2626', bg: '#fee2e2' },
    { etiket: 'Bloke',         deger: sonuc.counts.blocked,            icon: Ban,          renk: '#b45309', bg: '#fef3c7' },
    { etiket: 'Atanmamış Kritik', deger: sonuc.counts.unassignedCritical, icon: UserX,     renk: '#7c3aed', bg: '#ede9fe' },
    { etiket: 'Aşırı Yüklü Üye', deger: sonuc.counts.overloaded,       icon: AlertTriangle, renk: '#2288c9', bg: '#e0f2fe' },
  ]

  return (
    <div className="min-h-screen" style={{ background: '#f5f7fa' }}>
      <main className="w-full px-4 sm:px-6 py-5">

        <ResponsivePageHeader
          title="Operasyon Riski"
          subtitle={`${org?.name} · mevcut görev ve sprint verisinden otomatik hesaplanır`}
        />

        {/* ── Genel risk skoru ── */}
        <div
          className="rounded-2xl p-5 sm:p-6 mb-5"
          style={{ background: 'linear-gradient(135deg, #0d1a2a 0%, #1a2f45 100%)', border: '1px solid rgba(122,207,230,0.15)' }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: 'rgba(122,207,230,0.55)' }}>
                Genel Risk Durumu
              </p>
              <div className="flex items-center gap-3">
                <span className="text-3xl sm:text-4xl font-black text-white leading-none">{sonuc.score}</span>
                <span className="text-sm" style={{ color: 'rgba(255,255,255,0.35)' }}>/ 100</span>
                <span
                  className="px-3 py-1 rounded-full text-xs font-bold"
                  style={{ background: renk.bg, color: renk.color }}
                >
                  {renk.label}
                </span>
              </div>
              <p className="text-xs mt-2" style={{ color: 'rgba(255,255,255,0.4)' }}>
                {temiz
                  ? 'Şu an açık bir risk sinyali yok.'
                  : `${sonuc.signals.length} risk sinyali tespit edildi.`}
              </p>
            </div>

            {/* Skor barı */}
            <div className="w-full sm:w-64">
              <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${sonuc.score}%`, background: renk.color }}
                />
              </div>
              <div className="flex justify-between mt-1.5">
                <span className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>Düşük</span>
                <span className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>Yüksek</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── KPI kartları ── */}
        <div className="mb-5">
          <ResponsiveKPIGrid>
            {kpiler.map(({ etiket, deger, icon: Icon, renk: c, bg }) => (
              <div key={etiket} className="stat-card">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center mb-3"
                  style={{ background: bg }}
                >
                  <Icon style={{ width: 17, height: 17, color: c }} />
                </div>
                <div className="text-2xl font-bold" style={{ color: deger > 0 ? c : '#94a3b8', letterSpacing: '-0.02em' }}>
                  {deger}
                </div>
                <div className="text-xs mt-0.5 font-medium" style={{ color: '#9ca3af' }}>{etiket}</div>
              </div>
            ))}
          </ResponsiveKPIGrid>
        </div>

        {/* ── Risk sinyalleri ── */}
        {temiz ? (
          <div
            className="rounded-2xl px-6 py-12 text-center"
            style={{ background: '#fff', border: '1px solid #e5e7eb' }}
          >
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background: '#d1fae5' }}
            >
              <ShieldCheck style={{ width: 26, height: 26, color: '#059669' }} />
            </div>
            <p className="text-base font-semibold" style={{ color: '#111827' }}>Her şey yolunda görünüyor</p>
            <p className="text-sm mt-2 max-w-md mx-auto" style={{ color: '#9ca3af' }}>
              Gecikmiş veya bloke görev, aşırı yüklenmiş üye ya da takvimin gerisinde kalan sprint yok.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {sonuc.signals.map((s) => {
              const r = RISK_RENK[s.level]
              const icerik = (
                <div
                  className="rounded-2xl p-4 h-full transition-all"
                  style={{ background: '#fff', border: '1px solid #e5e7eb', borderLeft: `4px solid ${r.color}` }}
                >
                  <div className="flex items-start justify-between gap-3 mb-1.5">
                    <p className="text-sm font-bold" style={{ color: '#111827' }}>{s.title}</p>
                    <span
                      className="px-2 py-0.5 rounded-full text-xs font-bold shrink-0"
                      style={{ background: r.bg, color: r.color }}
                    >
                      {r.label}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: '#64748b' }}>{s.detail}</p>
                </div>
              )

              return s.link ? (
                <Link key={s.id} href={`/org/${org?.slug}/${s.link}`} className="block hover:opacity-90 transition-opacity">
                  {icerik}
                </Link>
              ) : (
                <div key={s.id}>{icerik}</div>
              )
            })}
          </div>
        )}

        {/* ── Açıklama ── */}
        <div
          className="rounded-2xl px-5 py-4 mt-5 flex items-start gap-3"
          style={{ background: 'rgba(34,136,201,0.05)', border: '1px solid rgba(34,136,201,0.15)' }}
        >
          <PauseCircle style={{ width: 16, height: 16, color: '#2288c9', flexShrink: 0, marginTop: 2 }} />
          <p className="text-xs leading-relaxed" style={{ color: '#64748b' }}>
            Risk sinyalleri ayrı bir kayıt tutulmadan, mevcut görev ve sprint verisinden otomatik
            hesaplanır: termini geçen ve yaklaşan görevler, bloke işler, atanmamış kritik görevler,
            aşırı yüklenmiş üyeler, takvimin gerisinde kalan sprintler ve uzun süredir beklemede
            duran görevler. Aşırı yük eşiği <strong>Ayarlar → Otomasyon</strong> bölümünden değiştirilebilir.
          </p>
        </div>
      </main>
    </div>
  )
}
