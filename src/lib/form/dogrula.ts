import { secenekGerekirMi, type FormAlani, type Cevaplar, type CevapDegeri, type AlanTipi } from './tipler'

/**
 * Form tanımı ve cevap doğrulaması — saf, sunucuda ZORUNLU.
 *
 * İstemcideki doğrulama kullanıcıya yardım içindir; gerçek kapı burası.
 * Açık bağlantıyla gelen cevaplarda tarayıcı tamamen atlanabileceği için
 * sunucunun istemciye hiç güvenmemesi gerekiyor.
 */

const TIPLER: AlanTipi[] = [
  'metin', 'uzun_metin', 'sayi', 'tarih', 'evet_hayir', 'secim', 'coklu_secim', 'tablo',
]

export const LIMIT = {
  alanSayisi: 60,
  secenekSayisi: 40,
  sutunSayisi: 12,
  tabloSatiri: 200,
  metinUzunluk: 2000,
  uzunMetinUzunluk: 10000,
  etiketUzunluk: 200,
}

export interface Hata { alan: string; mesaj: string }

const bosMu = (v: unknown) =>
  v === null || v === undefined || (typeof v === 'string' && v.trim() === '') ||
  (Array.isArray(v) && v.length === 0)

/**
 * Form TANIMINI doğrular ve temizlenmiş halini döndürür.
 *
 * Alan id'leri burada üretilmiyor; istemci üretiyor ama tekilliği burada
 * kontrol ediliyor — çakışan id'ler cevapların birbirinin üstüne yazmasına
 * yol açardı.
 */
export function tanimDogrula(ham: unknown): { alanlar: FormAlani[]; hatalar: Hata[] } {
  const hatalar: Hata[] = []
  if (!Array.isArray(ham)) return { alanlar: [], hatalar: [{ alan: 'alanlar', mesaj: 'Alan listesi geçersiz.' }] }
  if (ham.length === 0) return { alanlar: [], hatalar: [{ alan: 'alanlar', mesaj: 'Formda en az bir soru olmalı.' }] }
  if (ham.length > LIMIT.alanSayisi) {
    return { alanlar: [], hatalar: [{ alan: 'alanlar', mesaj: `En fazla ${LIMIT.alanSayisi} soru olabilir.` }] }
  }

  const gorulenIdler = new Set<string>()
  const alanlar: FormAlani[] = []

  ham.forEach((h, i) => {
    const g = h as Record<string, unknown>
    const yer = `alan[${i}]`

    const id = typeof g.id === 'string' ? g.id.trim() : ''
    if (!id) { hatalar.push({ alan: yer, mesaj: 'Alan kimliği eksik.' }); return }
    if (gorulenIdler.has(id)) {
      // Çakışan id, cevapların birbirinin üstüne yazması demek.
      hatalar.push({ alan: yer, mesaj: `"${id}" kimliği birden fazla alanda kullanılmış.` }); return
    }
    gorulenIdler.add(id)

    const tip = g.tip as AlanTipi
    if (!TIPLER.includes(tip)) { hatalar.push({ alan: yer, mesaj: 'Bilinmeyen alan tipi.' }); return }

    const etiket = typeof g.etiket === 'string' ? g.etiket.trim() : ''
    if (!etiket) { hatalar.push({ alan: yer, mesaj: 'Soru metni boş olamaz.' }); return }
    if (etiket.length > LIMIT.etiketUzunluk) {
      hatalar.push({ alan: yer, mesaj: `Soru metni ${LIMIT.etiketUzunluk} karakteri aşamaz.` }); return
    }

    const alan: FormAlani = {
      id, tip, etiket,
      aciklama: typeof g.aciklama === 'string' && g.aciklama.trim() ? g.aciklama.trim() : null,
      zorunlu: g.zorunlu === true,
    }

    if (secenekGerekirMi(tip)) {
      const sec = Array.isArray(g.secenekler)
        ? g.secenekler.filter((s): s is string => typeof s === 'string' && s.trim() !== '').map(s => s.trim())
        : []
      if (sec.length === 0) { hatalar.push({ alan: yer, mesaj: 'Seçimli soruda en az bir seçenek olmalı.' }); return }
      if (sec.length > LIMIT.secenekSayisi) { hatalar.push({ alan: yer, mesaj: 'Çok fazla seçenek.' }); return }
      if (new Set(sec).size !== sec.length) { hatalar.push({ alan: yer, mesaj: 'Seçenekler tekrar ediyor.' }); return }
      alan.secenekler = sec
    }

    if (tip === 'tablo') {
      const ham2 = Array.isArray(g.sutunlar) ? g.sutunlar : []
      const sutunlar = ham2
        .map(s => s as Record<string, unknown>)
        .filter(s => typeof s.id === 'string' && typeof s.baslik === 'string' && (s.baslik as string).trim())
        .map(s => ({
          id: (s.id as string).trim(),
          baslik: (s.baslik as string).trim(),
          tip: (['metin', 'sayi', 'tarih'].includes(s.tip as string) ? s.tip : 'metin') as 'metin' | 'sayi' | 'tarih',
        }))
      if (sutunlar.length === 0) { hatalar.push({ alan: yer, mesaj: 'Tablo sorusunda en az bir sütun olmalı.' }); return }
      if (sutunlar.length > LIMIT.sutunSayisi) { hatalar.push({ alan: yer, mesaj: 'Çok fazla sütun.' }); return }
      if (new Set(sutunlar.map(s => s.id)).size !== sutunlar.length) {
        hatalar.push({ alan: yer, mesaj: 'Sütun kimlikleri tekrar ediyor.' }); return
      }
      alan.sutunlar = sutunlar
      const enAz = Number(g.enAzSatir)
      alan.enAzSatir = Number.isFinite(enAz) && enAz > 0 ? Math.min(enAz, LIMIT.tabloSatiri) : 1
    }

    alanlar.push(alan)
  })

  return { alanlar, hatalar }
}

