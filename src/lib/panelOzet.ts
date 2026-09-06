import { gecikmisMi, yaklasanMi } from '@/lib/gorevTermin'
import { trCompare } from '@/lib/turkce'
import type { Task, Deneyap, Meeting } from '@/types/database'

/**
 * Panelin özet hesapları — saf fonksiyonlar.
 *
 * Panel bugüne kadar yalnızca KPI sayıları ve ekip listesi gösteriyordu;
 * `priority` alanı panelde hiç kullanılmıyordu. Faz 6'da eklenen dört blok
 * (yaklaşan terminler, il/DENEYAP tablosu, kritik+gecikmiş, son hareketler)
 * buradaki fonksiyonlardan besleniyor.
 *
 * Bileşenlerden ayrı tutuluyor ki sıralama ve eşik kararları test edilebilsin.
 */

/** Panelde bir blokta gösterilecek en fazla satır. */
export const PANEL_LIMIT = 6

const ONCELIK_SIRASI: Record<string, number> = { critical: 0, high: 1, normal: 2, low: 3 }

function terminZamani(t: Pick<Task, 'due_date'>): number {
  // Terminsiz görevler sona; `Infinity` sıralamayı bozmadan bunu sağlar.
  return t.due_date ? Date.parse(t.due_date) : Number.POSITIVE_INFINITY
}

/**
 * Önümüzdeki 7 gün içinde termini dolan açık görevler, en yakın önce.
 *
 * "Bu hafta neye yetişmem gerekiyor" sorusunun cevabı. Gecikmişleri BURAYA
 * KOYMUYORUZ — onların ayrı bir bloğu var ve ikisini karıştırmak "yaklaşan"
 * listesini geçmişle doldururdu.
 */
export function yaklasanTerminler<T extends Task>(gorevler: T[], limit = PANEL_LIMIT): T[] {
  return gorevler
    .filter(yaklasanMi)
    .sort((a, b) => terminZamani(a) - terminZamani(b))
    .slice(0, limit)
}

/**
 * Kritik ve gecikmiş görevler — "şu an neyin alarmı çalıyor".
 *
 * İki küme birleştiriliyor: kritik öncelikli AÇIK görevler + termini geçmiş
 * görevler. Sıralama önce öncelik, sonra termin: gecikmiş bir "düşük" görev,
 * henüz gecikmemiş bir "kritik" görevin üstüne çıkmamalı.
 */
export function kritikVeGecikmis<T extends Task>(gorevler: T[], limit = PANEL_LIMIT): T[] {
  return gorevler
    .filter(t => t.status !== 'done' && (t.priority === 'critical' || gecikmisMi(t)))
    .sort((a, b) => {
      const o = (ONCELIK_SIRASI[a.priority ?? 'normal'] ?? 2) - (ONCELIK_SIRASI[b.priority ?? 'normal'] ?? 2)
      if (o !== 0) return o
      return terminZamani(a) - terminZamani(b)
    })
    .slice(0, limit)
}

export interface KirilimSatiri {
  /** DENEYAP varsa onun id'si, yoksa il adı — satırın kimliği. */
  anahtar: string
  etiket: string
  /** DENEYAP satırında ilin adı; il satırında null. */
  altEtiket: string | null
  toplam: number
  acik: number
  geciken: number
  tamamlanan: number
}

/**
 * İl / DENEYAP durum tablosu.
 *
 * DENEYAP'ı olan görevler DENEYAP satırında, olmayanlar kendi ili altında
 * toplanıyor. İkisini tek tabloda göstermek bilinçli: bir org'un bir kısmı
 * DENEYAP'a geçmiş, bir kısmı geçmemiş olabilir ve "DENEYAP'a bağlanmamış
 * işler" görünmezleşmemeli.
 *
 * Sıralama: önce geciken sayısı (dikkat isteyen üstte), sonra Türkçe alfabe.
 */
export function ilDeneyapKirilimi(
  gorevler: Task[], deneyaplar: Deneyap[], limit = PANEL_LIMIT,
): KirilimSatiri[] {
  const deneyapHaritasi = new Map(deneyaplar.map(d => [d.id, d]))
  const gruplar = new Map<string, KirilimSatiri>()

  for (const t of gorevler) {
    const d = t.deneyap_id ? deneyapHaritasi.get(t.deneyap_id) : undefined
    const anahtar = d ? d.id : (t.il ?? '__ilsiz__')
    const etiket = d ? d.ad : (t.il ?? 'İl atanmamış')
    const altEtiket = d ? d.il : null

    let satir = gruplar.get(anahtar)
    if (!satir) {
      satir = { anahtar, etiket, altEtiket, toplam: 0, acik: 0, geciken: 0, tamamlanan: 0 }
      gruplar.set(anahtar, satir)
    }
    satir.toplam++
    if (t.status === 'done') satir.tamamlanan++
    else satir.acik++
    if (gecikmisMi(t)) satir.geciken++
  }

  return [...gruplar.values()]
    .sort((a, b) => (b.geciken - a.geciken) || trCompare(a.etiket, b.etiket))
    .slice(0, limit)
}

/**
 * Son hareketler — en son güncellenen görevler.
 *
 * Gerçek bir denetim kaydı yok (bilinçli: günlük özet yaklaşımı seçildi),
 * elimizdeki en iyi sinyal `updated_at`. Bu yüzden "son hareketler" değil
 * "son dokunulan işler" anlamına geliyor; başlık buna göre yazılmalı.
 */
export function sonHareketler<T extends Task>(gorevler: T[], limit = PANEL_LIMIT): T[] {
  return [...gorevler]
    .sort((a, b) => Date.parse(b.updated_at ?? b.created_at) - Date.parse(a.updated_at ?? a.created_at))
    .slice(0, limit)
}

/** Yaklaşan toplantılar — şu andan sonrası, en yakın önce. */
export function yaklasanToplantilar(
  toplantilar: Meeting[], simdi: Date = new Date(), limit = PANEL_LIMIT,
): Meeting[] {
  const t = simdi.getTime()
  return toplantilar
    .filter(m => m.status !== 'ended' && Date.parse(m.start_time) >= t)
    .sort((a, b) => Date.parse(a.start_time) - Date.parse(b.start_time))
    .slice(0, limit)
}
