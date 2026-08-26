import { trFold } from '@/lib/turkce'
import { IL_SECENEKLERI } from '@/lib/iller'
import { TASK_TYPE_VALUES } from '@/lib/taskTypes'
import type { TaskStatus, TaskPriority, TaskType } from '@/types/database'

/**
 * Excel/CSV hücrelerini uygulamanın enum'larına çeviren saf fonksiyonlar.
 *
 * İçe aktarmada hataların büyük kısmı burada doğar, bu yüzden hepsi
 * bağımsız test edilebilir olacak şekilde saf tutuldu.
 *
 * Ortak dönüş sözleşmesi:
 *   guven='kesin'  → doğrudan uygulanır
 *   guven='tahmin' → uygulanır ama önizlemede sarı, kullanıcı düzeltebilir
 *   guven='yok'    → değer bulunamadı; `value` null veya varsayılan
 */

export type Guven = 'kesin' | 'tahmin' | 'yok'

export interface NormSonuc<T> {
  value: T | null
  guven: Guven
  uyari?: string
  /** Kullanıcıya sunulacak alternatifler (belirsiz il eşleşmesi gibi) */
  oneriler?: string[]
}

function bos(raw: unknown): boolean {
  return raw === null || raw === undefined || String(raw).trim() === ''
}

/* ── Durum ─────────────────────────────────────────────────────────────── */

const DURUM_SOZLUK: Record<string, TaskStatus> = {}
const durumEkle = (s: TaskStatus, ...kelimeler: string[]) =>
  kelimeler.forEach(k => { DURUM_SOZLUK[trFold(k)] = s })

durumEkle('backlog', 'beklemede', 'bekliyor', 'başlanmadı', 'baslanmadi', 'başlamadı',
  'yapılacak', 'yapilacak', 'açık', 'acik', 'planlandı', 'planlandi', 'todo', 'yeni', 'sırada', 'sirada')
durumEkle('doing', 'devam ediyor', 'yapılıyor', 'yapiliyor', 'başladı', 'basladi',
  'işlemde', 'islemde', 'sürüyor', 'suruyor', 'in progress', 'wip', 'çalışılıyor', 'calisiliyor')
durumEkle('testing', 'test', 'testte', 'test aşaması', 'test asamasi', 'kontrol',
  'kontrolde', 'onayda', 'doğrulama', 'dogrulama', 'inceleme')
durumEkle('blocked', 'bloke', 'engellendi', 'durduruldu', 'askıda', 'askida', 'beklemede (engel)')
durumEkle('done', 'tamamlandı', 'tamamlandi', 'bitti', 'tamam', 'kapandı', 'kapandi',
  'yapıldı', 'yapildi', 'done', 'bitirildi', 'teslim edildi')

/** "Gecikti" bir durum DEĞİL — türetilmiş bir sıfat, ayrıca işaretlenir */
const GECIKME_KELIMELERI = new Set(
  ['gecikti', 'gecikmiş', 'gecikmis', 'geç kaldı', 'gec kaldi', 'gecikme', 'overdue']
    .map(trFold),
)

export interface DurumSonuc extends NormSonuc<TaskStatus> {
  /**
   * Hücrede "Gecikti" yazıyordu. Bu bir durum olmadığı için `doing`'e
   * çevrildi; gecikmiş görünmesi termin tarihinin geçmiş olmasına bağlı.
   */
  gecikmeIsareti?: boolean
}

export function normDurum(raw: unknown): DurumSonuc {
  if (bos(raw)) return { value: 'backlog', guven: 'yok' }
  const k = trFold(String(raw))

  if (GECIKME_KELIMELERI.has(k)) {
    return {
      value: 'doing',
      guven: 'tahmin',
      gecikmeIsareti: true,
      uyari: '"Gecikti" bir durum değil, termin tarihinden hesaplanır. Görev "Yapılıyor" olarak alındı.',
    }
  }

  const eslesme = DURUM_SOZLUK[k]
  if (eslesme) return { value: eslesme, guven: 'kesin' }

  // "%100", "100%" gibi tamamlanma ifadeleri
  if (/^%?\s*100\s*%?$/.test(k)) return { value: 'done', guven: 'tahmin' }

  return {
    value: 'backlog',
    guven: 'yok',
    uyari: `Durum tanınmadı ("${String(raw).trim()}") — "Beklemede" olarak alındı.`,
  }
}

