'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useOrg } from '@/lib/supabase/orgContext'
import { getCachedData, setCachedData } from '@/lib/pageDataCache'
import { computeRisk, RISK_RENK, type RiskResult } from '@/lib/operationRisk'
import { fetchRiskInput } from '@/lib/risk/istemciVeri'

/**
 * Sidebar'daki kompakt operasyon risk şeridi.
 *
 * Tarlis'teki AtölyeBarı'nın ("şu an atölyede kim var") görsel yapısı
 * korunarak DENEYAP'ın operasyon risk özetine dönüştürüldü. Risk verisi
 * /risk sayfasıyla aynı hesaplamayı (lib/operationRisk) kullanır ve aynı
 * önbelleği paylaşır — sayfa geçişlerinde tekrar sorgu atılmaz.
 */
export default function OperationRiskWidget() {
  const { org, isAdmin, loading: orgLoading } = useOrg()

  const onbellek = org?.id ? getCachedData<RiskResult>(`risk:${org.id}`) : null
  const [sonuc, setSonuc] = useState<RiskResult | null>(onbellek)

  useEffect(() => {
    if (orgLoading || !org?.id || !isAdmin) return

    let iptal = false
    async function yukle() {
      try {
        const girdi = await fetchRiskInput(org!.id)
        if (iptal) return
        const r = computeRisk(girdi)
        setSonuc(r)
        setCachedData(`risk:${org!.id}`, r)
      } catch {
        // Sidebar'da sessizce geç — risk özeti kritik bir bileşen değil
      }
    }
    yukle()
    return () => { iptal = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgLoading, org?.id, isAdmin])

  if (!isAdmin || !sonuc) return null

  const renk = RISK_RENK[sonuc.level]
  const enUsttekiler = sonuc.signals.slice(0, 2)

  return (
    <Link
      href={`/org/${org?.slug}/risk`}
      className="block rounded-xl transition-colors"
      style={{
        background: 'linear-gradient(90deg, rgba(122,207,230,0.06) 0%, rgba(34,136,201,0.04) 100%)',
        border: '1px solid rgba(122,207,230,0.14)',
        padding: '9px 11px',
        textDecoration: 'none',
      }}
      title="Operasyon Riski sayfasını aç"
    >
      {/* Üst satır: durum + skor */}
      <div className="flex items-center gap-2">
        <span
          className="inline-block w-2 h-2 rounded-full shrink-0"
          style={{ background: renk.color, boxShadow: `0 0 0 3px ${renk.color}2e` }}
        />
        <span style={{ fontSize: 11.5, fontWeight: 600, color: 'rgba(255,255,255,0.72)', flex: 1 }}>
          {sonuc.signals.length === 0 ? 'Açık risk yok' : `${sonuc.signals.length} risk sinyali`}
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 800,
            color: renk.color,
            background: `${renk.color}1f`,
            borderRadius: 99,
            padding: '1px 7px',
          }}
        >
          {sonuc.score}
        </span>
      </div>

      {/* Alt satır: en yüksek iki sinyal */}
      {enUsttekiler.length > 0 && (
        <div className="mt-1.5 flex flex-col gap-1">
          {enUsttekiler.map((s) => (
            <div key={s.id} className="flex items-center gap-1.5">
              <span
                className="inline-block w-1 h-1 rounded-full shrink-0"
                style={{ background: RISK_RENK[s.level].color }}
              />
              <span
                style={{
                  fontSize: 10.5,
                  color: 'rgba(255,255,255,0.42)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {s.title}
              </span>
            </div>
          ))}
        </div>
      )}
    </Link>
  )
}
