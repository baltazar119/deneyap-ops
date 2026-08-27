import YasalSayfa, { KURUM, type Bolum } from '@/components/YasalSayfa'

export const metadata = {
  title: 'Gizlilik Politikası — DENEYAP OYS',
  description: 'DENEYAP OYS uygulamasında verilerin nasıl toplandığı, korunduğu ve saklandığı',
}

const BOLUMLER: Bolum[] = [
  {
    baslik: 'Kapsam',
    bloklar: [
      { tip: 'p', metin: `Bu politika, ${KURUM.unvan} tarafından ${KURUM.program} operasyonlarının yönetimi için işletilen DENEYAP OYS uygulaması için geçerlidir. Uygulama kurum içi kullanıma yöneliktir; herkese açık bir hizmet değildir.` },
      { tip: 'p', metin: 'Kişisel verilerin işlenmesine ilişkin hukuki dayanaklar ve haklarınız KVKK Aydınlatma Metni\'nde ayrıntılı olarak açıklanmıştır. Bu politika, işin teknik tarafını — verinin nerede durduğunu, nasıl korunduğunu ve kimin gördüğünü — anlatır.' },
    ],
  },
  {
    baslik: 'Toplanan Veriler',
    bloklar: [
      { tip: 'altbaslik', metin: 'Sizin girdiğiniz veriler' },
      { tip: 'p', metin: 'Ad soyad, e-posta, unvan, profil fotoğrafı, sorumlu olduğunuz il/birim; oluşturduğunuz veya güncellediğiniz görevler, durum açıklamaları, yorumlar, yüklediğiniz dosyalar ve çalışma planı kayıtları.' },
      { tip: 'altbaslik', metin: 'Otomatik oluşan veriler' },
      { tip: 'p', metin: 'Giriş ve oturum kayıtları, IP adresi, gönderilen bildirim ve e-postaların kaydı, hata kayıtları.' },
      { tip: 'altbaslik', metin: 'Toplamadığımız veriler' },
      { tip: 'liste', maddeler: [
        'Konum bilgisi — saha giriş/çıkışı yalnızca sizin bastığınız düğmenin zaman damgasıdır',
        'Reklam veya davranışsal takip çerezleri; üçüncü taraf reklam ağı kullanılmaz',
        'Ödeme veya finansal bilgi',
        'Sağlık, biyometrik veya diğer özel nitelikli kişisel veriler',
      ]},
    ],
  },
  {
    baslik: 'Çerezler ve Yerel Depolama',
    bloklar: [
      { tip: 'p', metin: 'Uygulama yalnızca çalışması için zorunlu olan çerezleri kullanır:' },
      { tip: 'tablo', basliklar: ['Amaç', 'Ne tutulur', 'Süre'], satirlar: [
        ['Oturum', 'Supabase kimlik doğrulama jetonu', 'Çıkış yapana kadar'],
        ['Tercih', 'Seçtiğiniz çalışma alanı, menü ve görünüm tercihleri (tarayıcınızda)', 'Siz silene kadar'],
      ]},
      { tip: 'p', metin: 'Analitik veya pazarlama çerezi kullanılmadığı için onay bandı gösterilmez.' },
    ],
  },
  {
    baslik: 'Verinizi Kim Görebilir',
    bloklar: [
      { tip: 'p', metin: 'Erişim, uygulamadaki rolünüz ve sorumlu olduğunuz il ile sınırlıdır. Bu sınır yalnızca arayüzde değil, veritabanı seviyesinde satır bazlı güvenlik politikalarıyla uygulanır — yetkiniz dışındaki kayıtlar sorgu sonucuna hiç dâhil olmaz.' },
      { tip: 'tablo', basliklar: ['Rol', 'Görebildiği'], satirlar: [
        ['Merkez Operasyon Ekibi', 'Tüm iller, tüm görevler, tüm raporlar'],
        ['Koordinatör', 'Tüm iller, risk ve gecikme odaklı görünüm'],
        ['İl Sorumlusu', 'Yalnızca kendi ili ve kendisine atanan görevler'],
        ['Yetkili Yönetici', 'Yalnızca özet göstergeler — kişi bazlı görev detayı gösterilmez'],
      ]},
      { tip: 'not', metin: 'Farklı çalışma alanları (workspace) birbirinden tamamen yalıtılmıştır. Bir çalışma alanının verisi başka bir alanın üyelerine hiçbir koşulda görünmez.' },
    ],
  },
  {
    baslik: 'Güvenlik Önlemleri',
    bloklar: [
      { tip: 'liste', maddeler: [
        'Tüm trafik HTTPS ile şifrelenir; veriler sağlayıcıda diskte şifreli saklanır',
        'Parolalar geri döndürülemez şekilde özetlenerek (hash) saklanır; hiçbir yerde açık metin tutulmaz',
        'Yetkilendirme veritabanı seviyesinde satır bazlı güvenlik politikalarıyla zorunlu kılınır',
        'Giriş ve hassas işlemler için hız sınırlaması uygulanır',
        'E-posta ve Telegram üzerinden gelen tek dokunuşluk işlem bağlantıları tek kullanımlıktır, süreli olarak geçerlidir ve veritabanında yalnızca özetleri tutulur',
        'Zamanlanmış görevler yalnızca gizli anahtarla çağrılabilir; anahtar tanımlı değilse uç noktalar tüm istekleri reddeder',
      ]},
      { tip: 'p', metin: 'Hiçbir sistem mutlak güvenlik vaat edemez. Bir güvenlik açığı fark ederseniz kötüye kullanmadan aşağıdaki adrese bildirmenizi rica ederiz.' },
    ],
  },
  {
    baslik: 'Hizmet Sağlayıcılar',
    bloklar: [
      { tip: 'p', metin: 'Uygulama aşağıdaki sağlayıcıları kullanır. Her biri yalnızca kendi işlevi için gereken veriyi görür ve veriyi kendi amaçları için kullanamaz.' },
      { tip: 'tablo', basliklar: ['Sağlayıcı', 'İşlev'], satirlar: [
        ['Supabase', 'Veritabanı, kimlik doğrulama, dosya saklama'],
        ['Vercel', 'Uygulamanın barındırılması ve zamanlanmış görevler'],
        ['Google Gemini', 'AI Görev Asistanı — yalnızca bu özelliği kullandığınızda'],
        ['Google Drive / Takvim', 'Dosya ve toplantı entegrasyonu — yalnızca bağlarsanız'],
        ['Telegram', 'Bildirim iletimi — yalnızca bağlarsanız'],
        ['SMTP sağlayıcısı', 'Bildirim ve rapor e-postalarının iletimi'],
        ['Upstash', 'Hız sınırlaması / kötüye kullanım koruması'],
      ]},
      { tip: 'not', metin: 'AI Görev Asistanı\'na gönderilen metin, görev başlığı ve açıklamasıyla sınırlıdır. Kişi listesi, e-posta adresleri ve saha kayıtları modele gönderilmez.' },
    ],
  },
  {
    baslik: 'Yurt Dışına Aktarım',
    bloklar: [
      { tip: 'p', metin: 'Yukarıdaki sağlayıcıların bir kısmının sunucuları Türkiye dışında bulunmaktadır. Bu aktarım, hizmetin sunulabilmesi için zorunludur ve KVKK\'nın aktarıma ilişkin hükümleri çerçevesinde gerçekleştirilir.' },
    ],
  },
  {
    baslik: 'Veriniz Üzerindeki Kontrolünüz',
    bloklar: [
      { tip: 'liste', maddeler: [
        'Profil sayfanızdan verilerinizin tamamını JSON dosyası olarak indirebilirsiniz',
        'Profil ve bildirim tercihlerinizi istediğiniz zaman değiştirebilirsiniz',
        'Telegram bağlantınızı tek tıkla kaldırabilirsiniz',
        'E-posta bildirimlerini tamamen kapatabilir veya günlük/haftalık özete çevirebilirsiniz',
        'Hesabınızın silinmesini talep edebilirsiniz',
      ]},
      { tip: 'p', metin: 'Hesabınız silindiğinde profil ve kişisel kayıtlarınız silinir. Oluşturduğunuz görevler kurumsal operasyon kaydı olduğu için silinmez; bu kayıtlardaki kişi bağlantısı kaldırılır.' },
    ],
  },
  {
    baslik: 'Çocukların Verileri',
    bloklar: [
      { tip: 'p', metin: 'DENEYAP OYS, atölye öğrencilerinin değil, operasyon ekiplerinin kullanımı için tasarlanmıştır. Uygulamada öğrenci kişisel verisi tutulması amaçlanmaz; görev açıklamalarına öğrenci kişisel bilgisi yazılmamalıdır.' },
    ],
  },
  {
    baslik: 'İletişim',
    bloklar: [
      { tip: 'p', metin: `Gizlilikle ilgili soru, talep ve güvenlik bildirimleri için: ${KURUM.iletisim}` },
      { tip: 'p', metin: 'Bu politika güncellendiğinde yeni metin bu sayfada yayımlanır ve sayfanın başındaki tarih güncellenir. Önemli değişikliklerde uygulama içinden ayrıca bilgilendirme yapılır.' },
    ],
  },
]

export default function GizlilikPage() {
  return (
    <YasalSayfa
      ustBaslik="Gizlilik"
      baslik="Gizlilik Politikası"
      guncelleme="27 Ağustos 2026"
      girisMetni="Bu politika, DENEYAP OYS uygulamasında hangi verilerin toplandığını, nerede saklandığını, kimin görebildiğini ve nasıl korunduğunu açıklar."
      bolumler={BOLUMLER}
    />
  )
}
