/**
 * DENEYAP OYS tanıtım dokümanını PDF olarak üretir.
 *
 *   node scripts/tanitim-pdf/uret.mjs [cikti.pdf]
 *
 * Türkçe karakterler için Roboto gömülür (raporlarda kullanılan fontların
 * aynısı). JSX kullanılmadığı için bileşenler createElement ile kuruluyor.
 */
import { createElement as h } from 'react'
import { Document, Page, Text, View, Image, StyleSheet, Font, renderToFile } from '@react-pdf/renderer'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, readFileSync } from 'node:fs'

import { KAPAK, BOLUM_1, BOLUM_2 } from './icerik.mjs'

const KOK = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const cikti = resolve(process.argv[2] ?? `${KOK}/DENEYAP-OYS-Dokuman.pdf`)

/* ── Font ───────────────────────────────────────────────────────────────
   Sessizce Helvetica'ya düşmek Türkçe karakterleri bozar ve bu fark
   edilmez; font yoksa hata veriyoruz.                                    */
const FONT_DIZIN = `${KOK}/src/lib/rapor/pdf/fontlar`
for (const d of ['Roboto-Regular.ttf', 'Roboto-Bold.ttf']) {
  if (!existsSync(`${FONT_DIZIN}/${d}`)) throw new Error(`Font bulunamadı: ${FONT_DIZIN}/${d}`)
}
Font.register({
  family: 'Roboto',
  fonts: [
    { src: `${FONT_DIZIN}/Roboto-Regular.ttf`, fontWeight: 400 },
    { src: `${FONT_DIZIN}/Roboto-Bold.ttf`, fontWeight: 700 },
  ],
})
// Türkçe kelimeler varsayılan tireleme ile bölünmesin
Font.registerHyphenationCallback(k => [k])

const R = {
  lacivert: '#0d1a2a',
  mavi: '#2288c9',
  acikMavi: '#f0fbff',
  kenarMavi: '#bee5f0',
  metin: '#374151',
  soluk: '#64748b',
  cizgi: '#e2e8f0',
  zebra: '#f8fafc',
}

const s = StyleSheet.create({
  sayfa: { paddingTop: 52, paddingBottom: 56, paddingHorizontal: 52, fontFamily: 'Roboto', fontSize: 10, color: R.metin, lineHeight: 1.6 },

  /* kapak */
  kapak: { flexDirection: 'column', justifyContent: 'center', height: '100%' },
  kapakSerit: { width: 54, height: 4, backgroundColor: R.mavi, marginBottom: 22 },
  kapakBaslik: { fontSize: 40, fontWeight: 700, color: R.lacivert, letterSpacing: -1 },
  kapakAlt: { fontSize: 17, color: R.mavi, fontWeight: 700, marginTop: 4, marginBottom: 18 },
  kapakAciklama: { fontSize: 11.5, color: R.metin, lineHeight: 1.7, maxWidth: 380 },
  kapakEtiket: { fontSize: 9, color: R.soluk, marginTop: 3 },
  kapakAyrac: { height: 1, backgroundColor: R.cizgi, marginVertical: 26, maxWidth: 380 },

  /* bölüm kapağı */
  bolumNo: { fontSize: 10, color: R.mavi, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' },
  bolumBaslik: { fontSize: 27, fontWeight: 700, color: R.lacivert, marginTop: 6, marginBottom: 12, letterSpacing: -0.5 },
  bolumOzet: { fontSize: 11, color: R.soluk, lineHeight: 1.7, maxWidth: 400 },

  /* başlıklar */
  h2: { fontSize: 14.5, fontWeight: 700, color: R.lacivert, marginTop: 20, marginBottom: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: R.cizgi },
  h3: { fontSize: 11, fontWeight: 700, color: R.lacivert, marginTop: 12, marginBottom: 5 },

  p: { marginBottom: 8, textAlign: 'justify' },

  /* liste */
  satir: { flexDirection: 'row', marginBottom: 4 },
  im: { width: 15, color: R.mavi, fontWeight: 700 },
  imMetin: { flex: 1 },

  /* tablo */
  tablo: { marginBottom: 10, marginTop: 2 },
  tBas: { flexDirection: 'row', backgroundColor: R.lacivert },
  tBasH: { color: '#fff', fontWeight: 700, fontSize: 9, padding: 6 },
  tSatir: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: R.cizgi },
  tH: { fontSize: 9, padding: 6, lineHeight: 1.5 },

  /* kutu */
  kutu: { backgroundColor: R.acikMavi, borderWidth: 1, borderColor: R.kenarMavi, borderRadius: 6, padding: 11, marginBottom: 10, marginTop: 2 },
  kutuBaslik: { fontSize: 9, fontWeight: 700, color: R.mavi, marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.6 },
  kutuMetin: { fontSize: 9.5, color: R.lacivert, lineHeight: 1.65 },

  /* alt/üst bilgi */
  ustBilgi: { position: 'absolute', top: 24, left: 52, right: 52, flexDirection: 'row', justifyContent: 'space-between', fontSize: 8, color: '#a8b4c4' },
  altBilgi: { position: 'absolute', bottom: 26, left: 52, right: 52, flexDirection: 'row', justifyContent: 'space-between', fontSize: 8, color: '#a8b4c4', borderTopWidth: 1, borderTopColor: R.cizgi, paddingTop: 6 },
})