function sayiCevir(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    // Türkçe ondalık ayracı: "12,5" de kabul edilmeli.
    const n = Number(v.trim().replace(',', '.'))
    if (Number.isFinite(n)) return n
  }
  return null
}

const TARIH_DESENI = /^\d{4}-\d{2}-\d{2}$/

/**
 * CEVAPLARI form tanımına göre doğrular ve normalize eder.
 *
 * Tanımda olmayan anahtarlar SESSİZCE ATILIR — istemciden gelen fazladan
 * alanlar veri tabanına sızmamalı.
 */
export function cevaplariDogrula(
  alanlar: FormAlani[], ham: unknown,
): { cevaplar: Cevaplar; hatalar: Hata[] } {
  const hatalar: Hata[] = []
  const gelen = (ham && typeof ham === 'object' && !Array.isArray(ham) ? ham : {}) as Record<string, unknown>
  const cevaplar: Cevaplar = {}

  for (const alan of alanlar) {
    const ham2 = gelen[alan.id]
    let deger: CevapDegeri = null

    switch (alan.tip) {
      case 'metin':
      case 'uzun_metin': {
        const s = typeof ham2 === 'string' ? ham2.trim() : ''
        const sinir = alan.tip === 'metin' ? LIMIT.metinUzunluk : LIMIT.uzunMetinUzunluk
        if (s.length > sinir) hatalar.push({ alan: alan.id, mesaj: `${alan.etiket}: ${sinir} karakteri aşamaz.` })
        deger = s || null
        break
      }
      case 'sayi': {
        if (!bosMu(ham2)) {
          const n = sayiCevir(ham2)
          if (n === null) hatalar.push({ alan: alan.id, mesaj: `${alan.etiket}: geçerli bir sayı değil.` })
          deger = n
        }
        break
      }
      case 'tarih': {
        if (!bosMu(ham2)) {
          const s = String(ham2).slice(0, 10)
          if (!TARIH_DESENI.test(s) || Number.isNaN(Date.parse(s))) {
            hatalar.push({ alan: alan.id, mesaj: `${alan.etiket}: geçerli bir tarih değil.` })
          } else deger = s
        }
        break
      }
      case 'evet_hayir': {
        // Boş bırakılmış olabilir; false ile "cevaplanmadı" ayrımı korunuyor.
        deger = ham2 === true ? true : ham2 === false ? false : null
        break
      }
      case 'secim': {
        if (!bosMu(ham2)) {
          const s = String(ham2)
          if (!alan.secenekler?.includes(s)) {
            hatalar.push({ alan: alan.id, mesaj: `${alan.etiket}: geçersiz seçenek.` })
          } else deger = s
        }
        break
      }
      case 'coklu_secim': {
        const dizi = Array.isArray(ham2) ? ham2.map(String) : []
        const gecersiz = dizi.filter(s => !alan.secenekler?.includes(s))
        if (gecersiz.length) hatalar.push({ alan: alan.id, mesaj: `${alan.etiket}: geçersiz seçenek.` })
        deger = dizi.filter(s => alan.secenekler?.includes(s))
        break
      }
      case 'tablo': {
        const sutunlar = alan.sutunlar ?? []
        const satirlarHam = Array.isArray(ham2) ? ham2 : []
        if (satirlarHam.length > LIMIT.tabloSatiri) {
          hatalar.push({ alan: alan.id, mesaj: `${alan.etiket}: en fazla ${LIMIT.tabloSatiri} satır.` })
        }
        const satirlar = satirlarHam.slice(0, LIMIT.tabloSatiri).map(s => {
          const kaynak = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>
          const satir: Record<string, string | number | null> = {}
          for (const sut of sutunlar) {
            const v = kaynak[sut.id]
            if (sut.tip === 'sayi') satir[sut.id] = bosMu(v) ? null : sayiCevir(v)
            else if (sut.tip === 'tarih') {
              const t = bosMu(v) ? '' : String(v).slice(0, 10)
              satir[sut.id] = TARIH_DESENI.test(t) ? t : null
            } else satir[sut.id] = bosMu(v) ? null : String(v).slice(0, LIMIT.metinUzunluk)
          }
          return satir
        })
        // Tamamen boş satırlar atılıyor: cevaplayan ızgarada fazladan satır
        // bırakmış olabilir, bunlar veri sayılmamalı.
        deger = satirlar.filter(s => Object.values(s).some(v => v !== null && v !== ''))
        break
      }
    }

    if (alan.zorunlu) {
      if (bosMu(deger)) {
        hatalar.push({ alan: alan.id, mesaj: `${alan.etiket}: bu soru zorunlu.` })
      } else if (alan.tip === 'tablo' && Array.isArray(deger) && deger.length < (alan.enAzSatir ?? 1)) {
        hatalar.push({ alan: alan.id, mesaj: `${alan.etiket}: en az ${alan.enAzSatir ?? 1} satır doldurulmalı.` })
      }
    }

    cevaplar[alan.id] = deger
  }

  return { cevaplar, hatalar }
}
