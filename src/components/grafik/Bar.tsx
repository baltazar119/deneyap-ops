'use client'

import { useId } from 'react'
import { yatayBar, yiginBar, sparkline, type YatayBarGirdisi, type YiginDilimi } from '@/lib/grafik/geometri'

/**
 * Yatay bar, yığın bar ve sparkline — web renderer'ları.
 * Geometri `lib/grafik/geometri.ts`'ten gelir; PDF aynı geometriyi kullanır.
 */

export function YatayBar({ baslik, ...g }: YatayBarGirdisi & { baslik?: string }) {
  const id = useId()
  const c = yatayBar(g)

  if (!c.barlar.length) {
    return <div className="text-xs py-4 text-center" style={{ color: '#94a3b8' }}>Veri yok.</div>
  }

  return (
    <div>
      {baslik && <div className="text-xs font-semibold mb-1" style={{ color: '#475569' }}>{baslik}</div>}
      <div style={{ overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${c.genislik} ${c.yukseklik}`} width="100%"
             style={{ minWidth: 260, display: 'block' }} role="img" aria-labelledby={`${id}-t`}>
          <title id={`${id}-t`}>{baslik ?? 'Karşılaştırma'}</title>
          {c.barlar.map((b, i) => (
            <g key={b.etiket + i}>
              <text x={c.etiketGenisligi - 8} y={b.y + b.h / 2 + 3} textAnchor="end"
                    fontSize={10} fill="#475569">{b.etiket}</text>
              <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={3} fill={b.renk} />
              <text x={b.yaziX} y={b.y + b.h / 2 + 3} fontSize={10} fill="#64748b">{b.deger}</text>
            </g>
          ))}
        </svg>
      </div>
      <table className="sr-only">
        <caption>{baslik ?? 'Karşılaştırma verisi'}</caption>
        <tbody>
          {c.barlar.map((b, i) => (
            <tr key={b.etiket + i}><th scope="row">{b.etiket}</th><td>{b.deger}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function YiginBar({ dilimler, baslik }: { dilimler: YiginDilimi[]; baslik?: string }) {
  const id = useId()
  const c = yiginBar(dilimler)

  if (!c.dilimler.length) {
    return <div className="text-xs py-4 text-center" style={{ color: '#94a3b8' }}>Veri yok.</div>
  }

  return (
    <div>
      {baslik && <div className="text-xs font-semibold mb-1" style={{ color: '#475569' }}>{baslik}</div>}
      <svg viewBox={`0 0 ${c.genislik} ${c.yukseklik}`} width="100%"
           style={{ display: 'block' }} role="img" aria-labelledby={`${id}-t`}>
        <title id={`${id}-t`}>{baslik ?? 'Dağılım'}</title>
        {c.dilimler.map((d, i) => (
          <rect key={d.ad} x={d.x} y={0} width={d.w} height={c.yukseklik}
                fill={d.renk}
                rx={i === 0 || i === c.dilimler.length - 1 ? 3 : 0} />
        ))}
      </svg>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
        {c.dilimler.map(d => (
          <span key={d.ad} className="inline-flex items-center gap-1 text-xs" style={{ color: '#64748b' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: d.renk, display: 'inline-block' }} />
            {d.ad} <strong style={{ color: '#334155' }}>{d.deger}</strong>
            <span style={{ color: '#94a3b8' }}>%{d.yuzde}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * Küçük eğilim çizgisi — risk kartlarında ve il satırlarında.
 * Eksen yok, sayı yok; yalnızca YÖN gösterir.
 */
export function Sparkline({
  degerler, renk = '#2288c9', genislik = 80, yukseklik = 22, etiket,
}: {
  degerler: (number | null)[]
  renk?: string
  genislik?: number
  yukseklik?: number
  etiket?: string
}) {
  const s = sparkline(degerler, genislik, yukseklik)
  if (!s.d) return null

  return (
    <svg width={genislik} height={yukseklik} viewBox={`0 0 ${genislik} ${yukseklik}`}
         style={{ display: 'block', overflow: 'visible' }} role="img"
         aria-label={etiket ?? 'Eğilim'}>
      <path d={s.d} fill="none" stroke={renk} strokeWidth={1.5}
            strokeLinejoin="round" strokeLinecap="round" opacity={0.85} />
      {s.sonNokta && <circle cx={s.sonNokta.x} cy={s.sonNokta.y} r={2} fill={renk} />}
    </svg>
  )
}
