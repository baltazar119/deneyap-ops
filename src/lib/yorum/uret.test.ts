import { describe, it, expect } from 'vitest'
import { yorumUret, yorumGirdisiKur } from './uret'
import { tonSec } from './tipler'
import type { RaporVerisi } from '@/lib/rapor/hesapla'
import type { YorumGirdisi } from './tipler'

/**
 * Yorum motoru testleri.
 *
 * En değerli test `KVKK` bloğundaki property testi: nadir bir token'la
 * isimlendirilmiş bir üye alınıp Yetkili Yönetici çıktısında o token'ın HİÇ
 * geçmediği doğrulanıyor. İsim sızıntısı bu motorun en ciddi riski.
 */

const BOS_KPI = {
  toplam: 0, tamamlanan: 0, devamEden: 0, bekleyen: 0, bloke: 0,
  geciken: 0, atanmamis: 0, tamamlanmaOrani: 0, ortalamaGecikmeGunu: 0,
}

function rapor(o: Partial<RaporVerisi> = {}): RaporVerisi {
  return {
    meta: {
      orgAd: 'DENEYAP Demo', raporAdi: 'Test', uretimTarihi: '2026-09-10',
      donem: { baslangic: '2026-09-01', bitis: '2026-09-30', etiket: 'Eylül' },
      uretenAd: 'Test', uretenRolAdi: 'Test', kapsamEtiketi: 'Tüm iller', bolumler: [],
    },
    kpi: { ...BOS_KPI },
    ilKirilimi: [], sorumluKirilimi: [], turKirilimi: [],
    gecikmeler: [], yaklasan: [], hamListe: [],
    risk: null, trend: null,
    ...o,
  } as RaporVerisi
}

function girdi(r: RaporVerisi, kisiBazliVeri = true, ton: YorumGirdisi['ton'] = 'operasyon'): YorumGirdisi {
  return { rapor: r, rol: 'owner', ton, kisiBazliVeri, tekIl: null }
}

function trend(k: Partial<Record<'acik' | 'geciken' | 'tamamlanan', { bu: number; onceki: number }>>) {
  const yap = (bu: number, onceki: number) => {
    const fark = bu - onceki
    const guvenilir = onceki >= 5
    return {
      bu, onceki, fark,
      yuzde: guvenilir ? Math.round((fark / onceki) * 100) : null,
      yon: (fark > 0 ? 'artis' : fark < 0 ? 'azalis' : 'sabit') as 'artis' | 'azalis' | 'sabit',
      guvenilir,
      metin: `${onceki} → ${bu}`,
    }
  }
  return {
    noktalar: [],
    tamamenTuretilmis: false,
    karsilastirma: {
      acik:       yap(k.acik?.bu ?? 0, k.acik?.onceki ?? 0),
      geciken:    yap(k.geciken?.bu ?? 0, k.geciken?.onceki ?? 0),
      tamamlanan: yap(k.tamamlanan?.bu ?? 0, k.tamamlanan?.onceki ?? 0),
    },
  }
}

describe('yorumUret — temel davranış', () => {
  it('hiçbir kural tetiklenmezse BOŞ BLOK göstermez', () => {
    const s = yorumUret(girdi(rapor()))
    expect(s.yorumlar).toHaveLength(0)
    expect(s.ozet).toContain('dikkat çeken bir sapma yok')
    expect(s.ozet.length).toBeGreaterThan(20)
  })

  it('yorumları öneme göre sıralar — kritik başa', () => {
    const r = rapor({
      kpi: { ...BOS_KPI, toplam: 20, tamamlanan: 2, atanmamis: 6, tamamlanmaOrani: 10 },
      trend: trend({ geciken: { bu: 14, onceki: 6 } }),
    })
    const s = yorumUret(girdi(r))
    const sira = s.yorumlar.map(y => y.onem)
    const idx = (o: string) => ['kritik', 'uyari', 'bilgi', 'olumlu'].indexOf(o)
    for (let i = 1; i < sira.length; i++) {
      expect(idx(sira[i])).toBeGreaterThanOrEqual(idx(sira[i - 1]))
    }
  })

  it('en fazla 6 yorum döndürür', () => {
    const r = rapor({
      kpi: { ...BOS_KPI, toplam: 40, tamamlanan: 2, atanmamis: 9, bloke: 5, tamamlanmaOrani: 5 },
      trend: trend({ geciken: { bu: 20, onceki: 6 } }),
      ilKirilimi: [
        { il: 'Ankara', toplam: 20, tamamlanan: 1, geciken: 15, oran: 5 },
        { il: 'İzmir', toplam: 10, tamamlanan: 1, geciken: 3, oran: 10 },
        { il: 'Bursa', toplam: 10, tamamlanan: 0, geciken: 0, oran: 0 },
      ] as RaporVerisi['ilKirilimi'],
      yaklasan: Array.from({ length: 20 }, () => ({ baslik: 'x' })) as RaporVerisi['yaklasan'],
      sorumluKirilimi: [{ ad: 'Zx9Qw', il: null, acik: 14, tamamlanan: 1, geciken: 9 }] as RaporVerisi['sorumluKirilimi'],
    })
    expect(yorumUret(girdi(r)).yorumlar.length).toBeLessThanOrEqual(6)
  })

  it('her yorum KANIT taşır — iddia tek başına bırakılmaz', () => {
    const r = rapor({
      kpi: { ...BOS_KPI, toplam: 20, tamamlanan: 2, atanmamis: 5, tamamlanmaOrani: 10 },
      trend: trend({ geciken: { bu: 14, onceki: 6 } }),
    })
    const s = yorumUret(girdi(r))
    expect(s.yorumlar.length).toBeGreaterThan(0)
    s.yorumlar.forEach(y => {
      expect(y.kanit.length, y.id).toBeGreaterThan(0)
      expect(y.cumle.length, y.id).toBeGreaterThan(10)
    })
  })
})

