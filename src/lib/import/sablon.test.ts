import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { sablonUret } from './sablon'
import { tabloOku } from './tabloOku'
import { otomatikEsle } from './columnMap'
import { IL_SECENEKLERI } from '@/lib/iller'
import { TASK_TYPES } from '@/lib/taskTypes'

const UYELER = [
  { adSoyad: 'Ankara İl Sorumlusu', email: 'ankara@deneyap.demo' },
  { adSoyad: 'İzmir İl Sorumlusu',  email: 'izmir@deneyap.demo' },
  { adSoyad: 'Adsız',               email: null },
]

async function sablon() {
  return sablonUret({ orgAd: 'DENEYAP Demo', anaRenk: '#2288c9', uyeler: UYELER })
}

async function kitap(buf: Uint8Array) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(Buffer.from(buf) as unknown as ArrayBuffer)
  return wb
}

describe('sablonUret', () => {
  it('beklenen sayfaları üretir', async () => {
    const wb = await kitap(await sablon())
    const adlar = wb.worksheets.map(w => w.name)
    expect(adlar).toContain('Görevler')
    expect(adlar).toContain('Örnek')
    expect(adlar).toContain('Nasıl Kullanılır')
    expect(adlar).toContain('Listeler')
  })

  it('liste sayfasını gizler — kullanıcı yanlışlıkla bozmasın', async () => {
    const wb = await kitap(await sablon())
    expect(wb.getWorksheet('Listeler')!.state).toBe('veryHidden')
  })

  it('başlık satırını dondurur ve filtre ekler', async () => {
    const ws = (await kitap(await sablon())).getWorksheet('Görevler')!
    expect(ws.views?.[0]).toMatchObject({ state: 'frozen', ySplit: 1 })
    expect(ws.autoFilter).toBeTruthy()
  })

  it('il ve kategori listeleri KODDAN gelir — şablon uygulamadan ayrışamaz', async () => {
    const ws = (await kitap(await sablon())).getWorksheet('Listeler')!
    const iller = (ws.getColumn(1).values as unknown[]).slice(2).map(String)
    const kategoriler = (ws.getColumn(4).values as unknown[]).slice(2).map(String)
    expect(iller).toEqual([...IL_SECENEKLERI])
    expect(kategoriler).toEqual(TASK_TYPES.map(t => t.label))
  })

  it('sorumlu listesini org üyelerinin e-postalarıyla doldurur', async () => {
    const ws = (await kitap(await sablon())).getWorksheet('Listeler')!
    const sorumlular = (ws.getColumn(5).values as unknown[]).slice(2).map(String)
    expect(sorumlular).toEqual(['ankara@deneyap.demo', 'izmir@deneyap.demo'])
  })

  it('e-postasız üyeyi listeye koymaz', async () => {
    const ws = (await kitap(await sablon())).getWorksheet('Listeler')!
    const sorumlular = (ws.getColumn(5).values as unknown[]).slice(2)
    expect(sorumlular).not.toContain('Adsız')
  })

  it('açılır liste doğrulaması ekler', async () => {
    const ws = (await kitap(await sablon())).getWorksheet('Görevler')!
    expect(ws.getCell('C2').dataValidation?.type).toBe('list')   // İl
    expect(ws.getCell('E2').dataValidation?.type).toBe('list')   // Durum
    expect(ws.getCell('G2').dataValidation?.type).toBe('list')   // Kategori
  })

  it('durum uyarısında "Gecikti"nin durum olmadığını açıklar', async () => {
    const ws = (await kitap(await sablon())).getWorksheet('Görevler')!
    expect(ws.getCell('E2').dataValidation?.error).toContain('Gecikti')
  })

  it('tarih sütunlarına gün.ay.yıl biçimi verir', async () => {
    const ws = (await kitap(await sablon())).getWorksheet('Görevler')!
    expect(ws.getCell('I2').numFmt).toBe('dd.mm.yyyy')
  })

  it('örnek satırları ayrı sayfada tutar — yanlışlıkla içe aktarılmasın', async () => {
    const wb = await kitap(await sablon())
    expect(wb.getWorksheet('Görevler')!.actualRowCount).toBe(1)   // yalnız başlık
    expect(wb.getWorksheet('Örnek')!.actualRowCount).toBeGreaterThan(1)
  })

  it('üye yoksa da çöker değil, geçerli bir dosya üretir', async () => {
    const buf = await sablonUret({ orgAd: 'Boş Org', uyeler: [] })
    const wb = await kitap(buf)
    expect(wb.getWorksheet('Görevler')).toBeTruthy()
    expect(wb.getWorksheet('Görevler')!.getCell('D2').dataValidation).toBeUndefined()
  })
})

describe('şablon → okuyucu turu', () => {
  it('ürettiğimiz şablonun başlıkları kendi eşleyicimizle birebir eşleşir', async () => {
    const t = await tabloOku('sablon.xlsx', await sablon())
    const esleme = Object.fromEntries(otomatikEsle(t.basliklar).map(o => [o.sutun, o.alan]))

    expect(esleme['Görev Başlığı*']).toBe('title')
    expect(esleme['Açıklama']).toBe('description')
    expect(esleme['İl / Birim']).toBe('il')
    expect(esleme['Sorumlu (E-posta)']).toBe('assignee')
    expect(esleme['Durum']).toBe('status')
    expect(esleme['Öncelik']).toBe('priority')
    expect(esleme['Kategori']).toBe('task_type')
    expect(esleme['Başlangıç Tarihi']).toBe('start_date')
    expect(esleme['Termin Tarihi']).toBe('due_date')
    expect(esleme['Tahmini Süre (saat)']).toBe('estimated_hours')
    expect(esleme['Kod / Referans']).toBe('external_key')

    // Hiçbir sütun eşlemesiz kalmamalı
    expect(Object.values(esleme).filter(v => v === null)).toHaveLength(0)
  })

  it('örnek sayfasındaki satırlar okunup normalize edilebilir', async () => {
    const t = await tabloOku('sablon.xlsx', await sablon(), { sayfa: 'Örnek' })
    expect(t.satirlar.length).toBe(3)
    expect(t.satirlar[0]['Görev Başlığı*']).toBe('Atölye açılış etkinliği')
    expect(t.satirlar[0]['İl / Birim']).toBe('Ankara')
  })
})
