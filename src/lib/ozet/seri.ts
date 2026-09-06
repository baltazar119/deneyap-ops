import type { Task } from '@/types/database'
import { gune } from './gunlukOzet'

/**
 * Zaman serisi üretimi — SAF fonksiyon.
 *
 * TASARIMIN ÖZÜ: kaynak kararı GÜN BAŞINA verilir.
 *   o gün için snapshot varsa      → ölçüm ('olcum')
 *   yoksa görev tarihlerinden türet → tahmin ('turetilmis')
 *
 * Böylece snapshot biriktikçe grafik kendiliğinden gerçeğe kayar; "artık
 * gerçek veriye geç" diye bir geçiş kodu yazmak gerekmez.
 *
 * DÜRÜSTLÜK KURALI: her metrik türetilemez.
 *   Türetilebilir → acik, geciken, olusturulan, tamamlanan
 *     (created_at / completed_at / due_date bugün de elimizde)
 *   Türetilemez   → bloke, atanmamis, risk_skoru
 *     (durum geçmişi tutulmuyor; "3 hafta önce kaç görev blokeydi"
 *      bilinemez). Bunlar türetilmiş günlerde `null` döner ve grafik o
 *      bölgede çizgi ÇİZMEZ — uydurma veri göstermektense boşluk bırakılır.
 */

export type SeriKaynagi = 'olcum' | 'turetilmis'

export interface SeriMetrikleri {
  acik: number
  geciken: number
  olusturulan: number
  tamamlanan: number
  /** Türetilmiş günlerde null — durum geçmişi yok */
  bloke: number | null
  atanmamis: number | null
}

export interface SeriNoktasi extends SeriMetrikleri {
  gun: string
  etiket: string
  kaynak: SeriKaynagi
}

/** Snapshot tablosundan gelen satırın seriye lazım olan alanları */
export interface OlcumSatiri {
  gun: string
  acik: number
  geciken: number
  yeni_olusturulan: number
  gun_icinde_tamamlanan: number
  bloke: number
  atanmamis: number
}

export type Granularite = 'gun' | 'hafta' | 'ay'

const AY_KISA = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz',
                 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']

function tarih(g: string): Date { return new Date(g + 'T00:00:00') }

function iki(n: number): string { return String(n).padStart(2, '0') }

