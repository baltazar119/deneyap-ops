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

/**
 * İl → plaka kodu.
 *
 * Alfabetik sıradan TÜRETİLEMEZ: 68 Aksaray, 69 Bayburt, 70 Karaman gibi
 * sonradan il olan yerler listenin sonuna eklendi. Bu yüzden elle yazılıyor.
 *
 * Faz 11'deki Türkiye haritası il yollarını plakayla eşleyecek; harita
 * kaynağındaki isimler ("Afyon", "Icel") uygulamadaki isimlerle birebir
 * tutmayacağı için kararlı bir anahtar gerekiyor.
 */
export const IL_PLAKA: Record<string, number> = {
  'Adana': 1, 'Adıyaman': 2, 'Afyonkarahisar': 3, 'Ağrı': 4, 'Amasya': 5,
  'Ankara': 6, 'Antalya': 7, 'Artvin': 8, 'Aydın': 9, 'Balıkesir': 10,
  'Bilecik': 11, 'Bingöl': 12, 'Bitlis': 13, 'Bolu': 14, 'Burdur': 15,
  'Bursa': 16, 'Çanakkale': 17, 'Çankırı': 18, 'Çorum': 19, 'Denizli': 20,
  'Diyarbakır': 21, 'Edirne': 22, 'Elazığ': 23, 'Erzincan': 24, 'Erzurum': 25,
  'Eskişehir': 26, 'Gaziantep': 27, 'Giresun': 28, 'Gümüşhane': 29, 'Hakkâri': 30,
  'Hatay': 31, 'Isparta': 32, 'Mersin': 33, 'İstanbul': 34, 'İzmir': 35,
  'Kars': 36, 'Kastamonu': 37, 'Kayseri': 38, 'Kırklareli': 39, 'Kırşehir': 40,
  'Kocaeli': 41, 'Konya': 42, 'Kütahya': 43, 'Malatya': 44, 'Manisa': 45,
  'Kahramanmaraş': 46, 'Mardin': 47, 'Muğla': 48, 'Muş': 49, 'Nevşehir': 50,
  'Niğde': 51, 'Ordu': 52, 'Rize': 53, 'Sakarya': 54, 'Samsun': 55,
  'Siirt': 56, 'Sinop': 57, 'Sivas': 58, 'Tekirdağ': 59, 'Tokat': 60,
  'Trabzon': 61, 'Tunceli': 62, 'Şanlıurfa': 63, 'Uşak': 64, 'Van': 65,
  'Yozgat': 66, 'Zonguldak': 67, 'Aksaray': 68, 'Bayburt': 69, 'Karaman': 70,
  'Kırıkkale': 71, 'Batman': 72, 'Şırnak': 73, 'Bartın': 74, 'Ardahan': 75,
  'Iğdır': 76, 'Yalova': 77, 'Karabük': 78, 'Kilis': 79, 'Osmaniye': 80,
  'Düzce': 81,
}

/**
 * Değer listedeki bir il mi (birimler hariç, "Genel Merkez" false döner).
 *
 * DENEYAP'ın `il` alanı için kullanılıyor: DENEYAP gerçek bir ile bağlı
 * olmalı ki harita ve il kırılımı doğru toplasın.
 */
export function ilGecerliMi(value: string | null | undefined): boolean {
  return !!value && (ILLER as readonly string[]).includes(value)
}
