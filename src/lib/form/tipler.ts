/**
 * Form alan şeması — TEK KAYNAK.
 *
 * Veritabanında `formlar.alanlar` jsonb; jsonb esneklik için seçildi,
 * doğrulamasızlık için değil. Gelen her tanım ve her cevap sunucuda bu
 * şemaya göre doğrulanıyor (`dogrula.ts`).
 *
 * "tablo" tipi bu ürünün Google Form'dan ayrıldığı yer: cevaplayan Excel
 * gibi satır satır doldurur (ör. "Malzeme sayımı" → 4 sütun × N satır).
 */

export type AlanTipi =
  | 'metin' | 'uzun_metin' | 'sayi' | 'tarih' | 'evet_hayir'
  | 'secim' | 'coklu_secim' | 'tablo'

export type TabloSutunTipi = 'metin' | 'sayi' | 'tarih'

export interface TabloSutunu {
  id: string
  baslik: string
  tip: TabloSutunTipi
}

export interface FormAlani {
  id: string
  tip: AlanTipi
  etiket: string
  aciklama?: string | null
  zorunlu: boolean
  /** 'secim' ve 'coklu_secim' için. */
  secenekler?: string[]
  /** 'tablo' için. */
  sutunlar?: TabloSutunu[]
  /** 'tablo' için: cevaplayanın doldurması gereken en az satır. */
  enAzSatir?: number
}

/** Bir cevabın alabileceği değerler. Tablo → satır dizisi. */
export type CevapDegeri =
  | string | number | boolean | null
  | string[]
  | Record<string, string | number | null>[]

export type Cevaplar = Record<string, CevapDegeri>

export const ALAN_TIPI_ETIKET: Record<AlanTipi, string> = {
  metin: 'Kısa metin',
  uzun_metin: 'Uzun metin',
  sayi: 'Sayı',
  tarih: 'Tarih',
  evet_hayir: 'Evet / Hayır',
  secim: 'Tek seçim',
  coklu_secim: 'Çoklu seçim',
  tablo: 'Tablo (Excel gibi)',
}

export const SECENEKLI_TIPLER: AlanTipi[] = ['secim', 'coklu_secim']

export function secenekGerekirMi(tip: AlanTipi): boolean {
  return SECENEKLI_TIPLER.includes(tip)
}

/** Sonraki görev şablonu — form dolunca ne açılacak. */
export interface SonrakiGorevKurali {
  aktif: boolean
  baslik: string | null
  aciklama: string | null
  oncelik: string
  tur: string
  terminGun: number | null
  atananKaynak: 'gonderen' | 'yanitlayan' | 'sabit'
  atananId: string | null
}

export interface Form {
  id: string
  organization_id: string
  baslik: string
  aciklama: string | null
  alanlar: FormAlani[]
  erisim: 'uyeler' | 'baglanti'
  yayinda: boolean
  sonraki_gorev_aktif: boolean
  sonraki_gorev_baslik: string | null
  sonraki_gorev_aciklama: string | null
  sonraki_gorev_oncelik: string
  sonraki_gorev_tur: string
  sonraki_gorev_termin_gun: number | null
  sonraki_gorev_atanan_kaynak: 'gonderen' | 'yanitlayan' | 'sabit'
  sonraki_gorev_atanan_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface FormGonderim {
  id: string
  organization_id: string
  form_id: string
  gorev_id: string | null
  alici_user_id: string | null
  alici_etiket: string | null
  son_gecerlilik: string | null
  durum: 'bekliyor' | 'yanitlandi' | 'iptal'
  gonderen_id: string | null
  created_at: string
}

export interface FormYanit {
  id: string
  organization_id: string
  gonderim_id: string
  cevaplar: Cevaplar
  yanitlayan_user_id: string | null
  olusan_gorev_id: string | null
  created_at: string
}
