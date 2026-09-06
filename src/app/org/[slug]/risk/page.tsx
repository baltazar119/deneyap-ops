'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { riskGorebilirMi } from '@/lib/roller'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { MapPin, ShieldCheck, ChevronRight } from 'lucide-react'
import { useOrg } from '@/lib/supabase/orgContext'
import { getCachedData, setCachedData } from '@/lib/pageDataCache'
import { computeRisk, RISK_RENK, type RiskResult } from '@/lib/operationRisk'
import { fetchRiskInput } from '@/lib/risk/istemciVeri'
import ResponsivePageHeader from '@/components/responsive/ResponsivePageHeader'
import { supabase } from '@/lib/supabase/client'
import Cizgi from '@/components/grafik/Cizgi'
import type { RaporVerisi } from '@/lib/rapor/hesapla'

const ONEM_RENK: Record<string, { bg: string; bd: string; fg: string }> = {
  kritik: { bg: '#fef2f2', bd: '#fca5a5', fg: '#b91c1c' },
  uyari:  { bg: '#fffbeb', bd: '#fcd34d', fg: '#92400e' },
  bilgi:  { bg: '#f8fafc', bd: '#e2e8f0', fg: '#475569' },
  olumlu: { bg: '#f0fdf4', bd: '#86efac', fg: '#15803d' },
}

