import { describe, it, expect } from 'vitest'
import { normDurum, normOncelik, normKategori, normIl, normTarih, normSaat, normDeneyap, type DeneyapAdayi } from './normalize'

describe('normDurum', () => {
  it('Türkçe durum adlarını eşler', () => {
    expect(normDurum('Beklemede').value).toBe('backlog')
    expect(normDurum('Devam Ediyor').value).toBe('doing')
    expect(normDurum('Yapılıyor').value).toBe('doing')
    expect(normDurum('Tamamlandı').value).toBe('done')
    expect(normDurum('Bloke').value).toBe('blocked')
    expect(normDurum('Test').value).toBe('testing')
  })

  it('büyük/küçük harf ve fazladan boşluğa duyarsız', () => {
    expect(normDurum('  TAMAMLANDI  ').value).toBe('done')
    expect(normDurum('devam    ediyor').value).toBe('doing')
  })

  it('"Gecikti"yi durum saymaz — doing + gecikme işareti verir', () => {
    const s = normDurum('Gecikti')
    expect(s.value).toBe('doing')
    expect(s.gecikmeIsareti).toBe(true)
    expect(s.uyari).toContain('termin')
  })

  it('%100 ifadesini tamamlandı sayar', () => {
    expect(normDurum('%100').value).toBe('done')
    expect(normDurum('100%').value).toBe('done')
  })

  it('tanınmayan değerde backlog + uyarı döner, satırı düşürmez', () => {
    const s = normDurum('zamazingo')
    expect(s.value).toBe('backlog')
    expect(s.guven).toBe('yok')
    expect(s.uyari).toBeTruthy()
  })

  it('boş hücrede uyarı vermez', () => {
    expect(normDurum('').uyari).toBeUndefined()
    expect(normDurum(null).value).toBe('backlog')
  })
})

describe('normOncelik', () => {
  it('Türkçe öncelikleri eşler', () => {
    expect(normOncelik('Kritik').value).toBe('critical')
    expect(normOncelik('Yüksek').value).toBe('high')
    expect(normOncelik('Orta').value).toBe('normal')
    expect(normOncelik('Düşük').value).toBe('low')
  })

  it('varsayılanda 1 en yüksek önceliktir', () => {
    expect(normOncelik('1').value).toBe('critical')
    expect(normOncelik('4').value).toBe('low')
  })

  it('birEnYuksek=false ile sıra ters çevrilir', () => {
    expect(normOncelik('1', { birEnYuksek: false }).value).toBe('low')
    expect(normOncelik('4', { birEnYuksek: false }).value).toBe('critical')
  })

  it('P1..P4 gösterimini tanır', () => {
    expect(normOncelik('P1').value).toBe('critical')
    expect(normOncelik('p3').value).toBe('normal')
  })
})

describe('normKategori', () => {
  it('DENEYAP kategorilerini Türkçe adlarından eşler', () => {
    expect(normKategori('Mekanik').value).toBe('mechanical')
    expect(normKategori('Elektronik').value).toBe('electrical')
    expect(normKategori('Eğitim').value).toBe('training')
    expect(normKategori('Etkinlik').value).toBe('event')
    expect(normKategori('Malzeme & Tedarik').value).toBe('supply')
    expect(normKategori('Raporlama').value).toBe('reporting')
  })

  it('enum değerinin kendisini de kabul eder', () => {
    expect(normKategori('software').value).toBe('software')
  })

  it('tanınmayan kategori "other"a düşer', () => {
    const s = normKategori('kuantum fiziği')
    expect(s.value).toBe('other')
    expect(s.guven).toBe('yok')
  })
})

