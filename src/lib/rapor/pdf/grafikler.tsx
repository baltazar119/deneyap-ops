import { View, Text, Svg, Path, Line, Rect, Circle, G } from '@react-pdf/renderer'
import { cizgiSerisi, yatayBar, yiginBar, type CizgiGirdisi, type YiginDilimi } from '@/lib/grafik/geometri'

/**
 * PDF grafik renderer'ı.
 *
 * Web tarafıyla (components/grafik/*) AYNI geometri fonksiyonlarını kullanır;
 * `d` string'leri tek yerde üretilir. Bu yüzden ekranda görülen grafik ile
 * indirilen PDF'teki grafik birebir aynıdır — iki ayrı çizim kodu olsaydı
 * zamanla ayrışırlardı.
 *
 * @react-pdf v4 Svg/Path/Line/Rect/Circle/G destekliyor (kurulu sürümde
 * doğrulandı), bu yüzden ek bir grafik kütüphanesi gerekmiyor.
 *
 * NOT: Svg İÇİNDE <Text> kullanmıyoruz. Gömülü fontla (Roboto) Svg içi metin
 * bazı sürümlerde beklenmedik konumlanıyor; eksen etiketleri Svg'nin DIŞINDA
 * normal <Text> ile yazılıyor.
 */

const CIZGI_G = 500
const CIZGI_Y = 150

export function PdfCizgi({ baslik, ...girdi }: CizgiGirdisi & { baslik?: string }) {
  const c = cizgiSerisi({ ...girdi, genislik: CIZGI_G, yukseklik: CIZGI_Y })
  if (!c.seriler.length || !girdi.etiketler.length) return null

  const { ic } = c.eksen

  return (
    <View style={{ marginBottom: 14 }}>
      {baslik && (
        <Text style={{ fontSize: 9, color: '#475569', marginBottom: 4 }}>{baslik}</Text>
      )}

      <Svg width={CIZGI_G} height={CIZGI_Y} viewBox={`0 0 ${CIZGI_G} ${CIZGI_Y}`}>
        {/* Kılavuz çizgileri */}
        {c.eksen.tickler.map(t => (
          <Line key={t.deger} x1={ic.x} y1={t.y} x2={ic.x + ic.genislik} y2={t.y}
                strokeWidth={0.5} stroke="#e2e8f0" />
        ))}

        {c.seriler.map(s => (
          <G key={s.ad}>
            {s.parcalar.map((p, i) => (
              <Path key={i} d={p.d} stroke={s.renk} strokeWidth={1.4} fill="none"
                    strokeDasharray={p.kesikli ? '3 2' : undefined} />
            ))}
            {s.noktalar.map(n => (
              <Circle key={n.i} cx={n.x} cy={n.y} r={1.6} fill={s.renk} />
            ))}
          </G>
        ))}
      </Svg>

      {/* Eksen etiketleri Svg DIŞINDA — gömülü fontla Svg içi metin riskli */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
        {c.eksen.xEtiketleri.map((e, i) => (
          <Text key={i} style={{ fontSize: 6.5, color: '#94a3b8' }}>{e.etiket}</Text>
        ))}
      </View>

      {/* Gösterge */}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
        {c.seriler.map(s => (
          <View key={s.ad} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <View style={{ width: 8, height: 2, backgroundColor: s.renk }} />
            <Text style={{ fontSize: 7, color: '#64748b' }}>{s.ad}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

export function PdfYatayBar({ baslik, ogeler }: {
  baslik?: string
  ogeler: { etiket: string; deger: number; renk?: string }[]
}) {
  if (!ogeler.length) return null
  const c = yatayBar({ ogeler, genislik: CIZGI_G, satirYuksekligi: 16, etiketGenisligi: 110 })

  return (
    <View style={{ marginBottom: 14 }}>
      {baslik && <Text style={{ fontSize: 9, color: '#475569', marginBottom: 4 }}>{baslik}</Text>}
      {/* Barlar Svg ile, etiket ve sayı normal Text ile — hizalama için
          her satır ayrı bir flex satırı. */}
      {c.barlar.map((b, i) => (
        <View key={b.etiket + i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
          <Text style={{ fontSize: 7.5, color: '#475569', width: 110 }}>{b.etiket}</Text>
          <Svg width={CIZGI_G - 150} height={b.h}
               viewBox={`0 0 ${CIZGI_G - 150} ${b.h}`}>
            <Rect x={0} y={0} width={Math.max(b.w * (CIZGI_G - 150) / (CIZGI_G - 110 - 44), 0)}
                  height={b.h} fill={b.renk} rx={2} />
          </Svg>
          <Text style={{ fontSize: 7.5, color: '#64748b', width: 34, textAlign: 'right' }}>{b.deger}</Text>
        </View>
      ))}
    </View>
  )
}

export function PdfYiginBar({ baslik, dilimler }: { baslik?: string; dilimler: YiginDilimi[] }) {
  const c = yiginBar(dilimler, CIZGI_G, 12)
  if (!c.dilimler.length) return null

  return (
    <View style={{ marginBottom: 14 }}>
      {baslik && <Text style={{ fontSize: 9, color: '#475569', marginBottom: 4 }}>{baslik}</Text>}
      <Svg width={CIZGI_G} height={12} viewBox={`0 0 ${CIZGI_G} 12`}>
        {c.dilimler.map(d => (
          <Rect key={d.ad} x={d.x} y={0} width={d.w} height={12} fill={d.renk} />
        ))}
      </Svg>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
        {c.dilimler.map(d => (
          <View key={d.ad} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <View style={{ width: 6, height: 6, backgroundColor: d.renk }} />
            <Text style={{ fontSize: 7, color: '#64748b' }}>{d.ad} {d.deger} (%{d.yuzde})</Text>
          </View>
        ))}
      </View>
    </View>
  )
}