/* ── blok çizimi ────────────────────────────────────────────────────── */

function tablo(b, k) {
  // ilk sütun biraz dar, kalan alan eşit paylaşılır
  const n = b.basliklar.length
  const genislik = n === 2 ? ['34%', '66%'] : n === 3 ? ['26%', '30%', '44%'] : Array(n).fill(`${100 / n}%`)

  return h(View, { key: k, style: s.tablo, wrap: false },
    h(View, { style: s.tBas },
      b.basliklar.map((x, i) => h(Text, { key: i, style: [s.tBasH, { width: genislik[i] }] }, x))),
    b.satirlar.map((satir, i) =>
      h(View, { key: i, style: [s.tSatir, i % 2 ? { backgroundColor: R.zebra } : {}] },
        satir.map((hucre, j) =>
          h(Text, { key: j, style: [s.tH, { width: genislik[j] }, j === 0 ? { fontWeight: 700, color: R.lacivert } : {}] }, hucre)))))
}

function blok(b, k) {
  switch (b.tip) {
    case 'h3':
      return h(Text, { key: k, style: s.h3 }, b.metin)
    case 'p':
      return h(Text, { key: k, style: s.p }, b.metin)
    case 'liste':
      return h(View, { key: k, style: { marginBottom: 8 } },
        b.maddeler.map((m, i) =>
          h(View, { key: i, style: s.satir },
            h(Text, { style: s.im }, b.sirali ? `${i + 1}.` : '•'),
            h(Text, { style: s.imMetin }, m))))
    case 'tablo':
      return tablo(b, k)
    case 'kutu':
      return h(View, { key: k, style: s.kutu, wrap: false },
        b.baslik ? h(Text, { style: s.kutuBaslik }, b.baslik) : null,
        h(Text, { style: s.kutuMetin }, b.metin))
    default:
      return null
  }
}

const ustBilgi = () => h(View, { style: s.ustBilgi, fixed: true },
  h(Text, null, 'DENEYAP OYS — Operasyon Yönetim Sistemi'),
  h(Text, null, KAPAK.tarih))

const altBilgi = () => h(View, { style: s.altBilgi, fixed: true },
  h(Text, null, 'Proje Tanıtım ve Teknik Dokümanı'),
  h(Text, { render: ({ pageNumber }) => `${pageNumber}` }))

function bolumSayfalari(bolum) {
  return [
    // bölüm ayraç sayfası
    h(Page, { key: `${bolum.numara}-kapak`, size: 'A4', style: s.sayfa },
      h(View, { style: { justifyContent: 'center', height: '100%' } },
        h(View, { style: s.kapakSerit }),
        h(Text, { style: s.bolumNo }, bolum.numara),
        h(Text, { style: s.bolumBaslik }, bolum.baslik),
        h(Text, { style: s.bolumOzet }, bolum.ozet),
        h(View, { style: { marginTop: 26 } },
          bolum.altBolumler.map((ab, i) =>
            h(View, { key: i, style: s.satir },
              h(Text, { style: [s.im, { width: 22 }] }, `${i + 1}.`),
              h(Text, { style: [s.imMetin, { color: R.lacivert }] }, ab.baslik)))))),

    // içerik
    h(Page, { key: `${bolum.numara}-icerik`, size: 'A4', style: s.sayfa },
      ustBilgi(), altBilgi(),
      bolum.altBolumler.map((ab, i) =>
        h(View, { key: i },
          h(Text, { style: s.h2 }, `${i + 1}. ${ab.baslik}`),
          ab.bloklar.map((b, j) => blok(b, j))))),
  ]
}

/* Mutlak Windows yolu URL sanılıp getirilmeye çalışıldığı için buffer veriyoruz */
const logoYolu = `${KOK}/public/logo.png`
const logo = existsSync(logoYolu) ? { data: readFileSync(logoYolu), format: 'png' } : null

const belge = h(Document, {
  title: 'DENEYAP OYS — Proje Tanıtım ve Teknik Dokümanı',
  author: 'DENEYAP OYS',
  language: 'tr',
},
  /* Kapak */
  h(Page, { size: 'A4', style: s.sayfa },
    h(View, { style: s.kapak },
      logo ? h(Image, { src: logo, style: { width: 46, height: 46, marginBottom: 24 } }) : null,
      h(View, { style: s.kapakSerit }),
      h(Text, { style: s.kapakBaslik }, KAPAK.baslik),
      h(Text, { style: s.kapakAlt }, KAPAK.altBaslik),
      h(Text, { style: s.kapakAciklama }, KAPAK.aciklama),
      h(View, { style: s.kapakAyrac }),
      KAPAK.etiketler.map((e, i) => h(Text, { key: i, style: s.kapakEtiket }, e)),
      h(Text, { style: [s.kapakEtiket, { marginTop: 10, color: R.mavi, fontWeight: 700 }] }, KAPAK.tarih))),

  ...bolumSayfalari(BOLUM_1),
  ...bolumSayfalari(BOLUM_2),
)

await renderToFile(belge, cikti)
console.log(`\nPDF üretildi: ${cikti}\n`)
