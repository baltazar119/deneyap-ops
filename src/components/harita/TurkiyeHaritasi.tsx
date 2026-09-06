'use client'

import { useState, useRef } from 'react'
import { HARITA_GENISLIK, HARITA_YUKSEKLIK } from '@/lib/harita/turkiyeIller'
import { HARITA_RENK, LEJANT_SIRASI, haritaSirala, sinirKutusu, type IlHaritaVerisi } from '@/lib/harita/ilDurumu'
import { useIsMobile } from '@/lib/useIsMobile'
import ResponsiveModal from '@/components/responsive/ResponsiveModal'

/**
 * Türkiye ısı haritası.
 *
 * MOBİLDE VARSAYILAN TABLO: 375px genişlikte 81 il okunamaz, dokunma hedefleri
 * bir tırnak ucundan küçük olur. Harita "Haritayı göster" düğmesinin arkasında.
 *
 * HARİTA HER ZAMAN TABLOYLA BİRLİKTE: SVG ekran okuyucu için bir resimdir ve
 * renk körü bir kullanıcı için kademeler ayırt edilemeyebilir. Tablo hem
 * erişilebilirlik alternatifi hem de "hangi il kaçıncı sırada" sorusunun
 * doğrudan cevabı.
 */

interface Props {
  veri: IlHaritaVerisi[]
  /** İl Sorumlusu: yalnızca kendi ili gösterilir, ulusal tablo değil */
  tekIl?: string | null
  ilLinki?: (il: string) => string
}

