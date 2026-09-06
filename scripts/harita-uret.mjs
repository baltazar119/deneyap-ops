/**
 * Türkiye il sınırlarını TS modülüne dönüştürür.
 *
 * TEK SEFERLİK, ÇEVRİMDIŞI bir işlem. Üretim kodu bu betiği çalıştırmaz;
 * çıktısı (`src/lib/harita/turkiyeIller.ts`) depoya girer.
 *
 * NEDEN TS MODÜLÜ, NEDEN public/ ALTINDA DOSYA DEĞİL:
 * Vercel'de runtime'da dosyadan okunan varlıklar `outputFileTracingIncludes`
 * listesine eklenmezse 500 veriyor. Bu proje bu tuzağa PDF fontlarında İKİ KEZ
 * düştü. Statik import edilen bir TS modülü webpack tarafından izlenir ve
 * sorun hiç doğmaz.
 *
 * KAYNAK: Natural Earth 10m Admin-1. KAMU MALI (public domain) — atıf bile
 * gerekmiyor. MIT etiketli Türkiye GeoJSON depolarının çoğu aslında OSM
 * türevidir ve gerçek lisansları ODbL'dir (paylaş-benzer yükümlülüğü);
 * depo etiketi bunu geçersiz kılmaz. Bu yüzden Natural Earth seçildi.
 *
 * Kullanım:
 *   node scripts/harita-uret.mjs <ne_10m_admin_1_states_provinces.geojson>
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const kok = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/* ── Ayarlar ─────────────────────────────────────────────────────────────── */
const VB_W = 1000          // viewBox genişliği
const VB_H = 430           // Türkiye'nin en/boy oranına yakın
const KENAR = 4
const TOLERANS = 0.012     // Douglas-Peucker, derece cinsinden

/**
 * Natural Earth adları bizim `ILLER` listemizle birebir tutmuyor.
 * Eksik kalan her il haritada SESSİZCE boş görünürdü; bu yüzden aşağıda
 * 81↔81 eşleşme zorunlu tutuluyor ve tutmazsa betik hata veriyor.
 */
const TAKMA_AD = {
  'Afyon': 'Afyonkarahisar',
  'Icel': 'Mersin',
  'İçel': 'Mersin',
  'Mersin (Icel)': 'Mersin',
  'K. Maras': 'Kahramanmaraş',
  'Kahramanmaras': 'Kahramanmaraş',
  'Kinkkale': 'Kırıkkale',
  'Zinguldak': 'Zonguldak',
}

function trFold(s) {
  return String(s)
    .replace(/[İIı]/g, 'i').replace(/[Ğğ]/g, 'g').replace(/[Üü]/g, 'u')
    .replace(/[Şş]/g, 's').replace(/[Öö]/g, 'o').replace(/[Çç]/g, 'c')
    .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ').trim()
}

/* ── Douglas-Peucker sadeleştirme ────────────────────────────────────────── */

function noktaCizgiUzakligi(p, a, b) {
  const [px, py] = p, [ax, ay] = a, [bx, by] = b
  const dx = bx - ax, dy = by - ay
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay)
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

function sadelestir(noktalar, tol) {
  if (noktalar.length <= 2) return noktalar
  let enUzak = 0, idx = 0
  for (let i = 1; i < noktalar.length - 1; i++) {
    const d = noktaCizgiUzakligi(noktalar[i], noktalar[0], noktalar[noktalar.length - 1])
    if (d > enUzak) { enUzak = d; idx = i }
  }
  if (enUzak <= tol) return [noktalar[0], noktalar[noktalar.length - 1]]
  return [
    ...sadelestir(noktalar.slice(0, idx + 1), tol).slice(0, -1),
    ...sadelestir(noktalar.slice(idx), tol),
  ]
}

/* ── Ana ─────────────────────────────────────────────────────────────────── */

const girdiYolu = process.argv[2]
if (!girdiYolu) {
  console.error('\nKullanim: node scripts/harita-uret.mjs <ne_10m_admin_1_states_provinces.geojson>\n')
  process.exit(1)
}

const geo = JSON.parse(readFileSync(girdiYolu, 'utf8'))
const tr = geo.features.filter(f => f.properties.iso_a2 === 'TR' || f.properties.adm0_a3 === 'TUR')
if (tr.length !== 81) {
  console.error(`Beklenen 81 il, bulunan ${tr.length}. Kaynak dosya degismis olabilir.`)
  process.exit(1)
}

// Bizim il listemiz — eşleşme doğrulaması için
const illerTs = readFileSync(resolve(kok, 'src/lib/iller.ts'), 'utf8')
// ILLER blogunu bul ve icindeki tirnakli adlari cikar. Bir satirda birden
// fazla ad oldugu icin satir bazli ayristirma calismaz.
const bas = illerTs.indexOf('export const ILLER = [')
const son = illerTs.indexOf('] as const', bas)
if (bas < 0 || son < 0) { console.error('iller.ts icinde ILLER blogu bulunamadi'); process.exit(1) }
const ILLER = [...illerTs.slice(bas, son).matchAll(/'([^']+)'/g)].map(m => m[1])
const illerKatli = new Map(ILLER.map(i => [trFold(i), i]))

