import { taskTypeLabel } from '@/lib/taskTypes'
import { trCompare } from '@/lib/turkce'
import { yerelGun } from './donem'
import type { RaporKapsami } from './kapsam'
import type { Task, OrgRole } from '@/types/database'

/**
 * Rapor verisini hesaplar. SAF fonksiyon — veritabanına bakmaz, testlidir.
 *
 * PDF, Excel, CSV ve e-posta hepsi bu tek çıktıyı kullanır; formatlar arası
 * sayı tutarsızlığı olmasın diye.
 */

export interface Donem {
  baslangic: string   // YYYY-MM-DD
  bitis: string       // YYYY-MM-DD
  etiket: string
}

export interface IlSatiri {
  il: string
  toplam: number
  tamamlanan: number
  devamEden: number
  geciken: number
  oran: number        // 0-100
}

export interface SorumluSatiri {
  ad: string
  il: string | null
  acik: number
  tamamlanan: number
  geciken: number
}

export interface TurSatiri {
  tur: string
  etiket: string
  toplam: number
  tamamlanan: number
}

export interface GorevSatiri {
  baslik: string
  il: string | null
  sorumlu: string | null
  durum: string
  oncelik: string
  tur: string
  termin: string | null
  gecikmeGunu: number | null
}

export interface RaporVerisi {
  meta: {
    orgAd: string
    raporAdi: string
    donem: Donem
    uretimTarihi: string
    uretenAd: string
    uretenRolAdi: string
    kapsamEtiketi: string
    bolumler: string[]
  }
  kpi: {
    toplam: number
    tamamlanan: number
    devamEden: number
    bekleyen: number
    bloke: number
    geciken: number
    atanmamis: number
    tamamlanmaOrani: number
    ortalamaGecikmeGunu: number
  }
  ilKirilimi: IlSatiri[]
  sorumluKirilimi: SorumluSatiri[]
  turKirilimi: TurSatiri[]
  gecikmeler: GorevSatiri[]
  yaklasan: GorevSatiri[]
  hamListe: GorevSatiri[]
  /**
   * Operasyon Riski özeti. `hesapla` SAF olduğu ve risk hesabı sprint+üye
   * verisi de istediği için burada üretilmez; sunucu katmanı (rapor/veri.ts)
   * doldurur. Kapsamda 'risk' yoksa null kalır.
   */
  risk: RaporRiskOzeti | null
  /**
   * Zaman serisi. Saf hesaplayıcı DB'ye bakmadığı için burada üretilmez;
   * sunucu katmanı (rapor/veri.ts) doldurur. Kapsamda 'trend' yoksa null.
   */
  trend: RaporTrend | null
  /**
   * Kural tabanlı yorumlar. Saf hesaplayıcı bunları üretmez (yorum motoru
   * risk ve trend'e de bakıyor); sunucu katmanı doldurur.
   */
  yorum: RaporYorum | null
}

export interface RaporYorum {
  ozet: string
  maddeler: {
    onem: 'kritik' | 'uyari' | 'bilgi' | 'olumlu'
    baslik: string
    cumle: string
    eylem: string | null
    kanit: { etiket: string; deger: string | number }[]
  }[]
}

export interface RaporTrend {
  noktalar: {
    etiket: string
    acik: number
    geciken: number
    olusturulan: number
    tamamlanan: number
    bloke: number | null
    atanmamis: number | null
    turetilmis: boolean
  }[]
  /** Serinin tamamı görev tarihlerinden mi türetildi (hiç ölçüm yok) */
  tamamenTuretilmis: boolean
  karsilastirma: {
    acik: TrendKarsilastirma
    geciken: TrendKarsilastirma
    tamamlanan: TrendKarsilastirma
  } | null
}

export interface TrendKarsilastirma {
  bu: number
  onceki: number
  fark: number
  yuzde: number | null
  yon: 'artis' | 'azalis' | 'sabit'
  guvenilir: boolean
  metin: string
}

export interface RaporRiskOzeti {
  skor: number
  seviye: 'low' | 'medium' | 'high'
  baslik: string
  sinyaller: { baslik: string; detay: string; seviye: string; eylem: string }[]
  iller: { il: string; skor: number; seviye: string; acik: number; geciken: number }[]
}

export interface HesapGirdisi {
  gorevler: Task[]
  kapsam: RaporKapsami
  donem: Donem
  /** userId → ad soyad */
  uyeAdlari: Record<string, string>
  /** userId → il */
  uyeIlleri: Record<string, string | null>
  orgAd: string
  uretenAd: string
  uretenRol: OrgRole | null
  uretenRolAdi: string
  /** Testlerde sabitlenebilsin diye dışarıdan verilir (YYYY-MM-DD) */
  bugun: string
}

