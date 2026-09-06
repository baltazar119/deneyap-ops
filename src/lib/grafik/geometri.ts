import { dogrusalOlcek, guzelTickler, ustSinir, bantOlcek, etiketSeyrelt } from './olcek'

/**
 * Grafik geometrisi — SAF. Çıktısı hazır SVG `d` string'leri ve koordinatlar.
 *
 * Aynı çıktı iki renderer tarafından tüketilir:
 *   components/grafik/*        → web <svg>
 *   lib/rapor/pdf/grafikler.tsx → @react-pdf Svg
 * Böylece web ile PDF'te BİREBİR aynı grafik çıkar.
 */

export interface Kutu { ust: number; sag: number; alt: number; sol: number }
export const VARSAYILAN_KENAR: Kutu = { ust: 12, sag: 12, alt: 26, sol: 34 }

export interface Eksen {
  tickler: { deger: number; y: number; etiket: string }[]
  xEtiketleri: { etiket: string; x: number }[]
  /** Çizim alanı (kenar boşlukları düşülmüş) */
  ic: { x: number; y: number; genislik: number; yukseklik: number }
}

/* ── Çok çizgili zaman serisi ────────────────────────────────────────────── */

export interface CizgiSerisi {
  ad: string
  renk: string
  /** null = veri yok; o noktada çizgi KOPAR, sıfır olarak çizilmez */
  degerler: (number | null)[]
}

export interface CizgiParcasi {
  /** SVG path `d` — birden fazla parça varsa her biri ayrı obje */
  d: string
  /** Bu parça türetilmiş veriden mi geliyor (kesikli çizilir) */
  kesikli: boolean
}

export interface CizgiCizimi {
  eksen: Eksen
  seriler: {
    ad: string
    renk: string
    parcalar: CizgiParcasi[]
    noktalar: { x: number; y: number; deger: number; i: number }[]
  }[]
  genislik: number
  yukseklik: number
}

export interface CizgiGirdisi {
  etiketler: string[]
  seriler: CizgiSerisi[]
  /** Her noktanın türetilmiş olup olmadığı — kesikli çizim için */
  turetilmis?: boolean[]
  genislik?: number
  yukseklik?: number
  kenar?: Kutu
  enFazlaEtiket?: number
}

function say(n: number): number {
  // Kayan nokta artıklarını kısalt: "12.000000000000002" gibi d string'leri
  // hem PDF'i şişirir hem karşılaştırmayı zorlaştırır.
  return Number(n.toFixed(2))
}

export function cizgiSerisi(g: CizgiGirdisi): CizgiCizimi {
  const genislik = g.genislik ?? 560
  const yukseklik = g.yukseklik ?? 200
  const k = g.kenar ?? VARSAYILAN_KENAR

  const ic = {
    x: k.sol, y: k.ust,
    genislik: Math.max(1, genislik - k.sol - k.sag),
    yukseklik: Math.max(1, yukseklik - k.ust - k.alt),
  }

  const n = g.etiketler.length
  const tumDegerler = g.seriler.flatMap(s => s.degerler.filter((v): v is number => v !== null))
  const max = tumDegerler.length ? Math.max(...tumDegerler) : 0
  const yMax = ustSinir(max)

  const yOlcek = dogrusalOlcek([0, yMax], [ic.y + ic.yukseklik, ic.y])
  // Tek noktalı seride bölme yapılmaz; nokta ortaya konur.
  const xOlcek = (i: number) =>
    n <= 1 ? ic.x + ic.genislik / 2 : ic.x + (i / (n - 1)) * ic.genislik

  const eksen: Eksen = {
    ic,
    tickler: guzelTickler(max).map(d => ({ deger: d, y: say(yOlcek(d)), etiket: String(d) })),
    xEtiketleri: etiketSeyrelt(g.etiketler, g.enFazlaEtiket ?? 8)
      .map(({ oge, i }) => ({ etiket: oge, x: say(xOlcek(i)) })),
  }

  const seriler = g.seriler.map(s => {
    const noktalar: { x: number; y: number; deger: number; i: number }[] = []
    const parcalar: CizgiParcasi[] = []

    let aktif: { d: string; kesikli: boolean } | null = null

    s.degerler.forEach((v, i) => {
      if (v === null) { aktif = null; return }   // veri yok → çizgi KOPAR
      const x = say(xOlcek(i))
      const y = say(yOlcek(v))
      noktalar.push({ x, y, deger: v, i })

      const kesikli = g.turetilmis?.[i] ?? false
      if (!aktif || aktif.kesikli !== kesikli) {
        // Kesikli/düz geçişinde yeni parça başlar ama kopukluk olmasın diye
        // önceki noktadan devam edilir.
        const oncekiNokta = noktalar.length > 1 ? noktalar[noktalar.length - 2] : null
        const bas = aktif && oncekiNokta ? `M ${oncekiNokta.x} ${oncekiNokta.y} L ${x} ${y}` : `M ${x} ${y}`
        aktif = { d: bas, kesikli }
        parcalar.push(aktif)
      } else {
        aktif.d += ` L ${x} ${y}`
      }
    })

    return { ad: s.ad, renk: s.renk, parcalar, noktalar }
  })

  return { eksen, seriler, genislik, yukseklik }
}

