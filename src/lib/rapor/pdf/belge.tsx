import 'server-only'
import React from 'react'
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer'
import path from 'path'
import { existsSync } from 'fs'
import { T, gecikmeRengi, oranRengi } from './tema'
import type { RaporVerisi, GorevSatiri, IlSatiri } from '../hesapla'

/**
 * Rol bazlı PDF rapor şablonu.
 *
 * Font kaydı ZORUNLU: @react-pdf'in gömülü Helvetica'sında Türkçe karakter
 * yok. Projedeki eski jsPDF raporu bu yüzden "Haftalik Proje Raporu" gibi
 * ASCII'ye indirgenmişti ve dinamik metinde ş/ğ/ı bozuluyordu.
 */

let fontKayitli = false

/** Fontları birkaç olası konumda arar — Vercel ve yerel çalışma dizinleri farklı */
function fontDizini(): string {
  const adaylar = [
    path.join(process.cwd(), 'src', 'lib', 'rapor', 'pdf', 'fontlar'),
    path.join(process.cwd(), '.next', 'server', 'src', 'lib', 'rapor', 'pdf', 'fontlar'),
    path.join(__dirname, 'fontlar'),
  ]
  for (const d of adaylar) {
    if (existsSync(path.join(d, 'Roboto-Regular.ttf'))) return d
  }
  // Sessizce Helvetica'ya düşmek YANLIŞ olur: PDF üretilir ama Türkçe
  // karakterler bozuk çıkar ve kimse fark etmez. Açıkça patlıyoruz.
  throw new Error(
    `PDF fontları bulunamadı. Aranan konumlar: ${adaylar.join(' , ')}. ` +
    'next.config.js içindeki outputFileTracingIncludes ayarını kontrol edin.',
  )
}

function fontlariKaydet() {
  if (fontKayitli) return
  const dizin = fontDizini()
  Font.register({
    family: 'Roboto',
    fonts: [
      { src: path.join(dizin, 'Roboto-Regular.ttf'), fontWeight: 'normal' },
      { src: path.join(dizin, 'Roboto-Bold.ttf'),    fontWeight: 'bold' },
    ],
  })
  // Türkçede otomatik heceleme kelimeleri yanlış bölüyor
  Font.registerHyphenationCallback(kelime => [kelime])
  fontKayitli = true
}

