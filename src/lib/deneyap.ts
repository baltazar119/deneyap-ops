import { trFold, trCompare } from '@/lib/turkce'
import type { Deneyap } from '@/types/database'

/**
 * DENEYAP birimleri — saf yardımcılar.
 *
 * Arayüz terimi kullanıcı kararıyla **"DENEYAP"**; "atölye" ya da "birim"
 * değil. Etiket biçimi: "Ankara DENEYAP — Çankaya".
 *
 * Hiçbir fetch/hook yok, doğrudan test ediliyor.
 */

/** Listede ve rozetlerde gösterilen tam etiket. */
export function deneyapEtiketi(d: Pick<Deneyap, 'ad' | 'il' | 'ilce'>): string {
  const bas = `${d.il} DENEYAP`
  // Ad zaten ili içeriyorsa tekrar etme ("Ankara DENEYAP — Ankara DENEYAP").
  const ekAd = trFold(d.ad) === trFold(bas) ? null : d.ad
  const ek = ekAd ?? d.ilce
  return ek ? `${bas} — ${ek}` : bas
}

/** Dar alanlar için kısa etiket (rozet, tablo hücresi). */
export function deneyapKisaEtiket(d: Pick<Deneyap, 'ad' | 'ilce'>): string {
  return d.ad || d.ilce || 'DENEYAP'
}

/**
 * Seçicideki arama. `kod` de taranıyor çünkü Excel'den gelen dosyalarda
 * çoğu zaman ad değil kod yazıyor.
 */
export function deneyapAranabilirMetin(d: Pick<Deneyap, 'ad' | 'il' | 'ilce' | 'kod'>): string {
  return trFold([d.ad, d.il, d.ilce ?? '', d.kod ?? ''].join(' '))
}

export function deneyaplariAra<T extends Pick<Deneyap, 'ad' | 'il' | 'ilce' | 'kod'>>(
  liste: T[], sorgu: string,
): T[] {
  const tokenlar = trFold(sorgu).split(' ').filter(Boolean)
  if (tokenlar.length === 0) return liste
  return liste.filter(d => {
    const metin = deneyapAranabilirMetin(d)
    return tokenlar.every(t => metin.includes(t))
  })
}

/**
 * İle göre gruplar ve Türkçe sıralar.
 *
 * `oncelikliIl` verilirse o il en başa alınır — kullanıcının kendi ili
 * listenin dibinde aranmasın.
 */
export function deneyaplariIleGoreGrupla<T extends Pick<Deneyap, 'ad' | 'il'>>(
  liste: T[], oncelikliIl?: string | null,
): { il: string; deneyaplar: T[] }[] {
  const gruplar = new Map<string, T[]>()
  for (const d of liste) {
    const mevcut = gruplar.get(d.il)
    if (mevcut) mevcut.push(d)
    else gruplar.set(d.il, [d])
  }

  return [...gruplar.entries()]
    .map(([il, deneyaplar]) => ({
      il,
      deneyaplar: [...deneyaplar].sort((a, b) => trCompare(a.ad, b.ad)),
    }))
    .sort((a, b) => {
      if (oncelikliIl) {
        if (a.il === oncelikliIl) return -1
        if (b.il === oncelikliIl) return 1
      }
      return trCompare(a.il, b.il)
    })
}

/**
 * Seçicide gösterilecek liste: pasifler gizli, AMA seçili olan her zaman
 * görünür.
 *
 * Kapatılmış bir DENEYAP'a bağlı eski bir görevi düzenlerken seçim
 * listeden düşerse alan boş görünür ve kaydetmek görevin birimini SESSİZCE
 * siler. Bu yüzden seçili kayıt pasif olsa bile listede kalır.
 */
export function secicideGosterilecekler<T extends Pick<Deneyap, 'id' | 'aktif'>>(
  liste: T[], seciliId: string | null,
): T[] {
  return liste.filter(d => d.aktif || d.id === seciliId)
}

/** Aynı ada sahip bir DENEYAP zaten var mı (tr_fold ile, DB kısıtının ikizi). */
export function adCakisiyorMu(
  liste: Pick<Deneyap, 'id' | 'ad'>[], ad: string, haricId?: string | null,
): boolean {
  const katlanmis = trFold(ad)
  return liste.some(d => d.id !== haricId && trFold(d.ad) === katlanmis)
}

/** Görev sayısını DENEYAP id'sine göre toplar (yönetim ekranındaki sütun). */
export function deneyapGorevSayilari(
  gorevler: { deneyap_id?: string | null }[],
): Record<string, number> {
  const sayac: Record<string, number> = {}
  for (const g of gorevler) {
    if (!g.deneyap_id) continue
    sayac[g.deneyap_id] = (sayac[g.deneyap_id] ?? 0) + 1
  }
  return sayac
}
