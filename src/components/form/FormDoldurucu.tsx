'use client'

import { useState } from 'react'
import type { FormAlani, Cevaplar, CevapDegeri } from '@/lib/form/tipler'

/**
 * Form doldurma arayüzü — açık bağlantı, üye formu ve kurucu önizlemesi
 * AYNI bileşeni kullanır. Önizlemenin gerçeğin aynısı olmasının tek yolu bu.
 *
 * İstemcideki kontroller kullanıcıya yardım içindir; gerçek doğrulama
 * sunucuda (`lib/form/dogrula.ts`).
 *
 * KONTRAST NOTU: bu ekranı çoğu zaman sistemi hiç tanımayan biri, telefonda,
 * sahada dolduruyor. Bu yüzden gri-üstüne-gri değil: etiketler koyu ve kalın,
 * girdi kenarları görünür, tablo ızgarasının her hücresi belli.
 */

interface Props {
  alanlar: FormAlani[]
  onGonder: (cevaplar: Cevaplar) => Promise<string | null>
  gonderEtiketi?: string
  /** Önizlemede: girdiler çalışır ama gönderme düğmesi pasiftir. */
  onizleme?: boolean
}

const R = {
  metin: '#0f172a',
  etiket: '#1e293b',
  yardim: '#64748b',
  kenar: '#cbd5e1',
  kenarHafif: '#e2e8f0',
  zemin: '#ffffff',
  vurgu: '#0369a1',
  vurguBg: '#e0f2fe',
  vurguKenar: '#38bdf8',
  zorunlu: '#dc2626',
}

const girdiStili: React.CSSProperties = {
  width: '100%',
  border: `1px solid ${R.kenar}`,
  borderRadius: 10,
  padding: '10px 12px',
  fontSize: 14,
  color: R.metin,
  background: R.zemin,
  outline: 'none',
}

function baslangicSatirlari(alan: FormAlani): Record<string, string>[] {
  const n = Math.max(alan.enAzSatir ?? 1, 1)
  const bos = Object.fromEntries((alan.sutunlar ?? []).map(s => [s.id, '']))
  return Array.from({ length: n }, () => ({ ...bos }))
}