/* ── Yatay bar (il/DENEYAP karşılaştırma) ────────────────────────────────── */

export interface YatayBarGirdisi {
  ogeler: { etiket: string; deger: number; renk?: string }[]
  genislik?: number
  satirYuksekligi?: number
  etiketGenisligi?: number
  varsayilanRenk?: string
}

export interface YatayBarCizimi {
  genislik: number
  yukseklik: number
  barlar: {
    etiket: string
    deger: number
    renk: string
    x: number; y: number; w: number; h: number
    /** Değer yazısının konumu — bar çok kısaysa barın SAĞINA taşar */
    yaziX: number
    yaziIcerde: boolean
  }[]
  etiketGenisligi: number
}

export function yatayBar(g: YatayBarGirdisi): YatayBarCizimi {
  const genislik = g.genislik ?? 560
  const satirH = g.satirYuksekligi ?? 26
  const etiketW = g.etiketGenisligi ?? 120
  const barAlani = Math.max(1, genislik - etiketW - 44)   // 44 = sağdaki sayı için
  const max = Math.max(1, ...g.ogeler.map(o => o.deger))

  const barlar = g.ogeler.map((o, i) => {
    const w = say((o.deger / max) * barAlani)
    const y = say(i * satirH + 4)
    const h = satirH - 10
    return {
      etiket: o.etiket,
      deger: o.deger,
      renk: o.renk ?? g.varsayilanRenk ?? '#2288c9',
      x: etiketW, y, w: Math.max(w, o.deger > 0 ? 2 : 0), h,
      yaziX: say(etiketW + Math.max(w, 2) + 6),
      yaziIcerde: false,
    }
  })

  return { genislik, yukseklik: Math.max(1, g.ogeler.length * satirH + 4), barlar, etiketGenisligi: etiketW }
}

/* ── Yığın bar (durum dağılımı) ──────────────────────────────────────────── */

export interface YiginDilimi { ad: string; deger: number; renk: string }

export interface YiginCizimi {
  genislik: number
  yukseklik: number
  dilimler: { ad: string; deger: number; renk: string; x: number; w: number; yuzde: number }[]
  toplam: number
}

export function yiginBar(dilimler: YiginDilimi[], genislik = 560, yukseklik = 18): YiginCizimi {
  const toplam = dilimler.reduce((s, d) => s + d.deger, 0)
  if (toplam <= 0) return { genislik, yukseklik, dilimler: [], toplam: 0 }

  let x = 0
  const out = dilimler
    .filter(d => d.deger > 0)
    .map(d => {
      const w = say((d.deger / toplam) * genislik)
      const p = { ...d, x: say(x), w, yuzde: Math.round((d.deger / toplam) * 100) }
      x += w
      return p
    })

  return { genislik, yukseklik, dilimler: out, toplam }
}

/* ── Sparkline (risk kartları, il satırları) ─────────────────────────────── */

export function sparkline(
  degerler: (number | null)[],
  genislik = 80,
  yukseklik = 22,
): { d: string; sonNokta: { x: number; y: number } | null } {
  const gecerli = degerler.filter((v): v is number => v !== null)
  if (gecerli.length === 0) return { d: '', sonNokta: null }

  const max = Math.max(...gecerli)
  const min = Math.min(...gecerli)
  const aralik = max - min || 1
  const n = degerler.length

  let d = ''
  let son: { x: number; y: number } | null = null
  let kopuk = true

  degerler.forEach((v, i) => {
    if (v === null) { kopuk = true; return }
    const x = say(n <= 1 ? genislik / 2 : (i / (n - 1)) * genislik)
    const y = say(yukseklik - ((v - min) / aralik) * yukseklik)
    d += `${kopuk ? 'M' : ' L'} ${x} ${y}`
    kopuk = false
    son = { x, y }
  })

  return { d: d.trim(), sonNokta: son }
}

export { bantOlcek, dogrusalOlcek, guzelTickler, etiketSeyrelt }
