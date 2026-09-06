'use client'

import { useId, useState } from 'react'
import { cizgiSerisi, type CizgiGirdisi } from '@/lib/grafik/geometri'

/**
 * Çok çizgili zaman serisi — web renderer'ı.
 *
 * Geometri `lib/grafik/geometri.ts`'te hesaplanır; bu bileşen yalnızca çizer.
 * PDF karşılığı (`lib/rapor/pdf/grafikler.tsx`) AYNI geometriyi tüketir,
 * böylece ekran ile PDF birebir aynı grafiği gösterir.
 *
 * ERİŞİLEBİLİRLİK: grafiğin yanında görsel olarak gizli bir <table> render
 * edilir. Ekran okuyucu kullanan biri için SVG bir "resim"dir; tablo aynı
 * veriyi okunabilir kılar.
 */

interface Props extends CizgiGirdisi {
  baslik?: string
  /** Kesikli bölge için dipnot gösterilsin mi */
  turetilmisNotu?: string
}

export default function Cizgi({ baslik, turetilmisNotu, ...girdi }: Props) {
  const id = useId()
  const [vurgu, setVurgu] = useState<number | null>(null)
  const c = cizgiSerisi(girdi)

  if (!c.seriler.length || !girdi.etiketler.length) {
    return (
      <div className="text-xs py-6 text-center" style={{ color: '#94a3b8' }}>
        Bu dönem için gösterilecek veri yok.
      </div>
    )
  }

  const { ic } = c.eksen
  const vurguX = vurgu !== null && girdi.etiketler.length > 1
    ? ic.x + (vurgu / (girdi.etiketler.length - 1)) * ic.genislik
    : null

  return (
    <div>
      {baslik && (
        <div className="text-xs font-semibold mb-1" style={{ color: '#475569' }}>{baslik}</div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <svg
          viewBox={`0 0 ${c.genislik} ${c.yukseklik}`}
          width="100%"
          style={{ minWidth: 280, display: 'block' }}
          role="img"
          aria-labelledby={`${id}-t`}
        >
          <title id={`${id}-t`}>
            {baslik ?? 'Zaman serisi'} — {c.seriler.map(s => s.ad).join(', ')}
          </title>

          {/* Yatay kılavuz çizgileri ve y ekseni */}
          {c.eksen.tickler.map(t => (
            <g key={t.deger}>
              <line x1={ic.x} y1={t.y} x2={ic.x + ic.genislik} y2={t.y}
                    stroke="#eef2f7" strokeWidth={1} />
              <text x={ic.x - 6} y={t.y + 3} textAnchor="end"
                    fontSize={9} fill="#94a3b8">{t.etiket}</text>
            </g>
          ))}

          {/* x ekseni etiketleri */}
          {c.eksen.xEtiketleri.map(e => (
            <text key={e.x} x={e.x} y={c.yukseklik - 8} textAnchor="middle"
                  fontSize={9} fill="#94a3b8">{e.etiket}</text>
          ))}

          {/* Vurgulanan noktanın dikey çizgisi */}
          {vurguX !== null && (
            <line x1={vurguX} y1={ic.y} x2={vurguX} y2={ic.y + ic.yukseklik}
                  stroke="#cbd5e1" strokeWidth={1} strokeDasharray="3 3" />
          )}

          {/* Seriler */}
          {c.seriler.map(s => (
            <g key={s.ad}>
              {s.parcalar.map((p, i) => (
                <path key={i} d={p.d} fill="none" stroke={s.renk} strokeWidth={2}
                      strokeLinejoin="round" strokeLinecap="round"
                      // Kesikli = türetilmiş veri. Ölçüm ile tahmini
                      // görsel olarak ayırmak dürüstlük gereği.
                      strokeDasharray={p.kesikli ? '4 3' : undefined}
                      opacity={p.kesikli ? 0.75 : 1} />
              ))}
              {s.noktalar.map(n => (
                <circle key={n.i} cx={n.x} cy={n.y} r={vurgu === n.i ? 3.5 : 2.2}
                        fill="#fff" stroke={s.renk} strokeWidth={1.6} />
              ))}
            </g>
          ))}

          {/* Fare yakalama alanı — her nokta için görünmez dikey şerit */}
          {girdi.etiketler.map((_, i) => {
            const w = ic.genislik / Math.max(girdi.etiketler.length, 1)
            return (
              <rect key={i} x={ic.x + i * w - w / 2} y={ic.y} width={w} height={ic.yukseklik}
                    fill="transparent"
                    onMouseEnter={() => setVurgu(i)}
                    onMouseLeave={() => setVurgu(null)} />
            )
          })}
        </svg>
      </div>

      {/* Gösterge */}
      <div className="flex flex-wrap gap-3 mt-1.5">
        {c.seriler.map(s => (
          <span key={s.ad} className="inline-flex items-center gap-1.5 text-xs" style={{ color: '#64748b' }}>
            <span style={{ width: 10, height: 2, background: s.renk, display: 'inline-block' }} />
            {s.ad}
            {vurgu !== null && (
              <strong style={{ color: '#334155' }}>
                {s.noktalar.find(n => n.i === vurgu)?.deger ?? '—'}
              </strong>
            )}
          </span>
        ))}
        {vurgu !== null && (
          <span className="text-xs" style={{ color: '#94a3b8' }}>{girdi.etiketler[vurgu]}</span>
        )}
      </div>

      {turetilmisNotu && girdi.turetilmis?.some(Boolean) && (
        <p className="text-xs mt-1.5" style={{ color: '#94a3b8' }}>{turetilmisNotu}</p>
      )}

      {/* Ekran okuyucu alternatifi — SVG bir resimdir, veri buradan okunur */}
      <table className="sr-only">
        <caption>{baslik ?? 'Zaman serisi verisi'}</caption>
        <thead>
          <tr>
            <th scope="col">Dönem</th>
            {c.seriler.map(s => <th key={s.ad} scope="col">{s.ad}</th>)}
          </tr>
        </thead>
        <tbody>
          {girdi.etiketler.map((e, i) => (
            <tr key={e + i}>
              <th scope="row">{e}</th>
              {c.seriler.map(s => (
                <td key={s.ad}>{s.noktalar.find(n => n.i === i)?.deger ?? 'veri yok'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