/* ── Öncelik ───────────────────────────────────────────────────────────── */

const ONCELIK_SOZLUK: Record<string, TaskPriority> = {}
const oncelikEkle = (p: TaskPriority, ...kelimeler: string[]) =>
  kelimeler.forEach(k => { ONCELIK_SOZLUK[trFold(k)] = p })

oncelikEkle('critical', 'kritik', 'acil', 'çok acil', 'cok acil', 'çok yüksek', 'cok yuksek', 'critical', 'p1')
oncelikEkle('high', 'yüksek', 'yuksek', 'önemli', 'onemli', 'high', 'p2')
oncelikEkle('normal', 'orta', 'normal', 'standart', 'medium', 'p3')
oncelikEkle('low', 'düşük', 'dusuk', 'az', 'low', 'p4')

const SAYI_SIRASI: TaskPriority[] = ['critical', 'high', 'normal', 'low']

export function normOncelik(
  raw: unknown,
  opts: { birEnYuksek?: boolean } = {},
): NormSonuc<TaskPriority> {
  if (bos(raw)) return { value: 'normal', guven: 'yok' }
  const k = trFold(String(raw))

  const eslesme = ONCELIK_SOZLUK[k]
  if (eslesme) return { value: eslesme, guven: 'kesin' }

  // Salt sayı: 1-4. Yönü kullanıcı belirler (1 en yüksek mi, en düşük mü)
  const sayi = Number(k)
  if (Number.isInteger(sayi) && sayi >= 1 && sayi <= 4) {
    const birEnYuksek = opts.birEnYuksek ?? true
    const idx = birEnYuksek ? sayi - 1 : 4 - sayi
    return { value: SAYI_SIRASI[idx], guven: 'tahmin' }
  }

  return {
    value: 'normal',
    guven: 'yok',
    uyari: `Öncelik tanınmadı ("${String(raw).trim()}") — "Normal" olarak alındı.`,
  }
}

/* ── Kategori ──────────────────────────────────────────────────────────── */

const KATEGORI_SOZLUK: Record<string, TaskType> = {}
const katEkle = (t: TaskType, ...kelimeler: string[]) =>
  kelimeler.forEach(k => { KATEGORI_SOZLUK[trFold(k)] = t })

katEkle('mechanical', 'mekanik', 'makine', 'mekanik tasarım', 'imalat', 'montaj')
katEkle('electrical', 'elektronik', 'elektrik', 'donanım', 'donanim', 'devre', 'kablolama')
katEkle('software', 'yazılım', 'yazilim', 'kod', 'software', 'programlama', 'geliştirme', 'gelistirme')
katEkle('training', 'eğitim', 'egitim', 'kurs', 'atölye', 'atolye', 'ders', 'seminer', 'workshop')
katEkle('event', 'etkinlik', 'organizasyon', 'tanıtım', 'tanitim', 'fuar', 'gösteri', 'gosteri', 'yarışma', 'yarisma')
katEkle('supply', 'malzeme', 'tedarik', 'satınalma', 'satinalma', 'lojistik', 'sarf', 'stok', 'malzeme & tedarik')
katEkle('admin', 'idari', 'yönetim', 'yonetim', 'insan kaynakları', 'insan kaynaklari', 'evrak', 'yazışma', 'yazisma')
katEkle('reporting', 'rapor', 'raporlama', 'analiz', 'istatistik', 'değerlendirme', 'degerlendirme')
katEkle('other', 'diğer', 'diger', 'genel', 'other')

