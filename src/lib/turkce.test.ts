import { describe, it, expect } from 'vitest'
import { trFold, toSlug, trCompare , bulunmaEki, yonelmeEki } from './turkce'

/**
 * `turkce.ts`'in ilk testleri. `trFold` bu projede üç yerde kritik: içe
 * aktarmada başlık/il eşlemesi, DENEYAP tekilleştirmesi ve görev araması.
 */

describe('trFold — temel davranış', () => {
  it('büyük İ doğru katlanır ("İSTANBUL" → "i-stanbul" hatası)', () => {
    // JavaScript'te "İ".toLowerCase() = i + U+0307; bu proje daha önce tam
    // bu yüzden bozulmuştu. Türkçe harfler küçültmeden ÖNCE çevriliyor.
    expect(trFold('İstanbul')).toBe('istanbul')
    expect('İ'.toLowerCase().length).toBe(2)
    expect(trFold('İ').length).toBe(1)
  })

  it('ı, I ve i aynı sonuca iner', () => {
    expect(trFold('ıIi')).toBe('iii')
  })

  it('boşluklar tekilleştirilir ve kırpılır', () => {
    expect(trFold('  a   b  ')).toBe('a b')
  })

  it('boş girdi boş döner', () => {
    expect(trFold('')).toBe('')
    expect(trFold('   ')).toBe('')
  })

  it('"İl / Birim" ile "il birim" başlık eşleşmesi için yakınsar', () => {
    expect(trFold('İl / Birim')).toBe('il / birim')
  })
})

describe('toSlug', () => {
  it('Türkçe adı URL güvenli hâle getirir', () => {
    expect(toSlug('Çankaya DENEYAP')).toBe('cankaya-deneyap')
  })

  it('baştaki ve sondaki tireleri atar', () => {
    expect(toSlug('  --Ağrı--  ')).toBe('agri')
  })
})

describe('trCompare', () => {
  it('Çanakkale C harfinden sonra gelir', () => {
    expect(trCompare('Çanakkale', 'Denizli')).toBeLessThan(0)
    expect(trCompare('Corum', 'Çanakkale')).toBeLessThan(0)
  })
})


// ── tr_fold (SQL) ikizi ───────────────────────────────────────────────────
// migration 060'taki public.tr_fold() bu fonksiyonun SQL ikizi. Ayrışırlarsa
// DENEYAP tekilleştirmesi bozulur: arayüz "böyle bir DENEYAP yok" der, unique
// kısıt "var" der (ya da tersi) ve aynı isimde iki kayıt oluşabilir.
//
// Buradaki değerler İKİ TARAFIN DA üretmesi gereken sonuçlar. Bunlar
// değişirse migration da değişmeli. Canlı DB'ye karşı doğrulama:
//   node scripts/tr-fold-ikiz.mjs
describe('trFold — SQL tr_fold() ile ikiz (migration 060)', () => {
  const BEKLENEN: [string, string][] = [
    ['Çankaya DENEYAP', 'cankaya deneyap'],
    ['ÇANKAYA DENEYAP', 'cankaya deneyap'],
    ['İSTANBUL', 'istanbul'],
    ['Istanbul', 'istanbul'],
    ['Şanlıurfa  Merkez', 'sanliurfa merkez'],
    ['  Ağrı Gümüşhane  ', 'agri gumushane'],
    // Aksanlı harfler: TS tarafı NFD ile temizliyor, SQL tarafı translate()
    // ile. İkisinin de aynı sonucu vermesi bu satırlarla kilitli.
    ['Hakkâri', 'hakkari'],
    ['Elâzığ', 'elazig'],
    ['Café DENEYAP', 'cafe deneyap'],
    ['ÖZEL ÖĞRETİM', 'ozel ogretim'],
    ['İzmir Karşıyaka DENEYAP', 'izmir karsiyaka deneyap'],
  ]

  it.each(BEKLENEN)('%s → %s', (girdi, beklenen) => {
    expect(trFold(girdi)).toBe(beklenen)
  })

  it('migration 060 hâlâ aynı translate() çiftlerini taşıyor', async () => {
    const { readFileSync } = await import('node:fs')
    const sql = readFileSync('supabase/migrations/060_deneyaplar.sql', 'utf8')
    const m = sql.match(/translate\(\s*s,\s*'([^']+)',\s*'([^']+)'/)
    expect(m, 'translate() çifti migration 060 içinde bulunamadı').toBeTruthy()
    const [, kaynak, hedef] = m!
    // Karakter sayıları eşit olmalı; değilse Postgres sessizce eksik çevirir.
    expect([...kaynak].length).toBe([...hedef].length)
    // Her karakterin SQL hedefi, TS'in o karakter için ürettiğiyle aynı olmalı.
    const kaynakChars = [...kaynak]
    const hedefChars = [...hedef]
    const ayrisan = kaynakChars
      .map((ch, i) => ({ ch, sql: hedefChars[i], ts: trFold(ch) }))
      .filter(x => x.sql !== x.ts)
    expect(ayrisan).toEqual([])
  })
})

describe('bulunmaEki', () => {
  it('kalın ünlü + yumuşak ünsüz → da', () => {
    expect(bulunmaEki('Ankara')).toBe("Ankara'da")
    expect(bulunmaEki('Bolu')).toBe("Bolu'da")
    expect(bulunmaEki('Adana')).toBe("Adana'da")
  })
  it('kalın ünlü + SERT ünsüz → ta', () => {
    // "Uşak'da" yazan bir cümle metni anında makine üretimi gibi gösterir.
    expect(bulunmaEki('Uşak')).toBe("Uşak'ta")
    expect(bulunmaEki('Sinop')).toBe("Sinop'ta")
    expect(bulunmaEki('Tokat')).toBe("Tokat'ta")
  })
  it('ince ünlü → de / te', () => {
    expect(bulunmaEki('İzmir')).toBe("İzmir'de")
    expect(bulunmaEki('Edirne')).toBe("Edirne'de")
    expect(bulunmaEki('Kilis')).toBe("Kilis'te")
    expect(bulunmaEki('Bilecik')).toBe("Bilecik'te")
  })
  it('sesli harfi olmayan girdide çökmez', () => {
    expect(() => bulunmaEki('X')).not.toThrow()
  })
})

describe('yonelmeEki', () => {
  it('ünsüzle biten adlarda düz ek', () => {
    expect(yonelmeEki('İzmir')).toBe("İzmir'e")
    expect(yonelmeEki('Uşak')).toBe("Uşak'a")
  })
  it('sesliyle biten adlarda kaynaştırma y', () => {
    expect(yonelmeEki('Ankara')).toBe("Ankara'ya")
    expect(yonelmeEki('Bolu')).toBe("Bolu'ya")
  })
})
