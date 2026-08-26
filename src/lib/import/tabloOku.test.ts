import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { tabloOku, TabloHatasi } from './tabloOku'
import { otomatikEsle } from './columnMap'
import { normDurum, normIl, normOncelik, normKategori, normTarih, normSaat } from './normalize'

/**
 * Uçtan uca: gerçek bir .xlsx üretilir, okunur, başlıklar eşlenir ve
 * değerler normalize edilir. Birim testlerin kapsamadığı "parçalar birlikte
 * çalışıyor mu" sorusunu cevaplar.
 */

async function xlsxUret(
  satirlar: unknown[][],
  opts: { sayfaAdi?: string; ikinciSayfa?: boolean } = {},
): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(opts.sayfaAdi ?? 'Görevler')
  satirlar.forEach(r => ws.addRow(r))
  if (opts.ikinciSayfa) wb.addWorksheet('Notlar').addRow(['boş'])
  const buf = await wb.xlsx.writeBuffer()
  return new Uint8Array(buf as ArrayBuffer)
}

const BASLIKLAR = [
  'Görev Başlığı*', 'Açıklama', 'İl / Birim', 'Sorumlu',
  'Durum', 'Öncelik', 'Kategori', 'Termin Tarihi', 'Tahmini Süre',
]

describe('tabloOku — xlsx', () => {
  it('başlıkları ve satırları okur, boş satırları atlar', async () => {
    const buf = await xlsxUret([
      BASLIKLAR,
      ['Açılış etkinliği', 'Basın dahil', 'Şanlıurfa', 'a@b.com', 'Devam Ediyor', 'Yüksek', 'Etkinlik', '01.09.2026', '7,5'],
      ['', '', '', '', '', '', '', '', ''],
      ['Eğitmen listesi', '', 'Ankara', 'c@d.com', 'Gecikti', '1', 'Eğitim', '03/04/2026', '8 saat'],
    ])

    const t = await tabloOku('gorevler.xlsx', buf)
    expect(t.basliklar).toEqual(BASLIKLAR)
    expect(t.satirlar).toHaveLength(2)          // boş satır atlandı
    expect(t.satirNolari).toEqual([2, 4])       // Excel'deki gerçek satır numaraları
    expect(t.secilenSayfa).toBe('Görevler')
  })

  it('Türkçe karakterleri bozmadan okur', async () => {
    const buf = await xlsxUret([BASLIKLAR, ['Şanlıurfa işi', '', 'Şanlıurfa', '', '', '', '', '', '']])
    const t = await tabloOku('a.xlsx', buf)
    expect(t.satirlar[0]['Görev Başlığı*']).toBe('Şanlıurfa işi')
    expect(t.satirlar[0]['İl / Birim']).toBe('Şanlıurfa')
  })

  it('Excel tarih hücresini Date olarak korur', async () => {
    const buf = await xlsxUret([BASLIKLAR, ['X', '', '', '', '', '', '', new Date(2026, 8, 1), '']])
    const t = await tabloOku('a.xlsx', buf)
    expect(t.satirlar[0]['Termin Tarihi']).toBeInstanceOf(Date)
  })

  it('tekrar eden başlıkları ayrıştırır — ikincisi birinciyi ezmesin', async () => {
    const buf = await xlsxUret([['Görev', 'Görev'], ['a', 'b']])
    const t = await tabloOku('a.xlsx', buf)
    expect(t.basliklar).toEqual(['Görev', 'Görev (2)'])
    expect(t.satirlar[0]).toEqual({ 'Görev': 'a', 'Görev (2)': 'b' })
  })

  it('boş başlığa yer tutucu ad verir', async () => {
    const buf = await xlsxUret([['Görev', ''], ['a', 'b']])
    const t = await tabloOku('a.xlsx', buf)
    expect(t.basliklar[1]).toBe('Sütun 2')
  })

  it('birden çok sayfayı listeler ve seçileni okur', async () => {
    const buf = await xlsxUret([BASLIKLAR, ['X', '', '', '', '', '', '', '', '']], { ikinciSayfa: true })
    const t = await tabloOku('a.xlsx', buf)
    expect(t.sayfalar).toEqual(['Görevler', 'Notlar'])
    const t2 = await tabloOku('a.xlsx', buf, { sayfa: 'Notlar' })
    expect(t2.secilenSayfa).toBe('Notlar')
  })

  it('başlık satırı numarası verilebilir (üstte logo/başlık olan dosyalar)', async () => {
    const buf = await xlsxUret([
      ['DENEYAP 2026 GÖREV LİSTESİ'],
      [],
      ['Görev', 'İl'],
      ['Test', 'Ankara'],
    ])
    const t = await tabloOku('a.xlsx', buf, { baslikSatiri: 3 })
    expect(t.basliklar).toEqual(['Görev', 'İl'])
    expect(t.satirlar).toHaveLength(1)
  })

  it('desteklenmeyen biçimde yol gösteren hata verir', async () => {
    await expect(tabloOku('eski.xls', new Uint8Array([1, 2, 3])))
      .rejects.toThrow(/\.xlsx/)
    await expect(tabloOku('resim.png', new Uint8Array([1, 2, 3])))
      .rejects.toThrow(TabloHatasi)
  })

  it('bozuk xlsx dosyasında anlaşılır hata verir', async () => {
    await expect(tabloOku('bozuk.xlsx', new Uint8Array([1, 2, 3, 4])))
      .rejects.toThrow(/okunamadı/)
  })
})