export default function FormDoldurucu({
  alanlar, onGonder, gonderEtiketi = 'Gönder', onizleme = false,
}: Props) {
  const [cevaplar, setCevaplar] = useState<Cevaplar>(() => {
    const b: Cevaplar = {}
    for (const a of alanlar) {
      if (a.tip === 'tablo') b[a.id] = baslangicSatirlari(a)
      else if (a.tip === 'coklu_secim') b[a.id] = []
      else b[a.id] = null
    }
    return b
  })
  const [gonderiliyor, setGonderiliyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const [odak, setOdak] = useState<string | null>(null)

  const ayarla = (id: string, deger: CevapDegeri) => setCevaplar(o => ({ ...o, [id]: deger }))

  function satirAyarla(alanId: string, i: number, sutunId: string, deger: string) {
    setCevaplar(o => {
      const satirlar = [...((o[alanId] as Record<string, string>[]) ?? [])]
      satirlar[i] = { ...satirlar[i], [sutunId]: deger }
      return { ...o, [alanId]: satirlar }
    })
  }

  function satirEkle(alan: FormAlani) {
    setCevaplar(o => {
      const satirlar = [...((o[alan.id] as Record<string, string>[]) ?? [])]
      satirlar.push(Object.fromEntries((alan.sutunlar ?? []).map(s => [s.id, ''])))
      return { ...o, [alan.id]: satirlar }
    })
  }

  function satirSil(alanId: string, i: number) {
    setCevaplar(o => {
      const satirlar = [...((o[alanId] as Record<string, string>[]) ?? [])]
      satirlar.splice(i, 1)
      return { ...o, [alanId]: satirlar }
    })
  }

  async function gonder(e: React.FormEvent) {
    e.preventDefault()
    if (onizleme) return
    setGonderiliyor(true)
    setHata(null)
    const h = await onGonder(cevaplar)
    setGonderiliyor(false)
    if (h) setHata(h)
  }

  /** Odaklanınca kenar vurgulanıyor — hangi alanda olduğunu görmek şart. */
  const odakStili = (id: string): React.CSSProperties =>
    odak === id ? { borderColor: R.vurguKenar, boxShadow: `0 0 0 3px ${R.vurguBg}` } : {}

  return (
    <form onSubmit={gonder} className="space-y-4">
      {alanlar.map((alan, sira) => (
        <div key={alan.id}
          className="rounded-xl p-4"
          style={{ background: R.zemin, border: `1px solid ${R.kenarHafif}` }}>

          {/* Numaralı başlık: uzun formda "kaçıncı sorudayım" hissi verir. */}
          <div className="flex items-start gap-2.5 mb-2.5">
            <span className="shrink-0 flex items-center justify-center rounded-lg text-[11px] font-bold"
              style={{ width: 22, height: 22, background: '#f1f5f9', color: '#475569', marginTop: 1 }}>
              {sira + 1}
            </span>
            <div className="min-w-0">
              <label className="block text-[15px] font-semibold leading-snug" style={{ color: R.etiket }}>
                {alan.etiket}
                {alan.zorunlu && <span style={{ color: R.zorunlu }}> *</span>}
              </label>
              {alan.aciklama && (
                <p className="text-[13px] mt-1 leading-relaxed" style={{ color: R.yardim }}>{alan.aciklama}</p>
              )}
            </div>
          </div>

          <div className="pl-[32px]">
            {alan.tip === 'metin' && (
              <input type="text" style={{ ...girdiStili, ...odakStili(alan.id) }}
                onFocus={() => setOdak(alan.id)} onBlur={() => setOdak(null)}
                value={(cevaplar[alan.id] as string) ?? ''}
                onChange={e => ayarla(alan.id, e.target.value)} />
            )}

            {alan.tip === 'uzun_metin' && (
              <textarea rows={4} style={{ ...girdiStili, ...odakStili(alan.id), minHeight: 96, resize: 'vertical' }}
                onFocus={() => setOdak(alan.id)} onBlur={() => setOdak(null)}
                value={(cevaplar[alan.id] as string) ?? ''}
                onChange={e => ayarla(alan.id, e.target.value)} />
            )}

            {alan.tip === 'sayi' && (
              <input type="number" step="any" style={{ ...girdiStili, ...odakStili(alan.id), maxWidth: 200 }}
                onFocus={() => setOdak(alan.id)} onBlur={() => setOdak(null)}
                value={(cevaplar[alan.id] as string) ?? ''}
                onChange={e => ayarla(alan.id, e.target.value)} />
            )}

            {alan.tip === 'tarih' && (
              <input type="date" style={{ ...girdiStili, ...odakStili(alan.id), maxWidth: 220 }}
                onFocus={() => setOdak(alan.id)} onBlur={() => setOdak(null)}
                value={(cevaplar[alan.id] as string) ?? ''}
                onChange={e => ayarla(alan.id, e.target.value)} />
            )}

            {alan.tip === 'evet_hayir' && (
              <div className="flex gap-2">
                {[{ v: true, e: 'Evet' }, { v: false, e: 'Hayır' }].map(o => {
                  const secili = cevaplar[alan.id] === o.v
                  return (
                    <button key={o.e} type="button" onClick={() => ayarla(alan.id, secili ? null : o.v)}
                      className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors"
                      style={{
                        background: secili ? R.vurguBg : R.zemin,
                        color: secili ? R.vurgu : '#475569',
                        border: `1.5px solid ${secili ? R.vurguKenar : R.kenar}`,
                      }}>
                      {o.e}
                    </button>
                  )
                })}
              </div>
            )}

            {alan.tip === 'secim' && (
              // Az seçenekte radyo benzeri düğmeler, çokta select: dört
              // seçeneği açılır listeye gizlemek gereksiz bir tıklama.
              (alan.secenekler?.length ?? 0) <= 5 ? (
                <div className="flex flex-col gap-1.5">
                  {alan.secenekler?.map(s => {
                    const secili = cevaplar[alan.id] === s
                    return (
                      <button key={s} type="button" onClick={() => ayarla(alan.id, secili ? null : s)}
                        className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-medium text-left transition-colors"
                        style={{
                          background: secili ? R.vurguBg : R.zemin,
                          color: secili ? R.vurgu : R.metin,
                          border: `1.5px solid ${secili ? R.vurguKenar : R.kenar}`,
                        }}>
                        <span className="shrink-0 rounded-full" style={{
                          width: 16, height: 16,
                          border: `2px solid ${secili ? R.vurgu : '#94a3b8'}`,
                          background: secili ? R.vurgu : 'transparent',
                          boxShadow: secili ? 'inset 0 0 0 3px #fff' : 'none',
                        }} />
                        {s}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <select style={{ ...girdiStili, ...odakStili(alan.id) }}
                  onFocus={() => setOdak(alan.id)} onBlur={() => setOdak(null)}
                  value={(cevaplar[alan.id] as string) ?? ''}
                  onChange={e => ayarla(alan.id, e.target.value || null)}>
                  <option value="">-- Seçiniz --</option>
                  {alan.secenekler?.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              )
            )}

            {alan.tip === 'coklu_secim' && (
              <div className="flex flex-col gap-1.5">
                {alan.secenekler?.map(s => {
                  const mevcut = (cevaplar[alan.id] as string[]) ?? []
                  const secili = mevcut.includes(s)
                  return (
                    <button key={s} type="button"
                      onClick={() => ayarla(alan.id, secili ? mevcut.filter(x => x !== s) : [...mevcut, s])}
                      className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-medium text-left transition-colors"
                      style={{
                        background: secili ? R.vurguBg : R.zemin,
                        color: secili ? R.vurgu : R.metin,
                        border: `1.5px solid ${secili ? R.vurguKenar : R.kenar}`,
                      }}>
                      <span className="shrink-0 rounded flex items-center justify-center text-[11px] font-bold" style={{
                        width: 16, height: 16,
                        border: `2px solid ${secili ? R.vurgu : '#94a3b8'}`,
                        background: secili ? R.vurgu : 'transparent',
                        color: '#fff',
                      }}>{secili ? '✓' : ''}</span>
                      {s}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Tablo — ızgaranın HER hücresi görünür olmalı. Önceki sürümde
                kenarlıksız girdiler beyaz üstüne beyaz kalıyordu. */}
            {alan.tip === 'tablo' && (
              <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${R.kenar}` }}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" style={{ borderCollapse: 'collapse', minWidth: 340 }}>
                    <thead>
                      <tr style={{ background: '#f1f5f9' }}>
                        <th className="px-2 py-2 text-[11px] font-bold text-center"
                          style={{ color: '#64748b', borderBottom: `1px solid ${R.kenar}`, width: 34 }}>#</th>
                        {alan.sutunlar?.map(s => (
                          <th key={s.id} className="text-left px-3 py-2 text-xs font-bold whitespace-nowrap"
                            style={{ color: '#334155', borderBottom: `1px solid ${R.kenar}`, borderLeft: `1px solid ${R.kenarHafif}` }}>
                            {s.baslik}
                          </th>
                        ))}
                        <th style={{ borderBottom: `1px solid ${R.kenar}`, width: 38 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {((cevaplar[alan.id] as Record<string, string>[]) ?? []).map((satir, i) => (
                        <tr key={i} style={{ background: i % 2 ? '#fafbfc' : '#fff' }}>
                          <td className="text-center text-[11px] font-semibold"
                            style={{ color: '#94a3b8', borderBottom: `1px solid ${R.kenarHafif}` }}>{i + 1}</td>
                          {alan.sutunlar?.map(s => (
                            <td key={s.id} style={{ borderBottom: `1px solid ${R.kenarHafif}`, borderLeft: `1px solid ${R.kenarHafif}` }}>
                              <input
                                type={s.tip === 'sayi' ? 'number' : s.tip === 'tarih' ? 'date' : 'text'}
                                step={s.tip === 'sayi' ? 'any' : undefined}
                                value={satir[s.id] ?? ''}
                                onChange={e => satirAyarla(alan.id, i, s.id, e.target.value)}
                                aria-label={`${s.baslik} — satır ${i + 1}`}
                                className="w-full px-3 py-2.5 text-sm"
                                style={{ border: 'none', outline: 'none', background: 'transparent', color: R.metin, minWidth: 104 }}
                              />
                            </td>
                          ))}
                          <td className="text-center" style={{ borderBottom: `1px solid ${R.kenarHafif}` }}>
                            <button type="button" onClick={() => satirSil(alan.id, i)}
                              aria-label={`${i + 1}. satırı sil`}
                              className="text-base font-bold px-2 rounded"
                              style={{ color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer' }}
                              onMouseEnter={e => { e.currentTarget.style.color = '#dc2626' }}
                              onMouseLeave={e => { e.currentTarget.style.color = '#94a3b8' }}>
                              ×
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button type="button" onClick={() => satirEkle(alan)}
                  className="w-full text-center py-2.5 text-[13px] font-semibold transition-colors"
                  style={{ color: R.vurgu, background: '#f8fafc', border: 'none', borderTop: `1px solid ${R.kenar}`, cursor: 'pointer' }}>
                  + Satır ekle
                </button>
              </div>
            )}
          </div>
        </div>
      ))}

      {hata && (
        <div className="text-sm rounded-xl px-4 py-3 font-medium"
          style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}>
          {hata}
        </div>
      )}

      <button type="submit" disabled={gonderiliyor || onizleme}
        className="w-full rounded-xl text-[15px] font-bold transition-colors"
        style={{
          padding: '13px 20px', border: 'none', cursor: onizleme ? 'not-allowed' : 'pointer',
          background: onizleme ? '#cbd5e1' : '#2288c9', color: '#fff',
          opacity: gonderiliyor ? 0.7 : 1,
        }}>
        {onizleme ? 'Önizleme — gönderilemez' : gonderiliyor ? 'Gönderiliyor...' : gonderEtiketi}
      </button>
    </form>
  )
}
