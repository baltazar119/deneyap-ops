'use client'

export interface OperationRiskItem {
  id: string
  label: string
  level: 'low' | 'medium' | 'high'
}

const LEVEL_COLOR: Record<OperationRiskItem['level'], string> = {
  low: '#22c55e',
  medium: '#f59e0b',
  high: '#ef4444',
}

interface Props {
  items: OperationRiskItem[]
  loading?: boolean
}

/**
 * AtölyeBarı'nın (Tarlis'e özgü "atölyede kim var" şeridi) görsel yapısı
 * korunarak DENEYAP'ın operasyon risk özetine dönüştürülmüş hali. Gerçek
 * risk verisi Faz 3'te (operasyon risk veri modeli eklenince) bağlanacak;
 * şimdilik `items` prop'u üzerinden dışarıdan beslenir.
 */
export default function OperationRiskWidget({ items, loading = false }: Props) {
  if (loading) return null

  const highCount = items.filter(i => i.level === 'high').length
  const mediumCount = items.filter(i => i.level === 'medium').length
  const overallColor = highCount > 0 ? LEVEL_COLOR.high : mediumCount > 0 ? LEVEL_COLOR.medium : LEVEL_COLOR.low

  return (
    <div
      style={{
        background: 'linear-gradient(90deg, #eaf8fc 0%, #f0fbff 100%)',
        borderBottom: '1px solid rgba(122,207,230,0.3)',
      }}
    >
      <div className="max-w-5xl mx-auto px-4 py-1.5 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className="inline-block w-2 h-2 rounded-full shrink-0"
            style={{
              background: overallColor,
              boxShadow: items.length > 0 ? `0 0 0 3px ${overallColor}2e` : 'none',
            }}
          />
          <span className="text-xs font-semibold" style={{ color: '#182c3f' }}>
            {items.length > 0
              ? highCount > 0
                ? `Operasyon riski: ${highCount} yüksek riskli kayıt`
                : 'Operasyon riski izleniyor'
              : 'Açık risk kaydı yok'}
          </span>
        </div>

        {items.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-1 rounded-full px-2 py-0.5"
                style={{
                  background: `${LEVEL_COLOR[item.level]}18`,
                  border: `1px solid ${LEVEL_COLOR[item.level]}59`,
                }}
                title={item.label}
              >
                <span className="text-xs font-medium" style={{ color: '#182c3f' }}>
                  {item.label}
                </span>
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: LEVEL_COLOR[item.level] }}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