export default function OperasyonRiskPage() {
  const router = useRouter()
  const { org, orgRole, userId, userIl, isAdmin, loading: orgLoading } = useOrg()

  // Rol ve il önbellek anahtarına GİRMELİ: İl Sorumlusu ile Merkez aynı
  // anahtarı paylaşırsa biri diğerinin kapsamındaki veriyi görür.
  const cacheKey = org?.id ? `risk:${org.id}:${orgRole ?? '-'}:${userIl ?? '-'}` : ''
  const onbellek = cacheKey ? getCachedData<RiskResult>(cacheKey) : null

  const [sonuc, setSonuc] = useState<RiskResult | null>(onbellek)
  const [loading, setLoading] = useState(onbellek === null)
  // Yorum ve eğilim rapor API'sinden gelir; risk sayfası kendi hesabını
  // yapmaz. Hata durumunda sayfa yine çalışır (blok gizlenir).
  const [rapor, setRapor] = useState<RaporVerisi | null>(null)

  useEffect(() => {
    if (orgLoading) return
    if (!org || !userId) return
    // İl Sorumlusu da girebilir; kapsamı aşağıda kendi iliyle sınırlanır.
    if (!riskGorebilirMi(orgRole)) {
      router.replace(orgRole === 'consultant' ? `/org/${org.slug}/consultant` : `/org/${org.slug}/me`)
      return
    }

    let iptal = false
    async function yukle() {
      try {
        const girdi = await fetchRiskInput(org!.id)
        if (iptal) return

        // İl Sorumlusu kapsamı: yalnızca kendi ilinin görevleri.
        // RLS bu sayfada org genelini döndürüyor (kapsam kuralı taskScope'ta,
        // sorguda değil), bu yüzden daraltma burada YAPILMAK ZORUNDA —
        // aksi halde İl Sorumlusu ülke genelini görürdü.
        const kendiIli = orgRole === 'member' ? userIl : null
        const kapsamli = kendiIli
          ? { ...girdi, tasks: girdi.tasks.filter(t => t.il === kendiIli) }
          : girdi

        const r = computeRisk(kapsamli)
        setSonuc(r)
        setCachedData(cacheKey, r)
      } catch (err) {
        console.error('[Operasyon Risk] veri yüklenemedi:', err)
      } finally {
        if (!iptal) setLoading(false)
      }
    }
    yukle()

    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return
        const res = await fetch(`/api/org/${org!.slug}/rapor?format=json&donem=bu-ay`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        if (!res.ok || iptal) return
        setRapor(await res.json())
      } catch {
        /* yorum/eğilim bloğu gizli kalır — risk sayfası yine çalışır */
      }
    })()

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

        {/* ── Yorumlanmış veri ve eğilim ───────────────────────────────────
            Rapor API'sinden gelir; risk sayfası için AYRI bir hesap yolu
            açılmadı — iki yol zamanla ayrışır ve aynı ekranda iki farklı
            "geciken" sayısı görünür. */}
        {rapor?.yorum && rapor.yorum.maddeler.length > 0 && (
          <div className="rounded-2xl p-4 sm:p-5 mb-5" style={{ background: '#fff', border: '1px solid #e5e7eb' }}>
            <h2 className="font-semibold mb-1" style={{ color: '#0d1a2a' }}>Durum Yorumu</h2>
            <p className="text-sm mb-3" style={{ color: '#334155' }}>{rapor.yorum.ozet}</p>
            <div className="space-y-2">
              {rapor.yorum.maddeler.slice(0, 4).map((m, i) => {
                const r = ONEM_RENK[m.onem]
                return (
                  <div key={i} className="rounded-xl px-3 py-2" style={{ background: r.bg, border: `1px solid ${r.bd}` }}>
                    <div className="text-sm font-semibold" style={{ color: '#0d1a2a' }}>{m.baslik}</div>
                    <p className="text-sm" style={{ color: '#334155' }}>{m.cumle}</p>
                    {m.eylem && <p className="text-xs mt-1 font-medium" style={{ color: r.fg }}>Yapılacak: {m.eylem}</p>}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {rapor?.trend && rapor.trend.noktalar.length > 1 && (
          <div className="rounded-2xl p-4 sm:p-5 mb-5" style={{ background: '#fff', border: '1px solid #e5e7eb' }}>
            <h2 className="font-semibold mb-1" style={{ color: '#0d1a2a' }}>Son 90 Gün</h2>
            <p className="text-xs mb-3" style={{ color: '#94a3b8' }}>
              Riskin nereye gittiğini tek bir fotoğraf değil, eğilim gösterir.
            </p>
            <Cizgi
              etiketler={rapor.trend.noktalar.map(n => n.etiket)}
              turetilmis={rapor.trend.noktalar.map(n => n.turetilmis)}
              seriler={[
                { ad: 'Geciken', renk: '#dc2626', degerler: rapor.trend.noktalar.map(n => n.geciken) },
                { ad: 'Açık',    renk: '#2288c9', degerler: rapor.trend.noktalar.map(n => n.acik) },
              ]}
              turetilmisNotu={
                rapor.trend.tamamenTuretilmis
                  ? 'Kesikli çizgi: günlük ölçüm henüz birikmedi, seri görev tarihlerinden hesaplandı.'
                  : 'Kesikli bölümler ölçüm öncesine ait.'
              }
            />
          </div>
        )}

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
                        className="block rounded-2xl px-4 py-3.5 transition-all hover:opacity-90"
                        style={{ background: '#fff', border: '1px solid #e5e7eb', borderLeft: `4px solid ${r.color}` }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 flex items-center gap-2">
                            <span className="text-sm font-bold truncate" style={{ color: '#111827' }}>{p.il}</span>
                            <span
                              className="px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0"
                              style={{ background: r.bg, color: r.color }}
                            >
                              {r.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-sm font-bold tabular-nums" style={{ color: r.color }}>{p.score}</span>
                            <ChevronRight size={16} style={{ color: '#cbd5e1' }} />
                          </div>
                        </div>
                        <p className="text-xs mt-1 truncate" style={{ color: '#64748b' }}>
                          {p.topIssue} · {p.openCount} açık görev
                        </p>
                        {/* Diğer illerle kabaca kıyaslamak için — çıplak sayı yerine görsel referans */}
                        <div className="h-1 rounded-full mt-2 overflow-hidden" style={{ background: '#f1f5f9' }}>
                          <div className="h-full rounded-full transition-all" style={{ width: `${p.score}%`, background: r.color }} />
                        </div>
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