const DURUM_ETIKET: Record<string, string> = {
  backlog: 'Beklemede', doing: 'Yapılıyor', testing: 'Test',
  blocked: 'Bloke', done: 'Tamamlandı',
}
const ONCELIK_ETIKET: Record<string, string> = {
  critical: 'Kritik', high: 'Yüksek', normal: 'Normal', low: 'Düşük',
}

const IL_YOK = 'İl atanmamış'

function gunFarki(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000)
}

/** Gecikme: termini geçmiş VE tamamlanmamış. Ayrı bir durum değil. */
function gecikmeGunu(t: Task, bugun: string): number | null {
  if (!t.due_date || t.status === 'done') return null
  const fark = gunFarki(t.due_date, bugun)
  return fark > 0 ? fark : null
}

/**
 * Dönem, görevin TERMİN tarihine göre uygulanır.
 *
 * Ürün kararı: DENEYAP planı termin üzerinden yürüyor, dolayısıyla
 * "bu ay raporu" = bu ay TERMİNİ olan işler. "Bu ay açılan görev" yönetsel
 * olarak anlamsız — merkez ekip neyin ne zaman biteceğine bakıyor.
 *
 * Termini olmayan görevler oluşturulma tarihine göre değerlendirilir; aksi
 * halde hiçbir döneme giremez ve raporlardan tamamen kaybolurlardı.
 */
function donemeGirerMi(t: Task, donem: Donem): boolean {
  const olcut = t.due_date ?? (t.created_at ? yerelGun(new Date(t.created_at)) : null)
  if (!olcut) return true
  return olcut >= donem.baslangic && olcut <= donem.bitis
}

