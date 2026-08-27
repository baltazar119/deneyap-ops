import 'server-only'
import { IL_SECENEKLERI } from '@/lib/iller'
import { TASK_TYPES } from '@/lib/taskTypes'

/**
 * Kullanıcının doldurup yükleyeceği örnek .xlsx şablonu üretir.
 *
 * Neden statik bir public/sablon.xlsx değil de org başına üretim?
 *  1. İl listesi, kategoriler ve durumlar KODDAN okunur — şablon asla
 *     uygulamadan ayrışamaz. (Kategori listesinin 8 dosyada tekrar edip
 *     ayrışması bu projede zaten bir kez yaşandı.)
 *  2. "Sorumlu" sütununun açılır listesi org'un GERÇEK üye e-postalarıyla
 *     dolar. Kullanıcı isim yazmak yerine seçer, eşleşme oranı ~%100 olur —
 *     şablonu asıl değerli kılan şey bu.
 */

export interface SablonUyesi {
  adSoyad: string | null
  email: string | null
}

export interface SablonSecenekleri {
  orgAd: string
  anaRenk?: string
  uyeler: SablonUyesi[]
}

const DURUMLAR   = ['Beklemede', 'Yapılıyor', 'Test', 'Bloke', 'Tamamlandı']
const ONCELIKLER = ['Kritik', 'Yüksek', 'Normal', 'Düşük']

/** #2288c9 → FF2288C9 (ExcelJS ARGB) */
function argb(hex: string | undefined, yedek = 'FF0D1A2A'): string {
  if (!hex) return yedek
  const h = hex.replace('#', '').trim()
  return h.length === 6 ? `FF${h.toUpperCase()}` : yedek
}

