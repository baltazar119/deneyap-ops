/**
 * Grafik ölçekleri — SAF fonksiyonlar, React yok, DOM yok.
 *
 * NEDEN KÜTÜPHANE YOK: aynı grafikler hem web'de hem PDF'te görünmek zorunda.
 * recharts @react-pdf'e render edilemez; iki ayrı uygulama yazmak web ile
 * PDF'in görsel olarak ayrışması demekti. Bunun yerine geometri burada bir
 * kez hesaplanır, iki ince renderer (web <svg> ve @react-pdf Svg) aynı
 * sayıları tüketir.
 */

export interface Olcek {
  (deger: number): number
  alan: [number, number]
  hedef: [number, number]
}

/** Doğrusal ölçek. Alan sıfır genişlikteyse hedefin ortasına düşer (NaN olmaz). */
export function dogrusalOlcek(alan: [number, number], hedef: [number, number]): Olcek {
  const [a0, a1] = alan
  const [h0, h1] = hedef
  const genislik = a1 - a0

  const f = ((deger: number) => {
    if (genislik === 0) return (h0 + h1) / 2
    const t = (deger - a0) / genislik
    return h0 + t * (h1 - h0)
  }) as Olcek

  f.alan = alan
  f.hedef = hedef
  return f
}

/**
 * "Güzel" tick değerleri: 1, 2, 5 ve 10'un katları.
 *
 * Ham max/N bölmesi 0, 3.33, 6.67 gibi okunmaz eksenler üretiyor. Bu
 * fonksiyon üst sınırı yukarı yuvarlar ve düzgün adımlar verir.
 */
export function guzelTickler(max: number, hedefAdet = 4, tamsayi = true): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0, 1]

  const hamAdim = max / hedefAdet
  const buyukluk = Math.pow(10, Math.floor(Math.log10(hamAdim)))
  const oran = hamAdim / buyukluk
  const carpan = oran <= 1 ? 1 : oran <= 2 ? 2 : oran <= 5 ? 5 : 10
  // Bu projedeki her metrik bir SAYIM (görev, gecikme, üye). Küçük
  // değerlerde adım 1'in altına düşerse eksende "0,5 görev" yazar —
  // teknik olarak doğru ama anlamsız. Tamsayı tabanı zorlanıyor.
  const adim = tamsayi ? Math.max(1, carpan * buyukluk) : carpan * buyukluk

  const ust = Math.ceil(max / adim) * adim
  const out: number[] = []
  // Kayan nokta birikimini önlemek için indeksten hesaplanır
  const adetTick = Math.round(ust / adim)
  for (let i = 0; i <= adetTick; i++) out.push(Number((i * adim).toFixed(10)))
  return out
}

/** Tick listesinin üst sınırı — y ekseni alanı bundan kurulur */
export function ustSinir(max: number, hedefAdet = 4, tamsayi = true): number {
  const t = guzelTickler(max, hedefAdet, tamsayi)
  return t[t.length - 1]
}

/**
 * Bant ölçeği (bar grafikleri): n öğeyi [0, genislik] arasına yerleştirir.
 * `bandGenisligi` bar kalınlığı, `merkez(i)` i'inci barın orta noktası.
 */
export function bantOlcek(adet: number, genislik: number, bosluk = 0.25) {
  if (adet <= 0) return { bandGenisligi: 0, merkez: () => 0, sol: () => 0 }
  const adim = genislik / adet
  const bandGenisligi = adim * (1 - bosluk)
  return {
    bandGenisligi,
    merkez: (i: number) => adim * i + adim / 2,
    sol: (i: number) => adim * i + (adim - bandGenisligi) / 2,
  }
}

/**
 * Eksen etiketlerini seyreltir — 90 noktalı seride her etiketi yazmak
 * okunmaz bir şerit üretir. En fazla `enFazla` etiket bırakır, ilk ve son
 * daima korunur.
 */
export function etiketSeyrelt<T>(ogeler: T[], enFazla = 8): { oge: T; i: number }[] {
  const n = ogeler.length
  if (n === 0) return []
  if (n <= enFazla) return ogeler.map((oge, i) => ({ oge, i }))

  const adim = Math.ceil(n / enFazla)
  const out: { oge: T; i: number }[] = []
  for (let i = 0; i < n; i += adim) out.push({ oge: ogeler[i], i })
  if (out[out.length - 1].i !== n - 1) out.push({ oge: ogeler[n - 1], i: n - 1 })
  return out
}
