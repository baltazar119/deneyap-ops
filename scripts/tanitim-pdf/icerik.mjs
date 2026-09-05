/**
 * DENEYAP OYS tanıtım dokümanının içeriği.
 *
 * İçerik yapısal veri olarak tutuluyor; biçimlendirme uret.mjs tarafında.
 * Blok tipleri: h3, p, liste, tablo, kutu, kod, ayrac
 */

export const KAPAK = {
  baslik: 'DENEYAP OYS',
  altBaslik: 'Operasyon Yönetim Sistemi',
  aciklama:
    'İl ve birim operasyonlarının merkezden planlanması, görev takibi, ' +
    'termin uyarıları ve rol bazlı raporlama için geliştirilen web uygulaması',
  etiketler: ['T3 Vakfı Yapay Zekâ Creathon', 'Proje Tanıtım ve Teknik Dokümanı'],
  tarih: '5 Eylül 2026',
}

/* ══════════════════════════════════════════════════════════════════════
   BÖLÜM 1 — PROJENİN ANLATIMI
   ══════════════════════════════════════════════════════════════════════ */

export const BOLUM_1 = {
  numara: 'Bölüm 1',
  baslik: 'Projenin Anlatımı',
  ozet:
    'Bu bölüm projeyi teknik terim kullanmadan anlatır: hangi problemi çözüyor, ' +
    'kimler kullanıyor, ekranlarda ne oluyor ve hangi kararlar neden alındı.',
  altBolumler: [
    {
      baslik: 'Problem',
      bloklar: [
        { tip: 'p', metin:
          'DENEYAP, Türkiye genelinde çok sayıda ilde eş zamanlı yürüyen bir program. ' +
          'Merkezdeki operasyon ekibi her ile görevler veriyor; illerdeki sorumlular bu ' +
          'görevleri yürütüyor. Sorun görevlerin verilmesinde değil, verildikten sonra ' +
          'ne olduğunun görünmemesinde.' },
        { tip: 'p', metin:
          'Görevler İzlence üzerinden iletiliyor, ancak gerçekleşme durumu tek tek ' +
          'kontrol ediliyor. Bunun yanında Excel dosyaları, e-posta yazışmaları ve ' +
          'mesajlaşma grupları paralel olarak kullanılıyor. Aynı bilginin üç ayrı yerde ' +
          'farklı sürümleri oluşuyor.' },
        { tip: 'p', metin: 'Bu durumun pratikte yarattığı sonuçlar:' },
        { tip: 'liste', maddeler: [
          'Merkez ekip "hangi görev kimde, hangi durumda" sorusunu ancak tek tek sorarak öğrenebiliyor',
          'Bir görevin geciktiği çoğu zaman gecikme olduktan sonra fark ediliyor',
          'İl sorumlusu kendisiyle ilgili olmayan bilgi yığını içinde kendi işini aramak zorunda kalıyor',
          'Yöneticiye sunulacak durum raporu her seferinde elle, Excel üzerinden hazırlanıyor',
          'Bilginin tek bir doğru sürümü yok; kimin elindeki dosyanın güncel olduğu belirsiz',
        ]},
        { tip: 'kutu', baslik: 'Özetle', metin:
          'Görev üretmek değil, üretilmiş görevi takip etmek zor. Zaman, işi yapmaya ' +
          'değil işin ne durumda olduğunu öğrenmeye harcanıyor.' },
      ],
    },
    {
      baslik: 'Çözüm Yaklaşımı',
      bloklar: [
        { tip: 'p', metin:
          'DENEYAP OYS, bu paralel kanalları çoğaltmak yerine tek bir akışa bağlıyor. ' +
          'Temel fikir şu: operasyon verisinin tek bir doğru kaynağı olsun, diğer her şey ' +
          'o kaynağın ya girişi ya da çıkışı olsun.' },
        { tip: 'tablo', basliklar: ['Kanal', 'Sistemdeki rolü'], satirlar: [
          ['Excel / CSV', 'Giriş — mevcut veriyi bir kez içeri taşımak için. Sonrasında tek kaynak uygulamadır.'],
          ['PDF / Excel raporu', 'Çıkış — yönetime sunulacak belge, uygulamadan üretilir; elle hazırlanmaz.'],
          ['E-posta', 'Bildirim ve aksiyon kanalı — ikinci bir veri kaynağı değil.'],
          ['Telegram', 'Anlık uyarı ve tek dokunuşla durum güncelleme kanalı.'],
        ]},
        { tip: 'p', metin:
          'Bu ayrım bilinçli bir tercihtir. Projenin başında canlı bir Google Sheets ' +
          'entegrasyonu da değerlendirildi ve kapsamdan çıkarıldı: sürekli güncellenen ' +
          'bir tablo, insanlara tabloda çalışmaya devam etmek için sebep verir ve ' +
          'çözülmek istenen "paralel kanal" problemini geri getirir. Excel indirme, ' +
          '"yönetime tablo lazım" ihtiyacını göç hedefine zarar vermeden karşılar.' },
        { tip: 'p', metin:
          'İzlence sisteminin dışa açık bir arayüzü bulunmadığı için, mevcut verinin ' +
          'aktarımında Excel köprüsü tek gerçekçi yoldur. Bu nedenle içe aktarma ' +
          'özelliği yan bir kolaylık değil, projenin göç stratejisinin merkezindedir.' },
      ],
    },
    {
      baslik: 'Roller ve Görüş Alanları',
      bloklar: [
        { tip: 'p', metin:
          'Sistemde dört rol var. Rol yalnızca menüyü değil, kişinin gördüğü veriyi de ' +
          'belirler. Bir kullanıcı yetkisi dışındaki bir kaydı arayüzde göremediği gibi, ' +
          'veriyi doğrudan sorgulasa da alamaz.' },
        { tip: 'tablo', basliklar: ['Rol', 'Görüş alanı', 'Yetki'], satirlar: [
          ['Merkez Operasyon Ekibi', 'Tüm iller, tüm görevler', 'Görev oluşturur, atar, içe aktarır, tam rapor alır'],
          ['Koordinatör', 'Tüm iller, risk ve gecikme odaklı', 'Görev düzenler, sorumlu bazlı takip yapar'],
          ['İl Sorumlusu', 'Yalnızca kendi ili ve kendi görevleri', 'Durum günceller, açıklama girer, kendi ilinin raporunu alır'],
          ['Yetkili Yönetici', 'Yalnızca özet göstergeler', 'Salt okunur; kişi bazlı görev detayı görmez'],
        ]},
        { tip: 'kutu', baslik: 'Neden önemli', metin:
          'İl Sorumlusu yüzlerce görev arasından kendi işini aramak zorunda kalmaz; ' +
          'açtığı ekranda zaten yalnızca kendi ilinin görevleri vardır. Yetkili Yönetici ' +
          'ise kişi bazlı performans verisi görmeden programın genel gidişatını izler.' },
      ],
    },
    {
      baslik: 'Kullanım Akışı',
      bloklar: [
        { tip: 'h3', metin: 'Merkez ekip açısından' },
        { tip: 'liste', sirali: true, maddeler: [
          'Mevcut Excel dosyası bir kez içe aktarılır. Sistem önce önizleme gösterir: kaç satır geçerli, kaç görev güncellenecek, kaç yeni görev oluşacak, hangi satırlarda sorun var.',
          'Önizleme onaylanınca görevler oluşur. Sonuç beğenilmezse tek tuşla geri alınabilir.',
          'Yeni görevler doğrudan uygulamadan oluşturulur; il, sorumlu, termin ve öncelik seçilir.',
          'Panel ekranında tüm illerin durumu tek bakışta görünür: tamamlanma oranı, geciken görev sayısı, yaklaşan terminler.',
          'Yönetime sunulacak rapor PDF veya Excel olarak indirilir; elle hazırlanmaz.',
        ]},
        { tip: 'h3', metin: 'İl sorumlusu açısından' },
        { tip: 'liste', sirali: true, maddeler: [
          'Giriş yapıldığında doğrudan kendi görev listesi açılır.',
          'Görevin durumu güncellenirken açıklama girilir — "neden bu durumda" bilgisi kayda geçer.',
          'Termin yaklaştığında veya geçtiğinde e-posta ve Telegram üzerinden uyarı gelir.',
          'Telegram bildirimindeki düğme ile uygulamayı açmadan durum güncellenebilir.',
        ]},
        { tip: 'h3', metin: 'Yönetici açısından' },
        { tip: 'p', metin:
          'Yönetici ekranı sayıya odaklıdır: il karşılaştırması, tamamlanma oranları, ' +
          'gecikme sayıları ve operasyon riski göstergesi. Haftalık özet raporu ' +
          'otomatik olarak e-postayla PDF ekinde gönderilir; kimsenin rapor hazırlaması ' +
          'gerekmez.' },
      ],
    },
    {
      baslik: 'Öne Çıkan Özellikler',
      bloklar: [
        { tip: 'tablo', basliklar: ['Özellik', 'Ne yapar'], satirlar: [
          ['Görev yönetimi', 'Liste, Kanban, zaman çizelgesi ve takvim görünümleri; il, sorumlu, durum ve önceliğe göre filtreleme'],
          ['Açıklamalı durum güncelleme', 'Durum değişikliği açıklama ile birlikte kaydedilir; geçmiş izlenebilir'],
          ['Excel içe aktarma', 'Önizleme, eşleştirme, uygulama ve geri alma adımlarından oluşan üç aşamalı akış'],
          ['Rol bazlı rapor', 'PDF, Excel ve CSV; kapsamı çağıranın rolü belirler, kullanıcı seçemez'],
          ['Termin uyarıları', 'Yaklaşan ve geçmiş terminler için otomatik e-posta ve Telegram bildirimi'],
          ['Haftalık otomatik rapor', 'Her pazartesi PDF ekli özet e-postası'],
          ['Telegram entegrasyonu', 'Bildirim ve mesaj içindeki düğmeyle tek dokunuşta durum güncelleme'],
          ['Operasyon riski', 'Gecikme, yük dağılımı ve termin yoğunluğundan hesaplanan risk göstergesi'],
          ['AI Görev Asistanı', 'Girilen hedeften görev taslakları üretir; yayımlanmadan önce yetkili onayından geçer'],
          ['Toplantı ve dosya', 'Google Takvim ve Drive entegrasyonu (isteğe bağlı)'],
          ['Demo hesaplar', 'Dört rolün de tek tıkla denenebildiği sunum modu'],
        ]},
      ],
    },
    {
      baslik: 'Tasarım Kararları',
      bloklar: [
        { tip: 'p', metin:
          'Bazı kararlar ürünün nasıl davrandığını doğrudan belirlediği için ayrıca ' +
          'açıklanmayı hak ediyor.' },
        { tip: 'h3', metin: 'Aynı uygulama hem masaüstünde yoğun hem mobilde kullanışlı' },
        { tip: 'p', metin:
          'Ayrı bir mobil uygulama yazılmadı. Masaüstünde bilgi yoğunluğu korunurken, ' +
          'küçük ekranlarda tablolar kart görünümüne dönüşür, menü alt gezinme çubuğuna ' +
          'iner. Sahadaki il sorumlusu ile merkezdeki analist aynı sistemi kullanır.' },
        { tip: 'h3', metin: 'İçe aktarma her zaman geri alınabilir' },
        { tip: 'p', metin:
          'Toplu veri yazan bir işlemin en büyük riski, yanlış dosyanın yüklenmesidir. ' +
          'Bu nedenle her içe aktarma bir "parti" olarak kaydedilir ve o partide ' +
          'oluşturulan kayıtlar tek işlemle geri alınabilir. Aynı dosya ikinci kez ' +
          'yüklenirse kopya oluşmaz; eşleşen görevler güncellenir.' },
        { tip: 'h3', metin: 'Rapor kapsamını kullanıcı seçemez' },
        { tip: 'p', metin:
          'Rapor indirilirken hangi illerin dâhil olacağı arayüzden seçilmez; çağıran ' +
          'kişinin rolüne göre sunucu tarafında belirlenir. Böylece yetki sınırı ' +
          'arayüzdeki bir seçeneğe bağlı kalmaz.' },
        { tip: 'h3', metin: '"Gecikti" bir durum değildir' },
        { tip: 'p', metin:
          'Excel dosyalarında sık görülen "Gecikti" değeri sisteme bir durum olarak ' +
          'alınmaz; ilgili görev "devam ediyor" durumuna alınır ve termini geçmiş olarak ' +
          'işaretlenir. Gecikme, girilen bir etiket değil, terminden hesaplanan bir ' +
          'sonuçtur. Bu ayrım önizleme ekranında kullanıcıya açıkça bildirilir.' },
      ],
    },
    {
      baslik: 'Projenin Sağladığı Kazanım',
      bloklar: [
        { tip: 'tablo', basliklar: ['Önce', 'Sonra'], satirlar: [
          ['Durum bilgisi tek tek sorularak toplanıyor', 'Panel ekranında anlık görünüyor'],
          ['Gecikme sonradan fark ediliyor', 'Termin öncesi otomatik uyarı gidiyor'],
          ['Rapor elle Excel’de hazırlanıyor', 'PDF/Excel raporu tek tuşla üretiliyor'],
          ['Aynı verinin birden çok sürümü dolaşıyor', 'Tek doğru kaynak var'],
          ['İl sorumlusu ilgisiz bilgi içinde kendi işini arıyor', 'Yalnızca kendi ilini görüyor'],
          ['Yöneticiye sunum için ayrı çalışma gerekiyor', 'Haftalık rapor otomatik e-postayla geliyor'],
        ]},
      ],
    },
  ],
}

