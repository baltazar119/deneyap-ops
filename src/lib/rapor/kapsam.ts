import type { OrgRole } from '@/types/database'

/**
 * Rol → rapor kapsamı. TEK KAYNAK.
 *
 * "Rollere göre indirilsin" gereksiniminin karşılığı burası. Kural bir kez
 * yazılır; PDF, Excel, CSV ve e-posta hepsi buradan okur — aksi halde dört
 * formatta dört farklı kapsam kuralı oluşur ve biri sızdırır.
 */

export type RaporBolumu =
  | 'kpi'
  | 'il_kirilimi'
  | 'sorumlu_kirilimi'
  | 'tur_kirilimi'
  | 'gecikmeler'
  | 'yaklasan'
  | 'risk'
  | 'trend'
  | 'ham_liste'

export interface RaporKapsami {
  /** null = tüm iller; dizi = yalnızca bu iller */
  ilFiltresi: string[] | null
  bolumler: Set<RaporBolumu>
  /**
   * Kişi bazlı veri (kim kaç görevde geciktirdi) gösterilsin mi.
   * Yetkili Yönetici salt izleyici; kişi performansı görmesi gerekmiyor.
   */
  kisiBazliVeri: boolean
  raporAdi: string
}

export function raporKapsami(rol: OrgRole | null, uyeIl: string | null): RaporKapsami {
  const hepsi: RaporBolumu[] = [
    'kpi', 'il_kirilimi', 'sorumlu_kirilimi', 'tur_kirilimi',
    'gecikmeler', 'yaklasan', 'risk', 'trend', 'ham_liste',
  ]

  switch (rol) {
    case 'owner':
      return {
        ilFiltresi: null,
        bolumler: new Set(hepsi),
        kisiBazliVeri: true,
        raporAdi: 'Merkez Operasyon Raporu',
      }

    case 'admin':
      return {
        ilFiltresi: null,
        bolumler: new Set(hepsi),
        kisiBazliVeri: true,
        raporAdi: 'Koordinatör Risk Raporu',
      }

    case 'member':
      return {
        // İl tanımlı değilse BOŞ küme — "tüm iller"e düşmek sızıntı olurdu.
        // Bu durumda rapor yalnızca kişiye atanmış görevleri içerir.
        ilFiltresi: uyeIl ? [uyeIl] : [],
        bolumler: new Set<RaporBolumu>([
          // 'risk' bilinçli olarak EKLENDİ: kullanıcı kararı gereği İl
          // Sorumlusu kendi ilinin risk tablosunu görebilir. Kapsam zaten
          // ilFiltresi ile kendi iliyle sınırlı.
          'kpi', 'il_kirilimi', 'tur_kirilimi', 'yaklasan', 'gecikmeler', 'risk', 'trend', 'ham_liste',
        ]),
        kisiBazliVeri: true,
        raporAdi: uyeIl ? `${uyeIl} İl Durum Raporu` : 'Görev Durum Raporu',
      }

    case 'viewer':
      return {
        ilFiltresi: null,
        // Yönetici özeti: oranlar ve gecikmeler. Kişi kırılımı ve ham görev
        // listesi yok — bu rol karar için sayıya bakar, göreve değil.
        bolumler: new Set<RaporBolumu>(['kpi', 'il_kirilimi', 'tur_kirilimi', 'gecikmeler', 'risk', 'trend']),
        kisiBazliVeri: false,
        raporAdi: 'Yönetici Özeti',
      }

    default:
      // consultant ve tanımsız rol rapor üretemez
      return {
        ilFiltresi: [],
        bolumler: new Set<RaporBolumu>(),
        kisiBazliVeri: false,
        raporAdi: 'Rapor',
      }
  }
}

export function raporUretebilirMi(rol: OrgRole | null): boolean {
  return rol === 'owner' || rol === 'admin' || rol === 'member' || rol === 'viewer'
}
