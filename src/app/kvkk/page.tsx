import YasalSayfa, { KURUM, type Bolum } from '@/components/YasalSayfa'

export const metadata = {
  title: 'KVKK Aydınlatma Metni — DENEYAP OYS',
  description: '6698 sayılı KVKK kapsamında kişisel verilerin işlenmesine ilişkin aydınlatma metni',
}

const BOLUMLER: Bolum[] = [
  {
    baslik: 'Veri Sorumlusu',
    bloklar: [
      { tip: 'p', metin: `6698 sayılı Kişisel Verilerin Korunması Kanunu ("Kanun") uyarınca kişisel verileriniz, veri sorumlusu sıfatıyla ${KURUM.unvan} tarafından aşağıda açıklanan kapsamda işlenmektedir.` },
      { tip: 'tablo', basliklar: ['Alan', 'Bilgi'], satirlar: [
        ['Veri sorumlusu', KURUM.unvan],
        ['Program', KURUM.program],
        ['Uygulama', 'DENEYAP OYS — Operasyon Yönetim Sistemi'],
        ['Adres', KURUM.adres],
        ['Başvuru e-postası', KURUM.iletisim],
        ['VERBİS kayıt no', KURUM.verbis],
      ]},
    ],
  },
  {
    baslik: 'İşlenen Kişisel Veriler',
    bloklar: [
      { tip: 'p', metin: 'Uygulamayı kullanmanız sırasında aşağıdaki veri kategorileri işlenmektedir. Bu liste uygulamanın fiilen tuttuğu verilere göre hazırlanmıştır.' },
      { tip: 'tablo', basliklar: ['Kategori', 'İşlenen veriler'], satirlar: [
        ['Kimlik', 'Ad soyad, kullanıcı adı, unvan'],
        ['İletişim', 'E-posta adresi'],
        ['Görsel', 'Profil fotoğrafı (yüklerseniz)'],
        ['Mesleki deneyim', 'Sorumlu olduğunuz il/birim, uygulamadaki rolünüz, beceri etiketleri'],
        ['İşlem güvenliği', 'Giriş kayıtları, IP adresi, oturum bilgisi, e-posta ve bildirim gönderim kayıtları'],
        ['Faaliyet', 'Size atanan görevler, girdiğiniz durum açıklamaları, saha giriş/çıkış kayıtları, çalışma planı, yüklediğiniz dosyalar, sohbet ve toplantı kayıtları'],
        ['Üçüncü taraf hesap', 'Telegram bildirimlerini açarsanız Telegram sohbet kimliğiniz; Google ile giriş yaparsanız Google hesabınızın temel bilgileri'],
      ]},
      { tip: 'not', metin: 'Saha giriş/çıkış kaydı yalnızca sizin bastığınız "Giriş / Çıkış" düğmesiyle oluşan zaman damgasıdır. Uygulama konum bilgisi toplamaz, arka planda takip yapmaz.' },
    ],
  },
  {
    baslik: 'İşleme Amaçları',
    bloklar: [
      { tip: 'liste', maddeler: [
        'DENEYAP il operasyonlarının merkezi olarak planlanması, görev atanması ve takibi',
        'Görev terminlerinin izlenmesi, gecikme ve yaklaşan termin uyarılarının iletilmesi',
        'Rol ve sorumluluk alanına göre erişim yetkilendirmesi yapılması',
        'Tamamlanma oranları ve gecikmelere ilişkin raporlama yapılması',
        'Uygulama güvenliğinin sağlanması, kötüye kullanımın önlenmesi',
        'Talep ve başvurularınızın karşılanması',
      ]},
    ],
  },
  {
    baslik: 'Hukuki Sebepler',
    bloklar: [
      { tip: 'p', metin: 'Kişisel verileriniz Kanun\'un 5. maddesinde yer alan aşağıdaki hukuki sebeplere dayanılarak işlenmektedir:' },
      { tip: 'liste', maddeler: [
        'Bir sözleşmenin kurulması veya ifasıyla doğrudan doğruya ilgili olması (md. 5/2-c)',
        'Veri sorumlusunun hukuki yükümlülüğünü yerine getirmesi (md. 5/2-ç)',
        'İlgili kişinin temel hak ve özgürlüklerine zarar vermemek kaydıyla veri sorumlusunun meşru menfaatleri (md. 5/2-f)',
        'Telegram bildirimleri gibi isteğe bağlı özelliklerde açık rızanız (md. 5/1)',
      ]},
    ],
  },
  {
    baslik: 'Toplama Yöntemi',
    bloklar: [
      { tip: 'p', metin: 'Kişisel verileriniz; uygulamaya kayıt olmanız, profil bilgilerinizi girmeniz, görevler üzerinde işlem yapmanız ve yöneticiniz tarafından ekibe eklenmeniz yoluyla elektronik ortamda otomatik ve kısmen otomatik yollarla toplanmaktadır.' },
      { tip: 'p', metin: 'Merkez ekip tarafından Excel dosyası içe aktarıldığında, dosyada yer alan ad veya e-posta bilgileri de bu kapsamda işlenir.' },
    ],
  },
  {
    baslik: 'Aktarım',
    bloklar: [
      { tip: 'p', metin: 'Verileriniz, hizmetin sunulabilmesi için aşağıdaki hizmet sağlayıcılara aktarılmaktadır. Bu sağlayıcıların bir kısmının sunucuları yurt dışında bulunmaktadır.' },
      { tip: 'tablo', basliklar: ['Sağlayıcı', 'Amaç', 'Aktarılan veri'], satirlar: [
        ['Supabase', 'Veritabanı, kimlik doğrulama, dosya saklama', 'Tüm uygulama verisi'],
        ['Vercel', 'Uygulamanın barındırılması', 'Bağlantı kayıtları, IP adresi'],
        ['Google (Gemini)', 'AI Görev Asistanı — yalnızca bu özelliği kullanırsanız', 'Görev başlıkları ve açıklamaları'],
        ['Google (Drive, Takvim)', 'Dosya ve toplantı entegrasyonu — bağlarsanız', 'Yüklediğiniz dosyalar, toplantı bilgileri'],
        ['Telegram', 'Bildirim iletimi — bağlarsanız', 'Bildirim metni, sohbet kimliğiniz'],
        ['E-posta sağlayıcısı (SMTP)', 'Bildirim ve rapor e-postalarının iletilmesi', 'E-posta adresiniz, bildirim içeriği, rapor ekleri'],
        ['Upstash', 'Kötüye kullanım koruması', 'IP adresi'],
      ]},
      { tip: 'p', metin: 'Ayrıca yasal olarak yetkili kamu kurum ve kuruluşlarına, talep edilmesi hâlinde ve mevzuatın öngördüğü ölçüde aktarım yapılabilir.' },
      { tip: 'not', metin: 'Verileriniz pazarlama amacıyla üçüncü taraflara satılmaz, kiralanmaz veya devredilmez.' },
    ],
  },
  {
    baslik: 'Saklama Süresi',
    bloklar: [
      { tip: 'liste', maddeler: [
        'Hesap ve profil verileri: hesabınız aktif olduğu sürece',
        'Görev, rapor ve operasyon kayıtları: ilgili faaliyet dönemi ve sonrasında mevzuatın öngördüğü süre boyunca',
        'Giriş ve işlem güvenliği kayıtları: 2 yıl',
        'Bildirim gönderim kayıtları: 1 yıl',
        'Tek kullanımlık işlem bağlantıları: 7 gün',
        'İçe aktarma dosyaları ve satır kayıtları: ilgili içe aktarma silinene kadar',
      ]},
      { tip: 'p', metin: 'Sürelerin dolması hâlinde verileriniz silinir, yok edilir veya anonim hâle getirilir.' },
    ],
  },
  {
    baslik: 'Haklarınız',
    bloklar: [
      { tip: 'p', metin: 'Kanun\'un 11. maddesi uyarınca veri sorumlusuna başvurarak aşağıdaki haklarınızı kullanabilirsiniz:' },
      { tip: 'liste', maddeler: [
        'Kişisel verinizin işlenip işlenmediğini öğrenme',
        'İşlenmişse buna ilişkin bilgi talep etme',
        'İşlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme',
        'Yurt içinde veya yurt dışında aktarıldığı üçüncü kişileri bilme',
        'Eksik veya yanlış işlenmişse düzeltilmesini isteme',
        'Kanun\'un 7. maddesindeki şartlar çerçevesinde silinmesini veya yok edilmesini isteme',
        'Düzeltme, silme ve yok etme işlemlerinin aktarıldığı üçüncü kişilere bildirilmesini isteme',
        'Münhasıran otomatik sistemlerle analiz edilmesi suretiyle aleyhinize bir sonucun ortaya çıkmasına itiraz etme',
        'Kanuna aykırı işleme sebebiyle zarara uğramanız hâlinde zararın giderilmesini talep etme',
      ]},
      { tip: 'altbaslik', metin: 'Uygulama içinden kullanabileceğiniz haklar' },
      { tip: 'p', metin: 'Profil sayfanızdaki "Verilerimi İndir" düğmesiyle sizinle ilgili tuttuğumuz verilerin tamamını JSON dosyası olarak indirebilirsiniz. Hesabınızın silinmesi talebinizi aşağıdaki e-posta adresinden iletebilirsiniz.' },
      { tip: 'p', metin: `Başvurularınızı ${KURUM.iletisim} adresine iletebilirsiniz. Başvurunuz en geç otuz gün içinde sonuçlandırılır.` },
    ],
  },
  {
    baslik: 'Otomatik Karar Verme',
    bloklar: [
      { tip: 'p', metin: 'Uygulamadaki "Operasyon Riski" ve gecikme uyarıları, mevcut görev ve termin verisinden otomatik olarak hesaplanır. Bu hesaplamalar yalnızca yöneticilere bilgi ve önceliklendirme amacıyla sunulur; kişiler hakkında hukuki sonuç doğuran otomatik bir karar üretmez.' },
    ],
  },
  {
    baslik: 'Değişiklikler',
    bloklar: [
      { tip: 'p', metin: 'Bu aydınlatma metni gerektiğinde güncellenebilir. Güncel metin her zaman bu sayfada yayımlanır; sayfanın başındaki tarih son güncelleme tarihini gösterir.' },
    ],
  },
]

export default function KvkkPage() {
  return (
    <YasalSayfa
      ustBaslik="6698 Sayılı Kişisel Verilerin Korunması Kanunu"
      baslik="KVKK Aydınlatma Metni"
      guncelleme="27 Ağustos 2026"
      girisMetni="Bu metin, DENEYAP OYS uygulamasını kullanırken kişisel verilerinizin hangi amaçlarla, hangi hukuki sebeplere dayanılarak işlendiğini ve haklarınızı açıklar."
      bolumler={BOLUMLER}
    />
  )
}
