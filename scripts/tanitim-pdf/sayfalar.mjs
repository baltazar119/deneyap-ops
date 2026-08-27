/**
 * Sayfa sayfa rehber verisi. Kaynak: src/app/org/[slug]/**\/page.tsx
 * kod okunarak çıkarılmış gerçek başlık/bölüm/eylem metinleri.
 *
 * kimGorur: hangi roller bu sayfaya erişebilir (menuler.mjs kısaAd'larıyla eşleşir)
 * bolumler: kullanıcının yukarıdan aşağı gördüğü sıradaki bölümler
 * eylemler: sayfadaki ana interaktif eylemler
 * durumlar: varsa durum/renk rozetleri
 */

const MERKEZ = 'Merkez · Koordinatör'
const IL = 'İl Sorumlusu'
const YONETICI = 'Yetkili Yönetici'

export const SAYFALAR = [
  {
    yol: '/dashboard',
    baslik: 'Panel',
    kimGorur: [MERKEZ, YONETICI],
    ozet: 'Merkez ekip ve yöneticinin açılış ekranı — tüm organizasyonun anlık durumu tek bakışta.',
    bolumler: [
      'Başlık: çalışma alanı adı + "Operasyon paneli"',
      'KPI kartları (4): Toplam Üye · Sahada · Yapılan Görev · Gecikmiş — her biri tıklanınca detay listesi açılır',
      'Aktif Sprint kartı: durum sayaçları (Beklemede / Yapılıyor / Test / Bloke)',
      'Ekip listesi: avatar, isim, rol · il, görev sayısı rozeti, gecikmiş rozeti, sahada göstergesi',
      '"Tüm üyeleri gör ›" bağlantısı',
    ],
    eylemler: ['KPI kartına tıkla › detay listesi', 'Ekip listesine git'],
    durumlar: [
      { ad: 'Üye', renk: '#2288c9' }, { ad: 'Sahada', renk: '#059669' },
      { ad: 'Yapılan Görev', renk: '#7c3aed' }, { ad: 'Gecikmiş', renk: '#b45309' },
    ],
  },
  {
    yol: '/me',
    baslik: 'Panelim',
    kimGorur: [IL],
    ozet: 'İl Sorumlusunun açılış ekranı — kendi görevleri, kendi ilinin görevleri, saha durumu.',
    bolumler: [
      'KPI kartları (4): Aktif Görev · Tamamlanan · Geciken · Sprint Görevi',
      'Saha Durumu kartı: Giriş / Çıkış düğmesi, "Sahadasın" / "Sahada değilsin" durumu',
      'Aktif Sprint kartı: bu sprintteki görevleri, boşsa "Bu sprintte açık görev yok"',
      'Saha Planım: haftalık takvim görünümü',
      'Bana Atanan Görevler: açık görevler + ayrı "Tamamlananlar" bölümü',
      '"{İl} — İlimin Görevleri": kendine atanmamış ama ilinin diğer açık görevleri',
    ],
    eylemler: ['Giriş / Çıkış (saha kaydı)', 'Görev satırına tıkla › detay'],
    durumlar: [
      { ad: 'Kritik', renk: '#dc2626' }, { ad: 'Yüksek', renk: '#d97706' },
      { ad: 'Normal', renk: '#2288c9' }, { ad: 'Düşük', renk: '#6b7280' },
    ],
    not: 'Gecikmiş bir görev satırı kırmızı çerçeve ile ayrıca vurgulanır.',
  },
  {
    yol: '/tasks',
    baslik: 'Görevler',
    kimGorur: [MERKEZ, IL, YONETICI],
    ozet: 'Tüm görevlerin filtrelenebilir listesi — sistemin ana çalışma ekranı.',
    bolumler: [
      'Başlık + görev sayısı',
      'Termin süzgeci: "Gecikenler" / "Bu hafta biten" sayaçları',
      'Öncelik filtre çipleri (sayaçlı)',
      'Filtre satırı: Durum, Tür, İl, Üye + Temizle',
      'Görev listesi: öncelik çizgisi, başlık, rozetler (öncelik/tür/il/atanan/sprint), termin, durum rozeti',
    ],
    eylemler: ['Excel’den İçe Aktar (yetkiliye görünür)', '+ Görev Oluştur (yetkiliye görünür)', 'Düzenle / Sil (satır bazlı)'],
    durumlar: [
      { ad: 'Beklemede', renk: '#94a3b8' }, { ad: 'Yapılıyor', renk: '#2288c9' },
      { ad: 'Test', renk: '#f59e0b' }, { ad: 'Bloke', renk: '#ef4444' }, { ad: 'Tamamlandı', renk: '#10b981' },
    ],
    not: 'Görev listesi role ve ile göre önceden süzülür — İl Sorumlusu yalnızca kendi ilini görür.',
  },
  {
    yol: '/tasks/[id]',
    baslik: 'Görev Detayı',
    kimGorur: [MERKEZ, IL, YONETICI],
    ozet: 'Tek bir görevin tüm geçmişi ve açıklamalı durum güncellemesi.',
    bolumler: [
      'Görev başlığı + öncelik/tür rozetleri',
      'Açıklama + "Durumu Güncelle" (açılınca durum seçimi + açıklama alanı)',
      'Bilgi grid’i: Atanan, Son Tarih, Tahmini/Gerçekleşen Süre, Oluşturulma tarihi',
      'Bağımlı Görevler listesi',
      'Görev dosyaları (Drive)',
      'Görev Çıktıları: Not / Link ekleme ve listesi',
    ],
    eylemler: ['Durumu Güncelle (açıklama zorunlu değil ama önerilir)', '+ Çıktı Ekle', '+ Bağımlılık Ekle (yetkili)'],
    not: 'PRD’nin "durum güncelleme açıklama ile" maddesi bu ekranda karşılanır.',
  },
  {
    yol: '/tasks/import',
    baslik: 'Excel’den İçe Aktar',
    kimGorur: [MERKEZ],
    ozet: 'Excel/CSV göç akışının arayüzü — üç adım: Dosya › Önizleme › Sonuç.',
    bolumler: [
      'Adım 1 — Dosya: sürükle-bırak alanı, "Şablonu İndir (.xlsx)"',
      'Adım 2 — Önizleme: geçerli/uyarı/hata/eşleşen-yeni rozetleri, sütun eşleştirme grid’i, satır listesi (filtrelenebilir), tekrar yükleme modu seçimi (Eşleşeni güncelle / atla / hepsini yeni ekle)',
      'Adım 3 — Sonuç: "X oluşturuldu, Y güncellendi, Z atlandı" özeti',
    ],
    eylemler: ['Şablonu İndir', 'Sütun eşleştirmesini düzenle', '{N} görevi aktar', 'Bu içe aktarmayı geri al'],
    not: 'Her içe aktarma bir "parti" olarak kaydedilir; sonuç beğenilmezse tek tuşla tamamen geri alınabilir.',
  },
  {
    yol: '/kanban',
    baslik: 'Kanban',
    kimGorur: [MERKEZ, IL],
    ozet: 'Sürükle-bırak durum panosu — dört kolon.',
    bolumler: [
      'Aktif Sprint banner’ı (ilerleme yüzdesi)',
      'Filtre çubuğu: Sprint, Üye (yetkili), "Sadece Gecikmiş", arama',
      '4 kolon: Beklemede / Yapılıyor / Test / Tamamlandı',
      'Karta tıklanınca sağda hızlı güncelleme paneli (durum + atanan + "Tam Detay ›")',
    ],
    eylemler: ['Kartı sürükle-bırak › durum değiştir', 'Panelden hızlı güncelle', '+ Görev Oluştur'],
    durumlar: [
      { ad: 'Beklemede', renk: '#94a3b8' }, { ad: 'Yapılıyor', renk: '#2288c9' },
      { ad: 'Test', renk: '#f59e0b' }, { ad: 'Tamamlandı', renk: '#10b981' },
    ],
  },
  {
    yol: '/calendar',
    baslik: 'Takvim',
    kimGorur: [MERKEZ, IL],
    ozet: 'Haftalık/günlük saat ızgarasında görev ve etkinlik görünümü.',
    bolumler: [
      'Sol: mini ay takvimi + "Yaklaşan" listesi + durum bazlı ilerleme çubukları',
      'Ana alan: saatli ızgara (00:00–23:00), "Tüm Gün" şeridinde görev kartları',
      'Boş bir zaman dilimine tıklanınca etkinlik ekleme formu açılır',
      'Bir karta tıklanınca sağda detay paneli (durum, termin, öncelik, "Göreve Git")',
    ],
    eylemler: ['Boşluğa tıkla › etkinlik ekle', 'Karta tıkla › detay', 'Takvimi dışa aktar (.ics)'],
  },
  {
    yol: '/timeline',
    baslik: 'Timeline',
    kimGorur: [MERKEZ, IL, YONETICI],
    ozet: 'Gantt benzeri zaman çizelgesi — görevler ve bağımlılık okları.',
    bolumler: [
      'Sol sabit sütun: görev adı + atanan avatarı',
      'Sağda kaydırılabilir zaman ızgarası: görev çubukları, bağımlılık okları',
      'Zoom: Hafta / Ay / Çeyrek; gruplama: Yok / Sprint / Tür',
    ],
    eylemler: ['Zoom seviyesi değiştir', 'Gruplama değiştir', 'Çubuğa gelince tooltip'],
  },
  {
    yol: '/sprints',
    baslik: 'Sprintler',
    kimGorur: [MERKEZ],
    ozet: 'Sprint oluşturma ve aktifleştirme — yalnızca yönetici rolleri.',
    bolumler: [
      'Aktif Sprint kartı: tarih aralığı, kalan gün, ilerleme yüzdesi, istatistik pilleri',
      'Diğer Sprintler listesi: ilerleme çubuğu, "Aktifleştir / Düzenle / Sil"',
    ],
    eylemler: ['+ Yeni Sprint', 'Aktifleştir / Pasifleştir', 'Düzenle / Sil'],
  },
  {
    yol: '/risk',
    baslik: 'Operasyon Riski',
    kimGorur: [MERKEZ, YONETICI],
    ozet: 'Mevcut görev ve sprint verisinden otomatik hesaplanan risk göstergesi.',
    bolumler: [
      'Genel risk skoru kartı: /100 üzerinden skor, seviye rozeti, skor barı',
      'KPI kartları (4): Termini Geçen · Bloke · Atanmamış Kritik · Aşırı Yüklü Üye',
      'Risk sinyalleri grid’i — sorun yoksa "Her şey yolunda görünüyor"',
      'Alt kutu: risk hesaplama yönteminin kısa açıklaması',
    ],
    eylemler: ['Risk sinyaline tıkla › ilgili ekrana git'],
    not: 'Bölüm 1’de anlatılan "otomatik karar verme değil, önceliklendirme sinyali" ilkesi burada uygulanır.',
  },
  {
    yol: '/raporlar',
    baslik: 'Raporlar',
    kimGorur: [MERKEZ, IL, YONETICI],
    ozet: 'PDF / Excel / CSV çıktısı — kapsam role göre sunucuda belirlenir, kullanıcı seçemez.',
    bolumler: [
      'Dönem seçici: Bu hafta / Geçen hafta / Bu ay / Geçen ay / Bu çeyrek / Tüm zamanlar',
      'İndirme düğmeleri: PDF · Excel (.xlsx) · CSV',
      'Önizleme: Özet KPI’ları, İl Kırılımı, Termini Geçen Görevler, Önümüzdeki 7 Gün',
    ],
    eylemler: ['Dönem seç', 'PDF / Excel / CSV indir'],
    not: 'İl Sorumlusu yalnızca kendi ilinin verisini görür; Yetkili Yönetici kişi bazlı detay görmez.',
  },
  {
    yol: '/members',
    baslik: 'Ekip',
    kimGorur: [MERKEZ],
    ozet: 'Üye davet etme, rol ve il atama — yalnızca yönetici rolleri.',
    bolumler: [
      'Katılım Kodu kartı: kod + Kopyala / Yenile',
      'Davet formu: e-posta + rol seçimi',
      'Üye kartları: rol dropdown, il dropdown, "Çıkar" (yalnızca sahip)',
      'Bekleyen Davetler listesi',
    ],
    eylemler: ['+ Davet Gönder', 'Rol / il ata', 'Katılım kodunu kopyala / yenile'],
    durumlar: [
      { ad: 'Sahip', renk: '#92400e' }, { ad: 'Yönetici', renk: '#1e40af' },
      { ad: 'Üye', renk: '#374151' }, { ad: 'Yetkili Yönetici', renk: '#0f766e' },
    ],
  },
  {
    yol: '/members/[id]',
    baslik: 'Üye Profili',
    kimGorur: [MERKEZ],
    ozet: 'Bir üyenin görev geçmişi ve saha kayıtları.',
    bolumler: [
      'Profil başlığı: avatar, rol rozeti, unvan, beceri çipleri',
      'İstatistik kartları (4): Aktif Görev · Gecikmiş · Tamamlanan · Bu Ay Sahada',
      'Görevler: durum bazlı gruplandırılmış liste',
      'Son Saha Girişleri: giriş/çıkış kayıtları',
    ],
    eylemler: ['Profil bilgilerini düzenle (yönetici)'],
  },
  {
    yol: '/chat',
    baslik: 'Sohbet',
    kimGorur: [MERKEZ, IL],
    ozet: 'Kanal ve birebir mesajlaşma — görevle bağlantılı iletişim.',
    bolumler: [
      'Sol: kanal ve DM listesi',
      'Üst çubuk: kanal adı, sabitlenen mesaj sayısı, arama (Ctrl+K)',
      'Mesaj akışı + tepki/thread',
      'Mesaj kutusu',
    ],
    eylemler: ['Mesaj gönder', 'Mesajdan görev oluştur', 'Mesaj sabitle', 'Thread aç'],
  },
  {
    yol: '/meetings',
    baslik: 'Toplantılar',
    kimGorur: [MERKEZ, IL],
    ozet: 'Toplantı planlama, katılım ve AI destekli not özeti.',
    bolumler: [
      'İstatistik kartları (4): Bu Hafta · Canlı Görüşme · Yüz Yüze · Geçmiş',
      'Yaklaşan / Geçmiş sekmeleri, gün bazlı gruplanmış liste',
      'Toplantı odası: sol video/link paneli, sağ not paneli',
    ],
    eylemler: ['Toplantı Oluştur', 'Google Bağla', 'Katıl', 'Not kaydet', 'AI ile Özetle'],
  },
  {
    yol: '/files',
    baslik: 'Dosya Merkezi',
    kimGorur: [MERKEZ, IL],
    ozet: 'Google Drive tabanlı dosya yönetimi, kategori ve görev bağlantısı.',
    bolumler: [
      'İstatistik kartları (4): Toplam Dosya · Görev Bağlantısı · Toplam Boyut · Kategoriler',
      'Arama + kategori sekmeleri (Mekanik/Elektronik/Yazılım/Test/Genel/Diğer)',
      'Dosya listesi: tip ikonu, kategori rozeti, boyut, yükleyen, bağlı görevler',
    ],
    eylemler: ['Dosya Yükle', 'Aç (Drive)', 'Sil'],
  },
  {
    yol: '/ai-assistant',
    baslik: 'AI Görev Asistanı',
    kimGorur: [MERKEZ],
    ozet: 'Gemini destekli görev üretimi, sprint analizi ve rapor taslağı — yalnızca yönetici, Pro plan.',
    bolumler: [
      '4 sekme: Görev Üretimi · Sprint & İş Yükü · Raporlama · İçerik Analizi',
      'Görev Üretimi: proje bağlamı + hedef girilir, görev sayısı seçilir, taslak set üretilir',
      'Taslaklar: Taslak / İnceleme / Yayında / Arşiv durumlarıyla listelenir',
    ],
    eylemler: ['{N} Görev Oluştur', 'Taslağı düzenle / Yayınla', 'Sprint & iş yükü analizi çalıştır', 'Toplantı notunu özetle'],
    not: 'Üretilen görevler doğrudan yayımlanmaz — yetkili onayından geçmeden sisteme girmez.',
  },
  {
    yol: '/consultant',
    baslik: 'Danışmanlık',
    kimGorur: [MERKEZ],
    ozet: 'Dış paydaş / danışman ile soru-cevap ve geri bildirim akışı — Pro plan.',
    bolumler: [
      '4 sekme: Sorular · Güncellemeler · Dosyalar · Görseller (annotasyon)',
      'Sorular: liste + durum/kategori/öncelik filtresi, seçili sorunun mesaj akışı',
      'Görseller: görsel üzerine pin bırakarak nokta bazlı geri bildirim',
    ],
    eylemler: ['+ Yeni Soru Aç', 'Yanıtla / Kapat', 'Görsele pin ekle'],
  },
  {
    yol: '/checklists',
    baslik: 'Listelerim',
    kimGorur: [MERKEZ, IL],
    ozet: 'Kişisel veya paylaşımlı yapılacaklar listeleri.',
    bolumler: [
      'İstatistik kartları (4): Toplam Liste · Tamamlanan · Bekleyen · Paylaşımlı/Kişisel',
      'Liste kartları: ilerleme çubuğu, "{tamamlanan}/{toplam}"',
      'Detay görünümü: madde ekleme, işaretleme',
    ],
    eylemler: ['+ Yeni Liste', 'Madde ekle / işaretle / sil'],
  },
  {
    yol: '/profile',
    baslik: 'Profilim',
    kimGorur: [MERKEZ, IL, YONETICI],
    ozet: 'Kişisel bilgiler ve bildirim tercihleri — dört rolün de eriştiği ortak sayfa.',
    bolumler: [
      'Kimlik kartı: ad, e-posta, rol rozeti, il rozeti',
      'E-posta Bildirimleri: sıklık (Anında / Günlük / Haftalık) + olay bazlı seçim',
      'Telegram Bildirimleri: bağlama / bağlantıyı kaldırma',
      'Verilerim: "Verilerimi İndir (JSON)" — KVKK’ya bağlı özellik',
    ],
    eylemler: ['Değişiklikleri Kaydet', 'Telegram’a Bağla', 'Verilerimi İndir'],
  },
  {
    yol: '/settings',
    baslik: 'Ayarlar',
    kimGorur: [MERKEZ],
    ozet: 'Çalışma alanı düzeyinde kimlik, plan ve otomasyon ayarları — yalnızca yönetici.',
    bolumler: [
      'Kurum Kimliği: logo yükleme',
      'Genel: çalışma alanı adı, marka renkleri (Pro)',
      'Plan: Ücretsiz/Pro karşılaştırma tablosu',
      'Otomasyonlar: gecikme bildirimi, termin hatırlatma, aşırı yük eşiği',
      'Tehlike Bölgesi: çalışma alanını silme (yalnızca sahip)',
    ],
    eylemler: ['Genel ayarları kaydet', 'Otomasyonları kaydet', 'Workspace’i Sil (sahip)'],
  },
]