describe('normIl', () => {
  it('81 ili ve Genel Merkez\'i eşler', () => {
    expect(normIl('Ankara').value).toBe('Ankara')
    expect(normIl('Genel Merkez').value).toBe('Genel Merkez')
  })

  it('Türkçe İ/ı tuzağına düşmez', () => {
    // "İSTANBUL".toLowerCase() JS'te i + U+0307 üretir; trFold bunu çözer
    expect(normIl('İSTANBUL').value).toBe('İstanbul')
    expect(normIl('istanbul').value).toBe('İstanbul')
    expect(normIl('İzmir').value).toBe('İzmir')
    expect(normIl('IZMIR').value).toBe('İzmir')
  })

  it('aksanlı ve zor yazılan illeri eşler', () => {
    expect(normIl('Hakkâri').value).toBe('Hakkâri')
    expect(normIl('Şanlıurfa').value).toBe('Şanlıurfa')
    expect(normIl('Afyonkarahisar').value).toBe('Afyonkarahisar')
  })

  it('yaygın kısaltmaları çözer', () => {
    expect(normIl('Afyon').value).toBe('Afyonkarahisar')
    expect(normIl('Urfa').value).toBe('Şanlıurfa')
    expect(normIl('Antep').value).toBe('Gaziantep')
    expect(normIl('GM').value).toBe('Genel Merkez')
  })

  it('yakın yazımı tahmin olarak işaretler, kesin saymaz', () => {
    const s = normIl('Ankra')
    expect(s.value).toBe('Ankara')
    expect(s.guven).toBe('tahmin')
  })

  it('tanınmayan ilde null döner — sessizce boş geçmez', () => {
    const s = normIl('Zamazingo')
    expect(s.value).toBeNull()
    expect(s.uyari).toContain('tanınmadı')
  })

  it('boş hücre uyarı üretmez', () => {
    expect(normIl('').value).toBeNull()
    expect(normIl('').uyari).toBeUndefined()
  })
})

describe('normTarih', () => {
  it('Türkçe formatta GÜN önce gelir — 03/04/2026 = 3 Nisan', () => {
    expect(normTarih('03/04/2026').value).toBe('2026-04-03')
    expect(normTarih('03.04.2026').value).toBe('2026-04-03')
    expect(normTarih('3-4-2026').value).toBe('2026-04-03')
  })

  it('ISO formatını olduğu gibi alır', () => {
    expect(normTarih('2026-09-01').value).toBe('2026-09-01')
  })

  it('Türkçe ay adlarını okur', () => {
    expect(normTarih('3 Nisan 2026').value).toBe('2026-04-03')
    expect(normTarih('15 Ağustos 2026').value).toBe('2026-08-15')
  })

  it('Date nesnesini saat dilimi kaydırmadan çevirir', () => {
    // toISOString kullanılsaydı UTC+3'te bir gün geri kayardı
    const d = new Date(2026, 8, 1, 0, 30)   // 1 Eylül 2026, yerel
    expect(normTarih(d).value).toBe('2026-09-01')
  })

  it('gece yarısına yakın saatlerde gün kaymaz', () => {
    const d = new Date(2026, 0, 1, 1, 0)    // 1 Ocak 2026 01:00 yerel
    expect(normTarih(d).value).toBe('2026-01-01')
  })

  it('iki haneli yılı 2000\'li yıllara taşır', () => {
    expect(normTarih('03.04.26').value).toBe('2026-04-03')
  })

  it('taşan tarihleri reddeder', () => {
    expect(normTarih('31.02.2026').value).toBeNull()
    expect(normTarih('45.01.2026').value).toBeNull()
  })

  it('okunamayan tarihte null + uyarı döner', () => {
    const s = normTarih('gelecek hafta')
    expect(s.value).toBeNull()
    expect(s.uyari).toBeTruthy()
  })
})

describe('normSaat', () => {
  it('Türkçe ondalık virgülünü çözer', () => {
    expect(normSaat('7,5').value).toBe(7.5)
  })

  it('birim eklerini temizler', () => {
    expect(normSaat('8 saat').value).toBe(8)
    expect(normSaat('3sa').value).toBe(3)
  })

  it('sayıyı doğrudan kabul eder', () => {
    expect(normSaat(12).value).toBe(12)
  })

  it('gün/hafta gibi belirsiz birimleri reddeder', () => {
    const s = normSaat('1 gün')
    expect(s.value).toBeNull()
    expect(s.uyari).toContain('saat')
  })
})

