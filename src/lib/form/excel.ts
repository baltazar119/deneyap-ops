import 'server-only'
import type { Sayfa } from './disaAktar'

/**
 * Form cevaplarından çok sayfalı .xlsx üretir.
 *
 * Sayfa içerikleri `disaAktar.ts`'te saf olarak hesaplanıyor; burası
 * yalnızca biçimlendirme. Rapor Excel'iyle aynı görsel dil kullanılıyor
 * (koyu başlık şeridi, donmuş ilk satır, otomatik süzgeç).
 */

const BASLIK_ZEMIN = 'FF0F2942'

export async function formExcelUret(sayfalar: Sayfa[]): Promise<Uint8Array> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'DENEYAP OYS'
  wb.created = new Date()

  for (const s of sayfalar) {
    const ws = wb.addWorksheet(s.ad)
    ws.addRow(s.basliklar)
    for (const satir of s.satirlar) ws.addRow(satir)

    const ilk = ws.getRow(1)
    ilk.height = 22
    ilk.eachCell((c: { font?: unknown; fill?: unknown; alignment?: unknown }) => {
      c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BASLIK_ZEMIN } }
      c.alignment = { vertical: 'middle' }
    })
    // Başlık satırı donuk + süzgeçli: 200 satırlık bir sayımda sütun
    // başlığını kaybetmek aktarımı işe yaramaz hale getirir.
    ws.views = [{ state: 'frozen', ySplit: 1 }]
    if (s.basliklar.length > 0) {
      ws.autoFilter = { from: 'A1', to: { row: 1, column: s.basliklar.length } }
    }

    // Sütun genişliği içeriğe göre; uzun serbest metinler tavana takılır.
    s.basliklar.forEach((baslik, i) => {
      const enUzun = s.satirlar.reduce((m, r) => {
        const v = r[i]
        return Math.max(m, v === null || v === undefined ? 0 : String(v).length)
      }, String(baslik).length)
      ws.getColumn(i + 1).width = Math.min(Math.max(enUzun + 2, 10), 48)
    })
  }

  // Hiç sayfa yoksa Excel dosyayı bozuk sayar.
  if (sayfalar.length === 0) wb.addWorksheet('Yanıtlar').addRow(['Kayıt yok'])

  const tampon = await wb.xlsx.writeBuffer()
  return new Uint8Array(tampon as ArrayBuffer)
}
