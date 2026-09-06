'use client'

import { useState } from 'react'
import { ALAN_TIPI_ETIKET, secenekGerekirMi, type AlanTipi, type FormAlani } from '@/lib/form/tipler'
import { tanimsizYerTutucular } from '@/lib/form/sablon'
import { trFold } from '@/lib/turkce'

/**
 * Form oluşturucu — soru listesi + workflow kuralı.
 *
 * Alan `id`'leri soru metninden türetiliyor (`trFold` + slug). Sebep:
 * "sonraki görev" şablonunda kullanıcı `{{malzeme_sayisi}}` yazacak;
 * rastgele uuid'lerle bu imkânsız olurdu. Çakışma olursa sonuna sayı
 * ekleniyor — sunucu da tekilliği ayrıca kontrol ediyor.
 */

interface Props {
  alanlar: FormAlani[]
  onDegis: (alanlar: FormAlani[]) => void
  /** Sonraki görev şablonları — tanımsız yer tutucu uyarısı için. */
  sablonlar: (string | null)[]
}

function idTuret(etiket: string, mevcut: Set<string>): string {
  const temel = trFold(etiket).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'alan'
  if (!mevcut.has(temel)) return temel
  let i = 2
  while (mevcut.has(`${temel}_${i}`)) i++
  return `${temel}_${i}`
}

const TIPLER = Object.keys(ALAN_TIPI_ETIKET) as AlanTipi[]