export default function TurkiyeHaritasi({ veri, tekIl = null, ilLinki }: Props) {
  const mobil = useIsMobile()
  const [haritaAcik, setHaritaAcik] = useState(false)
  const [vurgu, setVurgu] = useState<IlHaritaVerisi | null>(null)
  const [secili, setSecili] = useState<IlHaritaVerisi | null>(null)
  const kapsayici = useRef<HTMLDivElement>(null)

  const gosterilecek = tekIl ? veri.filter(v => v.il === tekIl) : veri

  /**
   * Tek il gösteriliyorsa viewBox o ilin etrafına daraltılır — "kendi ili
   * büyütülmüş" demek bu. Ülke ölçeğindeki çerçevede tek bir il ortada minik
   * bir leke olarak kalır ve DENEYAP'ları tıklamak zorlaşır.
   */
  const kutu = tekIl && gosterilecek[0] ? sinirKutusu(gosterilecek[0].d) : null
  const viewBox = kutu
    ? `${kutu.x} ${kutu.y} ${kutu.w} ${kutu.h}`
    : `0 0 ${HARITA_GENISLIK} ${HARITA_YUKSEKLIK}`
  const sirali = haritaSirala(gosterilecek)
  const veriliSayi = gosterilecek.filter(v => v.veriVarMi).length

  // Mobilde harita gizli başlar; masaüstünde açık.
  const haritaGorunur = !mobil || haritaAcik

  return (
    <div>
      {/* ── Başlık + mobil geçiş ── */}
      <div className="flex items-center justify-between mb-2 gap-2">
        <div>
          <h2 className="font-semibold" style={{ color: '#0d1a2a' }}>
            {tekIl ? `${tekIl} Durumu` : 'Türkiye Risk Haritası'}
          </h2>
          <p className="text-xs" style={{ color: '#94a3b8' }}>
            {veriliSayi > 0
              ? `${veriliSayi} ilde görev kaydı var. Verisi olmayan iller gri gösterilir.`
              : 'Henüz hiçbir ilde görev kaydı yok.'}
          </p>
        </div>
        {mobil && (
          <button
            onClick={() => setHaritaAcik(v => !v)}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg shrink-0"
            style={{ background: '#fff', color: '#2288c9', border: '1px solid #bae6fd' }}
          >
            {haritaAcik ? 'Haritayı gizle' : 'Haritayı göster'}
          </button>
        )}
      </div>

      {/* ── Harita ── */}
      {haritaGorunur && (
        <div ref={kapsayici} className="relative mb-3">
          <svg
            viewBox={viewBox}
            width="100%"
            style={{ display: 'block', background: '#f8fafc', borderRadius: 12 }}
            role="img"
            aria-label={tekIl ? `${tekIl} risk durumu` : 'Türkiye il bazlı risk haritası'}
          >
            <defs>
              {/* En yüksek kademe için tarama deseni — renk tek kanal olmasın */}
              <pattern id="tarama" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
                <line x1="0" y1="0" x2="0" y2="6" stroke="#ffffff" strokeWidth="1.5" opacity="0.55" />
              </pattern>
            </defs>

            {gosterilecek.map(v => {
              const renk = HARITA_RENK[v.seviye]
              const etkin = v.veriVarMi
              return (
                <g key={v.il}>
                  <path
                    d={v.d}
                    fill={renk.dolgu}
                    stroke={vurgu?.il === v.il ? '#0d1a2a' : renk.kenar}
                    strokeWidth={(vurgu?.il === v.il ? 2 : 0.7) * (kutu ? kutu.w / HARITA_GENISLIK : 1)}
                    tabIndex={etkin ? 0 : -1}
                    role={etkin ? 'button' : undefined}
                    aria-label={
                      `${v.il}: ${renk.etiket}` +
                      (etkin ? `, risk ${v.riskSkoru}, ${v.acik} açık görev, ${v.geciken} geciken` : '')
                    }
                    style={{ cursor: etkin ? 'pointer' : 'default', outline: 'none' }}
                    onMouseEnter={() => !mobil && setVurgu(v)}
                    onMouseLeave={() => !mobil && setVurgu(null)}
                    onFocus={() => setVurgu(v)}
                    onBlur={() => setVurgu(null)}
                    onClick={() => etkin && setSecili(v)}
                    onKeyDown={e => { if (etkin && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setSecili(v) } }}
                  />
                  {v.seviye === 'kritik' && (
                    <path d={v.d} fill="url(#tarama)" stroke="none" pointerEvents="none" />
                  )}
                </g>
              )
            })}
          </svg>

          {/* Tooltip — SVG dışında, kutudan taşabilsin */}
          {vurgu && !mobil && (
            <div
              className="absolute pointer-events-none rounded-xl px-3 py-2 shadow-lg"
              style={{
                left: kutu
                  ? `${((vurgu.merkez[0] - kutu.x) / kutu.w) * 100}%`
                  : `${(vurgu.merkez[0] / HARITA_GENISLIK) * 100}%`,
                top: kutu
                  ? `${((vurgu.merkez[1] - kutu.y) / kutu.h) * 100}%`
                  : `${(vurgu.merkez[1] / HARITA_YUKSEKLIK) * 100}%`,
                transform: 'translate(-50%, -115%)',
                background: '#0d1a2a', color: '#fff', minWidth: 150, zIndex: 10,
              }}
            >
              <div className="text-sm font-bold">{vurgu.il}</div>
              {vurgu.veriVarMi ? (
                <>
                  <div className="text-xs" style={{ color: '#cbd5e1' }}>
                    Risk {vurgu.riskSkoru} · {HARITA_RENK[vurgu.seviye].etiket}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: '#cbd5e1' }}>
                    {vurgu.acik} açık · {vurgu.geciken} geciken
                  </div>
                  {vurgu.deneyaplar.length > 0 && (
                    <div className="text-xs mt-1 pt-1" style={{ borderTop: '1px solid #334155', color: '#e2e8f0' }}>
                      {vurgu.deneyaplar.slice(0, 4).map(d => (
                        <div key={d.id}>· {d.ad} ({d.acik} açık{d.geciken ? `, ${d.geciken} geciken` : ''})</div>
                      ))}
                      {vurgu.deneyaplar.length > 4 && <div>… {vurgu.deneyaplar.length - 4} DENEYAP daha</div>}
                    </div>
                  )}
                  <div className="text-xs mt-1" style={{ color: '#7acfe6' }}>Ayrıntı için tıklayın</div>
                </>
              ) : (
                <div className="text-xs" style={{ color: '#cbd5e1' }}>Bu ilde görev kaydı yok</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Lejant ── */}
      {haritaGorunur && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 mb-4">
          {LEJANT_SIRASI.map(s => (
            <span key={s} className="inline-flex items-center gap-1.5 text-xs" style={{ color: '#64748b' }}>
              <span style={{
                width: 12, height: 12, borderRadius: 3, display: 'inline-block',
                background: HARITA_RENK[s].dolgu, border: `1px solid ${HARITA_RENK[s].kenar}`,
              }} />
              {HARITA_RENK[s].etiket}
            </span>
          ))}
        </div>
      )}

      {/* ── Tablo — HER ZAMAN görünür ── */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e2e8f0' }}>
        <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
          <caption className="sr-only">İl bazlı risk tablosu</caption>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              <th scope="col" className="text-left px-3 py-2 text-xs font-semibold" style={{ color: '#64748b' }}>İl</th>
              <th scope="col" className="text-right px-2 py-2 text-xs font-semibold" style={{ color: '#64748b' }}>Risk</th>
              <th scope="col" className="text-right px-2 py-2 text-xs font-semibold" style={{ color: '#64748b' }}>Açık</th>
              <th scope="col" className="text-right px-2 py-2 text-xs font-semibold" style={{ color: '#64748b' }}>Geciken</th>
              <th scope="col" className="text-right px-3 py-2 text-xs font-semibold" style={{ color: '#64748b' }}>DENEYAP</th>
            </tr>
          </thead>
          <tbody>
            {sirali.filter(v => v.veriVarMi).map(v => (
              <tr key={v.il}
                  onClick={() => setSecili(v)}
                  style={{ borderTop: '1px solid #f1f5f9', cursor: 'pointer' }}>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-2">
                    <span style={{
                      width: 10, height: 10, borderRadius: 2, display: 'inline-block',
                      background: HARITA_RENK[v.seviye].dolgu, border: '1px solid #e2e8f0',
                    }} />
                    <span style={{ color: '#0d1a2a' }}>{v.il}</span>
                  </span>
                </td>
                <td className="text-right px-2 py-2 font-semibold" style={{ color: '#334155' }}>{v.riskSkoru}</td>
                <td className="text-right px-2 py-2" style={{ color: '#64748b' }}>{v.acik}</td>
                <td className="text-right px-2 py-2" style={{ color: v.geciken ? '#dc2626' : '#64748b' }}>{v.geciken}</td>
                <td className="text-right px-3 py-2" style={{ color: '#64748b' }}>{v.deneyaplar.length || '—'}</td>
              </tr>
            ))}
            {veriliSayi === 0 && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-xs" style={{ color: '#94a3b8' }}>
                Görev kaydı olan il yok.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Detay paneli — bir ilde BİRDEN FAZLA DENEYAP olabildiği için var ── */}
      <ResponsiveModal open={!!secili} onClose={() => setSecili(null)} title={secili?.il} maxWidth="md">
        {secili && (
          <div>
            <div className="flex flex-wrap gap-2 mb-4">
              <Rozet etiket="Risk" deger={`${secili.riskSkoru} · ${HARITA_RENK[secili.seviye].etiket}`} />
              <Rozet etiket="Açık" deger={secili.acik} />
              <Rozet etiket="Geciken" deger={secili.geciken} vurgu={secili.geciken > 0} />
              {secili.bloke > 0 && <Rozet etiket="Bloke" deger={secili.bloke} vurgu />}
            </div>

            <h3 className="text-sm font-semibold mb-2" style={{ color: '#0d1a2a' }}>
              Bu ildeki DENEYAP&apos;lar ({secili.deneyaplar.length})
            </h3>
            {secili.deneyaplar.length ? (
              <div className="space-y-1.5">
                {secili.deneyaplar.map(d => (
                  <div key={d.id} className="flex items-center gap-2 rounded-xl px-3 py-2"
                       style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                    <span className="text-sm flex-1 min-w-0 truncate" style={{ color: '#0d1a2a' }}>{d.ad}</span>
                    <span className="text-xs" style={{ color: '#64748b' }}>{d.acik} açık</span>
                    {d.geciken > 0 && (
                      <span className="text-xs font-bold px-2 py-0.5 rounded"
                            style={{ background: '#fee2e2', color: '#dc2626' }}>{d.geciken} geciken</span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs" style={{ color: '#94a3b8' }}>
                Bu ile bağlı DENEYAP tanımlanmamış. Ayarlar → DENEYAP&apos;lar ekranından ekleyebilirsiniz.
              </p>
            )}

            {ilLinki && (
              <a href={ilLinki(secili.il)}
                 className="inline-block mt-4 text-sm font-semibold px-4 py-2 rounded-xl"
                 style={{ background: '#2288c9', color: '#fff' }}>
                {secili.il} görevlerini aç
              </a>
            )}
          </div>
        )}
      </ResponsiveModal>
    </div>
  )
}

function Rozet({ etiket, deger, vurgu = false }: { etiket: string; deger: string | number; vurgu?: boolean }) {
  return (
    <span className="text-xs px-2.5 py-1 rounded-lg"
          style={{
            background: vurgu ? '#fee2e2' : '#f1f5f9',
            color: vurgu ? '#dc2626' : '#475569',
            border: `1px solid ${vurgu ? '#fca5a5' : '#e2e8f0'}`,
          }}>
      {etiket}: <strong>{deger}</strong>
    </span>
  )
}