export function normKategori(raw: unknown): NormSonuc<TaskType> {
  if (bos(raw)) return { value: 'other', guven: 'yok' }
  const k = trFold(String(raw))

  const eslesme = KATEGORI_SOZLUK[k]
  if (eslesme) return { value: eslesme, guven: 'kesin' }

  // Enum değerinin kendisi yazılmış olabilir ("software")
  if ((TASK_TYPE_VALUES as string[]).includes(k)) {
    return { value: k as TaskType, guven: 'kesin' }
  }

  return {
    value: 'other',
    guven: 'yok',
    uyari: `Kategori tanınmadı ("${String(raw).trim()}") — "Diğer" olarak alındı.`,
  }
}

/* ── İl / Birim ────────────────────────────────────────────────────────── */

const IL_HARITASI: Record<string, string> = Object.fromEntries(
  IL_SECENEKLERI.map(il => [trFold(il), il]),
)

/** Yaygın kısaltma ve eski adlar */
const IL_TAKMA_ADLAR: Record<string, string> = Object.fromEntries(
  Object.entries({
    'afyon': 'Afyonkarahisar',
    'urfa': 'Şanlıurfa',
    'maraş': 'Kahramanmaraş',
    'k.maraş': 'Kahramanmaraş',
    'antep': 'Gaziantep',
    'g.antep': 'Gaziantep',
    'içel': 'Mersin',
    'merkez': 'Genel Merkez',
    'gm': 'Genel Merkez',
    'genel müdürlük': 'Genel Merkez',
    'genel merkez': 'Genel Merkez',
    'ankara merkez': 'Genel Merkez',
  }).map(([k, v]) => [trFold(k), v]),
)