export default function FormOlusturucu({ alanlar, onDegis, sablonlar }: Props) {
  const [acikIndex, setAcikIndex] = useState<number | null>(null)

  const guncelle = (i: number, yama: Partial<FormAlani>) =>
    onDegis(alanlar.map((a, j) => (j === i ? { ...a, ...yama } : a)))

  function ekle(tip: AlanTipi) {
    const mevcut = new Set(alanlar.map(a => a.id))
    const etiket = 'Yeni soru'
    const yeni: FormAlani = {
      id: idTuret(`${etiket} ${alanlar.length + 1}`, mevcut),
      tip, etiket, zorunlu: false,
    }
    if (secenekGerekirMi(tip)) yeni.secenekler = ['Seçenek 1']
    if (tip === 'tablo') {
      yeni.sutunlar = [{ id: 'sutun_1', baslik: 'Sütun 1', tip: 'metin' }]
      yeni.enAzSatir = 1
    }
    onDegis([...alanlar, yeni])
    setAcikIndex(alanlar.length)
  }

  function sil(i: number) {
    onDegis(alanlar.filter((_, j) => j !== i))
    setAcikIndex(null)
  }

  function tasi(i: number, yon: -1 | 1) {
    const hedef = i + yon
    if (hedef < 0 || hedef >= alanlar.length) return
    const kopya = [...alanlar]
    ;[kopya[i], kopya[hedef]] = [kopya[hedef], kopya[i]]
    onDegis(kopya)
    setAcikIndex(hedef)
  }

  /** Soru metni değişince id de güncellenir — ama yalnızca henüz şablonda
   *  kullanılmıyorsa; kullanılıyorsa şablon sessizce bozulurdu. */
  function etiketDegistir(i: number, etiket: string) {
    const alan = alanlar[i]
    const kullaniliyor = sablonlar.some(s => (s ?? '').includes(`{{${alan.id}}}`))
    if (kullaniliyor) { guncelle(i, { etiket }); return }
    const mevcut = new Set(alanlar.filter((_, j) => j !== i).map(a => a.id))
    guncelle(i, { etiket, id: idTuret(etiket, mevcut) })
  }

  const tanimsiz = [...new Set(sablonlar.flatMap(s => tanimsizYerTutucular(s, alanlar)))]

  return (
    <div className="space-y-3">
      {tanimsiz.length > 0 && (
        <div className="text-xs rounded-xl px-3 py-2 leading-relaxed"
          style={{ background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a' }}>
          Sonraki görev şablonunda formda olmayan alan(lar) var:{' '}
          <strong>{tanimsiz.map(t => `{{${t}}}`).join(', ')}</strong>. Bunlar boş bırakılacak.
        </div>
      )}

      {alanlar.length === 0 && (
        <div className="text-center py-8 rounded-xl"
          style={{ background: '#f8fafc', border: '1.5px dashed #cbd5e1' }}>
          <div className="text-sm font-semibold" style={{ color: '#475569' }}>Henüz soru yok</div>
          <div className="text-xs mt-1" style={{ color: '#64748b' }}>Aşağıdan bir soru tipi seçerek başlayın.</div>
        </div>
      )}

      {alanlar.map((alan, i) => {
        const acik = acikIndex === i
        return (
          <div key={alan.id} className="rounded-xl overflow-hidden"
            style={{ border: `1.5px solid ${acik ? '#38bdf8' : '#cbd5e1'}`, background: '#fff' }}>
            <div className="flex items-center gap-2 px-3 py-2.5"
              style={{ background: acik ? '#f0f9ff' : '#fff' }}>
              <button type="button" onClick={() => setAcikIndex(acik ? null : i)}
                className="min-w-0 flex-1 text-left" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <div className="text-[14px] font-bold truncate" style={{ color: '#0f172a' }}>
                  {alan.etiket}{alan.zorunlu && <span style={{ color: '#dc2626' }}> *</span>}
                </div>
                <div className="text-[11px] mt-1 flex items-center gap-1.5 flex-wrap">
                  <span className="font-semibold px-1.5 py-0.5 rounded"
                    style={{ background: '#f1f5f9', color: '#475569' }}>{ALAN_TIPI_ETIKET[alan.tip]}</span>
                  {/* Alan kimliği görünür olmalı: sonraki görev şablonunda
                      kullanıcı tam olarak bunu yazacak. */}
                  <code className="px-1.5 py-0.5 rounded font-semibold"
                    style={{ background: '#f0fdfa', color: '#0f766e' }}>{`{{${alan.id}}}`}</code>
                </div>
              </button>
              <div className="flex items-center gap-1 shrink-0">
                <button type="button" onClick={() => tasi(i, -1)} aria-label="Yukarı taşı"
                  className="w-6 h-6 rounded-md text-xs font-bold"
                  style={{ color: '#475569', background: '#f1f5f9', border: 'none', cursor: 'pointer' }}>↑</button>
                <button type="button" onClick={() => tasi(i, 1)} aria-label="Aşağı taşı"
                  className="w-6 h-6 rounded-md text-xs font-bold"
                  style={{ color: '#475569', background: '#f1f5f9', border: 'none', cursor: 'pointer' }}>↓</button>
                <button type="button" onClick={() => sil(i)} aria-label="Soruyu sil"
                  className="w-6 h-6 rounded-md text-sm font-bold"
                  style={{ color: '#dc2626', background: '#fef2f2', border: 'none', cursor: 'pointer' }}>×</button>
              </div>
            </div>

            {acik && (
              <div className="px-3 pb-3 space-y-3" style={{ borderTop: '1px solid #f3f4f6' }}>
                <div className="pt-3">
                  <label className="block text-[13px] font-semibold mb-1.5" style={{ color: '#1e293b' }}>Soru metni</label>
                  <input className="input" style={{ borderColor: '#cbd5e1' }} value={alan.etiket}
                    onChange={e => etiketDegistir(i, e.target.value)} />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[13px] font-semibold mb-1.5" style={{ color: '#1e293b' }}>Tip</label>
                    <select className="input" style={{ borderColor: '#cbd5e1' }} value={alan.tip}
                      onChange={e => {
                        const tip = e.target.value as AlanTipi
                        const yama: Partial<FormAlani> = { tip }
                        if (secenekGerekirMi(tip) && !alan.secenekler?.length) yama.secenekler = ['Seçenek 1']
                        if (tip === 'tablo' && !alan.sutunlar?.length) {
                          yama.sutunlar = [{ id: 'sutun_1', baslik: 'Sütun 1', tip: 'metin' }]
                          yama.enAzSatir = 1
                        }
                        guncelle(i, yama)
                      }}>
                      {TIPLER.map(t => <option key={t} value={t}>{ALAN_TIPI_ETIKET[t]}</option>)}
                    </select>
                  </div>
                  <div className="flex items-end pb-2">
                    <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: '#374151' }}>
                      <input type="checkbox" checked={alan.zorunlu}
                        onChange={e => guncelle(i, { zorunlu: e.target.checked })} />
                      Zorunlu
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-[13px] font-semibold mb-1.5" style={{ color: '#1e293b' }}>Yardım metni</label>
                  <input className="input" style={{ borderColor: '#cbd5e1' }} value={alan.aciklama ?? ''}
                    placeholder="İsteğe bağlı"
                    onChange={e => guncelle(i, { aciklama: e.target.value || null })} />
                </div>

                {secenekGerekirMi(alan.tip) && (
                  <div>
                    <label className="block text-[13px] font-semibold mb-1.5" style={{ color: '#1e293b' }}>
                      Seçenekler (her satıra bir tane)
                    </label>
                    <textarea className="input resize-y" rows={3} style={{ color: '#111827' }}
                      value={(alan.secenekler ?? []).join('\n')}
                      onChange={e => guncelle(i, { secenekler: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) })} />
                  </div>
                )}

                {alan.tip === 'tablo' && (
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold" style={{ color: '#374151' }}>
                      Sütunlar — cevaplayan bu ızgarayı satır satır dolduracak
                    </label>
                    {(alan.sutunlar ?? []).map((s, si) => (
                      <div key={si} className="flex gap-2">
                        <input className="input flex-1" value={s.baslik} placeholder="Sütun başlığı"
                          onChange={e => {
                            const yeni = [...(alan.sutunlar ?? [])]
                            const baslik = e.target.value
                            yeni[si] = { ...s, baslik, id: idTuret(baslik, new Set(yeni.filter((_, k) => k !== si).map(x => x.id))) }
                            guncelle(i, { sutunlar: yeni })
                          }} />
                        <select className="input" style={{ borderColor: '#cbd5e1', width: 110 }} value={s.tip}
                          onChange={e => {
                            const yeni = [...(alan.sutunlar ?? [])]
                            yeni[si] = { ...s, tip: e.target.value as 'metin' | 'sayi' | 'tarih' }
                            guncelle(i, { sutunlar: yeni })
                          }}>
                          <option value="metin">Metin</option>
                          <option value="sayi">Sayı</option>
                          <option value="tarih">Tarih</option>
                        </select>
                        <button type="button" aria-label="Sütunu sil"
                          onClick={() => guncelle(i, { sutunlar: (alan.sutunlar ?? []).filter((_, k) => k !== si) })}
                          className="px-2 text-sm font-bold"
                          style={{ color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
                      </div>
                    ))}
                    <button type="button"
                      onClick={() => {
                        const mevcut = new Set((alan.sutunlar ?? []).map(x => x.id))
                        const n = (alan.sutunlar?.length ?? 0) + 1
                        guncelle(i, { sutunlar: [...(alan.sutunlar ?? []), { id: idTuret(`sutun ${n}`, mevcut), baslik: `Sütun ${n}`, tip: 'metin' }] })
                      }}
                      className="text-xs font-semibold"
                      style={{ color: '#2288c9', background: 'none', border: 'none', cursor: 'pointer' }}>
                      + Sütun ekle
                    </button>
                    <div>
                      <label className="block text-[13px] font-semibold mb-1.5" style={{ color: '#1e293b' }}>
                        En az kaç satır doldurulmalı
                      </label>
                      <input type="number" min={1} className="input" style={{ borderColor: '#cbd5e1', width: 120 }}
                        value={alan.enAzSatir ?? 1}
                        onChange={e => guncelle(i, { enAzSatir: Math.max(1, Number(e.target.value) || 1) })} />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}

      <div className="flex flex-wrap gap-1.5 pt-1">
        {TIPLER.map(t => (
          <button key={t} type="button" onClick={() => ekle(t)}
            className="px-3 py-2 rounded-lg text-xs font-semibold transition-colors"
            style={{ background: '#fff', color: '#334155', border: '1.5px solid #cbd5e1', cursor: 'pointer' }}>
            + {ALAN_TIPI_ETIKET[t]}
          </button>
        ))}
      </div>
    </div>
  )
}
