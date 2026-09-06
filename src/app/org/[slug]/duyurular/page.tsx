'use client'

export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useOrg } from '@/lib/supabase/orgContext'
import { useDeneyaplar } from '@/lib/useDeneyaplar'
import { yazabilirMi, ROLLER } from '@/lib/roller'
import { ILLER } from '@/lib/iller'
import { deneyapKisaEtiket, deneyaplariIleGoreGrupla } from '@/lib/deneyap'
import { ONEM_ETIKET, ONEM_RENK, duyuruYayindaMi, type DuyuruOnem } from '@/lib/duyuru'
import ResponsiveModal from '@/components/responsive/ResponsiveModal'
import type { Duyuru } from '@/types/database'

const ONEMLER: DuyuruOnem[] = ['kritik', 'onemli', 'normal']

/**
 * Duyurular — owner/admin (kullanıcı kararı: "Merkez Operasyon + Koordinatör").
 *
 * Hedefleme üç boyutlu: rol, il, DENEYAP. Hiçbiri seçilmezse duyuru herkese
 * gider; ekranda bu durum açıkça yazıyor ki "kimseye gitmedi" sanılmasın.
 */
export default function DuyurularPage() {
  const router = useRouter()
  const { org, orgRole, userIl, loading: orgLoading } = useOrg()
  const { deneyaplar } = useDeneyaplar(org?.id)

  const [duyurular, setDuyurular] = useState<Duyuru[]>([])
  const [okunmaSayilari, setOkunmaSayilari] = useState<Record<string, number>>({})
  const [yukleniyor, setYukleniyor] = useState(true)
  const [hata, setHata] = useState<string | null>(null)
  const [migrationGerekli, setMigrationGerekli] = useState(false)

  const [formAcik, setFormAcik] = useState(false)
  const [duzenlenen, setDuzenlenen] = useState<Duyuru | null>(null)
  const [fBaslik, setFBaslik] = useState('')
  const [fIcerik, setFIcerik] = useState('')
  const [fOnem, setFOnem] = useState<DuyuruOnem>('normal')
  const [fRoller, setFRoller] = useState<string[]>([])
  const [fIller, setFIller] = useState<string[]>([])
  const [fDeneyaplar, setFDeneyaplar] = useState<string[]>([])
  const [fYayinda, setFYayinda] = useState(false)
  const [fBitis, setFBitis] = useState('')
  const [formHata, setFormHata] = useState<string | null>(null)
  const [kaydediliyor, setKaydediliyor] = useState(false)

  const istek = useCallback(async (yol: string, init?: RequestInit) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Oturum bulunamadı.')
    const r = await fetch(yol, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        ...(init?.headers ?? {}),
      },
    })
    const g = await r.json().catch(() => ({}))
    if (!r.ok) {
      const e = new Error(g.error || 'İşlem başarısız.') as Error & { migrationGerekli?: boolean }
      e.migrationGerekli = g.migrationGerekli === true
      throw e
    }
    return g
  }, [])

  const yukle = useCallback(async () => {
    if (!org) return
    try {
      const d = await istek(`/api/org/${org.slug}/duyurular`)
      setDuyurular(d.duyurular ?? [])
      setOkunmaSayilari(d.okunmaSayilari ?? {})
      setHata(null); setMigrationGerekli(false)
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Duyurular alınamadı.')
      setMigrationGerekli((e as { migrationGerekli?: boolean })?.migrationGerekli === true)
    } finally {
      setYukleniyor(false)
    }
  }, [org, istek])

  useEffect(() => {
    if (orgLoading || !org) return
    if (!yazabilirMi(orgRole)) { router.replace(`/org/${org.slug}/dashboard`); return }
    yukle()
  }, [orgLoading, org, orgRole, router, yukle])

  function yeniAc() {
    setDuzenlenen(null)
    setFBaslik(''); setFIcerik(''); setFOnem('normal')
    setFRoller([]); setFIller([]); setFDeneyaplar([])
    setFYayinda(false); setFBitis('')
    setFormHata(null); setFormAcik(true)
  }

  function duzenleAc(d: Duyuru) {
    setDuzenlenen(d)
    setFBaslik(d.baslik); setFIcerik(d.icerik); setFOnem(d.onem)
    setFRoller(d.hedef_roller ?? []); setFIller(d.hedef_iller ?? [])
    setFDeneyaplar(d.hedef_deneyap_ids ?? [])
    setFYayinda(d.yayinda)
    setFBitis(d.bitis_at ? d.bitis_at.slice(0, 10) : '')
    setFormHata(null); setFormAcik(true)
  }

  const cevir = (liste: string[], deger: string) =>
    liste.includes(deger) ? liste.filter(x => x !== deger) : [...liste, deger]

  async function kaydet(e: React.FormEvent) {
    e.preventDefault()
    if (!org) return
    setKaydediliyor(true); setFormHata(null)
    const govde = {
      baslik: fBaslik, icerik: fIcerik, onem: fOnem,
      hedef_roller: fRoller, hedef_iller: fIller, hedef_deneyap_ids: fDeneyaplar,
      yayinda: fYayinda,
      // Bitiş günü seçildiyse o günün SONU kastediliyor; kullanıcı "10 Mayıs'a
      // kadar" derken 10 Mayıs boyunca görünmesini bekler.
      bitis_at: fBitis ? new Date(`${fBitis}T23:59:59`).toISOString() : null,
      baslangic_at: duzenlenen?.baslangic_at ?? new Date().toISOString(),
    }
    try {
      if (duzenlenen) {
        await istek(`/api/org/${org.slug}/duyurular`, {
          method: 'PATCH', body: JSON.stringify({ ...govde, id: duzenlenen.id }),
        })
      } else {
        await istek(`/api/org/${org.slug}/duyurular`, { method: 'POST', body: JSON.stringify(govde) })
      }
      setFormAcik(false)
      await yukle()
    } catch (e) {
      setFormHata(e instanceof Error ? e.message : 'Kaydedilemedi.')
    } finally {
      setKaydediliyor(false)
    }
  }

  async function sil(d: Duyuru) {
    if (!org) return
    if (!confirm(`"${d.baslik}" duyurusu silinsin mi? Okundu kayıtları da silinir.`)) return
    try {
      await istek(`/api/org/${org.slug}/duyurular?id=${d.id}`, { method: 'DELETE' })
      await yukle()
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Silinemedi.')
    }
  }

  const deneyapGruplari = useMemo(
    () => deneyaplariIleGoreGrupla(deneyaplar.filter(d => d.aktif), userIl),
    [deneyaplar, userIl],
  )

  function hedefOzeti(d: Duyuru): string {
    const p: string[] = []
    if (d.hedef_roller?.length) {
      p.push(d.hedef_roller.map(r => ROLLER.find(x => x.role === r)?.ad ?? r).join(', '))
    }
    if (d.hedef_iller?.length) p.push(d.hedef_iller.join(', '))
    if (d.hedef_deneyap_ids?.length) {
      p.push(d.hedef_deneyap_ids
        .map(id => deneyaplar.find(x => x.id === id))
        .map(x => x ? deneyapKisaEtiket(x) : 'bilinmeyen DENEYAP')
        .join(', '))
    }
    return p.length ? p.join(' · ') : 'Herkes'
  }

  if (orgLoading || yukleniyor) {
    return (
      <div className="min-h-screen px-4 md:px-6 py-5 space-y-3" style={{ background: '#f5f7fa' }}>
        <div className="skeleton h-8 w-48 rounded-xl" />
        {[0, 1, 2].map(i => <div key={i} className="skeleton h-20 rounded-2xl" />)}
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: '#f5f7fa' }}>
      <main className="w-full px-4 md:px-6 py-4 md:py-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h1 className="text-lg md:text-xl font-bold" style={{ color: '#111827', letterSpacing: '-0.02em' }}>
              Duyurular
            </h1>
            <p className="text-xs md:text-sm mt-0.5" style={{ color: '#9ca3af' }}>
              {duyurular.length} duyuru · hedeflenen kişilere ana ekranda bir kez gösterilir
            </p>
          </div>
          <button onClick={yeniAc} className="shrink-0 text-sm font-medium px-4 py-2 rounded-xl"
            style={{ background: '#2288c9', color: '#fff', border: 'none' }}>
            + Yeni Duyuru
          </button>
        </div>

        {hata && (
          <div className="text-sm rounded-xl px-4 py-3 mb-4 leading-relaxed"
            style={migrationGerekli
              ? { background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a' }
              : { background: '#fee2e2', color: '#dc2626' }}>
            {hata}
          </div>
        )}

        <div className="space-y-2">
          {duyurular.length === 0 ? (
            <div className="rounded-2xl px-5 py-14 text-center text-sm"
              style={{ background: '#fff', border: '1px solid #e5e7eb', color: '#9ca3af' }}>
              Henüz duyuru yok.
            </div>
          ) : duyurular.map(d => {
            const renk = ONEM_RENK[d.onem] ?? ONEM_RENK.normal
            const canli = duyuruYayindaMi(d)
            return (
              <div key={d.id} className="rounded-2xl px-4 md:px-5 py-3.5"
                style={{ background: '#fff', border: '1px solid #e5e7eb' }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{ background: renk.bg, color: renk.renk, border: `1px solid ${renk.bd}` }}>
                        {ONEM_ETIKET[d.onem]}
                      </span>
                      {/* "Yayında" ile "şu an görünür" farklı: bitiş tarihi
                          geçmiş bir duyuru yayinda=true olsa da görünmez. */}
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={canli
                          ? { background: '#f0fdf4', color: '#15803d', border: '1px solid #86efac' }
                          : { background: '#f1f5f9', color: '#94a3b8', border: '1px solid #e2e8f0' }}>
                        {canli ? 'Yayında' : d.yayinda ? 'Süresi doldu' : 'Taslak'}
                      </span>
                      <span className="text-xs" style={{ color: '#9ca3af' }}>
                        {okunmaSayilari[d.id] ?? 0} kişi okudu
                      </span>
                    </div>
                    <div className="text-[13px] font-semibold" style={{ color: '#111827' }}>{d.baslik}</div>
                    <p className="text-xs mt-1 line-clamp-2" style={{ color: '#6b7280' }}>{d.icerik}</p>
                    <div className="text-[11px] mt-1.5" style={{ color: '#0f766e' }}>
                      🎯 {hedefOzeti(d)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => duzenleAc(d)} className="text-xs px-2.5 py-1 rounded-lg font-medium"
                      style={{ color: '#2288c9', background: '#eff6ff', border: '1px solid #dbeafe' }}>
                      Düzenle
                    </button>
                    <button onClick={() => sil(d)} className="text-xs px-2.5 py-1 rounded-lg font-medium"
                      style={{ color: '#dc2626', background: '#fff1f1', border: '1px solid #fecaca' }}>
                      Sil
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </main>

      <ResponsiveModal
        open={formAcik}
        onClose={() => setFormAcik(false)}
        title={duzenlenen ? 'Duyuruyu Düzenle' : 'Yeni Duyuru'}
        maxWidth="lg"
      >
        <form onSubmit={kaydet} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: '#374151' }}>Başlık *</label>
            <input value={fBaslik} onChange={e => setFBaslik(e.target.value)} required className="input" />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: '#374151' }}>İçerik *</label>
            <textarea value={fIcerik} onChange={e => setFIcerik(e.target.value)} required
              className="input resize-y" rows={4} style={{ color: '#111827', minHeight: 90 }} />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: '#374151' }}>Önem</label>
            <div className="flex gap-1.5">
              {ONEMLER.map(o => {
                const r = ONEM_RENK[o]
                const aktif = fOnem === o
                return (
                  <button key={o} type="button" onClick={() => setFOnem(o)}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold"
                    style={{
                      background: aktif ? r.bg : '#fff',
                      color: aktif ? r.renk : '#64748b',
                      border: `1px solid ${aktif ? r.renk : '#e5e7eb'}`,
                    }}>
                    {ONEM_ETIKET[o]}
                  </button>
                )
              })}
            </div>
            {fOnem === 'kritik' && (
              <p className="text-[11px] mt-1.5" style={{ color: '#b45309' }}>
                Kritik duyuru kapatılamaz: kullanıcı &quot;Anladım&quot;a basmadan geçemez.
              </p>
            )}
          </div>

          <div>
            <div className="text-[11px] font-bold uppercase mb-2" style={{ color: '#64748b', letterSpacing: '0.04em' }}>
              Hedefleme
            </div>
            {/* Hiçbir hedef seçilmezse "herkes" demek. Bunu açıkça yazmak
                gerekiyor; boş bir hedef listesi "kimseye gitmez" gibi okunuyor. */}
            <p className="text-[11px] mb-2 leading-relaxed" style={{ color: '#6b7280' }}>
              Hiçbir şey seçmezseniz duyuru <strong>çalışma alanındaki herkese</strong> gider.
              Seçim yaparsanız hepsi birden sağlanmalıdır (rol <em>ve</em> il <em>ve</em> DENEYAP).
            </p>

            <div className="space-y-3">
              <div>
                <div className="text-xs font-semibold mb-1.5" style={{ color: '#374151' }}>Roller</div>
                <div className="flex flex-wrap gap-1.5">
                  {ROLLER.map(r => (
                    <button key={r.role} type="button" onClick={() => setFRoller(cevir(fRoller, r.role))}
                      className="px-2.5 py-1 rounded-full text-[11px] font-semibold"
                      style={{
                        background: fRoller.includes(r.role) ? '#e0f2fe' : '#fff',
                        color: fRoller.includes(r.role) ? '#0369a1' : '#64748b',
                        border: `1px solid ${fRoller.includes(r.role) ? '#7dd3fc' : '#e5e7eb'}`,
                      }}>
                      {r.ad}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold mb-1.5" style={{ color: '#374151' }}>
                  İller {fIller.length > 0 && <span style={{ color: '#0f766e' }}>({fIller.length})</span>}
                </div>
                <select
                  multiple
                  value={fIller}
                  onChange={e => setFIller([...e.target.selectedOptions].map(o => o.value))}
                  className="input"
                  size={4}
                  aria-label="Hedef iller"
                >
                  {ILLER.map(il => <option key={il} value={il}>{il}</option>)}
                </select>
              </div>

              {deneyaplar.length > 0 && (
                <div>
                  <div className="text-xs font-semibold mb-1.5" style={{ color: '#374151' }}>
                    DENEYAP&apos;lar {fDeneyaplar.length > 0 && <span style={{ color: '#0f766e' }}>({fDeneyaplar.length})</span>}
                  </div>
                  <select
                    multiple
                    value={fDeneyaplar}
                    onChange={e => setFDeneyaplar([...e.target.selectedOptions].map(o => o.value))}
                    className="input"
                    size={4}
                    aria-label="Hedef DENEYAP'lar"
                  >
                    {deneyapGruplari.map(g => (
                      <optgroup key={g.il} label={g.il}>
                        {g.deneyaplar.map(d => (
                          <option key={d.id} value={d.id}>{deneyapKisaEtiket(d)}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: '#374151' }}>
              Bitiş tarihi (isteğe bağlı)
            </label>
            <input type="date" value={fBitis} onChange={e => setFBitis(e.target.value)} className="input" />
            <p className="text-[11px] mt-1" style={{ color: '#9ca3af' }}>
              Seçilen günün sonuna kadar görünür. Boş bırakılırsa süresiz.
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: '#374151' }}>
            <input type="checkbox" checked={fYayinda} onChange={e => setFYayinda(e.target.checked)} />
            Yayına al (işaretlenmezse taslak olarak kaydedilir)
          </label>

          {formHata && (
            <div className="text-xs rounded-xl px-4 py-3" style={{ background: '#fee2e2', color: '#dc2626' }}>
              {formHata}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={() => setFormAcik(false)} className="btn-secondary flex-1">İptal</button>
            <button type="submit" disabled={kaydediliyor} className="btn-primary flex-1">
              {kaydediliyor ? 'Kaydediliyor...' : duzenlenen ? 'Güncelle' : 'Oluştur'}
            </button>
          </div>
        </form>
      </ResponsiveModal>
    </div>
  )
}