/* ══════════════════════════════════════════════════════════════════════
   BÖLÜM 2 — TEKNİK DOKÜMAN
   ══════════════════════════════════════════════════════════════════════ */

export const BOLUM_2 = {
  numara: 'Bölüm 3',
  baslik: 'Teknik Doküman',
  ozet:
    'Bu bölüm sistemin nasıl kurulduğunu anlatır: mimari, veri modeli, ' +
    'yetkilendirme, entegrasyonlar, test yaklaşımı ve dağıtım.',
  altBolumler: [
    {
      baslik: 'Teknoloji Yığını',
      bloklar: [
        { tip: 'tablo', basliklar: ['Katman', 'Teknoloji', 'Gerekçe'], satirlar: [
          ['Uygulama', 'Next.js 14 (App Router), React 18, TypeScript (strict)', 'Sunucu ve istemci kodunun tek projede, tip güvenli yönetimi'],
          ['Veritabanı', 'PostgreSQL (Supabase)', 'İlişkisel model ve satır bazlı güvenlik desteği'],
          ['Kimlik doğrulama', 'Supabase Auth (e-posta + Google)', 'Yetkilendirmenin veritabanı politikalarıyla bütünleşmesi'],
          ['Barındırma', 'Vercel', 'Otomatik dağıtım, serverless çalıştırma, zamanlanmış görevler'],
          ['PDF üretimi', '@react-pdf/renderer', 'Sunucu tarafında üretim ve gömülü font ile Türkçe desteği'],
          ['Excel / CSV', 'exceljs, papaparse', 'Okuma, yazma ve veri doğrulama listeleri'],
          ['E-posta', 'nodemailer (SMTP)', 'Sağlayıcıdan bağımsız gönderim'],
          ['Doğrulama', 'zod', 'Dışarıdan gelen verinin şema ile denetimi'],
          ['Test', 'vitest', 'Saf mantık birimlerinin hızlı doğrulanması'],
        ]},
      ],
    },
    {
      baslik: 'Proje Büyüklüğü',
      bloklar: [
        { tip: 'tablo', basliklar: ['Ölçüt', 'Değer'], satirlar: [
          ['TypeScript / TSX satır sayısı', '41.712'],
          ['Uygulama sayfası', '32'],
          ['API uç noktası', '58'],
          ['Yardımcı kütüphane modülü', '64'],
          ['Veritabanı migration dosyası', '58'],
          ['Veritabanı tablosu', '38'],
          ['Satır bazlı güvenlik politikası', '235'],
          ['Otomatik test', '181 test / 12 dosya'],
        ]},
      ],
    },
    {
      baslik: 'Mimari',
      bloklar: [
        { tip: 'p', metin:
          'Uygulama üç katmanda çalışır. Tarayıcıdaki React arayüzü, Vercel üzerinde ' +
          'serverless olarak çalışan API uç noktaları ve Supabase üzerindeki PostgreSQL ' +
          'veritabanı.' },
        { tip: 'p', metin:
          'Kritik tasarım ilkesi: yetkilendirme yalnızca arayüzde değil, veritabanı ' +
          'seviyesinde uygulanır. Her tabloda satır bazlı güvenlik politikaları vardır; ' +
          'kullanıcının kendi kimlik jetonuyla yaptığı her sorgu bu politikalardan geçer. ' +
          'Arayüzde bir kontrol atlansa dahi veri sızmaz.' },
        { tip: 'h3', metin: 'Sunucu tarafı ortak katman' },
        { tip: 'p', metin:
          'Kimlik doğrulama, üyelik kontrolü ve rol denetimi 58 uç noktada ayrı ayrı ' +
          'yazılmak yerine tek bir modülde toplanmıştır. Bu modül her istek için iki ' +
          'ayrı veritabanı istemcisi sunar: kullanıcının kendi jetonuyla çalışan ' +
          '(güvenlik politikaları aktif) ve yönetimsel anahtarla çalışan istemci. ' +
          'Yönetimsel anahtar yalnızca sunucu tarafında bulunur ve tarayıcı paketine ' +
          'hiçbir koşulda dâhil edilmez.' },
        { tip: 'h3', metin: 'Görev kapsamı tek kaynaktan' },
        { tip: 'p', metin:
          '"Hangi rol hangi görevleri görür" kuralı tek bir modülde tanımlıdır ve tüm ' +
          'ekranlar ile rapor üretimi bu modüle bağlanır. Kural hem sunucuda sorgu ' +
          'filtresi olarak, hem istemcide saf fonksiyon olarak aynı kaynaktan çalışır. ' +
          'Bu birleştirme, kuralın beş ayrı yerde farklı yazılmış olmasından kaynaklanan ' +
          've il sorumlularının bazı ekranlarda kendi illerinin görevlerini görememesine ' +
          'yol açan bir hatayı da ortadan kaldırmıştır.' },
      ],
    },
    {
      baslik: 'Veri Modeli',
      bloklar: [
        { tip: 'p', metin: 'Sistemin merkezinde yer alan tablolar:' },
        { tip: 'tablo', basliklar: ['Tablo', 'İçerik'], satirlar: [
          ['organizations', 'Çalışma alanı (workspace) — veri yalıtımının en üst sınırı'],
          ['organization_members', 'Kullanıcı–çalışma alanı ilişkisi; rol ve sorumlu olunan il bu tabloda'],
          ['profiles', 'Kullanıcı profili: ad, unvan, avatar, beceriler'],
          ['tasks', 'Görevler: başlık, açıklama, il, sorumlu, durum, öncelik, termin, kategori'],
          ['task_outputs', 'Görev çıktıları ve durum açıklamaları'],
          ['import_batches / import_rows', 'İçe aktarma partileri ve satır bazlı sonuçları'],
          ['channel_links / channel_log', 'Telegram bağlantıları ve bildirim gönderim kaydı'],
          ['email_action_tokens', 'E-posta ve Telegram üzerinden tek dokunuşluk işlem jetonları'],
          ['automation_settings / email_preferences', 'Otomasyon ve bildirim tercihleri'],
          ['notifications, meetings, files, checkins, schedules', 'Destekleyici modüller'],
        ]},
        { tip: 'kutu', baslik: 'Yalıtım', metin:
          'Her kayıt bir çalışma alanına bağlıdır. Politikalar üyelik ve yönetici ' +
          'kontrolünü veritabanı fonksiyonları üzerinden yapar; farklı çalışma ' +
          'alanlarının verisi hiçbir sorguda karışmaz.' },
      ],
    },
    {
      baslik: 'Excel İçe Aktarma',
      bloklar: [
        { tip: 'p', metin: 'İçe aktarma üç aşamalıdır ve hiçbir aşama geri dönülemez değildir.' },
        { tip: 'tablo', basliklar: ['Aşama', 'Yapılan iş'], satirlar: [
          ['Önizleme', 'Dosya çözümlenir, sütunlar eşleştirilir, satırlar doğrulanır. Veritabanına hiçbir görev yazılmaz.'],
          ['Uygulama', 'Parti tek bir veritabanı fonksiyonu içinde işlenir; kısmi başarısızlıkta tamamı geri alınır.'],
          ['Geri alma', 'Partide oluşturulan kayıtlar silinir, güncellenenler kullanıcıya bildirilir.'],
        ]},
        { tip: 'h3', metin: 'Çözülen teknik problemler' },
        { tip: 'liste', maddeler: [
          'Türkçe yerelli Excel’in CSV çıktısı noktalı virgül ayırıcı ve windows-1254 kodlaması kullanır. Dosya önce UTF-8 olarak çözülür, bozuk karakter tespit edilirse windows-1254 ile yeniden çözülür; ayırıcı otomatik tespit edilir.',
          'Türkçe büyük "İ" harfinin küçültülmesi JavaScript’te beklenmeyen bir birleşik karakter üretir. Bu tuzak, il ve başlık eşleştirmesini bozmaması için tek bir metin normalleştirme modülünde çözülmüştür.',
          'Tarih alanları için standart tarih dönüşümü kullanılmaz; saat dilimi farkı nedeniyle terminleri bir gün geriye kaydırdığı için tarih bileşenlerinden doğrudan kurulur.',
          'Tekrar yükleme kopya üretmez: eşleştirme anahtarı dış kimlik sütunu varsa ondan, yoksa normalleştirilmiş başlık ve ilden üretilir. Anahtar bilinçli olarak termini içermez; böylece termini değişmiş bir görev yeni kayıt olarak eklenmez, güncellenir.',
          'Dosya boyutu, barındırma platformunun istek gövdesi sınırına göre kısıtlanır ve desteklenmeyen dosya biçimleri baştan reddedilir.',
        ]},
      ],
    },
    {
      baslik: 'Raporlama',
      bloklar: [
        { tip: 'p', metin:
          'Dört çıktı biçimi (PDF, Excel, CSV, JSON) tek bir rapor veri modelinden ' +
          'üretilir. Rapor kapsamı ve hangi bölümlerin görüneceği, çağıranın rolüne ' +
          'göre sunucuda belirlenir.' },
        { tip: 'tablo', basliklar: ['Rol', 'Rapor kapsamı'], satirlar: [
          ['Merkez Operasyon Ekibi', 'Tüm iller, tam rapor ve il karşılaştırma tablosu'],
          ['Koordinatör', 'Tüm iller; risk, gecikme ve sorumlu kırılımı öne çıkar'],
          ['İl Sorumlusu', 'Yalnızca kendi ili; görev listesi ve yaklaşan terminler'],
          ['Yetkili Yönetici', 'Yalnızca özet göstergeler; kişi ve görev detayı yok'],
        ]},
        { tip: 'h3', metin: 'Türkçe karakter problemi' },
        { tip: 'p', metin:
          'PDF üretiminde yaygın kullanılan kütüphanelerin standart fontları Türkçe ' +
          'karakter içermez; bu durum çıktıların sessizce bozulmasına yol açar. Bu ' +
          'nedenle PDF üretimi sunucu tarafında, gömülü font dosyalarıyla yapılır. ' +
          'Font yükleyicisi, font bulunamadığında sessizce yedek fonta düşmek yerine ' +
          'hata verir — bozuk çıktının fark edilmeden yayımlanmaması için.' },
        { tip: 'p', metin:
          'CSV çıktısı, Excel’in Türkçe karakterleri doğru okuması için bayt sırası ' +
          'işaretiyle üretilir. Excel çıktısı çok sayfalıdır; dondurulmuş başlık, ' +
          'otomatik filtre ve durum renkleri içerir.' },
      ],
    },
    {
      baslik: 'Bildirim ve Entegrasyonlar',
      bloklar: [
        { tip: 'h3', metin: 'Telegram' },
        { tip: 'p', metin:
          'Kullanıcı profil sayfasından tek kullanımlık bir kod alır ve bunu bota ' +
          'yazarak hesabını bağlar. Gelen istekler gizli başlık doğrulamasıyla korunur; ' +
          'karşılaştırma zamanlama saldırılarına kapalı biçimde yapılır. Bildirim ' +
          'mesajlarındaki düğmeler ile uygulamayı açmadan durum güncellenebilir.' },
        { tip: 'h3', metin: 'Tek kullanımlık işlem jetonları' },
        { tip: 'p', metin:
          'E-posta ve Telegram üzerinden yapılan işlemler tek kullanımlık jetonlarla ' +
          'yürür. Jetonun kendisi değil yalnızca özeti saklanır; süreye bağlıdır ve ' +
          'yalnızca ilgili görev, kullanıcı ve işlem için geçerlidir. Tüketim, koşullu ' +
          'güncelleme ile atomik yapılır; aynı jeton iki kez kullanılamaz.' },
        { tip: 'p', metin:
          'İşlem bağlantıları yalnızca POST ile çalışır. E-posta istemcilerinin ' +
          'bağlantıları önceden açması, işlemin kullanıcı farkında olmadan ' +
          'gerçekleşmesine yol açabileceği için GET istekleri reddedilir.' },
        { tip: 'h3', metin: 'Zamanlanmış görevler' },
        { tip: 'p', metin:
          'Günlük kontroller, özet e-postaları ve haftalık PDF raporu tek bir ' +
          'zamanlanmış görev altında birleştirilmiştir. Bu birleştirme, barındırma ' +
          'planının zamanlanmış görev kotasına sığmak için yapılmıştır ve ölçüm ' +
          'sonucunda mevcut planın yeterli olduğu doğrulanmıştır. Uç noktalar gizli ' +
          'anahtar olmadan çağrılamaz; anahtar tanımlı değilse istekler açık değil, ' +
          'kapalı kabul edilir.' },
      ],
    },
    {
      baslik: 'Güvenlik',
      bloklar: [
        { tip: 'liste', maddeler: [
          'Yetkilendirme veritabanı seviyesinde satır bazlı politikalarla zorunlu kılınır (235 politika)',
          'Yönetimsel veritabanı anahtarı yalnızca sunucuda bulunur; ilgili modüller derleme aşamasında istemci paketine girmeye karşı korumalıdır',
          'Anahtarın tanımsız olması hâlinde sistem sessizce düşük yetkili anahtara düşmez, hata verir',
          'E-posta şablonlarında tüm dinamik içerik kaçırılır; bağlantı adresleri biçim denetiminden geçirilir',
          'Hassas uç noktalarda hız sınırlaması uygulanır',
          'Parolalar geri döndürülemez şekilde özetlenerek saklanır',
          'Tüm trafik HTTPS üzerinden yürür',
        ]},
        { tip: 'kutu', baslik: 'Bilinen açık kalemler', metin:
          'Google OAuth akışında durum değeri doğrulanmıyor, Drive uç noktalarında ' +
          'yetkilendirme eksik ve toplantı listeleme ucu kimlik doğrulaması yapmıyor. ' +
          'Bu kalemler bilinçli olarak kapsam dışında bırakılmıştır ve giderilmesi ' +
          'gereken teknik borç olarak kayıtlıdır.' },
      ],
    },
    {
      baslik: 'Test Yaklaşımı',
      bloklar: [
        { tip: 'p', metin:
          '12 dosyada toplam 181 otomatik test bulunur. Testler arayüzü değil, hatanın ' +
          'sessizce oluşabileceği saf mantık birimlerini hedefler: rol kapsamı, Türkçe ' +
          'metin normalleştirme, sütun eşleştirme, değer dönüşümleri, rapor hesaplamaları ' +
          've e-posta şablonlarının kaçırma davranışı.' },
        { tip: 'p', metin: 'Testlerin ve elle yapılan tarayıcı turlarının yakaladığı gerçek hatalardan örnekler:' },
        { tip: 'liste', maddeler: [
          'Yetkili Yönetici raporunda sorumlu kırılımı gizlenmiş olmasına rağmen gecikme listesindeki satırlarda kişi adlarının görünmeye devam etmesi',
          'E-posta şablonunda geçerli bir yol ile başlamayan bir bağlantının uygulama adresiyle birleştirilerek çalıştırılabilir bir adrese dönüşmesi',
          'Excel şablonunda yardımcı sayfanın ilk sıraya gelmesi ve hem kullanıcıya hem okuyucuya yanlış sayfayı göstermesi',
          '"Üye Profili" sayfasının yanlış bir yetki kaynağı yüzünden hiçbir rol tarafından açılamaması — kod derleniyordu, tip kontrolü geçiyordu, yalnızca gerçek bir oturumla denenince ortaya çıktı',
          '"Panelim" sayfasının (İl Sorumlusunun günlük kullandığı ekran) bir React kapanışı bayatlığı yüzünden sessizce çökmesi — arayüz sonsuza dek yükleniyor gibi görünüyordu',
        ]},
        { tip: 'p', metin:
          'Bu son iki hata otomatik testlerle yakalanamazdı — ikisi de yalnızca gerçek bir ' +
          'oturumla, gerçek bir role girip sayfayı fiilen açmakla ortaya çıktı. Bu yüzden ' +
          'kod incelemesinin yanında dört rolün her biriyle 21 ekranı tek tek dolaşan bir ' +
          'mobil doğrulama turu ayrıca yapıldı (bkz. Bölüm 2.2).' },
        { tip: 'p', metin:
          'Bunun yanında canlı ortamda çalışan doğrulama betikleri bulunur: dağıtım ' +
          'sonrası kontrol betiği, içe aktarma ve rapor uçlarını uçtan uca deneyen ' +
          'betikler ile demo veri üretici.' },
      ],
    },
    {
      baslik: 'Dağıtım',
      bloklar: [
        { tip: 'p', metin:
          'Kod deposuna yapılan her gönderim otomatik olarak derlenip yayına alınır. ' +
          'Derleme başarısız olursa önceki çalışan sürüm ayakta kalır.' },
        { tip: 'p', metin:
          'Dağıtım sonrası doğrulama betiği; sitenin ayakta olduğunu, Telegram ' +
          'bağlantısının kayıtlı olduğunu, zamanlanmış görev uçlarının yetkisiz ' +
          'istekleri reddettiğini, işlem bağlantılarının GET ile çalışmadığını ve ' +
          'korumalı uçların oturumsuz istekleri geri çevirdiğini otomatik olarak ' +
          'sınar.' },
        { tip: 'kutu', baslik: 'Not', metin:
          'Sunum kolaylığı için demo modu açıktır; gerçek veriyle kullanıma geçmeden ' +
          'önce ilgili ortam değişkeninin kaldırılması gerekir.' },
      ],
    },
    {
      baslik: 'Bilinen Sınırlar ve Sonraki Adımlar',
      bloklar: [
        { tip: 'tablo', basliklar: ['Konu', 'Durum'], satirlar: [
          ['Google OAuth güvenlik kalemleri', 'Bilinen teknik borç; kapsam dışı bırakıldı'],
          ['Mobil responsive tur', 'Tamamlandı — 21 ekran, 3 rol, gerçek cihaz genişliğinde tek tek test edildi'],
          ['PWA ikonları ve manifest', 'Eklenmedi'],
          ['WhatsApp kanalı', 'Arayüz hazır, etkinleştirilmedi'],
          ['Yasal metinlerin hukuki onayı', 'Metinler hazır; kurum onayı bekleniyor'],
          ['Kurumsal bilgiler (adres, VERBİS)', 'Yasal sayfalarda doldurulmayı bekliyor'],
        ]},
      ],
    },
  ],
}
