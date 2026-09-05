import { describe, it, expect } from 'vitest'
import { parmakIzi, eslestirmeAnahtari, disAnahtarTemizle } from './fingerprint'

/**
 * ALTIN DEĞER TESTLERİ — dikkatle okuyun.
 *
 * Buradaki string'ler keyfî "beklenen çıktı" değil, algoritmanın BUGÜNKÜ
 * çıktısının kilidi. Bir içe aktarma yapıldığı anda bu değerler
 * `tasks.import_fingerprint` kolonuna yazılır ve geçmişe dönük yeniden
 * hesaplanamaz hale gelir.
 *
 * Bir test burada kırılırsa doğru tepki "beklenen değeri güncellemek" DEĞİLDİR.
 * Anahtar değişirse aynı Excel dosyası ikinci kez yüklendiğinde eski kayıtla
 * eşleşme kurulamaz ve **kopya görevler oluşur** — üstelik sessizce, kullanıcı
 * fark etmeden. Böyle bir değişiklik ancak bilinçli bir veri taşıma planıyla
 * yapılabilir.
 *
 * İlgili: supabase/migrations/055_import_batches.sql (aynı uyarı orada da var)
 */
describe('parmakIzi — altın değerler', () => {
  const ALTIN: Array<[baslik: string, il: string | null, beklenen: string]> = [
    ['Ankara atölyesi robotik kiti sayımı', 'Ankara', 'ankara atolyesi robotik kiti sayimi|ankara'],
    ['İzmir 3D yazıcı bakımı',              'İzmir',   'izmir 3d yazici bakimi|izmir'],
    ['Dönem kapanış sunumu',                'Genel Merkez', 'donem kapanis sunumu|genel merkez'],
    ['Bursa atölyesi kurulum takibi',       'Bursa',   'bursa atolyesi kurulum takibi|bursa'],
    ['Hakkâri ziyareti',                    'Hakkâri', 'hakkari ziyareti|hakkari'],
    ['ĞÜŞİÖÇ',                              'Iğdır',   'gusioc|igdir'],
  ]

  it.each(ALTIN)('%s / %s', (baslik, il, beklenen) => {
    expect(parmakIzi(baslik, il)).toBe(beklenen)
  })

  it('büyük İ harfini bozmaz — "i" + birleşik nokta üretilmemeli', () => {
    // Bu proje daha önce tam bu yüzden "İSTANBUL" → "i-stanbul" hatası verdi.
    const anahtar = parmakIzi('İSTANBUL işi', 'İstanbul')
    expect(anahtar).toBe('istanbul isi|istanbul')
    expect(anahtar).not.toContain('̇')
  })

  it('il null ile boş string AYNI anahtarı üretir', () => {
    // Önemli: "İl atanmamış" görevler tek bir kovada toplanır. Bu ikisi
    // ayrışırsa aynı görev iki kez oluşur.
    expect(parmakIzi('Görev', null)).toBe('gorev|')
    expect(parmakIzi('Görev', '')).toBe('gorev|')
  })

  it('baştaki/sondaki ve tekrarlı boşlukları sadeleştirir', () => {
    expect(parmakIzi('  Çift   boşluklu   başlık  ', 'Şanlıurfa'))
      .toBe('cift bosluklu baslik|sanliurfa')
  })

  it('aynı görev farklı yazımla aynı anahtara düşer', () => {
    // Excel'de büyük/küçük harf ve boşluk farkı sık; kopya üretmemeli.
    expect(parmakIzi('ANKARA DÖNEM RAPORU', 'ANKARA'))
      .toBe(parmakIzi('ankara  dönem raporu', 'ankara'))
  })

  it('farklı il aynı başlığı ayırır', () => {
    expect(parmakIzi('Dönem raporu', 'Ankara'))
      .not.toBe(parmakIzi('Dönem raporu', 'İzmir'))
  })
})

describe('eslestirmeAnahtari', () => {
  it('dış anahtar varsa onu kullanır — başlık değişse de aynı göreve işaret eder', () => {
    expect(eslestirmeAnahtari('Başlık', 'Ankara', 'GRV-001'))
      .toEqual({ anahtar: 'GRV-001', yontem: 'external_key' })
  })

  it('dış anahtar yoksa parmak izine düşer', () => {
    expect(eslestirmeAnahtari('Dönem kapanış sunumu', 'Genel Merkez', null))
      .toEqual({ anahtar: 'donem kapanis sunumu|genel merkez', yontem: 'fingerprint' })
  })

  it('dış anahtar ham hâliyle korunur — katlanmaz', () => {
    // Kod sütunu kullanıcının kimliği; büyük/küçük harf anlamlı olabilir.
    expect(eslestirmeAnahtari('X', null, 'ABC-123').anahtar).toBe('ABC-123')
  })
})

describe('disAnahtarTemizle', () => {
  it('boş ve tanımsız değerleri null yapar', () => {
    expect(disAnahtarTemizle(null)).toBeNull()
    expect(disAnahtarTemizle(undefined)).toBeNull()
    expect(disAnahtarTemizle('')).toBeNull()
    expect(disAnahtarTemizle('   ')).toBeNull()
  })

  it('kenar boşluklarını kırpar', () => {
    expect(disAnahtarTemizle('  GRV-1  ')).toBe('GRV-1')
  })

  it('sayıyı string olarak kabul eder', () => {
    // Excel hücresi sayı dönebilir.
    expect(disAnahtarTemizle(1024)).toBe('1024')
  })

  it('100 karakterden uzun değeri reddeder', () => {
    expect(disAnahtarTemizle('x'.repeat(101))).toBeNull()
    expect(disAnahtarTemizle('x'.repeat(100))).toBe('x'.repeat(100))
  })
})