describe('yorumUret — KVKK / kişi adı sızıntısı', () => {
  // Nadir token: gerçek metinde asla geçmeyecek bir dizge
  const TOKEN = 'Zxq7Wvb'

  const RAPOR = rapor({
    kpi: { ...BOS_KPI, toplam: 30, tamamlanan: 3, atanmamis: 4, tamamlanmaOrani: 10 },
    sorumluKirilimi: [
      { ad: TOKEN, il: null, acik: 16, tamamlanan: 2, geciken: 11 },
      { ad: 'Diğer Kişi', il: null, acik: 1, tamamlanan: 3, geciken: 0 },
    ] as RaporVerisi['sorumluKirilimi'],
    risk: {
      skor: 70, seviye: 'high', baslik: 'Kritik durum',
      sinyaller: [{ baslik: `${TOKEN} aşırı yüklü`, detay: `${TOKEN} 11 görevde gecikti`, seviye: 'high', eylem: `${TOKEN} ile görüşün` }],
      iller: [],
    },
  })

  it('kişi bazlı veri AÇIKKEN isim geçebilir', () => {
    const s = yorumUret(girdi(RAPOR, true))
    expect(JSON.stringify(s)).toContain(TOKEN)
  })

  it('kişi bazlı veri KAPALIYKEN token HİÇBİR YERDE geçmez', () => {
    const s = yorumUret(girdi(RAPOR, false, 'yonetim'))
    const metin = JSON.stringify(s)
    expect(metin).not.toContain(TOKEN)
  })

  it('kapalıyken kisiBazli bayraklı kural HİÇ çalıştırılmaz', () => {
    // Metin temizliği değil, kuralın hiç çalışmaması esas.
    const s = yorumUret(girdi(RAPOR, false, 'yonetim'))
    expect(s.yorumlar.some(y => y.kisiBazli)).toBe(false)
  })

  it('kapalıyken de anlamlı bir çıktı üretir — sessiz kalmaz', () => {
    const s = yorumUret(girdi(RAPOR, false, 'yonetim'))
    expect(s.ozet.length).toBeGreaterThan(20)
  })
})

