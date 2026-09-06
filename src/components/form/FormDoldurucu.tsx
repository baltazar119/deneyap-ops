'use client'

import { useState } from 'react'
import type { FormAlani, Cevaplar, CevapDegeri } from '@/lib/form/tipler'

/**
 * Form doldurma arayüzü — açık bağlantı ve üye formunda AYNI bileşen.
 *
 * İstemcideki kontroller kullanıcıya yardım içindir; gerçek doğrulama
 * sunucuda (`lib/form/dogrula.ts`). Bu bileşen bir cevabı asla "geçerli"
 * ilan etmez, yalnızca göndermeyi kolaylaştırır.
 */

interface Props {
  alanlar: FormAlani[]
  onGonder: (cevaplar: Cevaplar) => Promise<string | null>
  gonderEtiketi?: string
}

const etiketSinifi = 'block text-sm font-semibold mb-1.5'

/** Tablo alanının başlangıç satırı — cevaplayan boş ızgarayla karşılaşmasın. */
function baslangicSatirlari(alan: FormAlani): Record<string, string>[] {
  const n = Math.max(alan.enAzSatir ?? 1, 1)
  const bos = Object.fromEntries((alan.sutunlar ?? []).map(s => [s.id, '']))
  return Array.from({ length: n }, () => ({ ...bos }))
}

export default function FormDoldurucu({ alanlar, onGonder, gonderEtiketi = 'Gönder' }: Props) {
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

  const ayarla = (id: string, deger: CevapDegeri) =>
    setCevaplar(o => ({ ...o, [id]: deger }))

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
    setGonderiliyor(true)
    setHata(null)
    const h = await onGonder(cevaplar)
    setGonderiliyor(false)
    if (h) setHata(h)
  }

  return (
    <form onSubmit={gonder} className="space-y-5">
      {alanlar.map(alan => (
        <div key={alan.id}>
          <label className={etiketSinifi} style={{ color: '#111827' }}>
            {alan.etiket}
            {alan.zorunlu && <span style={{ color: '#dc2626' }}> *</span>}
          </label>
          {alan.aciklama && (
            <p className="text-xs mb-1.5" style={{ color: '#6b7280' }}>{alan.aciklama}</p>
          )}

          {alan.tip === 'metin' && (
            <input type="text" className="input"
              value={(cevaplar[alan.id] as string) ?? ''}
              onChange={e => ayarla(alan.id, e.target.value)} />
          )}

          {alan.tip === 'uzun_metin' && (
            <textarea className="input resize-y" rows={4} style={{ color: '#111827', minHeight: 90 }}
              value={(cevaplar[alan.id] as string) ?? ''}
              onChange={e => ayarla(alan.id, e.target.value)} />
          )}

          {alan.tip === 'sayi' && (
            <input type="number" step="any" className="input"
              value={(cevaplar[alan.id] as string) ?? ''}
              onChange={e => ayarla(alan.id, e.target.value)} />
          )}

          {alan.tip === 'tarih' && (
            <input type="date" className="input"
              value={(cevaplar[alan.id] as string) ?? ''}
              onChange={e => ayarla(alan.id, e.target.value)} />
          )}

          {alan.tip === 'evet_hayir' && (
            <div className="flex gap-2">
              {[{ v: true, e: 'Evet' }, { v: false, e: 'Hayır' }].map(o => {
                const secili = cevaplar[alan.id] === o.v
                return (
                  <button key={o.e} type="button" onClick={() => ayarla(alan.id, secili ? null : o.v)}
                    className="px-4 py-2 rounded-xl text-sm font-semibold"
                    style={{
                      background: secili ? '#e0f2fe' : '#fff',
                      color: secili ? '#0369a1' : '#64748b',
                      border: `1px solid ${secili ? '#7dd3fc' : '#e5e7eb'}`,
                    }}>
                    {o.e}
                  </button>
                )
              })}
            </div>
          )}

          {alan.tip === 'secim' && (
            <select className="input" value={(cevaplar[alan.id] as string) ?? ''}
              onChange={e => ayarla(alan.id, e.target.value || null)}>
              <option value="">-- Seçiniz --</option>
              {alan.secenekler?.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}

          {alan.tip === 'coklu_secim' && (
            <div className="flex flex-wrap gap-1.5">
              {alan.secenekler?.map(s => {
                const mevcut = (cevaplar[alan.id] as string[]) ?? []
                const secili = mevcut.includes(s)
                return (
                  <button key={s} type="button"
                    onClick={() => ayarla(alan.id, secili ? mevcut.filter(x => x !== s) : [...mevcut, s])}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold"
                    style={{
                      background: secili ? '#e0f2fe' : '#fff',
                      color: secili ? '#0369a1' : '#64748b',
                      border: `1px solid ${secili ? '#7dd3fc' : '#e5e7eb'}`,
                    }}>
                    {s}
                  </button>
                )
              })}
            </div>
          )}

          {/* Tablo — bu ürünün Google Form'dan ayrıldığı yer. Dar ekranda
              yatay kaydırılır; sayfanın kendisi yatay kaymamalı. */}
          {alan.tip === 'tablo' && (
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e5e7eb' }}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" style={{ borderCollapse: 'collapse', minWidth: 360 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      {alan.sutunlar?.map(s => (
                        <th key={s.id} className="text-left px-3 py-2 text-xs font-bold whitespace-nowrap"
                          style={{ color: '#475569', borderBottom: '1px solid #e5e7eb' }}>
                          {s.baslik}
                        </th>
                      ))}
                      <th style={{ borderBottom: '1px solid #e5e7eb', width: 40 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {((cevaplar[alan.id] as Record<string, string>[]) ?? []).map((satir, i) => (
                      <tr key={i}>
                        {alan.sutunlar?.map(s => (
                          <td key={s.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <input
                              type={s.tip === 'sayi' ? 'number' : s.tip === 'tarih' ? 'date' : 'text'}
                              step={s.tip === 'sayi' ? 'any' : undefined}
                              value={satir[s.id] ?? ''}
                              onChange={e => satirAyarla(alan.id, i, s.id, e.target.value)}
                              aria-label={`${s.baslik} — satır ${i + 1}`}
                              className="w-full px-3 py-2 text-sm"
                              style={{ border: 'none', outline: 'none', background: 'transparent', color: '#111827', minWidth: 110 }}
                            />
                          </td>
                        ))}
                        <td className="text-center" style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <button type="button" onClick={() => satirSil(alan.id, i)}
                            aria-label={`${i + 1}. satırı sil`}
                            className="text-sm font-bold px-2"
                            style={{ color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer' }}>
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" onClick={() => satirEkle(alan)}
                className="w-full text-left px-3 py-2 text-xs font-semibold"
                style={{ color: '#2288c9', background: '#fff', border: 'none', borderTop: '1px solid #f3f4f6', cursor: 'pointer' }}>
                + Satır ekle
              </button>
            </div>
          )}
        </div>
      ))}

      {hata && (
        <div className="text-sm rounded-xl px-4 py-3" style={{ background: '#fee2e2', color: '#dc2626' }}>
          {hata}
        </div>
      )}

      <button type="submit" disabled={gonderiliyor} className="btn-primary w-full">
        {gonderiliyor ? 'Gönderiliyor...' : gonderEtiketi}
      </button>
    </form>
  )
}
