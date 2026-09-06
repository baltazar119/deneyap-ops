import type { OrgRole } from '@/types/database'

/**
 * Duyuru hedefleme ve sıralama — saf kurallar.
 *
 * Hedefleme SUNUCUDA uygulanıyor (`api/org/[slug]/duyurular/aktif`).
 * İstemci tarafı bir filtre yeterli olmazdı: hedeflenmemiş kullanıcı veriyi
 * yine de çekebilir, ağ sekmesinden okuyabilirdi. Bu dosya saf olduğu için
 * hem sunucu ucu hem testler aynı kuralı kullanır.
 */

export type DuyuruOnem = 'kritik' | 'onemli' | 'normal'

export interface DuyuruHedefi {
  hedef_roller: string[]
  hedef_iller: string[]
  hedef_deneyap_ids: string[]
}

export interface DuyuruPenceresi {
  yayinda: boolean
  baslangic_at: string | null
  bitis_at: string | null
}

export interface AliciBaglami {
  role: OrgRole | null
  il: string | null
  deneyapId: string | null
}

/**
 * Boş dizi = "kısıt yok". `null` değil boş dizi kullanılıyor (migration 062
 * `default '{}'`) ki üç boyutun da kontrolü tek desenle yazılabilsin.
 */
function hedefEsler(hedefler: string[], deger: string | null): boolean {
  if (!hedefler || hedefler.length === 0) return true
  if (!deger) return false
  return hedefler.includes(deger)
}

/** Kullanıcı bu duyurunun hedef kitlesinde mi? Üç boyut da VE ile bağlı. */
export function duyuruHedefliyorMu(d: DuyuruHedefi, alici: AliciBaglami): boolean {
  return (
    hedefEsler(d.hedef_roller, alici.role) &&
    hedefEsler(d.hedef_iller, alici.il) &&
    hedefEsler(d.hedef_deneyap_ids, alici.deneyapId)
  )
}

/** Duyuru şu an yayın penceresinde mi? */
export function duyuruYayindaMi(d: DuyuruPenceresi, simdi: Date = new Date()): boolean {
  if (!d.yayinda) return false
  const t = simdi.getTime()
  if (d.baslangic_at && Date.parse(d.baslangic_at) > t) return false
  // Bitiş anı DIŞARIDA: "bitis_at 15:00" demek 15:00'te artık görünmüyor.
  if (d.bitis_at && Date.parse(d.bitis_at) <= t) return false
  return true
}

const ONEM_SIRASI: Record<DuyuruOnem, number> = { kritik: 0, onemli: 1, normal: 2 }

export function onemSirasi(onem: string): number {
  return ONEM_SIRASI[onem as DuyuruOnem] ?? ONEM_SIRASI.normal
}

/**
 * Popup'ta gösterim sırası: önce önem, sonra yeni olan.
 *
 * Kullanıcı birden fazla okunmamış duyuruyla karşılaşırsa kritik olanı ilk
 * görmeli — "1/3" göstergesiyle diğerlerini de gezebiliyor.
 */
export function duyurulariSirala<T extends { onem: string; baslangic_at: string | null; created_at: string }>(
  liste: T[],
): T[] {
  return [...liste].sort((a, b) => {
    const o = onemSirasi(a.onem) - onemSirasi(b.onem)
    if (o !== 0) return o
    const at = Date.parse(a.baslangic_at ?? a.created_at)
    const bt = Date.parse(b.baslangic_at ?? b.created_at)
    return bt - at
  })
}

/** Bir kullanıcıya şu an gösterilecek duyurular: yayında + hedefte + okunmamış. */
export function gosterilecekDuyurular<
  T extends DuyuruHedefi & DuyuruPenceresi & { id: string; onem: string; created_at: string },
>(
  liste: T[], alici: AliciBaglami, okunanIdler: Set<string>, simdi: Date = new Date(),
): T[] {
  return duyurulariSirala(
    liste.filter(d =>
      duyuruYayindaMi(d, simdi) &&
      duyuruHedefliyorMu(d, alici) &&
      !okunanIdler.has(d.id),
    ),
  )
}

export const ONEM_ETIKET: Record<DuyuruOnem, string> = {
  kritik: 'Kritik',
  onemli: 'Önemli',
  normal: 'Bilgi',
}

export const ONEM_RENK: Record<DuyuruOnem, { renk: string; bg: string; bd: string }> = {
  kritik: { renk: '#dc2626', bg: '#fee2e2', bd: '#fca5a5' },
  onemli: { renk: '#b45309', bg: '#fef3c7', bd: '#fcd34d' },
  normal: { renk: '#0369a1', bg: '#e0f2fe', bd: '#7dd3fc' },
}