describe('normDeneyap', () => {
  const D = (id: string, ad: string, il: string, kod: string | null = null, aktif = true):
    DeneyapAdayi => ({ id, ad, il, kod, aktif })

  const LISTE: DeneyapAdayi[] = [
    D('d1', 'Çankaya DENEYAP', 'Ankara', 'ANK-01'),
    D('d2', 'Keçiören DENEYAP', 'Ankara', 'ANK-02'),
    D('d3', 'Bornova DENEYAP', 'İzmir', 'IZM-01'),
    D('d4', 'Merkez DENEYAP', 'Bursa'),
    D('d5', 'Merkez DENEYAP', 'Konya'),
    D('d6', 'Kapalı DENEYAP', 'Rize', 'RZE-01', false),
  ]

  it('boş hücrede sessiz kalır', () => {
    expect(normDeneyap('', LISTE).value).toBeNull()
    expect(normDeneyap(null, LISTE).uyari).toBeUndefined()
  })

  it('kod ile birebir eşleşir', () => {
    const r = normDeneyap('ANK-02', LISTE)
    expect(r.value).toBe('d2')
    expect(r.guven).toBe('kesin')
  })

  it('ad ile birebir eşleşir ve İLİNİ döndürür', () => {
    const r = normDeneyap('Bornova DENEYAP', LISTE)
    expect(r.value).toBe('d3')
    expect(r.il).toBe('İzmir')      // "etkin il" bunu kullanacak
  })

  it('Türkçe büyük/küçük harf farkını yutar', () => {
    expect(normDeneyap('ÇANKAYA DENEYAP', LISTE).value).toBe('d1')
    expect(normDeneyap('çankaya deneyap', LISTE).value).toBe('d1')
  })

  it('aynı ad iki ilde varsa il bağlamıyla ayrışır', () => {
    expect(normDeneyap('Merkez DENEYAP', LISTE, 'Konya').value).toBe('d5')
    expect(normDeneyap('Merkez DENEYAP', LISTE, 'Bursa').value).toBe('d4')
  })

  it('aynı ad iki ilde ve il bağlamı yoksa KULLANICIYA SORAR', () => {
    const r = normDeneyap('Merkez DENEYAP', LISTE)
    expect(r.value).toBeNull()
    expect(r.oneriler).toHaveLength(2)
    expect(r.yeniAd).toBeNull()     // yeni oluşturma önerilmemeli
  })

  it('yakın yazımı tahmin olarak kabul eder', () => {
    const r = normDeneyap('Bornva DENEYAP', LISTE)
    expect(r.value).toBe('d3')
    expect(r.guven).toBe('tahmin')
    expect(r.uyari).toContain('olarak yorumlandı')
  })

  it('kapalı DENEYAP koda göre kabul edilir', () => {
    expect(normDeneyap('RZE-01', LISTE).value).toBe('d6')
  })

  it('kapalı DENEYAP ad BİREBİR yazılırsa kabul edilir', () => {
    // trFold sonrası birebir: 'Kapali' ile 'Kapalı' aynı metne katlanır.
    // Kullanıcı tam adı yazdıysa niyeti açıktır (geçmiş veri aktarımı).
    expect(normDeneyap('Kapali DENEYAP', LISTE).value).toBe('d6')
  })

  it('kapalı DENEYAP YAKIN YAZIMLA kabul EDİLMEZ', () => {
    // Yazım hatasıyla kapalı bir birime düşmek sessiz bir yanlışlık olurdu.
    // 'Kapalu' → 'Kapalı' mesafesi 1, yani yakın yazım aşamasına girer.
    const r = normDeneyap('Kapalu DENEYAP', LISTE)
    expect(r.value).toBeNull()
    expect(r.yeniAd).toBe('Kapalu DENEYAP')
  })

  it('tanınmayan ad HATA değil, oluşturma adayı döner', () => {
    const r = normDeneyap('Sivas DENEYAP', LISTE)
    expect(r.value).toBeNull()
    expect(r.yeniAd).toBe('Sivas DENEYAP')
    expect(r.uyari).toContain('oluşturabilirsiniz')
  })

  it('boş DENEYAP listesinde her ad oluşturma adayı olur', () => {
    const r = normDeneyap('Çankaya DENEYAP', [])
    expect(r.yeniAd).toBe('Çankaya DENEYAP')
  })
})