const s = StyleSheet.create({
  sayfa: { fontFamily: 'Roboto', fontSize: 9, color: T.metin, paddingTop: 0, paddingBottom: 44, paddingHorizontal: 0 },

  bant: { backgroundColor: T.koyu, paddingVertical: 18, paddingHorizontal: 34, marginBottom: 16 },
  bantUst: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  marka: { color: '#fff', fontSize: 15, fontWeight: 'bold', letterSpacing: -0.3 },
  markaAlt: { color: T.soluk, fontSize: 7.5, marginTop: 1 },
  rolRozet: { color: T.aksan, fontSize: 8, fontWeight: 'bold', borderWidth: 1, borderColor: T.aksan, borderRadius: 8, paddingVertical: 3, paddingHorizontal: 8 },
  baslik: { color: '#fff', fontSize: 19, fontWeight: 'bold', marginTop: 14, letterSpacing: -0.4 },
  altBaslik: { color: T.soluk, fontSize: 9, marginTop: 4 },

  govde: { paddingHorizontal: 34 },
  bolum: { marginBottom: 18 },
  bolumBaslik: { fontSize: 11, fontWeight: 'bold', color: T.koyu, marginBottom: 8 },
  bolumNot: { fontSize: 7.5, color: T.acikGri, marginBottom: 8 },

  kpiSatir: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  kpiKart: { flex: 1, borderWidth: 1, borderColor: T.cizgi, borderRadius: 6, padding: 9 },
  kpiDeger: { fontSize: 19, fontWeight: 'bold' },
  kpiEtiket: { fontSize: 7, color: T.gri, marginTop: 1 },

  barDis: { height: 9, backgroundColor: '#eef2f6', borderRadius: 5, marginTop: 6 },
  barIc: { height: 9, borderRadius: 5 },

  tabloBaslik: { flexDirection: 'row', backgroundColor: T.koyu, paddingVertical: 5, paddingHorizontal: 6, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  th: { color: '#fff', fontSize: 7.5, fontWeight: 'bold' },
  tr: { flexDirection: 'row', paddingVertical: 4.5, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: T.cizgi },
  td: { fontSize: 8 },
  rozet: { fontSize: 7, fontWeight: 'bold', paddingVertical: 1.5, paddingHorizontal: 4, borderRadius: 3, textAlign: 'center' },

  bosKutu: { borderWidth: 1, borderColor: T.cizgi, borderRadius: 6, padding: 14, alignItems: 'center' },
  bosMetin: { fontSize: 8.5, color: T.acikGri },

  altBilgi: { position: 'absolute', bottom: 18, left: 34, right: 34, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: T.cizgi, paddingTop: 6 },
  altMetin: { fontSize: 6.5, color: T.acikGri },
})

function trTarih(iso: string | null): string {
  if (!iso) return '—'
  const [y, a, g] = iso.split('-')
  return `${g}.${a}.${y}`
}

function KpiKart({ deger, etiket, renk }: { deger: number | string; etiket: string; renk?: string }) {
  return (
    <View style={s.kpiKart}>
      <Text style={[s.kpiDeger, { color: renk ?? T.koyu }]}>{deger}</Text>
      <Text style={s.kpiEtiket}>{etiket}</Text>
    </View>
  )
}

function Bos({ metin }: { metin: string }) {
  return <View style={s.bosKutu}><Text style={s.bosMetin}>{metin}</Text></View>
}

/* ── İl kırılımı tablosu ─────────────────────────────────────────────────── */
function IlTablosu({ satirlar }: { satirlar: IlSatiri[] }) {
  const g = [2.6, 1, 1, 1, 1, 1.6]
  return (
    <View>
      <View style={s.tabloBaslik} fixed>
        <Text style={[s.th, { flex: g[0] }]}>İl / Birim</Text>
        <Text style={[s.th, { flex: g[1], textAlign: 'right' }]}>Toplam</Text>
        <Text style={[s.th, { flex: g[2], textAlign: 'right' }]}>Biten</Text>
        <Text style={[s.th, { flex: g[3], textAlign: 'right' }]}>Devam</Text>
        <Text style={[s.th, { flex: g[4], textAlign: 'right' }]}>Geciken</Text>
        <Text style={[s.th, { flex: g[5], textAlign: 'right' }]}>Tamamlanma</Text>
      </View>
      {satirlar.map((r, i) => (
        <View key={r.il} style={[s.tr, { backgroundColor: i % 2 ? T.zebra : '#fff' }]} wrap={false}>
          <Text style={[s.td, { flex: g[0], fontWeight: 'bold' }]}>{r.il}</Text>
          <Text style={[s.td, { flex: g[1], textAlign: 'right' }]}>{r.toplam}</Text>
          <Text style={[s.td, { flex: g[2], textAlign: 'right', color: T.yesil }]}>{r.tamamlanan}</Text>
          <Text style={[s.td, { flex: g[3], textAlign: 'right' }]}>{r.devamEden}</Text>
          <View style={{ flex: g[4], alignItems: 'flex-end' }}>
            {r.geciken > 0
              ? <Text style={[s.rozet, { color: T.kirmizi, backgroundColor: T.kirmiziBg }]}>{r.geciken}</Text>
              : <Text style={[s.td, { color: T.acikGri }]}>0</Text>}
          </View>
          <View style={{ flex: g[5], alignItems: 'flex-end' }}>
            <Text style={[s.td, { color: oranRengi(r.oran), fontWeight: 'bold' }]}>%{r.oran}</Text>
          </View>
        </View>
      ))}
    </View>
  )
}

/* ── Görev tablosu (gecikmeler / yaklaşanlar) ────────────────────────────── */
function GorevTablosu({
  satirlar, kisiGoster, gecikmeSutunu,
}: { satirlar: GorevSatiri[]; kisiGoster: boolean; gecikmeSutunu: boolean }) {
  const g = kisiGoster ? [3.4, 1.3, 1.6, 1.2, 1.1] : [4.4, 1.5, 1.3, 1.2]
  return (
    <View>
      <View style={s.tabloBaslik} fixed>
        <Text style={[s.th, { flex: g[0] }]}>Görev</Text>
        <Text style={[s.th, { flex: g[1] }]}>İl</Text>
        {kisiGoster && <Text style={[s.th, { flex: g[2] }]}>Sorumlu</Text>}
        <Text style={[s.th, { flex: kisiGoster ? g[3] : g[2], textAlign: 'right' }]}>Termin</Text>
        <Text style={[s.th, { flex: kisiGoster ? g[4] : g[3], textAlign: 'right' }]}>
          {gecikmeSutunu ? 'Gecikme' : 'Kalan'}
        </Text>
      </View>
      {satirlar.map((r, i) => {
        const renk = r.gecikmeGunu ? gecikmeRengi(r.gecikmeGunu) : null
        return (
          <View key={i} style={[s.tr, { backgroundColor: i % 2 ? T.zebra : '#fff' }]} wrap={false}>
            <Text style={[s.td, { flex: g[0] }]}>{r.baslik}</Text>
            <Text style={[s.td, { flex: g[1], color: T.gri }]}>{r.il ?? '—'}</Text>
            {kisiGoster && <Text style={[s.td, { flex: g[2], color: T.gri }]}>{r.sorumlu ?? 'Atanmamış'}</Text>}
            <Text style={[s.td, { flex: kisiGoster ? g[3] : g[2], textAlign: 'right', color: T.gri }]}>
              {trTarih(r.termin)}
            </Text>
            <View style={{ flex: kisiGoster ? g[4] : g[3], alignItems: 'flex-end' }}>
              {renk
                ? <Text style={[s.rozet, { color: renk.metin, backgroundColor: renk.zemin }]}>{r.gecikmeGunu} gün</Text>
                : <Text style={[s.td, { color: T.acikGri }]}>{r.durum}</Text>}
            </View>
          </View>
        )
      })}
    </View>
  )
}

/* ── Belge ───────────────────────────────────────────────────────────────── */

const GECIKME_SINIRI = 40

export function RaporBelgesi({ v }: { v: RaporVerisi }) {
  fontlariKaydet()
  const b = (ad: string) => v.meta.bolumler.includes(ad)
  const kisi = v.sorumluKirilimi.length > 0 || v.hamListe.some(x => x.sorumlu)
  const gecikmeGoster = v.gecikmeler.slice(0, GECIKME_SINIRI)

  return (
    <Document
      title={`${v.meta.raporAdi} — ${v.meta.orgAd}`}
      author="DENEYAP OYS"
      language="tr"
    >
      <Page size="A4" style={s.sayfa}>

        {/* Kapak bandı */}
        <View style={s.bant}>
          <View style={s.bantUst}>
            <View>
              <Text style={s.marka}>DENEYAP OYS</Text>
              <Text style={s.markaAlt}>Operasyon Yönetim Sistemi</Text>
            </View>
            <Text style={s.rolRozet}>{v.meta.uretenRolAdi}</Text>
          </View>
          <Text style={s.baslik}>{v.meta.raporAdi}</Text>
          <Text style={s.altBaslik}>
            {v.meta.orgAd}   ·   {v.meta.donem.etiket}   ·   {v.meta.kapsamEtiketi}
          </Text>
        </View>

        <View style={s.govde}>

          {/* KPI */}
          <View style={s.bolum}>
            <View style={s.kpiSatir}>
              <KpiKart deger={v.kpi.toplam} etiket="Toplam görev" />
              <KpiKart deger={v.kpi.tamamlanan} etiket="Tamamlanan" renk={T.yesil} />
              <KpiKart deger={v.kpi.devamEden} etiket="Devam eden" renk={T.birincil} />
              <KpiKart deger={v.kpi.geciken} etiket="Geciken" renk={v.kpi.geciken ? T.kirmizi : T.gri} />
            </View>

            <Text style={{ fontSize: 8, color: T.gri }}>
              Tamamlanma oranı: <Text style={{ fontWeight: 'bold', color: oranRengi(v.kpi.tamamlanmaOrani) }}>
                %{v.kpi.tamamlanmaOrani}
              </Text>
              {v.kpi.geciken > 0 && `   ·   Ortalama gecikme: ${v.kpi.ortalamaGecikmeGunu} gün`}
              {v.kpi.atanmamis > 0 && `   ·   Atanmamış: ${v.kpi.atanmamis}`}
              {v.kpi.bloke > 0 && `   ·   Bloke: ${v.kpi.bloke}`}
            </Text>
            <View style={s.barDis}>
              <View style={[s.barIc, {
                width: `${Math.max(v.kpi.tamamlanmaOrani, 1)}%`,
                backgroundColor: oranRengi(v.kpi.tamamlanmaOrani),
              }]} />
            </View>
          </View>

          {/* İl kırılımı */}
          {b('il_kirilimi') && (
            <View style={s.bolum}>
              <Text style={s.bolumBaslik}>İl Kırılımı</Text>
              <Text style={s.bolumNot}>En çok geciken il başta listelenmiştir.</Text>
              {v.ilKirilimi.length ? <IlTablosu satirlar={v.ilKirilimi} /> : <Bos metin="Görev bulunamadı." />}
            </View>
          )}

          {/* Gecikmeler */}
          {b('gecikmeler') && (
            <View style={s.bolum} break={v.ilKirilimi.length > 12}>
              <Text style={[s.bolumBaslik, { color: v.gecikmeler.length ? T.kirmizi : T.koyu }]}>
                Termini Geçen Görevler ({v.gecikmeler.length})
              </Text>
              {v.gecikmeler.length ? (
                <>
                  <GorevTablosu satirlar={gecikmeGoster} kisiGoster={kisi} gecikmeSutunu />
                  {v.gecikmeler.length > GECIKME_SINIRI && (
                    <Text style={[s.bolumNot, { marginTop: 6 }]}>
                      …ve {v.gecikmeler.length - GECIKME_SINIRI} görev daha. Tam liste için Excel çıktısını kullanın.
                    </Text>
                  )}
                </>
              ) : <Bos metin="Termini geçen görev yok." />}
            </View>
          )}

          {/* Yaklaşan */}
          {b('yaklasan') && (
            <View style={s.bolum}>
              <Text style={s.bolumBaslik}>Önümüzdeki 7 Gün ({v.yaklasan.length})</Text>
              {v.yaklasan.length
                ? <GorevTablosu satirlar={v.yaklasan.slice(0, 30)} kisiGoster={kisi} gecikmeSutunu={false} />
                : <Bos metin="Önümüzdeki 7 günde termini dolan görev yok." />}
            </View>
          )}

          {/* Sorumlu yükü */}
          {b('sorumlu_kirilimi') && v.sorumluKirilimi.length > 0 && (
            <View style={s.bolum}>
              <Text style={s.bolumBaslik}>Sorumlu Yükü</Text>
              <View style={s.tabloBaslik} fixed>
                <Text style={[s.th, { flex: 3 }]}>Sorumlu</Text>
                <Text style={[s.th, { flex: 1.6 }]}>İl</Text>
                <Text style={[s.th, { flex: 1, textAlign: 'right' }]}>Açık</Text>
                <Text style={[s.th, { flex: 1, textAlign: 'right' }]}>Biten</Text>
                <Text style={[s.th, { flex: 1.2, textAlign: 'right' }]}>Geciken</Text>
              </View>
              {v.sorumluKirilimi.map((r, i) => (
                <View key={i} style={[s.tr, { backgroundColor: i % 2 ? T.zebra : '#fff' }]} wrap={false}>
                  <Text style={[s.td, { flex: 3 }]}>{r.ad}</Text>
                  <Text style={[s.td, { flex: 1.6, color: T.gri }]}>{r.il ?? '—'}</Text>
                  <Text style={[s.td, { flex: 1, textAlign: 'right' }]}>{r.acik}</Text>
                  <Text style={[s.td, { flex: 1, textAlign: 'right', color: T.yesil }]}>{r.tamamlanan}</Text>
                  <View style={{ flex: 1.2, alignItems: 'flex-end' }}>
                    {r.geciken > 0
                      ? <Text style={[s.rozet, { color: T.kirmizi, backgroundColor: T.kirmiziBg }]}>{r.geciken}</Text>
                      : <Text style={[s.td, { color: T.acikGri }]}>0</Text>}
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Tür kırılımı */}
          {b('tur_kirilimi') && v.turKirilimi.length > 0 && (
            <View style={s.bolum}>
              <Text style={s.bolumBaslik}>Kategori Dağılımı</Text>
              {v.turKirilimi.map(r => {
                const yuzde = v.kpi.toplam ? Math.round((r.toplam / v.kpi.toplam) * 100) : 0
                return (
                  <View key={r.tur} style={{ marginBottom: 5 }} wrap={false}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 8 }}>{r.etiket}</Text>
                      <Text style={{ fontSize: 8, color: T.gri }}>
                        {r.tamamlanan}/{r.toplam}
                      </Text>
                    </View>
                    <View style={[s.barDis, { height: 5, marginTop: 2 }]}>
                      <View style={[s.barIc, { height: 5, width: `${Math.max(yuzde, 1)}%`, backgroundColor: T.birincil }]} />
                    </View>
                  </View>
                )
              })}
            </View>
          )}

        </View>

        {/* Alt bilgi — her sayfada */}
        <View style={s.altBilgi} fixed>
          <Text style={s.altMetin}>
            DENEYAP OYS · {v.meta.orgAd} · {v.meta.uretenAd} ({v.meta.uretenRolAdi}) için {trTarih(v.meta.uretimTarihi)} tarihinde üretildi
          </Text>
          <Text style={s.altMetin} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
