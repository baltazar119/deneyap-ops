import type { Task } from '@/types/database'

/**
 * Günlük özet (snapshot) hesabı — SAF fonksiyon.
 *
 * Gecikme tanımı burada YENİDEN YAZILMAZ: `rapor/hesapla.ts` ile aynı kural
 * kullanılır (termini geçmiş VE tamamlanmamış). İki ayrı tanım olsaydı
 * raporla grafik farklı "geciken" sayısı gösterirdi ve hangisinin doğru
 * olduğu anlaşılmazdı.
 */

export type OzetKirilim = 'org' | 'il' | 'deneyap'

export interface OzetSatiri {
  kirilim: OzetKirilim
  il: string | null
  deneyap_id: string | null
  toplam: number
  acik: number
  tamamlanan: number
  devam_eden: number
  bekleyen: number
  bloke: number
  geciken: number
  gecikme_gun_toplam: number
  atanmamis: number
  kritik_atanmamis: number
  termini_yaklasan: number
  yeni_olusturulan: number
  gun_icinde_tamamlanan: number
}

/** YYYY-MM-DD karşılaştırması yeterli; iki tarih de yerel gün formatında */
function gunFarki(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000)
}

/** Timestamp veya tarih → yerel YYYY-MM-DD */
export function gune(ts: string | null | undefined): string | null {
  if (!ts) return null
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return null
  const iki = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${iki(d.getMonth() + 1)}-${iki(d.getDate())}`
}

function bosSatir(kirilim: OzetKirilim, il: string | null, deneyap_id: string | null): OzetSatiri {
  return {
    kirilim, il, deneyap_id,
    toplam: 0, acik: 0, tamamlanan: 0, devam_eden: 0, bekleyen: 0, bloke: 0,
    geciken: 0, gecikme_gun_toplam: 0, atanmamis: 0, kritik_atanmamis: 0,
    termini_yaklasan: 0, yeni_olusturulan: 0, gun_icinde_tamamlanan: 0,
  }
}

function say(satir: OzetSatiri, t: Task, bugun: string): void {
  satir.toplam += 1

  const tamam = t.status === 'done'
  if (tamam) satir.tamamlanan += 1
  else satir.acik += 1

  if (t.status === 'doing' || t.status === 'testing') satir.devam_eden += 1
  if (t.status === 'backlog') satir.bekleyen += 1
  if (t.status === 'blocked') satir.bloke += 1

  if (!tamam && t.due_date) {
    const fark = gunFarki(t.due_date, bugun)
    if (fark > 0) {
      satir.geciken += 1
      satir.gecikme_gun_toplam += fark
    } else if (fark >= -7) {
      satir.termini_yaklasan += 1
    }
  }

  if (!tamam && !t.assignee_id) {
    satir.atanmamis += 1
    if (t.priority === 'critical') satir.kritik_atanmamis += 1
  }

  if (gune(t.created_at) === bugun) satir.yeni_olusturulan += 1
  const bittiGun = gune((t as Task & { completed_at?: string | null }).completed_at)
  if (bittiGun === bugun) satir.gun_icinde_tamamlanan += 1
}

/**
 * Verilen görev listesinden o günün özet satırlarını üretir:
 * bir 'org' satırı + her il için bir satır + her DENEYAP için bir satır.
 */
export function gunlukOzetHesapla(
  gorevler: Task[],
  bugun: string,
): OzetSatiri[] {
  const org = bosSatir('org', null, null)
  const iller = new Map<string, OzetSatiri>()
  const birimler = new Map<string, OzetSatiri>()

  for (const t of gorevler) {
    say(org, t, bugun)

    const il = t.il?.trim() || null
    if (il) {
      if (!iller.has(il)) iller.set(il, bosSatir('il', il, null))
      say(iller.get(il)!, t, bugun)
    }

    const dId = (t as Task & { deneyap_id?: string | null }).deneyap_id ?? null
    if (dId) {
      if (!birimler.has(dId)) birimler.set(dId, bosSatir('deneyap', il, dId))
      say(birimler.get(dId)!, t, bugun)
    }
  }

  return [org, ...iller.values(), ...birimler.values()]
}