export async function sablonUret(opts: SablonSecenekleri): Promise<Uint8Array> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'DENEYAP OYS'

  const sutunlar = [
    { baslik: 'Görev Başlığı*',       genislik: 42 },
    { baslik: 'Açıklama',             genislik: 46 },
    { baslik: 'İl / Birim',           genislik: 18 },
    { baslik: 'Sorumlu (E-posta)',    genislik: 30 },
    { baslik: 'Durum',                genislik: 14 },
    { baslik: 'Öncelik',              genislik: 12 },
    { baslik: 'Kategori',             genislik: 20 },
    { baslik: 'Başlangıç Tarihi',     genislik: 16 },
    { baslik: 'Termin Tarihi',        genislik: 16 },
    { baslik: 'Tahmini Süre (saat)',  genislik: 18 },
    { baslik: 'Kod / Referans',       genislik: 16 },
  ]

  const epostalar = opts.uyeler
    .map(u => u.email)
    .filter((e): e is string => !!e)
    .sort()

  const aralik = (kolon: string, adet: number) =>
    adet > 0 ? [`Listeler!$${kolon}$2:$${kolon}$${adet + 1}`] : undefined

  /* ── Görevler sayfası ────────────────────────────────────────────────── */
  const ws = wb.addWorksheet('Görevler', {
    views: [{ state: 'frozen', ySplit: 1 }],
  })

  ws.columns = sutunlar.map(s => ({ header: s.baslik, width: s.genislik }))

  const baslikSatiri = ws.getRow(1)
  baslikSatiri.height = 26
  baslikSatiri.eachCell(c => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(opts.anaRenk) } }
    c.alignment = { vertical: 'middle', horizontal: 'left' }
  })
  ws.autoFilter = { from: 'A1', to: { row: 1, column: sutunlar.length } }

  const SON = 500
  const dv = (kolon: string, formul: string[] | undefined, baslik: string, mesaj: string) => {
    if (!formul) return
    for (let r = 2; r <= SON; r++) {
      ws.getCell(`${kolon}${r}`).dataValidation = {
        type: 'list', allowBlank: true, formulae: formul,
        showErrorMessage: true, errorStyle: 'warning',
        errorTitle: baslik, error: mesaj,
      }
    }
  }

  dv('C', aralik('A', IL_SECENEKLERI.length), 'Geçersiz il',
     'Listeden bir il seçin. Yine de yazabilirsiniz; yükleme sırasında eşleştirmeye çalışılır.')
  dv('D', aralik('E', epostalar.length), 'Geçersiz sorumlu',
     'Ekipteki bir e-posta seçin. Ekipte olmayan biri yazarsanız görev atanmamış olarak eklenir.')
  dv('E', aralik('B', DURUMLAR.length), 'Geçersiz durum',
     'Beklemede / Yapılıyor / Test / Bloke / Tamamlandı. "Gecikti" bir durum değildir — termin tarihinden hesaplanır.')
  dv('F', aralik('C', ONCELIKLER.length), 'Geçersiz öncelik', 'Kritik / Yüksek / Normal / Düşük.')
  dv('G', aralik('D', TASK_TYPES.length), 'Geçersiz kategori', 'Listeden bir kategori seçin.')

  for (let r = 2; r <= SON; r++) {
    ws.getCell(`H${r}`).numFmt = 'dd.mm.yyyy'
    ws.getCell(`I${r}`).numFmt = 'dd.mm.yyyy'
    ws.getCell(`J${r}`).numFmt = '0.0'
  }

  /* ── Örnek sayfası ───────────────────────────────────────────────────── */
  // Örnekler AYRI sayfada: "Görevler"e koyarsak birileri silmeyi unutup
  // örnek satırları da içe aktarır.
  const ornek = wb.addWorksheet('Örnek')
  ornek.columns = sutunlar.map(s => ({ header: s.baslik, width: s.genislik }))
  ornek.getRow(1).font = { bold: true }
  const ornekEposta = epostalar[0] ?? 'sorumlu@ornek.com'
  ornek.addRow(['Atölye açılış etkinliği', 'Davetli listesi ve basın duyurusu', 'Ankara',
    ornekEposta, 'Yapılıyor', 'Yüksek', 'Etkinlik', new Date(), new Date(), 8, 'GRV-001'])
  ornek.addRow(['3D yazıcı bakımı', 'Yedek parça bekleniyor', 'İzmir',
    ornekEposta, 'Bloke', 'Yüksek', 'Mekanik', null, new Date(), 4, 'GRV-002'])
  ornek.addRow(['Dönem raporu hazırlığı', '', 'Genel Merkez',
    '', 'Beklemede', 'Normal', 'Raporlama', null, null, null, 'GRV-003'])

  /* ── Yardım sayfası ──────────────────────────────────────────────────── */
  const yardim = wb.addWorksheet('Nasıl Kullanılır')
  yardim.getColumn(1).width = 110
  const satirlar: [string, boolean][] = [
    [`${opts.orgAd} — Görev İçe Aktarma Şablonu`, true],
    ['', false],
    ['1. Görevlerinizi "Görevler" sayfasına yazın. Örnek satırlar "Örnek" sayfasındadır.', false],
    ['2. Yalnızca "Görev Başlığı" zorunludur. Diğer sütunlar boş bırakılabilir.', false],
    ['3. İl, Durum, Öncelik, Kategori ve Sorumlu sütunlarında açılır listeden seçim yapın.', false],
    ['4. Tarihleri gün.ay.yıl olarak yazın: 03.04.2026 = 3 Nisan 2026.', false],
    ['', false],
    ['"Gecikti" bir durum değildir', true],
    ['Bir görevin gecikmiş sayılması termin tarihinin geçmiş olmasına bağlıdır.', false],
    ['Durum sütununa "Gecikti" yazarsanız görev "Yapılıyor" olarak alınır ve size uyarı gösterilir.', false],
    ['', false],
    ['Aynı dosyayı ikinci kez yüklerseniz', true],
    ['Var olan görevler GÜNCELLENİR, kopya oluşmaz. Eşleştirme "Kod / Referans" sütununa,', false],
    ['o sütun boşsa "Görev Başlığı + İl" ikilisine göre yapılır.', false],
    ['Başlığı veya ili değiştirirseniz sistem bunu YENİ bir görev sayar.', false],
    ['', false],
    ['Boş bıraktığınız hücreler mevcut veriyi SİLMEZ', true],
    ['Örneğin "Durum" hücresini boş bırakırsanız, uygulamada elle yapılmış durum güncellemesi korunur.', false],
    ['', false],
    ['Yükleme sırasında hatalı satırlar size listelenir; isterseniz yalnızca geçerli satırları aktarabilirsiniz.', false],
    ['İçe aktarma sonrası "Geri Al" ile tüm partiyi tek tıkla geri alabilirsiniz.', false],
  ]
  satirlar.forEach(([metin, kalin]) => {
    const r = yardim.addRow([metin])
    if (kalin) r.font = { bold: true, size: 12 }
  })

  /* ── Gizli liste sayfası (doğrulama kaynağı) ─────────────────────────── */
  // EN SONA eklenir: ilk sayfa kullanıcının göreceği "Görevler" olmalı.
  // Ayrıca okuyucumuz sayfa belirtilmezse ilk sayfayı alır.
  const listeler = wb.addWorksheet('Listeler')
  listeler.getColumn(1).values = ['İller', ...IL_SECENEKLERI]
  listeler.getColumn(2).values = ['Durumlar', ...DURUMLAR]
  listeler.getColumn(3).values = ['Öncelikler', ...ONCELIKLER]
  listeler.getColumn(4).values = ['Kategoriler', ...TASK_TYPES.map(t => t.label)]
  listeler.getColumn(5).values = ['Sorumlular', ...epostalar]
  // Kullanıcı yanlışlıkla bozmasın; "veryHidden" sekmeden de gizler
  listeler.state = 'veryHidden'

  const buf = await wb.xlsx.writeBuffer()
  return new Uint8Array(buf as ArrayBuffer)
}