describe('tabloOku — csv', () => {
  it('noktalı virgüllü Türkçe CSV\'yi okur', async () => {
    const metin = 'Görev;İl;Durum\nAçılış;Şanlıurfa;Devam Ediyor\n'
    const t = await tabloOku('a.csv', new TextEncoder().encode(metin))
    expect(t.basliklar).toEqual(['Görev', 'İl', 'Durum'])
    expect(t.satirlar[0]).toEqual({ 'Görev': 'Açılış', 'İl': 'Şanlıurfa', 'Durum': 'Devam Ediyor' })
    expect(t.varsayimlar.join(' ')).toContain(';')
  })

  it('tırnak içindeki virgülü ayırıcı sanmaz', async () => {
    const metin = 'Görev;Açıklama\nA;"x, y, z"\n'
    const t = await tabloOku('a.csv', new TextEncoder().encode(metin))
    expect(t.satirlar[0]['Açıklama']).toBe('x, y, z')
  })
})

describe('okuma → eşleme → normalizasyon zinciri', () => {
  it('gerçekçi bir Excel satırını uygulama alanlarına çevirir', async () => {
    const buf = await xlsxUret([
      BASLIKLAR,
      ['Açılış etkinliği', 'Basın dahil', 'Şanlıurfa', 'a@b.com', 'Devam Ediyor', 'Yüksek', 'Etkinlik', '01.09.2026', '7,5'],
    ])
    const t = await tabloOku('gorevler.xlsx', buf)

    // Başlıklar doğru alanlara eşleniyor mu
    const esleme = Object.fromEntries(otomatikEsle(t.basliklar).map(o => [o.sutun, o.alan]))
    expect(esleme['Görev Başlığı*']).toBe('title')
    expect(esleme['İl / Birim']).toBe('il')
    expect(esleme['Termin Tarihi']).toBe('due_date')
    expect(esleme['Tahmini Süre']).toBe('estimated_hours')

    // Değerler doğru normalize ediliyor mu
    const s = t.satirlar[0]
    expect(normIl(s['İl / Birim']).value).toBe('Şanlıurfa')
    expect(normDurum(s['Durum']).value).toBe('doing')
    expect(normOncelik(s['Öncelik']).value).toBe('high')
    expect(normKategori(s['Kategori']).value).toBe('event')
    expect(normTarih(s['Termin Tarihi']).value).toBe('2026-09-01')
    expect(normSaat(s['Tahmini Süre']).value).toBe(7.5)
  })

  it('"Gecikti" ve yanlış yazılmış il, satırı düşürmeden uyarıya çevrilir', async () => {
    const buf = await xlsxUret([
      BASLIKLAR,
      ['Eğitmen listesi', '', 'Ankra', '', 'Gecikti', '1', 'Eğitim', '03/04/2026', ''],
    ])
    const t = await tabloOku('a.xlsx', buf)
    const s = t.satirlar[0]

    const durum = normDurum(s['Durum'])
    expect(durum.value).toBe('doing')
    expect(durum.gecikmeIsareti).toBe(true)

    const il = normIl(s['İl / Birim'])
    expect(il.value).toBe('Ankara')
    expect(il.guven).toBe('tahmin')     // otomatik kabul değil, kullanıcı onaylar

    // Türkçe formatta gün önce gelir
    expect(normTarih(s['Termin Tarihi']).value).toBe('2026-04-03')
    expect(normOncelik(s['Öncelik']).value).toBe('critical')
  })
})
