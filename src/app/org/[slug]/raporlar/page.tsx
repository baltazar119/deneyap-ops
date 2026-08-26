'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useOrg } from '@/lib/supabase/orgContext'
import { rolAdi } from '@/lib/roller'
import { raporUretebilirMi } from '@/lib/rapor/kapsam'
import type { RaporVerisi } from '@/lib/rapor/hesapla'
import type { DonemAnahtari } from '@/lib/rapor/donem'

/**
 * Rapor Merkezi.
 *
 * Ekrandaki önizleme ile indirilen PDF/Excel AYNI veriden gelir
 * (/api/.../rapor?format=json) — kullanıcı indirmeden ne alacağını görür.
 */

const DONEMLER: { value: DonemAnahtari; label: string }[] = [
  { value: 'bu-hafta',    label: 'Bu hafta' },
  { value: 'gecen-hafta', label: 'Geçen hafta' },
  { value: 'bu-ay',       label: 'Bu ay' },
  { value: 'gecen-ay',    label: 'Geçen ay' },
  { value: 'ceyrek',      label: 'Bu çeyrek' },
  { value: 'tumu',        label: 'Tüm zamanlar' },
]

export default function RaporlarPage() {
  const router = useRouter()
  const params = useParams()
  const slug = params.slug as string
  const { orgRole, userIl, loading: orgLoading } = useOrg()

  const [donem, setDonem] = useState<DonemAnahtari>('tumu')
  const [veri, setVeri] = useState<RaporVerisi | null>(null)
  const [yukleniyor, setYukleniyor] = useState(true)
  const [indiriliyor, setIndiriliyor] = useState<string | null>(null)
  const [hata, setHata] = useState<string | null>(null)

  const tokenAl = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }, [])

  const yukle = useCallback(async (d: DonemAnahtari) => {
    setYukleniyor(true); setHata(null)
    const t = await tokenAl()
    const res = await fetch(`/api/org/${slug}/rapor?format=json&donem=${d}`, {
      headers: { Authorization: `Bearer ${t}` },
    })
    const j = await res.json()
    setYukleniyor(false)
    if (!res.ok) { setHata(j.error ?? 'Rapor hazırlanamadı.'); return }
    setVeri(j)
  }, [slug, tokenAl])

  useEffect(() => {
    if (orgLoading) return
    if (!raporUretebilirMi(orgRole)) { router.replace(`/org/${slug}`); return }
    yukle(donem)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgLoading, orgRole, donem])

  async function indir(format: 'pdf' | 'xlsx' | 'csv') {
    setIndiriliyor(format); setHata(null)
    try {
      const t = await tokenAl()
      const res = await fetch(`/api/org/${slug}/rapor?format=${format}&donem=${donem}`, {
        headers: { Authorization: `Bearer ${t}` },
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setHata(j.error ?? 'Rapor indirilemedi.'); return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${veri?.meta.raporAdi ?? 'rapor'}.${format}`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } finally {
      setIndiriliyor(null)
    }
  }

  if (orgLoading) {
    return <div className="min-h-screen p-6" style={{ background: '#f5f7fa' }}>
      <div className="skeleton h-40 rounded-2xl max-w-4xl mx-auto" />
    </div>
  }

  const b = (ad: string) => veri?.meta.bolumler.includes(ad) ?? false

  return (
    <div className="min-h-screen px-4 sm:px-6 py-5" style={{ background: '#f5f7fa' }}>
      <div className="max-w-4xl mx-auto space-y-5">

        {/* Başlık */}
        <div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight" style={{ color: '#0d1a2a' }}>
            Raporlar
          </h1>
          <p className="text-sm mt-0.5" style={{ color: '#64748b' }}>
            {veri?.meta.raporAdi ?? 'Rapor'} · Kapsamınız: <strong>{veri?.meta.kapsamEtiketi ?? '—'}</strong>
          </p>
        </div>

        {hata && (
          <div className="rounded-xl px-4 py-3 text-sm" style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' }}>
            {hata}
          </div>
        )}

        {/* Dönem + indirme */}
        <div className="card">
          <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#64748b' }}>Dönem</div>
          <div className="flex flex-wrap gap-1.5 mb-5">
            {DONEMLER.map(d => (
              <button key={d.value} onClick={() => setDonem(d.value)}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                style={{
                  background: donem === d.value ? '#2288c9' : '#fff',
                  color: donem === d.value ? '#fff' : '#64748b',
                  border: `1px solid ${donem === d.value ? '#2288c9' : '#e5e7eb'}`,
                }}>{d.label}</button>
            ))}
          </div>

          <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#64748b' }}>İndir</div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => indir('pdf')} disabled={!!indiriliyor || yukleniyor} className="btn-primary">
              {indiriliyor === 'pdf' ? 'Hazırlanıyor…' : 'PDF Raporu'}
            </button>
            <button onClick={() => indir('xlsx')} disabled={!!indiriliyor || yukleniyor} className="btn-secondary">
              {indiriliyor === 'xlsx' ? 'Hazırlanıyor…' : 'Excel (.xlsx)'}
            </button>
            <button onClick={() => indir('csv')} disabled={!!indiriliyor || yukleniyor} className="btn-secondary">
              {indiriliyor === 'csv' ? 'Hazırlanıyor…' : 'CSV'}
            </button>
          </div>
          <p className="text-xs mt-3" style={{ color: '#94a3b8' }}>
            Rapor <strong>{rolAdi(orgRole)}</strong> rolünüze göre hazırlanır
            {orgRole === 'member' && userIl && ` — yalnızca ${userIl} verisi içerir`}
            {orgRole === 'viewer' && ' — kişi bazlı veri içermez'}.
          </p>
        </div>

        {/* Önizleme */}
        {yukleniyor ? (
          <div className="card"><div className="skeleton h-32 rounded-xl" /></div>
        ) : veri ? (
          <>
            <div className="card">
              <h2 className="font-semibold mb-3" style={{ color: '#0d1a2a' }}>
                Özet <span className="text-xs font-normal" style={{ color: '#94a3b8' }}>· {veri.meta.donem.etiket}</span>
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                <Kpi deger={veri.kpi.toplam} etiket="Toplam görev" />
                <Kpi deger={veri.kpi.tamamlanan} etiket="Tamamlanan" renk="#059669" />
                <Kpi deger={veri.kpi.devamEden} etiket="Devam eden" renk="#2288c9" />
                <Kpi deger={veri.kpi.geciken} etiket="Geciken" renk={veri.kpi.geciken ? '#dc2626' : '#64748b'} />
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-full overflow-hidden" style={{ height: 10, background: '#eef2f6' }}>
                  <div style={{
                    height: 10,
                    width: `${Math.max(veri.kpi.tamamlanmaOrani, 1)}%`,
                    background: veri.kpi.tamamlanmaOrani >= 70 ? '#059669' : veri.kpi.tamamlanmaOrani >= 40 ? '#b45309' : '#dc2626',
                  }} />
                </div>
                <span className="text-sm font-bold" style={{ color: '#0d1a2a' }}>%{veri.kpi.tamamlanmaOrani}</span>
              </div>
            </div>

            {b('il_kirilimi') && veri.ilKirilimi.length > 0 && (
              <div className="card">
                <h2 className="font-semibold mb-1" style={{ color: '#0d1a2a' }}>İl Kırılımı</h2>
                <p className="text-xs mb-3" style={{ color: '#94a3b8' }}>En çok geciken il başta.</p>
                <div className="space-y-1.5">
                  {veri.ilKirilimi.map(r => (
                    <div key={r.il} className="flex items-center gap-3 rounded-xl px-3 py-2" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                      <span className="text-sm font-semibold flex-1 min-w-0 truncate" style={{ color: '#0d1a2a' }}>{r.il}</span>
                      <span className="text-xs" style={{ color: '#64748b' }}>{r.tamamlanan}/{r.toplam}</span>
                      {r.geciken > 0 && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ background: '#fee2e2', color: '#dc2626' }}>
                          {r.geciken} geciken
                        </span>
                      )}
                      <span className="text-xs font-bold w-10 text-right" style={{ color: r.oran >= 70 ? '#059669' : r.oran >= 40 ? '#b45309' : '#dc2626' }}>
                        %{r.oran}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {b('gecikmeler') && (
              <div className="card">
                <h2 className="font-semibold mb-3" style={{ color: veri.gecikmeler.length ? '#dc2626' : '#0d1a2a' }}>
                  Termini Geçen Görevler ({veri.gecikmeler.length})
                </h2>
                {veri.gecikmeler.length ? (
                  <div className="space-y-1.5">
                    {veri.gecikmeler.slice(0, 12).map((r, i) => (
                      <div key={i} className="flex items-center gap-3 rounded-xl px-3 py-2" style={{ background: '#fff1f2', border: '1px solid #fecaca' }}>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate" style={{ color: '#0d1a2a' }}>{r.baslik}</div>
                          <div className="text-xs" style={{ color: '#94a3b8' }}>
                            {r.il ?? '—'}{r.sorumlu ? ` · ${r.sorumlu}` : ''}
                          </div>
                        </div>
                        <span className="text-xs font-bold px-2 py-0.5 rounded shrink-0" style={{ background: '#fee2e2', color: '#b91c1c' }}>
                          {r.gecikmeGunu} gün
                        </span>
                      </div>
                    ))}
                    {veri.gecikmeler.length > 12 && (
                      <p className="text-xs pt-1" style={{ color: '#94a3b8' }}>
                        …ve {veri.gecikmeler.length - 12} görev daha. Tam liste PDF ve Excel çıktısında.
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-center py-4" style={{ color: '#94a3b8' }}>Termini geçen görev yok.</p>
                )}
              </div>
            )}

            {b('yaklasan') && veri.yaklasan.length > 0 && (
              <div className="card">
                <h2 className="font-semibold mb-3" style={{ color: '#0d1a2a' }}>Önümüzdeki 7 Gün ({veri.yaklasan.length})</h2>
                <div className="space-y-1.5">
                  {veri.yaklasan.slice(0, 10).map((r, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-xl px-3 py-2" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate" style={{ color: '#0d1a2a' }}>{r.baslik}</div>
                        <div className="text-xs" style={{ color: '#94a3b8' }}>{r.il ?? '—'}</div>
                      </div>
                      <span className="text-xs shrink-0" style={{ color: '#64748b' }}>
                        {r.termin?.split('-').reverse().join('.')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : null}

      </div>
    </div>
  )
}

function Kpi({ deger, etiket, renk = '#0d1a2a' }: { deger: number; etiket: string; renk?: string }) {
  return (
    <div className="rounded-xl px-3 py-2.5" style={{ background: '#fff', border: '1px solid #e5e7eb' }}>
      <div className="text-xl font-black" style={{ color: renk }}>{deger}</div>
      <div className="text-xs" style={{ color: '#64748b' }}>{etiket}</div>
    </div>
  )
}
