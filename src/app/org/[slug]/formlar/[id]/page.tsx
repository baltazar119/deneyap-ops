'use client'

export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { useOrg } from '@/lib/supabase/orgContext'
import { cevapMetni } from '@/lib/form/sablon'
import type { Form, FormAlani, FormGonderim, FormYanit } from '@/lib/form/tipler'

/**
 * Bir formun gönderimleri ve gelen cevapları.
 *
 * Cevaplar tablo halinde: her satır bir yanıt, her sütun bir soru. "Tablo"
 * tipi sorular hücreye sığmadığı için satır sayısı gösterilip detayda
 * açılıyor — cevabın tamamı ayrıca oluşan görevin açıklamasında duruyor.
 */
export default function FormCevaplariPage() {
  const params = useParams<{ slug: string; id: string }>()
  const { org, loading: orgLoading } = useOrg()

  const [form, setForm] = useState<Form | null>(null)
  const [gonderimler, setGonderimler] = useState<FormGonderim[]>([])
  const [yanitlar, setYanitlar] = useState<FormYanit[]>([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [hata, setHata] = useState<string | null>(null)
  const [acikYanit, setAcikYanit] = useState<string | null>(null)
  const [indiriliyor, setIndiriliyor] = useState<'xlsx' | 'csv' | null>(null)

  /**
   * Dosya indirme: uç `Authorization` başlığı istediği için düz bir <a>
   * bağlantısı kullanılamıyor; blob'a çekip programatik indiriyoruz.
   */
  async function indir(bicim: 'xlsx' | 'csv') {
    if (!org) return
    setIndiriliyor(bicim)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Oturum bulunamadı.')
      const r = await fetch(`/api/org/${org.slug}/formlar/${params.id}/disa-aktar?format=${bicim}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!r.ok) throw new Error('İndirilemedi.')
      const blob = await r.blob()
      // Dosya adı sunucudan geliyor; istemcide yeniden türetmek ikisinin
      // ayrışması demekti.
      const ad = /filename="([^"]+)"/.exec(r.headers.get('content-disposition') ?? '')?.[1]
        ?? `form.${bicim}`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = ad
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'İndirilemedi.')
    } finally {
      setIndiriliyor(null)
    }
  }

  const yukle = useCallback(async () => {
    if (!org) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Oturum bulunamadı.')
      const r = await fetch(`/api/org/${org.slug}/formlar/${params.id}/yanitlar`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error ?? 'Alınamadı.')
      setForm(d.form)
      setGonderimler(d.gonderimler ?? [])
      setYanitlar(d.yanitlar ?? [])
      setHata(null)
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Alınamadı.')
    } finally {
      setYukleniyor(false)
    }
  }, [org, params.id])

  useEffect(() => { if (!orgLoading && org) yukle() }, [orgLoading, org, yukle])

  if (orgLoading || yukleniyor) {
    return (
      <div className="min-h-screen px-4 md:px-6 py-5 space-y-3" style={{ background: '#f5f7fa' }}>
        <div className="skeleton h-8 w-56 rounded-xl" />
        {[0, 1].map(i => <div key={i} className="skeleton h-24 rounded-2xl" />)}
      </div>
    )
  }

  const alanlar = (form?.alanlar ?? []) as FormAlani[]
  const alanlarTabloVar = alanlar.some(a => a.tip === 'tablo')
  const yanitHaritasi = new Map(yanitlar.map(y => [y.gonderim_id, y]))

  return (
    <div className="min-h-screen" style={{ background: '#f5f7fa' }}>
      <main className="w-full px-4 md:px-6 py-4 md:py-5">
        <Link href={`/org/${params.slug}/formlar`} className="text-xs font-medium"
          style={{ color: '#2288c9', textDecoration: 'none' }}>
          ← Formlar
        </Link>
        <h1 className="text-lg md:text-xl font-bold mt-1 mb-1" style={{ color: '#111827', letterSpacing: '-0.02em' }}>
          {form?.baslik ?? 'Form'}
        </h1>
        <div className="flex items-end justify-between gap-3 flex-wrap mb-4">
          <p className="text-xs md:text-sm" style={{ color: '#64748b' }}>
            {yanitlar.length} yanıt · {gonderimler.length} gönderim
          </p>
          {gonderimler.length > 0 && (
            <div className="flex items-center gap-2">
              <button onClick={() => indir('xlsx')} disabled={indiriliyor !== null}
                className="text-xs px-3 py-2 rounded-xl font-semibold"
                style={{ color: '#0f766e', background: '#f0fdfa', border: '1px solid #99f6e4' }}>
                {indiriliyor === 'xlsx' ? 'Hazırlanıyor...' : 'Excel indir'}
              </button>
              <button onClick={() => indir('csv')} disabled={indiriliyor !== null}
                className="text-xs px-3 py-2 rounded-xl font-semibold"
                style={{ color: '#475569', background: '#f8fafc', border: '1px solid #cbd5e1' }}>
                {indiriliyor === 'csv' ? 'Hazırlanıyor...' : 'CSV'}
              </button>
            </div>
          )}
        </div>

        {/* Tablo soruları CSV'ye sığmaz; kullanıcı indirmeden önce bilmeli. */}
        {alanlarTabloVar && (
          <p className="text-[11px] mb-4 -mt-2" style={{ color: '#64748b' }}>
            Tablo sorularının satırları yalnızca Excel&apos;de ayrı sayfa olarak yer alır.
          </p>
        )}

        {hata && (
          <div className="text-sm rounded-xl px-4 py-3 mb-4" style={{ background: '#fee2e2', color: '#dc2626' }}>{hata}</div>
        )}

        {gonderimler.length === 0 ? (
          <div className="rounded-2xl px-5 py-14 text-center text-sm"
            style={{ background: '#fff', border: '1px solid #e5e7eb', color: '#9ca3af' }}>
            Bu form henüz kimseye gönderilmedi.
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e5e7eb' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ borderCollapse: 'collapse', minWidth: 520 }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th className="text-left px-4 py-2.5 text-xs font-bold whitespace-nowrap"
                      style={{ color: '#475569', borderBottom: '1px solid #e5e7eb' }}>Durum</th>
                    <th className="text-left px-4 py-2.5 text-xs font-bold whitespace-nowrap"
                      style={{ color: '#475569', borderBottom: '1px solid #e5e7eb' }}>Alıcı</th>
                    {alanlar.map(a => (
                      <th key={a.id} className="text-left px-4 py-2.5 text-xs font-bold whitespace-nowrap"
                        style={{ color: '#475569', borderBottom: '1px solid #e5e7eb' }}>{a.etiket}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {gonderimler.map(g => {
                    const y = yanitHaritasi.get(g.id)
                    return (
                      <tr key={g.id}>
                        <td className="px-4 py-2.5 whitespace-nowrap" style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                            style={g.durum === 'yanitlandi'
                              ? { background: '#f0fdf4', color: '#15803d', border: '1px solid #86efac' }
                              : { background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a' }}>
                            {g.durum === 'yanitlandi' ? 'Dolduruldu' : g.durum === 'iptal' ? 'İptal' : 'Bekliyor'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs whitespace-nowrap" style={{ borderBottom: '1px solid #f3f4f6', color: '#6b7280' }}>
                          {g.alici_etiket || (g.alici_user_id ? 'Üye' : '—')}
                        </td>
                        {alanlar.map(a => {
                          const deger = y?.cevaplar?.[a.id] ?? null
                          const tabloMu = a.tip === 'tablo' && Array.isArray(deger) && deger.length > 0
                          return (
                            <td key={a.id} className="px-4 py-2.5 text-xs" style={{ borderBottom: '1px solid #f3f4f6', color: '#111827' }}>
                              {tabloMu ? (
                                <button onClick={() => setAcikYanit(acikYanit === `${g.id}:${a.id}` ? null : `${g.id}:${a.id}`)}
                                  className="text-xs font-semibold"
                                  style={{ color: '#2288c9', background: 'none', border: 'none', cursor: 'pointer' }}>
                                  {cevapMetni(deger, a)} ▾
                                </button>
                              ) : (
                                <span>{cevapMetni(deger, a) || '—'}</span>
                              )}
                              {tabloMu && acikYanit === `${g.id}:${a.id}` && (
                                <div className="mt-2 rounded-lg overflow-hidden" style={{ border: '1px solid #e5e7eb' }}>
                                  <table className="text-[11px]" style={{ borderCollapse: 'collapse' }}>
                                    <thead>
                                      <tr style={{ background: '#f8fafc' }}>
                                        {(a.sutunlar ?? []).map(s => (
                                          <th key={s.id} className="text-left px-2 py-1 whitespace-nowrap" style={{ color: '#475569' }}>
                                            {s.baslik}
                                          </th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {(deger as Record<string, string | number | null>[]).map((satir, i) => (
                                        <tr key={i}>
                                          {(a.sutunlar ?? []).map(s => (
                                            <td key={s.id} className="px-2 py-1 whitespace-nowrap"
                                              style={{ borderTop: '1px solid #f3f4f6' }}>
                                              {satir[s.id] ?? '—'}
                                            </td>
                                          ))}
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Workflow sonucu: hangi cevap hangi görevi açtı */}
        {yanitlar.some(y => y.olusan_gorev_id) && (
          <div className="mt-4 rounded-2xl px-4 md:px-5 py-3.5" style={{ background: '#fff', border: '1px solid #e5e7eb' }}>
            <h2 className="text-sm font-semibold mb-2" style={{ color: '#111827' }}>Bu formdan açılan görevler</h2>
            <div className="space-y-1">
              {yanitlar.filter(y => y.olusan_gorev_id).map(y => (
                <Link key={y.id} href={`/org/${params.slug}/tasks/${y.olusan_gorev_id}`}
                  className="block text-xs" style={{ color: '#2288c9', textDecoration: 'none' }}>
                  → {new Date(y.created_at).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} tarihli yanıttan açılan görev
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