/** Levenshtein — yalnızca kısa il adları için, maliyeti önemsiz */
function mesafe(a: string, b: string): number {
  const m = a.length, n = b.length
  if (Math.abs(m - n) > 2) return 99
  let onceki = Array.from({ length: n + 1 }, (_, i) => i)
  for (let i = 1; i <= m; i++) {
    const simdi = [i]
    for (let j = 1; j <= n; j++) {
      simdi[j] = Math.min(
        onceki[j] + 1,
        simdi[j - 1] + 1,
        onceki[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    onceki = simdi
  }
  return onceki[n]
}

export function normIl(raw: unknown): NormSonuc<string> {
  if (bos(raw)) return { value: null, guven: 'yok' }
  const ham = String(raw).trim()
  const k = trFold(ham)

  if (IL_HARITASI[k])     return { value: IL_HARITASI[k], guven: 'kesin' }
  if (IL_TAKMA_ADLAR[k])  return { value: IL_TAKMA_ADLAR[k], guven: 'kesin' }

  // Yakın yazımlar — otomatik kabul EDİLMEZ, kullanıcıya sorulur
  const yakinlar = IL_SECENEKLERI
    .map(il => ({ il, d: mesafe(k, trFold(il)) }))
    .filter(x => x.d <= 2)
    .sort((a, b) => a.d - b.d)

  if (yakinlar.length === 1) {
    return {
      value: yakinlar[0].il,
      guven: 'tahmin',
      uyari: `"${ham}" → "${yakinlar[0].il}" olarak yorumlandı.`,
      oneriler: [yakinlar[0].il],
    }
  }
  if (yakinlar.length > 1) {
    return {
      value: null,
      guven: 'yok',
      uyari: `"${ham}" birden fazla ile benziyor — seçim yapın.`,
      oneriler: yakinlar.slice(0, 4).map(x => x.il),
    }
  }

  return {
    value: null,
    guven: 'yok',
    uyari: `İl tanınmadı: "${ham}".`,
  }
}

/* ── Tarih ─────────────────────────────────────────────────────────────── */

const TR_AYLAR: Record<string, number> = Object.fromEntries(
  ['ocak', 'şubat', 'mart', 'nisan', 'mayıs', 'haziran',
   'temmuz', 'ağustos', 'eylül', 'ekim', 'kasım', 'aralık']
    .map((ay, i) => [trFold(ay), i + 1]),
)

/**
 * Tarihi YYYY-MM-DD'ye çevirir.
 *
 * ÖNEMLİ: `toISOString()` KULLANILMAZ. `due_date` bir `date` kolonu ve
 * UTC+3'te toISOString bir gün geri kaydırır (1 Eylül → 31 Ağustos).
 * Yerel bileşenlerden string kuruluyor.
 *
 * Türkçe formatta gün önce gelir: 03/04/2026 = 3 Nisan. `MM/dd` asla
 * varsayılmaz — bu varsayım kullanıcıya önizlemede açıkça yazılır.
 */
export function normTarih(raw: unknown): NormSonuc<string> {
  if (bos(raw)) return { value: null, guven: 'yok' }

  if (raw instanceof Date && !isNaN(raw.getTime())) {
    return { value: tariheCevir(raw), guven: 'kesin' }
  }

  const ham = String(raw).trim()

  // Excel seri numarası (1900 epoch, Excel'in 1900'ü artık yıl sayma hatası dahil)
  if (/^\d{5}$/.test(ham)) {
    const seri = Number(ham)
    const ms = (seri - 25569) * 86400 * 1000
    const d = new Date(ms)
    // UTC bileşenlerinden oku: seri numarası saat dilimi taşımaz
    return {
      value: `${d.getUTCFullYear()}-${iki(d.getUTCMonth() + 1)}-${iki(d.getUTCDate())}`,
      guven: 'tahmin',
    }
  }

  // YYYY-MM-DD
  let m = ham.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (m) return kur(+m[1], +m[2], +m[3], ham)

  // dd.MM.yyyy | dd/MM/yyyy | dd-MM-yyyy  (gün önce — Türkçe format)
  m = ham.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/)
  if (m) {
    const yil = m[3].length === 2 ? 2000 + +m[3] : +m[3]
    return kur(yil, +m[2], +m[1], ham)
  }

  // "3 Nisan 2026"
  m = ham.match(/^(\d{1,2})\s+([^\s\d]+)\s+(\d{4})$/)
  if (m) {
    const ay = TR_AYLAR[trFold(m[2])]
    if (ay) return kur(+m[3], ay, +m[1], ham)
  }

  return { value: null, guven: 'yok', uyari: `Tarih okunamadı: "${ham}".` }
}

function iki(n: number): string { return String(n).padStart(2, '0') }

function tariheCevir(d: Date): string {
  return `${d.getFullYear()}-${iki(d.getMonth() + 1)}-${iki(d.getDate())}`
}

function kur(yil: number, ay: number, gun: number, ham: string): NormSonuc<string> {
  if (ay < 1 || ay > 12 || gun < 1 || gun > 31 || yil < 1900 || yil > 2200) {
    return { value: null, guven: 'yok', uyari: `Geçersiz tarih: "${ham}".` }
  }
  // 31 Şubat gibi taşan tarihleri yakala
  const d = new Date(yil, ay - 1, gun)
  if (d.getMonth() !== ay - 1 || d.getDate() !== gun) {
    return { value: null, guven: 'yok', uyari: `Geçersiz tarih: "${ham}".` }
  }
  return { value: `${yil}-${iki(ay)}-${iki(gun)}`, guven: 'kesin' }
}

/* ── Süre (saat) ───────────────────────────────────────────────────────── */

export function normSaat(raw: unknown): NormSonuc<number> {
  if (bos(raw)) return { value: null, guven: 'yok' }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return { value: raw, guven: 'kesin' }
  }

  const ham = String(raw).trim()

  // "1 gün", "2 hafta" — belirsiz, kullanıcı netleştirmeli
  if (/gün|gun|hafta|ay\b/i.test(ham)) {
    return { value: null, guven: 'yok', uyari: `Süre saat cinsinden olmalı: "${ham}".` }
  }

  // "7,5 saat" → 7.5   (Türkçe ondalık virgülü)
  const temiz = ham.replace(/saat|sa\.?|hour|h\b/gi, '').replace(',', '.').trim()
  const sayi = Number(temiz)
  if (Number.isFinite(sayi) && sayi >= 0 && sayi <= 9999) {
    return { value: sayi, guven: temiz === ham ? 'kesin' : 'tahmin' }
  }

  return { value: null, guven: 'yok', uyari: `Süre okunamadı: "${ham}".` }
}
