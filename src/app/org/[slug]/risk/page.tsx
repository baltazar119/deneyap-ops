'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { raporGorebilirMi } from '@/lib/roller'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { MapPin, ShieldCheck, ChevronRight } from 'lucide-react'
import { useOrg } from '@/lib/supabase/orgContext'
import { getCachedData, setCachedData } from '@/lib/pageDataCache'
import { computeRisk, fetchRiskInput, RISK_RENK, type RiskResult } from '@/lib/operationRisk'
import ResponsivePageHeader from '@/components/responsive/ResponsivePageHeader'

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
    // Yetkili Yönetici (viewer) raporları görebilir — ekran zaten salt okunur
    if (!raporGorebilirMi(orgRole)) {
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
        <div className="skeleton h-24 rounded-2xl" />
        <div className="skeleton h-32 rounded-2xl" />
        {[0, 1, 2].map((i) => <div key={i} className="skeleton h-16 rounded-2xl" />)}
      </div>
    )
  }

  if (!sonuc) return null

  const sakin = sonuc.provinces.length === 0 && sonuc.signals.length === 0
  const ilLinki = (il: string) => `/org/${org?.slug}/tasks?il=${encodeURIComponent(il === 'İl Belirtilmemiş' ? '' : il)}`

  return (
    <div className="min-h-screen" style={{ background: '#f5f7fa' }}>
      <main className="w-full px-4 sm:px-6 py-5 max-w-4xl mx-auto">

        <ResponsivePageHeader
          title="Operasyon Riski"
          subtitle={`${org?.name} · mevcut görev ve sprint verisinden otomatik hesaplanır`}
        />

        {/* ── Durum özeti — tek cümle, sayı yok; detaylar zaten aşağıdaki listelerde ── */}
        <div
          className="rounded-2xl p-5 sm:p-6 mb-5"
          style={{ background: 'linear-gradient(135deg, #0d1a2a 0%, #1a2f45 100%)', border: '1px solid rgba(122,207,230,0.15)' }}
        >
          <p className="text-lg sm:text-xl font-bold text-white leading-snug">
            {sonuc.headline}
          </p>
        </div>

        {sakin ? (
          <div className="rounded-2xl px-6 py-12 text-center" style={{ background: '#fff', border: '1px solid #e5e7eb' }}>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: '#d1fae5' }}>
              <ShieldCheck style={{ width: 26, height: 26, color: '#059669' }} />
            </div>
            <p className="text-base font-semibold" style={{ color: '#111827' }}>Her şey yolunda görünüyor</p>
            <p className="text-sm mt-2 max-w-md mx-auto" style={{ color: '#9ca3af' }}>
              Gecikmiş veya bloke görev, aşırı yüklenmiş üye ya da takvimin gerisinde kalan sprint yok.
            </p>
          </div>
        ) : (
          <>
            {/* ── İl durumu — "hangi ile önce bakmalıyım" sorusunun doğrudan cevabı ── */}
            {sonuc.provinces.length > 0 && (
              <section className="mb-6">
                <h2 className="text-sm font-bold mb-3 flex items-center gap-1.5" style={{ color: '#111827' }}>
                  <MapPin size={15} style={{ color: '#64748b' }} />
                  Hangi ile bakmalıyım?
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {sonuc.provinces.map((p) => {
                    const r = RISK_RENK[p.level]
                    return (
                      <Link
                        key={p.il}
                        href={ilLinki(p.il)}
                        className="flex items-center justify-between gap-3 rounded-2xl px-4 py-3.5 transition-all hover:opacity-90"
                        style={{ background: '#fff', border: '1px solid #e5e7eb', borderLeft: `4px solid ${r.color}` }}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold truncate" style={{ color: '#111827' }}>{p.il}</span>
                            <span
                              className="px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0"
                              style={{ background: r.bg, color: r.color }}
                            >
                              {r.label}
                            </span>
                          </div>
                          <p className="text-xs mt-1 truncate" style={{ color: '#64748b' }}>
                            {p.topIssue} · {p.openCount} açık görev
                          </p>
                        </div>
                        <ChevronRight size={16} style={{ color: '#cbd5e1', flexShrink: 0 }} />
                      </Link>
                    )
                  })}
                </div>
              </section>
            )}

            {/* ── Yapılacaklar — soyut sinyal yerine somut sonraki adım ── */}
            {sonuc.signals.length > 0 && (
              <section>
                <h2 className="text-sm font-bold mb-3" style={{ color: '#111827' }}>
                  Yapılacaklar
                </h2>
                <div className="space-y-2">
                  {sonuc.signals.map((s) => {
                    const r = RISK_RENK[s.level]
                    const icerik = (
                      <div
                        className="rounded-2xl px-4 py-3.5 transition-all"
                        style={{ background: '#fff', border: '1px solid #e5e7eb', borderLeft: `4px solid ${r.color}` }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-bold" style={{ color: '#111827' }}>{s.title}</p>
                          <span
                            className="px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0"
                            style={{ background: r.bg, color: r.color }}
                          >
                            {r.label}
                          </span>
                        </div>
                        <p className="text-xs mt-1.5 font-medium" style={{ color: '#334155' }}>→ {s.action}</p>
                        <p className="text-xs mt-1 leading-relaxed" style={{ color: '#94a3b8' }}>{s.detail}</p>
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
              </section>
            )}
          </>
        )}

        {/* ── Açıklama ── */}
        <p className="text-xs leading-relaxed mt-6" style={{ color: '#9ca3af' }}>
          Bu sayfa mevcut görev ve sprint verisinden otomatik hesaplanır, elle risk girilmez.
          Aşırı yük eşiği <strong style={{ color: '#64748b' }}>Ayarlar → Otomasyon</strong> bölümünden değiştirilebilir.
        </p>
      </main>
    </div>
  )
}
