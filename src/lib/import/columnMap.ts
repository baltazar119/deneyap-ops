import { trFold } from '@/lib/turkce'

/**
 * Excel sütun başlıklarını uygulamanın alanlarına eşler.
 *
 * Kullanıcıların elindeki dosyalar standart değil — "Görev", "Faaliyet",
 * "İş Tanımı" hepsi aynı şeyi kastediyor olabilir. Otomatik eşleme bir
 * ÖNERİdir; kullanıcı önizleme adımında düzeltebilir.
 */

export type AlanAnahtari =
  | 'title' | 'description' | 'il' | 'deneyap' | 'assignee' | 'status' | 'priority'
  | 'task_type' | 'start_date' | 'due_date' | 'estimated_hours' | 'external_key'

export interface HedefAlan {
  key: AlanAnahtari
  label: string
  zorunlu: boolean
  /** trFold edilmiş hâlleriyle karşılaştırılır */
  aliases: string[]
}

export const HEDEF_ALANLAR: HedefAlan[] = [
  { key: 'title', label: 'Görev Başlığı', zorunlu: true, aliases: [
    'gorev', 'gorev basligi', 'gorev adi', 'baslik', 'is', 'is tanimi', 'faaliyet',
    'konu', 'aciklama basligi', 'task', 'title', 'yapilacak is', 'calisma' ] },
  { key: 'description', label: 'Açıklama', zorunlu: false, aliases: [
    'aciklama', 'detay', 'not', 'notlar', 'description', 'ayrinti', 'icerik' ] },
  { key: 'il', label: 'İl / Birim', zorunlu: false, aliases: [
    'il', 'sehir', 'il birim', 'il/birim', 'lokasyon', 'bolge', 'merkez',
    'il adi', 'birim' ] },
  // 'atolye' bu listeden ÇIKARILDI, artık 'deneyap' alanına ait.
  // 'birim' ve 'merkez' bilerek BURADA KALDI: alanın etiketi zaten
  // "İl / Birim" ve 'merkez' "Genel Merkez" takma adını taşıyor. İkisini
  // taşımak, "Birim" başlıklı sütunu olan mevcut dosyaların il verisini
  // koparırdı.
  { key: 'deneyap', label: 'DENEYAP', zorunlu: false, aliases: [
    'deneyap', 'deneyap adi', 'deneyap atolyesi', 'deneyap birimi',
    'atolye', 'atolye adi', 'atolyesi', 'atolye/merkez' ] },
  { key: 'assignee', label: 'Sorumlu', zorunlu: false, aliases: [
    'sorumlu', 'atanan', 'gorevli', 'kisi', 'personel', 'sorumlu kisi',
    'e-posta', 'eposta', 'mail', 'email', 'sorumlu eposta', 'ilgili kisi' ] },
  { key: 'status', label: 'Durum', zorunlu: false, aliases: [
    'durum', 'statu', 'status', 'ilerleme', 'asama', 'gerceklesme' ] },
  { key: 'priority', label: 'Öncelik', zorunlu: false, aliases: [
    'oncelik', 'aciliyet', 'onem', 'priority', 'onem derecesi' ] },
  { key: 'task_type', label: 'Kategori', zorunlu: false, aliases: [
    'kategori', 'tur', 'tip', 'alan', 'category', 'gorev turu', 'is turu' ] },
  { key: 'start_date', label: 'Başlangıç Tarihi', zorunlu: false, aliases: [
    'baslangic', 'baslangic tarihi', 'start', 'start date', 'baslama tarihi' ] },
  { key: 'due_date', label: 'Termin Tarihi', zorunlu: false, aliases: [
    'termin', 'termin tarihi', 'son tarih', 'bitis', 'bitis tarihi', 'deadline',
    'hedef tarih', 'teslim', 'teslim tarihi', 'due date' ] },
  { key: 'estimated_hours', label: 'Tahmini Süre (saat)', zorunlu: false, aliases: [
    'tahmini sure', 'sure', 'saat', 'tahmini saat', 'efor', 'is yuku' ] },
  { key: 'external_key', label: 'Kod / Referans', zorunlu: false, aliases: [
    'kod', 'no', 'sira', 'sira no', 'referans', 'id', 'gorev no', 'gorev kodu' ] },
]

export interface EslemeOnerisi {
  /** Excel'deki sütun başlığı (ham hâli) */
  sutun: string
  alan: AlanAnahtari | null
  /** 0-100 */
  guven: number
  sebep: string
}

export type Esleme = Record<string, AlanAnahtari | null>

