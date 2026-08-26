/**
 * İl / birim listesi — TEK KAYNAK.
 *
 * PRD: "Kullanıcı rolü ve sorumlu olduğu il/birim tanımlanır."
 * Görev formundaki il seçici, üye kartındaki il ataması ve görev
 * listesindeki il filtresi hep buradan okur.
 *
 * İl dışı yapılar (Genel Merkez, Bölge koordinasyonu) da atanabilsin diye
 * veritabanında CHECK kısıtı yok; bu liste sadece arayüzdeki seçenekleri
 * belirliyor.
 */

/** İl dışı birimler — listenin başında dursunlar */
export const BIRIMLER = ['Genel Merkez'] as const

export const ILLER = [
  'Adana', 'Adıyaman', 'Afyonkarahisar', 'Ağrı', 'Aksaray', 'Amasya',
  'Ankara', 'Antalya', 'Ardahan', 'Artvin', 'Aydın', 'Balıkesir',
  'Bartın', 'Batman', 'Bayburt', 'Bilecik', 'Bingöl', 'Bitlis',
  'Bolu', 'Burdur', 'Bursa', 'Çanakkale', 'Çankırı', 'Çorum',
  'Denizli', 'Diyarbakır', 'Düzce', 'Edirne', 'Elazığ', 'Erzincan',
  'Erzurum', 'Eskişehir', 'Gaziantep', 'Giresun', 'Gümüşhane', 'Hakkâri',
  'Hatay', 'Iğdır', 'Isparta', 'İstanbul', 'İzmir', 'Kahramanmaraş',
  'Karabük', 'Karaman', 'Kars', 'Kastamonu', 'Kayseri', 'Kilis',
  'Kırıkkale', 'Kırklareli', 'Kırşehir', 'Kocaeli', 'Konya', 'Kütahya',
  'Malatya', 'Manisa', 'Mardin', 'Mersin', 'Muğla', 'Muş',
  'Nevşehir', 'Niğde', 'Ordu', 'Osmaniye', 'Rize', 'Sakarya',
  'Samsun', 'Şanlıurfa', 'Siirt', 'Sinop', 'Sivas', 'Şırnak',
  'Tekirdağ', 'Tokat', 'Trabzon', 'Tunceli', 'Uşak', 'Van',
  'Yalova', 'Yozgat', 'Zonguldak',
] as const

/** Seçicilerde kullanılan tam liste: önce birimler, sonra iller */
export const IL_SECENEKLERI: string[] = [...BIRIMLER, ...ILLER]

/** Bilinmeyen/boş değer için görüntü etiketi */
export function ilEtiketi(value: string | null | undefined): string {
  return value?.trim() ? value : 'İl atanmamış'
}