describe('yorumUret — kural davranışları', () => {
  it('küçük gecikme artışını yorum saymaz', () => {
    // 1'den 2'ye çıkışı "kritik" ilan etmek motorun güvenilirliğini bitirir.
    const r = rapor({ kpi: { ...BOS_KPI, toplam: 10, tamamlanan: 5, tamamlanmaOrani: 50 }, trend: trend({ geciken: { bu: 2, onceki: 1 } }) })
    expect(yorumUret(girdi(r)).yorumlar.some(y => y.id === 'gecikme-artisi')).toBe(false)
  })

  it('anlamlı gecikme artışını yakalar', () => {
    const r = rapor({ kpi: { ...BOS_KPI, toplam: 20, tamamlanan: 10, tamamlanmaOrani: 50 }, trend: trend({ geciken: { bu: 14, onceki: 6 } }) })
    expect(yorumUret(girdi(r)).yorumlar.some(y => y.id === 'gecikme-artisi')).toBe(true)
  })

  it('İYİ HABERİ de verir — sadece kötü haber veren ekran kapatılır', () => {
    const r = rapor({ kpi: { ...BOS_KPI, toplam: 20, tamamlanan: 10, tamamlanmaOrani: 50 }, trend: trend({ geciken: { bu: 2, onceki: 9 } }) })
    const s = yorumUret(girdi(r))
    expect(s.yorumlar.some(y => y.onem === 'olumlu')).toBe(true)
  })

  it('gecikme yoğunlaşmasında Türkçe eki doğru kurar', () => {
    const r = rapor({
      kpi: { ...BOS_KPI, toplam: 20, tamamlanan: 10, tamamlanmaOrani: 50 },
      ilKirilimi: [
        { il: 'Uşak', toplam: 10, tamamlanan: 2, geciken: 8, oran: 20 },
        { il: 'İzmir', toplam: 10, tamamlanan: 8, geciken: 2, oran: 80 },
      ] as RaporVerisi['ilKirilimi'],
    })
    const y = yorumUret(girdi(r)).yorumlar.find(x => x.id === 'gecikme-yogunlasmasi')
    expect(y).toBeTruthy()
    expect(y!.cumle).toContain("Uşak'ta")     // "Uşak'da" DEĞİL
    expect(y!.eylem).toContain("Uşak'a")
  })

  it('İl Sorumlusu tonunda BAŞKA il adı geçmez', () => {
    const r = rapor({
      kpi: { ...BOS_KPI, toplam: 20, tamamlanan: 10, tamamlanmaOrani: 50 },
      ilKirilimi: [
        { il: 'Ankara', toplam: 10, tamamlanan: 2, geciken: 8, oran: 20 },
        { il: 'İzmir', toplam: 10, tamamlanan: 8, geciken: 2, oran: 80 },
      ] as RaporVerisi['ilKirilimi'],
    })
    const s = yorumUret({ ...girdi(r), ton: 'il', tekIl: 'Ankara' })
    const y = s.yorumlar.find(x => x.id === 'gecikme-yogunlasmasi')
    expect(y?.cumle).toContain('ilinizde')
  })

  it('sessiz il kuralı SUÇLAMAYAN dil kullanır', () => {
    const r = rapor({
      kpi: { ...BOS_KPI, toplam: 10, tamamlanan: 5, tamamlanmaOrani: 50 },
      ilKirilimi: [{ il: 'Rize', toplam: 5, tamamlanan: 0, geciken: 0, oran: 0 }] as RaporVerisi['ilKirilimi'],
    })
    const y = yorumUret(girdi(r)).yorumlar.find(x => x.id === 'sessiz-il')
    expect(y?.cumle).toContain('olabilir')
  })

  it('veri kalitesi kuralı raporun KENDİ sınırını söyler', () => {
    const r = rapor({
      kpi: { ...BOS_KPI, toplam: 10, tamamlanan: 5, tamamlanmaOrani: 50 },
      hamListe: Array.from({ length: 10 }, (_, i) => ({
        baslik: `g${i}`, durum: 'Yapılıyor', termin: i < 3 ? '2026-09-10' : null,
      })) as RaporVerisi['hamListe'],
    })
    const y = yorumUret(girdi(r)).yorumlar.find(x => x.id === 'veri-kalitesi')
    expect(y).toBeTruthy()
    expect(y!.cumle).toContain('kapsamıyor')
  })

  it('tek bir kural patlasa da diğerleri üretilir', () => {
    // hamListe bilerek bozuk tipte — veriKalitesi kuralı patlamalı
    const r = rapor({
      kpi: { ...BOS_KPI, toplam: 20, tamamlanan: 1, atanmamis: 5, tamamlanmaOrani: 5 },
      hamListe: null as unknown as RaporVerisi['hamListe'],
    })
    const s = yorumUret(girdi(r))
    expect(s.yorumlar.length).toBeGreaterThan(0)
  })
})

describe('tonSec', () => {
  it('role göre doğru ton seçer', () => {
    expect(tonSec('owner')).toBe('operasyon')
    expect(tonSec('admin')).toBe('koordinasyon')
    expect(tonSec('member')).toBe('il')
    expect(tonSec('viewer')).toBe('yonetim')
    expect(tonSec(null)).toBe('yonetim')
  })
})

describe('yorumGirdisiKur', () => {
  it('kapsamdan tekIl ve kisiBazliVeri çıkarır', () => {
    const g = yorumGirdisiKur(rapor(), 'member', { kisiBazliVeri: true, ilFiltresi: ['Ankara'] })
    expect(g.tekIl).toBe('Ankara')
    expect(g.ton).toBe('il')
  })
  it('tüm iller kapsamında tekIl null olur', () => {
    expect(yorumGirdisiKur(rapor(), 'owner', { kisiBazliVeri: true, ilFiltresi: null }).tekIl).toBeNull()
  })
})