/** Levenshtein — kısa başlıklar için, maliyeti önemsiz */
function mesafe(a: string, b: string): number {
  const m = a.length, n = b.length
  if (Math.abs(m - n) > 2) return 99
  let onceki = Array.from({ length: n + 1 }, (_, i) => i)
  for (let i = 1; i <= m; i++) {
    const simdi = [i]
    for (let j = 1; j <= n; j++) {
      simdi[j] = Math.min(onceki[j] + 1, simdi[j - 1] + 1,
        onceki[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    onceki = simdi
  }
  return onceki[n]
}

interface Aday { alan: AlanAnahtari; guven: number; sebep: string }

function enIyiAday(baslik: string, onceki?: Esleme): Aday | null {
  const k = trFold(baslik).replace(/[*:()]/g, '').trim()
  if (!k) return null

  // Kullanıcı daha önce bu sütunu elle eşlediyse ona güven.
  //
  // GERİYE DÖNÜK KORUMA — bu satır kasıtlı olarak alias kontrolünden ÖNCE:
  // "Atölye" başlıklı sütun eskiden 'il' alanına eşleniyordu, artık
  // 'deneyap'a eşleniyor. Daha önce içe aktarma yapmış bir org'un
  // `import_column_presets` hafızası "Atölye" → 'il' diyorsa o eşleme
  // AYNEN korunur; o org'un eşleştirme anahtarı (fingerprint) hiç değişmez
  // ve aynı dosya ikinci kez yüklendiğinde kopya görev oluşmaz.
  // Preset'leri yeni alana MIGRATE ETMEYİN.
  const gecmis = onceki?.[baslik]
  if (gecmis) return { alan: gecmis, guven: 100, sebep: 'Önceki içe aktarmada bu şekilde eşlenmişti' }

  const adaylar: Aday[] = []

  for (const alan of HEDEF_ALANLAR) {
    if (trFold(alan.label).replace(/[*:()]/g, '').trim() === k) {
      adaylar.push({ alan: alan.key, guven: 100, sebep: 'Başlık birebir eşleşti' })
      continue
    }
    for (const a of alan.aliases) {
      const af = trFold(a)
      if (af === k) { adaylar.push({ alan: alan.key, guven: 90, sebep: `"${a}" ile eşleşti` }); break }
    }
  }
  if (adaylar.length) return adaylar.sort((x, y) => y.guven - x.guven)[0]

  // Alt dizgi: "gorev basligi (zorunlu)" → "gorev basligi"
  for (const alan of HEDEF_ALANLAR) {
    for (const a of alan.aliases) {
      const af = trFold(a)
      if (af.length >= 3 && (k.includes(af) || af.includes(k))) {
        adaylar.push({ alan: alan.key, guven: 70, sebep: `"${a}" ifadesini içeriyor` })
        break
      }
    }
  }
  if (adaylar.length) return adaylar.sort((x, y) => y.guven - x.guven)[0]

  // Yazım hatası toleransı — yalnızca yeterince uzun başlıklarda
  if (k.length >= 5) {
    for (const alan of HEDEF_ALANLAR) {
      for (const a of alan.aliases) {
        if (mesafe(k, trFold(a)) <= 2) {
          adaylar.push({ alan: alan.key, guven: 60, sebep: `"${a}" ile benzer yazım` })
          break
        }
      }
    }
  }

  return adaylar.length ? adaylar.sort((x, y) => y.guven - x.guven)[0] : null
}

/**
 * Başlık satırından eşleme önerisi üretir.
 *
 * Aynı hedef alana iki sütun düşerse yüksek güvenli olan kazanır, diğeri
 * `null`'a düşer — yoksa ikinci sütun birincinin değerini ezerdi.
 */
export function otomatikEsle(basliklar: string[], onceki?: Esleme): EslemeOnerisi[] {
  const oneriler: EslemeOnerisi[] = basliklar.map(sutun => {
    const aday = enIyiAday(sutun, onceki)
    return aday
      ? { sutun, alan: aday.alan, guven: aday.guven, sebep: aday.sebep }
      : { sutun, alan: null, guven: 0, sebep: 'Eşleşme bulunamadı — elle seçin' }
  })

  const sahipli = new Map<AlanAnahtari, number>()
  oneriler.forEach((o, i) => {
    if (!o.alan) return
    const mevcut = sahipli.get(o.alan)
    if (mevcut === undefined) { sahipli.set(o.alan, i); return }
    // Çakışma: düşük güvenli olanı serbest bırak
    const kaybeden = oneriler[mevcut].guven >= o.guven ? i : mevcut
    const kazanan  = kaybeden === i ? mevcut : i
    oneriler[kaybeden] = {
      ...oneriler[kaybeden],
      alan: null,
      guven: 0,
      sebep: `"${oneriler[kazanan].sutun}" sütunu bu alana eşlendi — bunu elle seçin`,
    }
    sahipli.set(o.alan, kazanan)
  })

  return oneriler
}

/** Zorunlu alanlar eşlenmiş mi */
export function eksikZorunluAlanlar(esleme: Esleme): HedefAlan[] {
  const eslenen = new Set(Object.values(esleme).filter(Boolean))
  return HEDEF_ALANLAR.filter(a => a.zorunlu && !eslenen.has(a.key))
}
