import type { OrgRole } from '@/types/database'
import type { RaporVerisi } from '@/lib/rapor/hesapla'

/**
 * Kural tabanlı yorum motoru — tipler.
 *
 * AMAÇ: "yöneticilerin veriyi yorumlamasına gerek kalmadan yorumlanmış
 * şekilde vermek". Sayılar zaten ekranda; eksik olan onların NE ANLAMA
 * geldiği ve NE YAPILMASI gerektiği.
 *
 * HİBRİT yaklaşım: kurallar her zaman çalışır (internet/kota gerekmez,
 * sunumda garanti). AI yalnızca üstüne eklenir; hata alırsa ekran yine dolu.
 */

export type YorumOnemi = 'kritik' | 'uyari' | 'bilgi' | 'olumlu'

/**
 * Yorumun hitap ettiği rol dili.
 *   operasyon    — Merkez: emir kipi, "şunu yapın", kişi adı geçebilir
 *   koordinasyon — Koordinatör: alt ekip odaklı, "önce hangi ile bakın"
 *   il           — İl Sorumlusu: yalnızca kendi ili, kıyas ülke ortalamasına
 *   yonetim      — Yetkili Yönetici: eğilim dili, KİŞİ ADI YOK
 */
export type YorumTonu = 'operasyon' | 'koordinasyon' | 'il' | 'yonetim'

export interface Kanit {
  etiket: string
  deger: string | number
}

export interface Yorum {
  id: string
  onem: YorumOnemi
  baslik: string
  /** Tek cümlelik ana ifade */
  cumle: string
  /** Cümlenin dayandığı sayılar — "neye göre" sorusunun cevabı */
  kanit: Kanit[]
  /** Somut sonraki adım; yoksa null (örn. olumlu haberler) */
  eylem: string | null
  /**
   * Bu yorum kişi bazlı veri içeriyor mu.
   *
   * KRİTİK: isim REGEX ile temizlenmez. Kapsamda `kisiBazliVeri` false ise
   * bu bayrağı taşıyan kural HİÇ ÇALIŞTIRILMAZ. Metinden isim silmeye
   * çalışmak er ya da geç bir sızıntıyla sonuçlanır.
   */
  kisiBazli: boolean
}

export interface YorumGirdisi {
  rapor: RaporVerisi
  rol: OrgRole | null
  ton: YorumTonu
  kisiBazliVeri: boolean
  /** Bu raporun kapsamı tek bir ille mi sınırlı (İl Sorumlusu) */
  tekIl: string | null
}

export interface YorumSonucu {
  /** En fazla 3 cümlelik yönetici özeti */
  ozet: string
  yorumlar: Yorum[]
}

/** Öneme göre sıralama — kritik önce */
export const ONEM_SIRASI: Record<YorumOnemi, number> = {
  kritik: 0, uyari: 1, bilgi: 2, olumlu: 3,
}

export function tonSec(rol: OrgRole | null): YorumTonu {
  switch (rol) {
    case 'owner':  return 'operasyon'
    case 'admin':  return 'koordinasyon'
    case 'member': return 'il'
    case 'viewer': return 'yonetim'
    default:       return 'yonetim'
  }
}