export function raporHesapla(g: HesapGirdisi): RaporVerisi {
  const { kapsam, bugun } = g

  // Kapsam filtresi — il listesi boş dizi ise hiçbir il geçmez
  const ilKapsamli = kapsam.ilFiltresi === null
    ? g.gorevler
    : g.gorevler.filter(t => !!t.il && kapsam.ilFiltresi!.includes(t.il))

  // Dönem filtresi kapsamın ÜSTÜNE uygulanır.
  //
  // DİKKAT: "Yaklaşan terminler" bölümü bilerek `ilKapsamli` üzerinden
  // hesaplanır, dönemden etkilenmez. "Geçen ay" seçildiğinde "önümüzdeki
  // 7 gün" listesinin boşalması kullanıcı tarafından hata olarak algılanır —
  // o bölüm her zaman bugünden ileriye bakar.
  const kapsamli = ilKapsamli.filter(t => donemeGirerMi(t, g.donem))

  const gorevSatiri = (t: Task): GorevSatiri => ({
    baslik: t.title,
    il: t.il,
    // Kişi bazlı veri kapalıysa (Yetkili Yönetici) görev satırlarında da
    // isim geçmemeli — yalnızca sorumluKirilimi'ni gizlemek yetmiyor.
    sorumlu: kapsam.kisiBazliVeri && t.assignee_id
      ? (g.uyeAdlari[t.assignee_id] ?? null)
      : null,
    durum: DURUM_ETIKET[t.status] ?? t.status,
    oncelik: ONCELIK_ETIKET[t.priority] ?? t.priority,
    tur: taskTypeLabel(t.task_type),
    termin: t.due_date,
    gecikmeGunu: gecikmeGunu(t, bugun),
  })

  /* ── KPI ── */
  const tamamlanan = kapsamli.filter(t => t.status === 'done').length
  const gecikenler = kapsamli.filter(t => gecikmeGunu(t, bugun) !== null)
  const gecikmeToplam = gecikenler.reduce((s, t) => s + (gecikmeGunu(t, bugun) ?? 0), 0)

  const kpi = {
    toplam: kapsamli.length,
    tamamlanan,
    devamEden: kapsamli.filter(t => t.status === 'doing' || t.status === 'testing').length,
    bekleyen: kapsamli.filter(t => t.status === 'backlog').length,
    bloke: kapsamli.filter(t => t.status === 'blocked').length,
    geciken: gecikenler.length,
    atanmamis: kapsamli.filter(t => !t.assignee_id && t.status !== 'done').length,
    tamamlanmaOrani: kapsamli.length ? Math.round((tamamlanan / kapsamli.length) * 100) : 0,
    ortalamaGecikmeGunu: gecikenler.length ? Math.round(gecikmeToplam / gecikenler.length) : 0,
  }

  /* ── İl kırılımı ── */
  const ilHarita = new Map<string, Task[]>()
  kapsamli.forEach(t => {
    const k = t.il ?? IL_YOK
    if (!ilHarita.has(k)) ilHarita.set(k, [])
    ilHarita.get(k)!.push(t)
  })

  const ilKirilimi: IlSatiri[] = [...ilHarita.entries()].map(([il, ts]) => {
    const tam = ts.filter(t => t.status === 'done').length
    return {
      il,
      toplam: ts.length,
      tamamlanan: tam,
      devamEden: ts.filter(t => t.status === 'doing' || t.status === 'testing').length,
      geciken: ts.filter(t => gecikmeGunu(t, bugun) !== null).length,
      oran: ts.length ? Math.round((tam / ts.length) * 100) : 0,
    }
  }).sort((a, b) =>
    // Koordinatör raporunda en çok geciken il başta olmalı; eşitse alfabetik
    b.geciken - a.geciken || trCompare(a.il, b.il),
  )

  /* ── Sorumlu kırılımı ── */
  const sorumluHarita = new Map<string, Task[]>()
  kapsamli.forEach(t => {
    if (!t.assignee_id) return
    if (!sorumluHarita.has(t.assignee_id)) sorumluHarita.set(t.assignee_id, [])
    sorumluHarita.get(t.assignee_id)!.push(t)
  })

  const sorumluKirilimi: SorumluSatiri[] = kapsam.kisiBazliVeri
    ? [...sorumluHarita.entries()].map(([id, ts]) => ({
        ad: g.uyeAdlari[id] ?? 'Bilinmeyen',
        il: g.uyeIlleri[id] ?? null,
        acik: ts.filter(t => t.status !== 'done').length,
        tamamlanan: ts.filter(t => t.status === 'done').length,
        geciken: ts.filter(t => gecikmeGunu(t, bugun) !== null).length,
      })).sort((a, b) => b.geciken - a.geciken || b.acik - a.acik)
    : []

  /* ── Tür kırılımı ── */
  const turHarita = new Map<string, Task[]>()
  kapsamli.forEach(t => {
    const k = t.task_type ?? 'other'
    if (!turHarita.has(k)) turHarita.set(k, [])
    turHarita.get(k)!.push(t)
  })
  const turKirilimi: TurSatiri[] = [...turHarita.entries()].map(([tur, ts]) => ({
    tur,
    etiket: taskTypeLabel(tur),
    toplam: ts.length,
    tamamlanan: ts.filter(t => t.status === 'done').length,
  })).sort((a, b) => b.toplam - a.toplam)

  /* ── Gecikmeler ── */
  const gecikmeler = gecikenler
    .map(gorevSatiri)
    .sort((a, b) => (b.gecikmeGunu ?? 0) - (a.gecikmeGunu ?? 0))

  /* ── Yaklaşan terminler (7 gün) — dönemden BAĞIMSIZ, bkz. donemeGirerMi ── */
  const yaklasan = ilKapsamli
    .filter(t => {
      if (!t.due_date || t.status === 'done') return false
      const fark = gunFarki(bugun, t.due_date)
      return fark >= 0 && fark <= 7
    })
    .map(gorevSatiri)
    .sort((a, b) => (a.termin ?? '').localeCompare(b.termin ?? ''))

  /* ── Ham liste ── */
  const hamListe = kapsam.bolumler.has('ham_liste')
    ? kapsamli.map(gorevSatiri).sort((a, b) =>
        trCompare(a.il ?? '', b.il ?? '') || trCompare(a.baslik, b.baslik))
    : []

  const kapsamEtiketi = kapsam.ilFiltresi === null
    ? 'Tüm iller'
    : kapsam.ilFiltresi.length === 0
      ? 'Yalnızca size atanan görevler'
      : kapsam.ilFiltresi.join(', ')

  return {
    meta: {
      orgAd: g.orgAd,
      raporAdi: kapsam.raporAdi,
      donem: g.donem,
      uretimTarihi: bugun,
      uretenAd: g.uretenAd,
      uretenRolAdi: g.uretenRolAdi,
      kapsamEtiketi,
      bolumler: [...kapsam.bolumler],
    },
    kpi,
    ilKirilimi:       kapsam.bolumler.has('il_kirilimi')      ? ilKirilimi       : [],
    sorumluKirilimi:  kapsam.bolumler.has('sorumlu_kirilimi') ? sorumluKirilimi  : [],
    turKirilimi:      kapsam.bolumler.has('tur_kirilimi')     ? turKirilimi      : [],
    gecikmeler:       kapsam.bolumler.has('gecikmeler')       ? gecikmeler       : [],
    yaklasan:         kapsam.bolumler.has('yaklasan')         ? yaklasan         : [],
    hamListe,
    // Sunucu katmanı doldurur (rapor/veri.ts) — saf hesaplayıcı DB'ye bakmaz
    risk: null,
    trend: null,
    yorum: null,
  }
}
