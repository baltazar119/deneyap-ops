'use client'

import { gorulebilirGorunumler, gorunumEtiketi, type GorunumId, type GorunumBaglami } from '@/lib/gorevGorunumleri'

interface Props {
  baglam: GorunumBaglami
  gorunum: GorunumId
  setGorunum: (g: GorunumId) => void
  q: string
  setQ: (q: string) => void
  /** Görünüm chip'lerinde gösterilecek sayaçlar: görünüm id → adet. */
  sayaclar: Record<string, number>
  filtreSayisi: number
  onFiltreAc: () => void
}

/**
 * Görevler ekranının sürekli görünen kontrol çubuğu: hazır görünümler,
 * arama ve tek "Filtrele" düğmesi.
 *
 * Faz 2 öncesi ekranda sürekli 11 kontrol duruyordu (6 durum sekmesi, 2
 * termin chip'i, 5 öncelik chip'i, 4 select). Artık 3: görünüm satırı, arama,
 * Filtrele. Detaylar rozetli düğmenin arkasında.
 *
 * Aynı düzen iki breakpoint'te de geçerli — mobil/masaüstü ayrı kontrol
 * kümesi kalmadı.
 */
export default function GorevAramaVeGorunumler({
  baglam, gorunum, setGorunum, q, setQ, sayaclar, filtreSayisi, onFiltreAc,
}: Props) {
  const gorunumler = gorulebilirGorunumler(baglam)

  return (
    <div className="flex flex-col gap-2.5 mb-4">
      {/* Hazır görünümler */}
      <div
        className="flex items-center gap-1.5 overflow-x-auto"
        style={{ scrollbarWidth: 'none' }}
        role="tablist"
        aria-label="Hazır görünümler"
      >
        {gorunumler.map(g => {
          const aktif = gorunum === g.id
          const adet = sayaclar[g.id]
          return (
            <button
              key={g.id}
              role="tab"
              aria-selected={aktif}
              onClick={() => setGorunum(g.id)}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
              style={{
                background: aktif ? '#0f2942' : '#fff',
                color: aktif ? '#fff' : '#475569',
                border: `1px solid ${aktif ? '#0f2942' : '#e5e7eb'}`,
              }}
            >
              {gorunumEtiketi(g, baglam)}
              {adet !== undefined && (
                <span
                  className="font-bold text-[11px] px-1.5 rounded-full"
                  style={{
                    background: aktif ? 'rgba(255,255,255,0.18)' : '#f1f5f9',
                    color: aktif ? '#fff' : '#94a3b8',
                  }}
                >{adet}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Arama + Filtrele */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <span
            aria-hidden="true"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none"
            style={{ color: '#94a3b8' }}
          >⌕</span>
          <input
            type="search"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Görev, kişi veya il ara..."
            aria-label="Görevlerde ara"
            className="w-full text-sm rounded-xl py-2 pl-8 pr-3"
            style={{ background: '#fff', border: '1px solid #e5e7eb', color: '#111827', outline: 'none' }}
          />
        </div>

        <button
          onClick={onFiltreAc}
          className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold transition-colors"
          style={{
            background: filtreSayisi > 0 ? '#e0f2fe' : '#fff',
            color: filtreSayisi > 0 ? '#0369a1' : '#475569',
            border: `1px solid ${filtreSayisi > 0 ? '#7dd3fc' : '#e5e7eb'}`,
          }}
        >
          Filtrele
          {filtreSayisi > 0 && (
            <span
              className="text-[11px] font-bold px-1.5 rounded-full"
              style={{ background: '#0369a1', color: '#fff' }}
            >{filtreSayisi}</span>
          )}
        </button>
      </div>
    </div>
  )
}
