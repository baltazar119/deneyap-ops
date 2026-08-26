import 'server-only'
import Papa from 'papaparse'
import { csvCoz, ayiriciTahmin } from './decode'

/**
 * .xlsx ve .csv dosyalarını ortak bir tablo yapısına çevirir.
 *
 * Sunucuda çalışır — exceljs ~1 MB, istemci paketine girmemeli. Ayrıca
 * doğrulamanın otoriter yeri sunucu olmalı: istemcide ayrıştırıp sunucuya
 * "temiz" JSON göndermek, sunucunun kullanıcının uydurduğu satırlara
 * güvenmesi demek olurdu.
 */

export const LIMITLER = {
  dosyaBoyutu: 10 * 1024 * 1024,   // 10 MB
  satir: 20_000,
  sutun: 60,
  sayfa: 20,                       // zip-bomb koruması
  hucreUzunluk: 5_000,
} as const

export interface TabloSonuc {
  basliklar: string[]
  /** Her satır: { başlık → hücre değeri }. Excel tarih hücreleri Date kalır. */
  satirlar: Record<string, unknown>[]
  /** Excel'deki gerçek satır numaraları (hata mesajlarında kullanılır) */
  satirNolari: number[]
  sayfalar: string[]
  secilenSayfa: string
  /** Kullanıcıya önizlemede gösterilecek varsayımlar */
  varsayimlar: string[]
}

export class TabloHatasi extends Error {}

function baslikTemizle(basliklar: unknown[]): string[] {
  const gorulen = new Map<string, number>()
  return basliklar.map((h, i) => {
    let ad = String(h ?? '').trim()
    if (!ad) ad = `Sütun ${i + 1}`
    // Aynı başlık iki kez geçerse ayrıştır — yoksa ikincisi birinciyi ezer
    const n = gorulen.get(ad) ?? 0
    gorulen.set(ad, n + 1)
    return n === 0 ? ad : `${ad} (${n + 1})`
  })
}

function hucreKirp(v: unknown): unknown {
  if (typeof v === 'string' && v.length > LIMITLER.hucreUzunluk) {
    return v.slice(0, LIMITLER.hucreUzunluk)
  }
  return v
}

/* ── CSV ───────────────────────────────────────────────────────────────── */

function csvOku(buf: Uint8Array, baslikSatiri: number): TabloSonuc {
  const { metin, not } = csvCoz(buf)
  const ayirici = ayiriciTahmin(metin)

  const sonuc = Papa.parse<string[]>(metin, {
    delimiter: ayirici,
    skipEmptyLines: 'greedy',
  })

  const tumSatirlar = sonuc.data as unknown as string[][]
  if (!tumSatirlar.length) throw new TabloHatasi('Dosya boş görünüyor.')

  const bIdx = Math.max(0, baslikSatiri - 1)
  if (bIdx >= tumSatirlar.length) {
    throw new TabloHatasi(`Başlık satırı ${baslikSatiri} bulunamadı — dosyada ${tumSatirlar.length} satır var.`)
  }

  const basliklar = baslikTemizle(tumSatirlar[bIdx]).slice(0, LIMITLER.sutun)
  const veri = tumSatirlar.slice(bIdx + 1)
  if (veri.length > LIMITLER.satir) {
    throw new TabloHatasi(
      `Dosyada ${veri.length} satır var; üst sınır ${LIMITLER.satir}. Dosyayı bölerek yükleyin.`,
    )
  }

  const satirlar: Record<string, unknown>[] = []
  const satirNolari: number[] = []
  veri.forEach((hucreler, i) => {
    if (hucreler.every(h => String(h ?? '').trim() === '')) return
    const obj: Record<string, unknown> = {}
    basliklar.forEach((b, j) => { obj[b] = hucreKirp(hucreler[j] ?? '') })
    satirlar.push(obj)
    satirNolari.push(bIdx + 2 + i)
  })

  const ayiriciAdi = ayirici === '\t' ? 'sekme' : `"${ayirici}"`
  return {
    basliklar,
    satirlar,
    satirNolari,
    sayfalar: ['CSV'],
    secilenSayfa: 'CSV',
    varsayimlar: [not, `Sütun ayırıcı ${ayiriciAdi} olarak algılandı.`],
  }
}

/* ── XLSX ──────────────────────────────────────────────────────────────── */

