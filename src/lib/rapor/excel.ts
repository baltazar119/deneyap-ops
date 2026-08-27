import 'server-only'
import { T } from './pdf/tema'
import type { RaporVerisi, GorevSatiri } from './hesapla'

/**
 * Çok sayfalı, biçimlendirilmiş .xlsx raporu.
 *
 * Kapsam PDF ile aynı `RaporVerisi`'nden gelir — iki formatın sayıları
 * ayrışamaz. Yetkili Yönetici'nin verisinde ham liste ve kişi adı zaten
 * boş geldiği için burada ayrıca filtre gerekmiyor.
 */

function argb(hex: string): string {
  return 'FF' + hex.replace('#', '').toUpperCase()
}

const GOREV_BASLIK = ['Görev', 'İl / Birim', 'Sorumlu', 'Durum', 'Öncelik', 'Kategori', 'Termin', 'Gecikme (gün)']

const DURUM_ZEMIN: Record<string, string> = {
  'Beklemede':  'FFF1F5F9',
  'Yapılıyor':  'FFE0F2FE',
  'Test':       'FFEDE9FE',
  'Bloke':      'FFFEF3C7',
  'Tamamlandı': 'FFD1FAE5',
}

export async function raporExcelUret(v: RaporVerisi): Promise<Uint8Array> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'DENEYAP OYS'
  wb.created = new Date()

  // ExcelJS'in tip tanımları Worksheet'i namespace altında dışa vermiyor;
  // sadece ihtiyaç duyduğumuz yüzeyi tanımlıyoruz.
  type Sayfa = ReturnType<typeof wb.addWorksheet>
  const basliklandir = (ws: Sayfa, sutunSayisi: number) => {
    const r = ws.getRow(1)
    r.height = 22
    r.eachCell((c: { font?: unknown; fill?: unknown; alignment?: unknown }) => {
      c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(T.koyu) } }
      c.alignment = { vertical: 'middle' }
    })
    ws.views = [{ state: 'frozen', ySplit: 1 }]
    ws.autoFilter = { from: 'A1', to: { row: 1, column: sutunSayisi } }
  }

  /* ── Özet ── */
  const ozet = wb.addWorksheet('Özet')
  ozet.getColumn(1).width = 34
  ozet.getColumn(2).width = 24
  ozet.addRow(['Alan', 'Değer'])
  basliklandir(ozet, 2)
  const ozetSatirlari: [string, string | number][] = [
    ['Rapor', v.meta.raporAdi],
    ['Çalışma alanı', v.meta.orgAd],
    ['Dönem', v.meta.donem.etiket],
    ['Kapsam', v.meta.kapsamEtiketi],
    ['Üreten', `${v.meta.uretenAd} (${v.meta.uretenRolAdi})`],
    ['Üretim tarihi', v.meta.uretimTarihi],
    ['', ''],
    ['Toplam görev', v.kpi.toplam],
    ['Tamamlanan', v.kpi.tamamlanan],
    ['Devam eden', v.kpi.devamEden],
    ['Beklemede', v.kpi.bekleyen],
    ['Bloke', v.kpi.bloke],
    ['Geciken', v.kpi.geciken],
    ['Atanmamış', v.kpi.atanmamis],
    ['Tamamlanma oranı (%)', v.kpi.tamamlanmaOrani],
    ['Ortalama gecikme (gün)', v.kpi.ortalamaGecikmeGunu],
  ]
  ozetSatirlari.forEach(([a, b]) => {
    const r = ozet.addRow([a, b])
    if (a === '') return
    r.getCell(1).font = { bold: true, color: { argb: argb(T.gri) }, size: 10 }
  })

  /* ── İl Özeti ── */
  if (v.ilKirilimi.length) {
    const ws = wb.addWorksheet('İl Özeti')
    ws.columns = [
      { header: 'İl / Birim', width: 22 }, { header: 'Toplam', width: 10 },
      { header: 'Tamamlanan', width: 13 }, { header: 'Devam Eden', width: 13 },
      { header: 'Geciken', width: 10 }, { header: 'Tamamlanma %', width: 15 },
    ]
    basliklandir(ws, 6)
    v.ilKirilimi.forEach(r => {
      const satir = ws.addRow([r.il, r.toplam, r.tamamlanan, r.devamEden, r.geciken, r.oran / 100])
      satir.getCell(6).numFmt = '0%'
      if (r.geciken > 0) {
        satir.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(T.kirmiziBg) } }
        satir.getCell(5).font = { color: { argb: argb(T.kirmizi) }, bold: true }
      }
    })
    // Oran sütununa veri çubuğu — göz taraması kolaylaşsın
    ws.addConditionalFormatting({
      ref: `F2:F${v.ilKirilimi.length + 1}`,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rules: [{ type: 'dataBar', priority: 1, minLength: 0, maxLength: 100, cfvo: [{ type: 'min' }, { type: 'max' }] } as any],
    })
  }

  /* ── Görev sayfaları ── */
  const gorevSayfasi = (ad: string, satirlar: GorevSatiri[]) => {
    if (!satirlar.length) return
    const ws = wb.addWorksheet(ad)
    ws.columns = [
      { header: GOREV_BASLIK[0], width: 46 }, { header: GOREV_BASLIK[1], width: 18 },
      { header: GOREV_BASLIK[2], width: 24 }, { header: GOREV_BASLIK[3], width: 14 },
      { header: GOREV_BASLIK[4], width: 12 }, { header: GOREV_BASLIK[5], width: 18 },
      { header: GOREV_BASLIK[6], width: 13 }, { header: GOREV_BASLIK[7], width: 14 },
    ]
    basliklandir(ws, 8)
    satirlar.forEach(r => {
      const satir = ws.addRow([
        r.baslik, r.il ?? '', r.sorumlu ?? '', r.durum, r.oncelik, r.tur,
        // Gerçek tarih olarak yaz — Excel'de sıralanabilsin (metin değil)
        r.termin ? new Date(r.termin + 'T00:00:00') : null,
        r.gecikmeGunu ?? null,
      ])
      satir.getCell(1).alignment = { wrapText: true, vertical: 'top' }
      satir.getCell(7).numFmt = 'dd.mm.yyyy'
      const zemin = DURUM_ZEMIN[r.durum]
      if (zemin) satir.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: zemin } }
      if (r.gecikmeGunu) {
        satir.getCell(8).font = { color: { argb: argb(T.kirmizi) }, bold: true }
      }
    })
  }

  gorevSayfasi('Gecikmeler', v.gecikmeler)
  gorevSayfasi('Yaklaşan Terminler', v.yaklasan)
  gorevSayfasi('Görevler', v.hamListe)

  /* ── Sorumlu Yükü ── */
  if (v.sorumluKirilimi.length) {
    const ws = wb.addWorksheet('Sorumlu Yükü')
    ws.columns = [
      { header: 'Sorumlu', width: 28 }, { header: 'İl', width: 18 },
      { header: 'Açık Görev', width: 13 }, { header: 'Tamamlanan', width: 13 },
      { header: 'Geciken', width: 11 },
    ]
    basliklandir(ws, 5)
    v.sorumluKirilimi.forEach(r => {
      const satir = ws.addRow([r.ad, r.il ?? '', r.acik, r.tamamlanan, r.geciken])
      if (r.geciken > 0) {
        satir.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(T.kirmiziBg) } }
        satir.getCell(5).font = { color: { argb: argb(T.kirmizi) }, bold: true }
      }
    })
  }

  const buf = await wb.xlsx.writeBuffer()
  return new Uint8Array(buf as ArrayBuffer)
}