export function gunEkle(g: string, n: number): string {
  const d = tarih(g); d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${iki(d.getMonth() + 1)}-${iki(d.getDate())}`
}

export function gunlerArasi(baslangic: string, bitis: string): string[] {
  const out: string[] = []
  let g = baslangic
  // Güvenlik sınırı: 5 yıl. Bozuk aralıkta sonsuz döngüye girmesin.
  for (let i = 0; i < 1900 && g <= bitis; i++) { out.push(g); g = gunEkle(g, 1) }
  return out
}

/** Aralığın uzunluğuna göre makul granülarite */
export function granulariteSec(gunSayisi: number): Granularite {
  if (gunSayisi <= 31) return 'gun'
  if (gunSayisi <= 26 * 7) return 'hafta'
  return 'ay'
}

function etiketle(g: string, gr: Granularite): string {
  const d = tarih(g)
  if (gr === 'ay') return `${AY_KISA[d.getMonth()]} ${d.getFullYear()}`
  return `${d.getDate()} ${AY_KISA[d.getMonth()]}`
}

/* ── Türetme ─────────────────────────────────────────────────────────────── */

type Sayilabilir = Task & { completed_at?: string | null }

/**
 * Bir görevin verilen GÜNDE açık olup olmadığı.
 * Bugünün verisinden geriye bakarak hesaplanabilen tek şey bu.
 */
function oGunAcikMi(t: Sayilabilir, g: string): boolean {
  const olusma = gune(t.created_at)
  if (!olusma || olusma > g) return false
  if (t.status !== 'done') return true
  const bitis = gune(t.completed_at)
  // completed_at yoksa ne zaman bittiğini bilmiyoruz; o güne kadar açık say
  return bitis ? bitis > g : true
}

function turetilmisNokta(gorevler: Sayilabilir[], g: string): SeriMetrikleri {
  let acik = 0, geciken = 0, olusturulan = 0, tamamlanan = 0
  for (const t of gorevler) {
    if (gune(t.created_at) === g) olusturulan++
    if (gune(t.completed_at) === g) tamamlanan++
    if (oGunAcikMi(t, g)) {
      acik++
      if (t.due_date && t.due_date < g) geciken++
    }
  }
  // bloke ve atanmamis TÜRETİLEMEZ — bilerek null
  return { acik, geciken, olusturulan, tamamlanan, bloke: null, atanmamis: null }
}

/* ── Ana üretici ─────────────────────────────────────────────────────────── */

export interface SeriGirdisi {
  gorevler: Task[]
  olcumler: OlcumSatiri[]
  baslangic: string
  bitis: string
  granularite?: Granularite
}

export function seriUret(g: SeriGirdisi): SeriNoktasi[] {
  const gunler = gunlerArasi(g.baslangic, g.bitis)
  if (!gunler.length) return []

  const gr = g.granularite ?? granulariteSec(gunler.length)
  const olcumHarita = new Map(g.olcumler.map(o => [o.gun, o]))
  const gorevler = g.gorevler as Sayilabilir[]

  const gunluk: SeriNoktasi[] = gunler.map(gun => {
    const o = olcumHarita.get(gun)
    if (o) {
      return {
        gun, etiket: etiketle(gun, gr), kaynak: 'olcum',
        acik: o.acik, geciken: o.geciken,
        olusturulan: o.yeni_olusturulan, tamamlanan: o.gun_icinde_tamamlanan,
        bloke: o.bloke, atanmamis: o.atanmamis,
      }
    }
    return { gun, etiket: etiketle(gun, gr), kaynak: 'turetilmis', ...turetilmisNokta(gorevler, gun) }
  })

  if (gr === 'gun') return gunluk
  return grupla(gunluk, gr)
}

/**
 * Haftalık/aylık gruplama.
 *
 * `acik`, `geciken`, `bloke`, `atanmamis` DURUM metrikleri → dönemin SON
 * gününün değeri alınır (toplamak anlamsız olurdu: 30 günün "açık" sayısını
 * toplamak 30 kat şişik bir sayı verir).
 * `olusturulan`, `tamamlanan` AKIŞ metrikleri → toplanır.
 */
function grupla(gunluk: SeriNoktasi[], gr: Granularite): SeriNoktasi[] {
  const kova = new Map<string, SeriNoktasi[]>()
  for (const n of gunluk) {
    const d = tarih(n.gun)
    let anahtar: string
    if (gr === 'ay') {
      anahtar = `${d.getFullYear()}-${iki(d.getMonth() + 1)}`
    } else {
      const p = new Date(d)
      p.setDate(d.getDate() - ((d.getDay() + 6) % 7))   // Pazartesi
      anahtar = `${p.getFullYear()}-${iki(p.getMonth() + 1)}-${iki(p.getDate())}`
    }
    if (!kova.has(anahtar)) kova.set(anahtar, [])
    kova.get(anahtar)!.push(n)
  }

  return [...kova.entries()].map(([, grup]) => {
    const son = grup[grup.length - 1]
    const topla = (f: (n: SeriNoktasi) => number) => grup.reduce((s, n) => s + f(n), 0)
    return {
      gun: grup[0].gun,
      etiket: son.etiket,
      // Grupta tek bir türetilmiş gün varsa tamamı türetilmiş sayılır —
      // "kısmen ölçüm" diye bir güven seviyesi kullanıcıya anlatılamaz.
      kaynak: grup.every(n => n.kaynak === 'olcum') ? 'olcum' : 'turetilmis',
      acik: son.acik,
      geciken: son.geciken,
      bloke: son.bloke,
      atanmamis: son.atanmamis,
      olusturulan: topla(n => n.olusturulan),
      tamamlanan: topla(n => n.tamamlanan),
    }
  })
}