async function xlsxOku(
  buf: Uint8Array,
  sayfaAdi: string | undefined,
  baslikSatiri: number,
): Promise<TabloSonuc> {
  // Dinamik import: exceljs yalnızca gerçekten .xlsx geldiğinde yüklensin
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()

  try {
    await wb.xlsx.load(Buffer.from(buf) as unknown as ArrayBuffer)
  } catch {
    throw new TabloHatasi('Excel dosyası okunamadı. Dosya bozuk olabilir veya .xlsx değil.')
  }

  const sayfalar = wb.worksheets.map(w => w.name)
  if (!sayfalar.length) throw new TabloHatasi('Çalışma kitabında sayfa yok.')
  if (sayfalar.length > LIMITLER.sayfa) {
    throw new TabloHatasi(`Çalışma kitabında ${sayfalar.length} sayfa var; üst sınır ${LIMITLER.sayfa}.`)
  }

  const ws = sayfaAdi ? wb.getWorksheet(sayfaAdi) : wb.worksheets[0]
  if (!ws) throw new TabloHatasi(`"${sayfaAdi}" sayfası bulunamadı.`)

  const baslikRow = ws.getRow(baslikSatiri)
  const hamBasliklar: unknown[] = []
  baslikRow.eachCell({ includeEmpty: true }, (cell, col) => {
    if (col <= LIMITLER.sutun) hamBasliklar[col - 1] = hucreDegeri(cell.value)
  })
  const basliklar = baslikTemizle(hamBasliklar)
  if (!basliklar.length) throw new TabloHatasi(`${baslikSatiri}. satırda başlık bulunamadı.`)

  const satirlar: Record<string, unknown>[] = []
  const satirNolari: number[] = []

  const sonSatir = ws.actualRowCount ?? ws.rowCount
  if (sonSatir - baslikSatiri > LIMITLER.satir) {
    throw new TabloHatasi(
      `Sayfada ${sonSatir - baslikSatiri} veri satırı var; üst sınır ${LIMITLER.satir}. Dosyayı bölerek yükleyin.`,
    )
  }

  ws.eachRow({ includeEmpty: false }, (row, satirNo) => {
    if (satirNo <= baslikSatiri) return
    const obj: Record<string, unknown> = {}
    let doluMu = false
    basliklar.forEach((b, j) => {
      const v = hucreDegeri(row.getCell(j + 1).value)
      if (v !== null && v !== undefined && String(v).trim() !== '') doluMu = true
      obj[b] = hucreKirp(v)
    })
    if (!doluMu) return
    satirlar.push(obj)
    satirNolari.push(satirNo)
  })

  return {
    basliklar,
    satirlar,
    satirNolari,
    sayfalar,
    secilenSayfa: ws.name,
    varsayimlar: [
      sayfalar.length > 1
        ? `"${ws.name}" sayfası okundu (dosyada ${sayfalar.length} sayfa var).`
        : `"${ws.name}" sayfası okundu.`,
    ],
  }
}

/** ExcelJS hücre değerini sade bir değere indirger */
function hucreDegeri(v: unknown): unknown {
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return v
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    // Formül hücresi: hesaplanmış sonucu al, formülün kendisini değil
    if ('result' in o) return hucreDegeri(o.result)
    // Zengin metin
    if ('richText' in o && Array.isArray(o.richText)) {
      return (o.richText as { text: string }[]).map(r => r.text).join('')
    }
    if ('text' in o) return o.text
    if ('hyperlink' in o) return o.text ?? o.hyperlink
    return ''
  }
  return v
}

/* ── Giriş noktası ─────────────────────────────────────────────────────── */

export async function tabloOku(
  dosyaAdi: string,
  buf: Uint8Array,
  opts: { sayfa?: string; baslikSatiri?: number } = {},
): Promise<TabloSonuc> {
  if (buf.byteLength > LIMITLER.dosyaBoyutu) {
    throw new TabloHatasi(
      `Dosya ${Math.round(buf.byteLength / 1024 / 1024)} MB; üst sınır ${LIMITLER.dosyaBoyutu / 1024 / 1024} MB.`,
    )
  }

  const baslikSatiri = opts.baslikSatiri ?? 1
  const ad = dosyaAdi.toLowerCase()

  if (ad.endsWith('.csv')) return csvOku(buf, baslikSatiri)
  if (ad.endsWith('.xlsx')) return xlsxOku(buf, opts.sayfa, baslikSatiri)

  // .xls (eski BIFF biçimi) ve .xlsm (makrolu) bilinçli olarak reddediliyor:
  // ayrı bir ayrıştırıcı ve ek saldırı yüzeyi getiriyorlar.
  if (ad.endsWith('.xls') || ad.endsWith('.xlsm')) {
    throw new TabloHatasi(
      'Bu biçim desteklenmiyor. Excel\'de "Farklı Kaydet → Excel Çalışma Kitabı (.xlsx)" ile kaydedip tekrar deneyin.',
    )
  }
  throw new TabloHatasi('Yalnızca .xlsx ve .csv dosyaları yüklenebilir.')
}
