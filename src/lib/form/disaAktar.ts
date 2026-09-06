import { cevapMetni } from './sablon'
import type { Form, FormAlani, FormGonderim, FormYanit } from './tipler'

/**
 * Form cevaplarının tablo hâline getirilmesi — saf, hem Excel hem CSV bunu
 * kullanır.
 *
 * ASIL TASARIM KARARI: "tablo" tipi bir cevap düz bir hücreye sığmaz. Bir
 * yanıtta 20 satırlık malzeme listesi olabilir; bunu tek hücreye
 * "Arduino/12; Sensör/30; ..." diye sıkıştırmak veriyi kullanılamaz hale
 * getirir — Excel'e aktarmanın amacı zaten o satırları süzüp toplamak.
 *
 * Bu yüzden çıktı ÇOK SAYFALI:
 *   "Yanıtlar"        → her satır bir yanıt, tablo soruları "N satır" özeti
 *   "<soru adı>" ...  → her tablo sorusu için ayrı sayfa, her satır bir
 *                       tablo satırı; `Yanıt no` ile ana sayfaya bağlanır
 *
 * CSV tek sayfalıdır, dolayısıyla yalnızca "Yanıtlar" sayfasını taşır;
 * arayüz bunu kullanıcıya söylüyor.
 */

export interface Sayfa {
  ad: string
  basliklar: string[]
  satirlar: unknown[][]
}

/** Excel sayfa adı kuralları: en fazla 31 karakter, `[]:*?/\` yasak. */
export function sayfaAdiTemizle(ham: string, kullanilan: Set<string>): string {
  let ad = ham.replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Sayfa'
  if (!kullanilan.has(ad)) { kullanilan.add(ad); return ad }
  // Çakışmada sona sayı: Excel aynı adda iki sayfayı kabul etmez.
  for (let i = 2; i < 100; i++) {
    const aday = `${ad.slice(0, 28)} ${i}`
    if (!kullanilan.has(aday)) { kullanilan.add(aday); return aday }
  }
  kullanilan.add(ad)
  return ad
}

function tarihMetni(v: string | null | undefined): string {
  if (!v) return ''
  const d = new Date(v)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const DURUM_ETIKET: Record<string, string> = {
  bekliyor: 'Bekliyor', yanitlandi: 'Dolduruldu', iptal: 'İptal',
}

export interface DisaAktarGirdisi {
  form: Form
  gonderimler: FormGonderim[]
  yanitlar: FormYanit[]
  /** user_id → görünen ad. Bilinmeyen id ham bırakılmaz, boş geçilir. */
  adlar?: Record<string, string>
}

/**
 * Ana sayfa + her tablo sorusu için bir sayfa.
 *
 * Yanıtlanmamış gönderimler de listeye GİRER: "kim doldurmadı" sorusu en az
 * "kim ne yazdı" kadar önemli ve yalnızca yanıtları aktarmak bu bilgiyi yok
 * ederdi.
 */
export function yanitSayfalari(g: DisaAktarGirdisi): Sayfa[] {
  const { form, gonderimler, yanitlar, adlar = {} } = g
  const alanlar = (form.alanlar ?? []) as FormAlani[]
  const tabloAlanlari = alanlar.filter(a => a.tip === 'tablo')
  const yanitHaritasi = new Map(yanitlar.map(y => [y.gonderim_id, y]))

  const ad = (id: string | null | undefined) => (id ? adlar[id] ?? '' : '')

  const anaBasliklar = [
    'Yanıt no', 'Durum', 'Alıcı', 'Gönderim tarihi', 'Yanıt tarihi', 'Yanıtlayan',
    ...alanlar.map(a => a.etiket),
    'Oluşan görev',
  ]

  const anaSatirlar: unknown[][] = []
  // Yanıt numarası ana sayfa ile tablo sayfalarını bağlayan tek anahtar;
  // gönderim sırasına göre 1'den başlıyor ki insan gözüyle takip edilebilsin.
  const yanitNoHaritasi = new Map<string, number>()

  gonderimler.forEach((gon, i) => {
    const y = yanitHaritasi.get(gon.id)
    const no = i + 1
    yanitNoHaritasi.set(gon.id, no)

    anaSatirlar.push([
      no,
      DURUM_ETIKET[gon.durum] ?? gon.durum,
      gon.alici_etiket ?? ad(gon.alici_user_id),
      tarihMetni(gon.created_at),
      tarihMetni(y?.created_at),
      // Açık bağlantıyla dolduranın kimliği yoktur; boş bırakmak "anonim"i
      // uydurma bir isimden daha doğru anlatır.
      y ? ad(y.yanitlayan_user_id) : '',
      ...alanlar.map(a => {
        const deger = y?.cevaplar?.[a.id] ?? null
        if (a.tip === 'tablo') {
          const n = Array.isArray(deger) ? deger.length : 0
          return n > 0 ? `${n} satır` : ''
        }
        return cevapMetni(deger, a)
      }),
      y?.olusan_gorev_id ? 'Evet' : '',
    ])
  })

  const sayfalar: Sayfa[] = [{ ad: 'Yanıtlar', basliklar: anaBasliklar, satirlar: anaSatirlar }]

  const kullanilanAdlar = new Set<string>(['Yanıtlar'])
  for (const alan of tabloAlanlari) {
    const sutunlar = alan.sutunlar ?? []
    const satirlar: unknown[][] = []

    for (const gon of gonderimler) {
      const y = yanitHaritasi.get(gon.id)
      const deger = y?.cevaplar?.[alan.id]
      if (!Array.isArray(deger)) continue
      ;(deger as Record<string, string | number | null>[]).forEach((satir, si) => {
        satirlar.push([
          yanitNoHaritasi.get(gon.id) ?? '',
          si + 1,
          ...sutunlar.map(s => satir[s.id] ?? ''),
        ])
      })
    }

    sayfalar.push({
      ad: sayfaAdiTemizle(alan.etiket, kullanilanAdlar),
      basliklar: ['Yanıt no', 'Satır', ...sutunlar.map(s => s.baslik)],
      satirlar,
    })
  }

  return sayfalar
}

/** İndirilecek dosya adı — Türkçe karakterler ve boşluk temizlenir. */
export function dosyaAdi(formBasligi: string, uzanti: 'xlsx' | 'csv'): string {
  const temiz = formBasligi
    .replace(/[İIı]/g, 'i').replace(/[Ğğ]/g, 'g').replace(/[Üü]/g, 'u')
    .replace(/[Şş]/g, 's').replace(/[Öö]/g, 'o').replace(/[Çç]/g, 'c')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'form'
  const gun = new Date().toISOString().slice(0, 10)
  return `${temiz}-${gun}.${uzanti}`
}