function ilAdiCoz(props) {
  const adaylar = [props.name_tr, props.name, props.gn_name, props.woe_name].filter(Boolean)
  for (const ham of adaylar) {
    const takma = TAKMA_AD[ham]
    if (takma) return takma
    const bulundu = illerKatli.get(trFold(ham))
    if (bulundu) return bulundu
  }
  return null
}

/* Sınırları bul (projeksiyon için) */
let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
const halkalar = []

for (const f of tr) {
  const ad = ilAdiCoz(f.properties)
  if (!ad) {
    console.error(`ESLESMEYEN IL: ${JSON.stringify({ name: f.properties.name, name_tr: f.properties.name_tr })}`)
    process.exit(1)
  }

  const coords = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
  const parcalar = []
  for (const poly of coords) {
    // Yalnızca dış halka; iç halkalar (göller) ısı haritasında gereksiz
    const dis = sadelestir(poly[0], TOLERANS)
    if (dis.length < 4) continue
    parcalar.push(dis)
    for (const [x, y] of dis) {
      if (x < minX) minX = x; if (x > maxX) maxX = x
      if (y < minY) minY = y; if (y > maxY) maxY = y
    }
  }
  if (parcalar.length) halkalar.push({ ad, parcalar })
}

if (halkalar.length !== 81) {
  console.error(`Halka uretilen il sayisi ${halkalar.length}, 81 olmali.`)
  process.exit(1)
}

/* Ölçek: en/boy oranını KORUYARAK viewBox'a sığdır */
const olcek = Math.min((VB_W - 2 * KENAR) / (maxX - minX), (VB_H - 2 * KENAR) / (maxY - minY))
const kaydirX = (VB_W - (maxX - minX) * olcek) / 2
const kaydirY = (VB_H - (maxY - minY) * olcek) / 2

// Coğrafi y yukarı artar, SVG y aşağı artar → ters çevrilir
const px = x => Math.round((x - minX) * olcek + kaydirX)
const py = y => Math.round((maxY - y) * olcek + kaydirY)

const kayitlar = halkalar.map(({ ad, parcalar }) => {
  let d = ''
  let cx = 0, cy = 0, n = 0
  for (const halka of parcalar) {
    halka.forEach(([x, y], i) => {
      const X = px(x), Y = py(y)
      d += `${i === 0 ? 'M' : 'L'}${X} ${Y}`
      cx += X; cy += Y; n++
    })
    d += 'Z'
  }
  return { ad, d, merkez: [Math.round(cx / n), Math.round(cy / n)] }
})

kayitlar.sort((a, b) => a.ad.localeCompare(b.ad, 'tr'))

const cikti = `// OTOMATİK ÜRETİLDİ — scripts/harita-uret.mjs
//
// KAYNAK: Natural Earth 10m Admin-1 States/Provinces.
// LİSANS: KAMU MALI (public domain). Natural Earth açıkça "no permission
// needed" diyor; atıf zorunluluğu yoktur.
//
// NEDEN BU KAYNAK: MIT etiketli Türkiye GeoJSON depolarının çoğu aslında OSM
// türevidir ve gerçek lisansları ODbL'dir (paylaş-benzer yükümlülüğü doğurur).
// Deponun MIT etiketi bunu geçersiz kılmaz.
//
// NEDEN TS MODÜLÜ: Vercel'de runtime'da dosyadan okunan varlıklar
// outputFileTracingIncludes'a eklenmezse 500 veriyor (bu projede PDF
// fontlarında iki kez yaşandı). Statik import webpack tarafından izlenir.
//
// Bu dosyayı ELLE DÜZENLEMEYİN; betiği yeniden çalıştırın.

export interface IlSekli {
  /** İl adı — src/lib/iller.ts içindeki ILLER ile birebir aynı */
  ad: string
  /** SVG path verisi, viewBox="0 0 ${VB_W} ${VB_H}" içinde */
  d: string
  /** Etiket/tooltip için kaba ağırlık merkezi */
  merkez: [number, number]
}

export const HARITA_GENISLIK = ${VB_W}
export const HARITA_YUKSEKLIK = ${VB_H}

export const TURKIYE_ILLERI: IlSekli[] = ${JSON.stringify(kayitlar, null, 0)
  .replace(/\},\{/g, '},\n  {')
  .replace(/^\[/, '[\n  ')
  .replace(/\]$/, ',\n]')}
`

mkdirSync(resolve(kok, 'src/lib/harita'), { recursive: true })
const hedef = resolve(kok, 'src/lib/harita/turkiyeIller.ts')
writeFileSync(hedef, cikti)

const kb = (Buffer.byteLength(cikti) / 1024).toFixed(1)
console.log(`\nUretildi: src/lib/harita/turkiyeIller.ts`)
console.log(`  il sayisi : ${kayitlar.length}`)
console.log(`  boyut     : ${kb} KB`)
console.log(`  viewBox   : ${VB_W} x ${VB_H}`)
if (Number(kb) > 120) {
  console.log(`\n  UYARI: 120 KB esigi asildi. TOLERANS degerini artirip tekrar calistirin.`)
}
console.log('')
