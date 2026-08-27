import YasalSayfa, { KURUM, type Bolum } from '@/components/YasalSayfa'

export const metadata = {
  title: 'Kullanım Şartları — DENEYAP OYS',
  description: 'DENEYAP OYS uygulamasının kullanımına ilişkin şartlar ve kullanıcı yükümlülükleri',
}

const BOLUMLER: Bolum[] = [
  {
    baslik: 'Taraflar ve Kabul',
    bloklar: [
      { tip: 'p', metin: `Bu şartlar, DENEYAP OYS uygulamasını işleten ${KURUM.unvan} ile uygulamayı kullanan kişi arasındaki kullanım ilişkisini düzenler. Uygulamaya giriş yapmanız bu şartları kabul ettiğiniz anlamına gelir.` },
      { tip: 'p', metin: 'Şartları kabul etmiyorsanız uygulamayı kullanmamalısınız.' },
    ],
  },
  {
    baslik: 'Hizmetin Tanımı',
    bloklar: [
      { tip: 'p', metin: 'DENEYAP OYS; il ve birim operasyonlarının merkezi olarak planlanması, görevlerin atanması, durum ve termin takibi, gecikme uyarıları ve raporlama için kullanılan bir operasyon yönetim sistemidir.' },
      { tip: 'p', metin: 'Uygulama kurum içi kullanıma yöneliktir. Erişim, kuruma bağlı bir davet veya katılım kodu ile verilir.' },
    ],
  },
  {
    baslik: 'Hesap ve Erişim',
    bloklar: [
      { tip: 'liste', maddeler: [
        'Hesap bilgilerinizin gizliliğinden ve hesabınızla yapılan işlemlerden siz sorumlusunuz',
        'Hesabınızı başkasıyla paylaşamaz, başkası adına işlem yapamazsınız',
        'Yetkisiz bir erişim fark ederseniz derhâl bildirmelisiniz',
        'Katılım kodları ve davet bağlantıları kurum dışına paylaşılamaz',
        'Kurumla ilişiğiniz kesildiğinde erişiminiz kaldırılır',
      ]},
    ],
  },
  {
    baslik: 'Kullanıcı Yükümlülükleri',
    bloklar: [
      { tip: 'p', metin: 'Uygulamayı kullanırken:' },
      { tip: 'liste', maddeler: [
        'Girdiğiniz görev ve durum bilgilerinin doğru ve güncel olmasından sorumlusunuz',
        'Görev açıklamalarına gerekli olmayan kişisel veri (öğrenci bilgisi, kimlik numarası, sağlık bilgisi vb.) yazmamalısınız',
        'Yetkiniz dışındaki verilere erişmeye çalışamazsınız',
        'Sistemin güvenliğini test etmeye, tersine mühendislik yapmaya veya otomatik araçlarla aşırı yük oluşturmaya çalışamazsınız',
        'Uygulamadan aldığınız rapor ve dışa aktarımları yalnızca görev kapsamınızda kullanabilir, yetkisiz kişilerle paylaşamazsınız',
        'Hukuka aykırı, zarar verici veya kurum itibarını zedeleyici içerik yükleyemezsiniz',
      ]},
      { tip: 'not', metin: 'Uygulamadan indirdiğiniz Excel ve PDF raporlar kişi bazlı performans verisi içerebilir. Bu dosyaların paylaşımından ve saklanmasından indiren kişi sorumludur.' },
    ],
  },
  {
    baslik: 'İçerik ve Fikrî Haklar',
    bloklar: [
      { tip: 'p', metin: `Uygulamanın yazılımı, tasarımı, marka ve logoları üzerindeki haklar ${KURUM.unvan}'na aittir. Uygulamaya girdiğiniz operasyon verileri kuruma ait kurumsal kayıt niteliğindedir.` },
      { tip: 'p', metin: 'Uygulamanın kaynak kodu veya arayüzü, izin alınmaksızın kopyalanamaz, çoğaltılamaz veya türev çalışma üretiminde kullanılamaz.' },
    ],
  },
  {
    baslik: 'AI Görev Asistanı',
    bloklar: [
      { tip: 'p', metin: 'Uygulamadaki AI Görev Asistanı, girilen hedeften görev önerileri üretir. Üretilen öneriler yalnızca taslaktır; hatalı, eksik veya bağlama uygun olmayan çıktı verebilir.' },
      { tip: 'liste', maddeler: [
        'Önerilen görevler yayımlanmadan önce yetkili kullanıcı tarafından gözden geçirilmelidir',
        'AI çıktısına dayanarak alınan kararların sorumluluğu kullanıcıya aittir',
        'Asistana gizli veya kişisel veri girilmemelidir',
      ]},
    ],
  },
  {
    baslik: 'Hizmet Sürekliliği',
    bloklar: [
      { tip: 'p', metin: 'Uygulamanın kesintisiz çalışması hedeflenir ancak garanti edilmez. Bakım, güncelleme, hizmet sağlayıcı kaynaklı arıza veya mücbir sebeplerle geçici kesintiler yaşanabilir.' },
      { tip: 'p', metin: 'Planlı bakımlar mümkün olduğunca önceden duyurulur. Özellikler geliştirilebilir, değiştirilebilir veya kaldırılabilir.' },
    ],
  },
  {
    baslik: 'Bildirimler',
    bloklar: [
      { tip: 'p', metin: 'Uygulama; görev atama, yaklaşan termin ve gecikme durumlarında e-posta ve — bağlamışsanız — Telegram üzerinden bildirim gönderir. Bildirimlerin iletimi üçüncü taraf sağlayıcılara bağlı olduğundan gecikebilir veya ulaşmayabilir.' },
      { tip: 'p', metin: 'Bildirimlerin ulaşmamış olması, görev ve terminlere ilişkin sorumluluğu ortadan kaldırmaz. Güncel durum her zaman uygulama içinden takip edilmelidir.' },
    ],
  },
  {
    baslik: 'Sorumluluğun Sınırlandırılması',
    bloklar: [
      { tip: 'p', metin: 'Uygulama "olduğu gibi" sunulmaktadır. Kurum; veri kaybı, kesinti, bildirim ulaşmaması veya üçüncü taraf hizmetlerinden kaynaklanan dolaylı zararlardan, mevzuatın izin verdiği ölçüde sorumlu tutulamaz.' },
      { tip: 'p', metin: 'Kullanıcının bu şartlara aykırı davranışından doğan zararlardan kullanıcı sorumludur.' },
    ],
  },
  {
    baslik: 'Erişimin Askıya Alınması',
    bloklar: [
      { tip: 'p', metin: 'Bu şartlara aykırılık, güvenliğin tehlikeye düşmesi veya kurumla ilişiğin kesilmesi hâllerinde hesabınız bildirimsiz olarak askıya alınabilir veya kapatılabilir.' },
    ],
  },
  {
    baslik: 'Değişiklikler ve Uygulanacak Hukuk',
    bloklar: [
      { tip: 'p', metin: 'Bu şartlar gerektiğinde güncellenebilir; güncel metin bu sayfada yayımlanır. Değişiklik sonrası kullanıma devam etmeniz yeni şartları kabul ettiğiniz anlamına gelir.' },
      { tip: 'p', metin: 'Bu şartlara Türkiye Cumhuriyeti hukuku uygulanır. Uyuşmazlıklarda İstanbul mahkemeleri ve icra daireleri yetkilidir.' },
      { tip: 'p', metin: `İletişim: ${KURUM.iletisim}` },
    ],
  },
]

export default function KullanimSartlariPage() {
  return (
    <YasalSayfa
      ustBaslik="Kullanım"
      baslik="Kullanım Şartları"
      guncelleme="27 Ağustos 2026"
      girisMetni="Bu metin, DENEYAP OYS uygulamasının kullanımına ilişkin kuralları, kullanıcı yükümlülüklerini ve sorumluluk sınırlarını düzenler."
      bolumler={BOLUMLER}
    />
  )
}
