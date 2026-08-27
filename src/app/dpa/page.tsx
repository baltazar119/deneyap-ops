import YasalSayfa, { KURUM, type Bolum } from '@/components/YasalSayfa'

export const metadata = {
  title: 'Veri İşleme Sözleşmesi (DPA) — DENEYAP OYS',
  description: 'DENEYAP OYS için veri işleyen yükümlülükleri, alt işleyenler ve teknik/idari tedbirler',
}

const BOLUMLER: Bolum[] = [
  {
    baslik: 'Amaç ve Taraflar',
    bloklar: [
      { tip: 'p', metin: `Bu sözleşme, DENEYAP OYS uygulaması aracılığıyla işlenen kişisel veriler bakımından veri sorumlusu ile veri işleyen arasındaki yükümlülükleri düzenler.` },
      { tip: 'tablo', basliklar: ['Sıfat', 'Taraf'], satirlar: [
        ['Veri sorumlusu', KURUM.unvan],
        ['Veri işleyen', 'DENEYAP OYS uygulamasını kurum adına işleten teknik ekip'],
        ['Alt işleyenler', 'Aşağıda 5. bölümde listelenen hizmet sağlayıcılar'],
      ]},
      { tip: 'p', metin: 'Veri işleyen, kişisel verileri yalnızca veri sorumlusunun talimatları doğrultusunda ve bu sözleşmede belirlenen amaçlarla işler.' },
    ],
  },
  {
    baslik: 'İşlemenin Konusu ve Süresi',
    bloklar: [
      { tip: 'tablo', basliklar: ['Başlık', 'İçerik'], satirlar: [
        ['Konu', 'Operasyon görevlerinin planlanması, atanması, takibi ve raporlanması'],
        ['Nitelik', 'Toplama, kaydetme, saklama, güncelleme, sınıflandırma, aktarma, silme'],
        ['Amaç', 'Uygulamanın sözleşmeye uygun şekilde işletilmesi'],
        ['Süre', 'Uygulamanın işletildiği süre ve mevzuatın öngördüğü saklama süreleri boyunca'],
        ['İlgili kişiler', 'Kurum çalışanları, il sorumluları, koordinatörler, yöneticiler'],
        ['Veri kategorileri', 'Kimlik, iletişim, görsel, mesleki deneyim, işlem güvenliği, faaliyet verileri'],
      ]},
    ],
  },
  {
    baslik: 'Veri İşleyenin Yükümlülükleri',
    bloklar: [
      { tip: 'liste', maddeler: [
        'Kişisel verileri yalnızca veri sorumlusunun yazılı talimatları doğrultusunda işlemek',
        'Verileri kendi amaçları için kullanmamak, üçüncü kişilere satmamak veya devretmemek',
        'Verilere erişimi görev gereği bilmesi gerekenlerle sınırlamak ve erişen personeli gizlilikle yükümlü kılmak',
        'Aşağıda belirtilen teknik ve idari tedbirleri almak ve sürdürmek',
        'Alt işleyen kullanımını bu sözleşmede belirtilen çerçeveyle sınırlı tutmak ve yeni alt işleyenleri bildirmek',
        'İlgili kişi başvurularında veri sorumlusuna gerekli desteği sağlamak',
        'Veri ihlallerini gecikmeksizin bildirmek',
        'İşleme faaliyeti sona erdiğinde verileri veri sorumlusunun talimatına göre iade etmek veya silmek',
      ]},
    ],
  },
  {
    baslik: 'Teknik ve İdari Tedbirler',
    bloklar: [
      { tip: 'altbaslik', metin: 'Teknik tedbirler' },
      { tip: 'liste', maddeler: [
        'Aktarımda TLS/HTTPS şifreleme, saklamada disk seviyesinde şifreleme',
        'Parolaların geri döndürülemez şekilde özetlenerek saklanması',
        'Veritabanı seviyesinde satır bazlı güvenlik ile çalışma alanı ve il bazlı yalıtım',
        'Rol bazlı yetkilendirme (Merkez Operasyon / Koordinatör / İl Sorumlusu / Yetkili Yönetici)',
        'Hassas uç noktalarda hız sınırlaması ve kötüye kullanım koruması',
        'Tek kullanımlık ve süreli işlem jetonları; veritabanında yalnızca jeton özetinin tutulması',
        'Zamanlanmış görevlerin gizli anahtarla korunması; anahtar yoksa tüm isteklerin reddedilmesi',
        'Yönetimsel anahtarların yalnızca sunucu tarafında tutulması ve istemci paketine dâhil edilmemesi',
        'Uygulama günlükleri ve hata takibi',
      ]},
      { tip: 'altbaslik', metin: 'İdari tedbirler' },
      { tip: 'liste', maddeler: [
        'Erişimin en az yetki ilkesine göre verilmesi ve periyodik gözden geçirilmesi',
        'Kurumla ilişiği kesilen kullanıcıların erişiminin kaldırılması',
        'Gizlilik yükümlülüğü ve KVKK farkındalığı',
        'Değişikliklerin sürüm kontrolü altında ve gözden geçirilerek yayına alınması',
      ]},
    ],
  },
  {
    baslik: 'Alt İşleyenler',
    bloklar: [
      { tip: 'p', metin: 'Veri sorumlusu, aşağıdaki alt işleyenlerin kullanılmasına onay vermiştir:' },
      { tip: 'tablo', basliklar: ['Alt işleyen', 'Hizmet', 'İşlenen veri'], satirlar: [
        ['Supabase', 'Veritabanı, kimlik doğrulama, dosya saklama', 'Tüm uygulama verisi'],
        ['Vercel', 'Barındırma, serverless çalıştırma, zamanlanmış görevler', 'Bağlantı kayıtları, IP'],
        ['Google (Gemini)', 'AI görev önerisi', 'Görev başlık ve açıklamaları'],
        ['Google (Drive, Takvim)', 'Dosya ve toplantı entegrasyonu', 'Yüklenen dosyalar, toplantı bilgileri'],
        ['Telegram', 'Bildirim iletimi', 'Bildirim metni, sohbet kimliği'],
        ['SMTP sağlayıcısı', 'E-posta iletimi', 'E-posta adresi, bildirim içeriği, rapor ekleri'],
        ['Upstash', 'Hız sınırlaması', 'IP adresi'],
      ]},
      { tip: 'p', metin: 'Google Drive/Takvim ve Telegram yalnızca ilgili kullanıcı bu entegrasyonu kendisi bağladığında devreye girer. Yeni bir alt işleyen eklenmesi hâlinde veri sorumlusu önceden bilgilendirilir ve itiraz hakkı saklıdır.' },
    ],
  },
  {
    baslik: 'Yurt Dışına Aktarım',
    bloklar: [
      { tip: 'p', metin: 'Alt işleyenlerin bir kısmının sunucuları yurt dışında bulunmaktadır. Aktarım, KVKK\'nın yurt dışına aktarıma ilişkin hükümleri çerçevesinde ve hizmetin sunulması için gerekli olan asgari veriyle sınırlı olarak gerçekleştirilir.' },
    ],
  },
  {
    baslik: 'Veri İhlali Bildirimi',
    bloklar: [
      { tip: 'p', metin: 'Veri işleyen, öğrendiği her veri ihlalini gecikmeksizin ve en geç 24 saat içinde veri sorumlusuna bildirir. Bildirim; ihlalin niteliğini, etkilenen veri kategorilerini ve yaklaşık ilgili kişi sayısını, olası sonuçlarını ve alınan/alınacak tedbirleri içerir.' },
      { tip: 'p', metin: 'Kişisel Verileri Koruma Kurulu\'na bildirim yükümlülüğü veri sorumlusuna aittir; veri işleyen bu süreçte gereken tüm bilgi ve desteği sağlar.' },
    ],
  },
  {
    baslik: 'Denetim',
    bloklar: [
      { tip: 'p', metin: 'Veri sorumlusu, makul bildirim süresi vermek kaydıyla, veri işleyenin bu sözleşmeden doğan yükümlülüklerine uygunluğunu denetleyebilir veya denetlettirebilir. Veri işleyen gerekli bilgi ve belgeleri sağlar.' },
    ],
  },
  {
    baslik: 'İade ve İmha',
    bloklar: [
      { tip: 'p', metin: 'İşleme faaliyeti sona erdiğinde veri işleyen, veri sorumlusunun tercihine göre kişisel verileri yaygın bir formatta iade eder veya siler; mevzuat gereği saklanması zorunlu veriler bu yükümlülüğün dışındadır ve saklandığı sürece bu sözleşmedeki korumalara tabidir.' },
      { tip: 'p', metin: 'Kullanıcılar kendi verilerini her zaman profil sayfasından JSON olarak dışa aktarabilir.' },
    ],
  },
  {
    baslik: 'Yürürlük ve İletişim',
    bloklar: [
      { tip: 'p', metin: 'Bu sözleşme, uygulamanın kullanıma alındığı tarihte yürürlüğe girer ve işleme faaliyeti sürdüğü sürece geçerlidir. Bu sözleşmede hüküm bulunmayan hâllerde 6698 sayılı Kanun ve ilgili ikincil mevzuat uygulanır.' },
      { tip: 'p', metin: `İletişim: ${KURUM.iletisim} — ${KURUM.adres}` },
    ],
  },
]

export default function DpaPage() {
  return (
    <YasalSayfa
      ustBaslik="Veri İşleme Sözleşmesi"
      baslik="Veri İşleme Sözleşmesi (DPA)"
      guncelleme="27 Ağustos 2026"
      girisMetni="Bu metin, DENEYAP OYS uygulamasında kişisel verilerin işlenmesine ilişkin veri sorumlusu ve veri işleyen yükümlülüklerini, alt işleyenleri ve alınan teknik/idari tedbirleri düzenler."
      bolumler={BOLUMLER}
    />
  )
}
