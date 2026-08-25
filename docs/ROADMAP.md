# DENEYAP Ops — Kalan İşler ve Canlıya Alma Rehberi

Bu doküman iki kısımdan oluşuyor: (1) benim (Claude) tamamlamam gereken kalan
geliştirme işleri, (2) projeyi gerçek kullanıcılarla canlıya almadan önce
**senin** yapman gereken adımlar. Her ikisi de öncelik sırasına göre listelendi.

Güncel durum: Faz 0-2 tamamlandı (scaffold, ortak UI sistemi, tüm ekranlar).
Faz 3 (DENEYAP domain adaptasyonu) yeni başladı (yasal sayfa placeholder'ları).

---

## 1. Benim yapacağım kalan işler

### 1.1 Backend — eksik API route'ları (yüksek öncelik)

Bazı ekranlar taşındı ama arkalarındaki API route'ları henüz taşınmadı — bu
ekranlardaki ilgili aksiyonlar şu an **sessizce başarısız oluyor** (buton
tıklanır ama sunucudan 404 döner). Taşınması gerekenler:

| Route grubu | Kaç dosya | Kullanan ekran | Etki |
|---|---|---|---|
| `/api/org/[slug]/meetings*` | 2 | Toplantılar | Toplantı oluşturma/düzenleme/silme çalışmıyor |
| `/api/org/[slug]/members*` | 2 | Üyeler | Üye rol değiştirme/çıkarma çalışmıyor |
| `/api/org/[slug]/automation-settings` | 1 | Ayarlar | Otomasyon ayarları kaydedilmiyor |
| `/api/org/[slug]/claim-owner` | 1 | Ayarlar | Sahiplik devri çalışmıyor |
| `/api/org/[slug]/rotate-join-code` | 1 | Ayarlar, Üyeler | Katılım kodu yenileme çalışmıyor |
| `/api/org/[slug]/logo` | 1 | Ayarlar | Logo yükleme çalışmıyor |
| `/api/org/[slug]/files*` | 2 | Dosyalar, Görev Detayı | Dosya listeleme/bağlama çalışmıyor |
| `/api/send-email` | 1 | Bildirimler (genel) | Bildirim e-postaları gitmiyor |
| `/api/me/delete`, `/api/me/export` | 2 | Profil | Hesap silme/veri dışa aktarma yok |

### 1.2 Google Drive entegrasyonu (orta öncelik)

`/api/drive/*` (8 route: auth, callback, status, files, upload-session,
upload-proxy, upload-complete, debug) henüz taşınmadı. Dosyalar sayfası ve
Görev Detayı'ndaki dosya yükleme UI'ı hazır ama bu route'lar olmadan pasif.
Senin bir Google Cloud OAuth uygulaması oluşturman gerekecek (bkz. Bölüm 2).

### 1.3 AI Görev Asistanı — Gemini route'ları (orta öncelik, domain uyarlaması gerekli)

`/api/ai-tasks/*` (10 route). Bunlar hem taşınacak hem de DENEYAP bağlamına
göre prompt'ları gözden geçirilecek (örn. "atölye" yerine "saha/operasyon"
terminolojisi, DENEYAP'a özgü görev kategorileri).

### 1.4 Google Calendar entegrasyonu (düşük öncelik)

`/api/gcal/*` (3 route) — toplantı oluştururken Google Calendar'a event
eklemek için. Drive ile aynı Google Cloud OAuth uygulamasını kullanabilir.

### 1.5 Cron / dijest e-postaları (düşük öncelik)

`/api/cron/daily-checks` ve `/api/digest-email` — günlük/haftalık özet
e-postaları. `vercel.json` içindeki cron tanımları henüz DENEYAP-Ops'a
kopyalanmadı; bu route'lar taşınınca birlikte eklenecek.

### 1.6 Admin paneli (düşük öncelik, opsiyonel)

`/api/admin/*` (4 route) + süper admin arayüzü — tüm workspace'leri tek
yerden yöneten bir panel. DENEYAP için gerekliyse (örn. merkezi bir
koordinatör tüm illeri görebilsin diye) ayrıca konuşulmalı; şu an kapsamda
değil.

### 1.7 Faz 3 — DENEYAP domain adaptasyonu

- İl/birim seçim alanları (onboarding, üyeler, ayarlar)
- Operasyon Risk ekranı — gerçek veri modeli (yeni migration: risk kayıtları)
  ve `OperationRiskWidget`'ın gerçek veriye bağlanması (şu an boş dizi ile
  render ediliyor)
- DENEYAP'a özgü görev alanları (gerekirse)
- AI Asistan prompt'larının DENEYAP terminolojisine göre gözden geçirilmesi
- Gerçek DENEYAP logosu (`public/logo.svg` şu an geçici bir placeholder)
- Yasal sayfaların gerçek metinleri (bkz. Bölüm 2.6)

### 1.8 Faz 4 — Responsive test turu

Tüm ekranların 375/390/430/768/1024/1366/1440/1920px genişliklerde
sistematik kontrolü (yatay taşma, buton erişilebilirliği, tablo/kart geçişi,
Kanban dokunmatik davranışı vb.) — gerçek Supabase verisiyle test edilmesi
en sağlıklısı olur, bu yüzden Bölüm 2'deki Supabase kurulumundan sonra
yapılması öneriliyor.

### 1.9 Test altyapısı

`vitest`/`playwright` konfigürasyonu Faz 0'da kopyalandı ama testlerin
kendisi (Tarlis'teki `rateLimit.test.ts` vb.) henüz taşınmadı.

---

## 2. Canlıya almadan önce senin yapman gerekenler

Bunlar hesap oluşturma, ödeme/faturalama ve gerçek bulut kaynağı içerdiği
için ben yapamıyorum — güvenlik kurallarım gereği bu adımları sen yapmalısın.
Sırasıyla:

### 2.1 Supabase projesi (zorunlu, ilk adım)

1. https://supabase.com/dashboard → yeni proje oluştur (örn. `deneyap-ops`).
2. Proje URL'i ve `anon`/`service_role` anahtarlarını not al.
3. `.env.local.example` dosyasını `.env.local` olarak kopyala, bu değerleri
   doldur.
4. Supabase CLI kur, `supabase link` ile projeye bağlan, `supabase db push`
   ile `supabase/migrations/` içindeki şemayı uygula. Detaylar:
   [docs/SUPABASE_SETUP.md](SUPABASE_SETUP.md)

### 2.2 SMTP (bildirim e-postaları için, önerilir)

Gmail kullanacaksan: Google Hesabı → Güvenlik → 2 Adımlı Doğrulama →
Uygulama Şifreleri'nden bir "uygulama şifresi" oluştur, `.env.local`'e
`SMTP_USER`/`SMTP_PASS` olarak gir. Kurumsal bir e-posta sağlayıcısı da
kullanılabilir (Zoho, Office365 vb.) — sadece SMTP host/port bilgisi değişir.

### 2.3 Google Gemini API anahtarı (AI Görev Asistanı için)

https://aistudio.google.com/app/apikey adresinden ücretsiz bir anahtar al,
`GEMINI_API_KEY` olarak gir.

### 2.4 Google Cloud OAuth uygulaması (Drive + Takvim + "Google ile Giriş" için — opsiyonel ama önerilir)

1. https://console.cloud.google.com → yeni proje → APIs & Services →
   Credentials → "OAuth 2.0 Client ID" oluştur.
2. Yetkili redirect URI'lara ekle: `https://<domain>/api/drive/callback` ve
   `https://<domain>/api/gcal/callback`.
3. Client ID/Secret'ı `.env.local`'e gir.
4. Supabase Dashboard → Authentication → Providers → Google'ı da aynı
   Client ID/Secret ile etkinleştir (login sayfasındaki "Google ile Giriş
   Yap" butonu bunu kullanıyor) ve Supabase'in verdiği redirect URI'yi
   Google Cloud Console'a ekle.

### 2.5 Barındırma / deploy (Vercel önerilir — Tarlis de Vercel üzerinde çalışıyordu)

1. GitHub'da DENEYAP-Ops için bir repo oluştur, bu klasördeki git geçmişini
   push'la (`git remote add origin ... && git push -u origin master`).
2. Vercel'de bu repoyu import et.
3. Bölüm 2.1-2.4'teki tüm ortam değişkenlerini Vercel proje ayarlarına gir
   (Production + Preview).
4. `NEXT_PUBLIC_APP_URL`'i gerçek domain ile güncelle.
5. Domain bağlama (Vercel'in verdiği `.vercel.app` adresi yeterli değilse
   kendi domain'ini bağla).

### 2.6 Yasal sayfaların gerçek metinleri

`kvkk`, `gizlilik`, `kullanim-sartlari`, `dpa` sayfaları şu an placeholder.
DENEYAP'ın gerçek kurum bilgileriyle (unvan, adres, veri sorumlusu iletişim
bilgisi) bir hukuk danışmanı desteğiyle doldurulmalı — bu konuda metin
taslağı hazırlamamı istersen ayrıca söyleyebilirsin, ama gerçek şirket/kurum
bilgilerini onaylamak sana düşüyor.

### 2.7 Marka görselleri

`public/logo.svg` şu an "D" harfli, marka renklerinde geçici bir placeholder.
DENEYAP'ın gerçek logosunu (tercihen SVG) gönderirsen yerine koyarım. Ayrıca
`public/icons/` ve `public/manifest.json` (PWA ikonları) henüz eklenmedi —
gerçek logo geldiğinde birlikte hazırlanabilir.

### 2.8 Opsiyonel ama production için önerilenler

- **Upstash Redis** (dağıtık rate limiting): https://console.upstash.com
  ücretsiz planı yeterli. Olmadan da çalışır ama Vercel'in çoklu-instance
  yapısında rate limit koruması zayıflar.
- **Sentry** (hata izleme): bir proje oluşturup `NEXT_PUBLIC_SENTRY_DSN`
  girilirse hata takibi aktifleşir.
- **Cloudflare Turnstile** (captcha): login/signup formunda bot koruması.

### 2.9 Supabase kullanıcı testi

Kendi hesabınla kayıt ol → onboarding'den bir workspace oluştur → bir davet
gönder → görev/kanban/sprint akışını dene. Bu, hem Faz 4 responsive testinin
hem de genel doğrulamanın en gerçekçi yolu.

---

## Önerilen sıralama

1. **Sen**: Supabase projesi + migration (2.1) — bu olmadan hiçbir şeyi
   gerçek veriyle test edemeyiz.
2. **Ben**: Eksik org-scoped API route'larını taşırım (1.1) — Ayarlar,
   Üyeler, Toplantılar tam fonksiyonel hale gelir.
3. **Sen**: SMTP + Gemini anahtarı (2.2, 2.3) — bildirimler ve AI Asistan
   çalışır hale gelir.
4. **Ben**: AI route'larını taşırım + DENEYAP'a göre prompt uyarlaması (1.3).
5. **Sen**: Google Cloud OAuth kurulumu (2.4) — istersen bu adımı sona
   bırakabiliriz, Drive/Takvim entegrasyonu olmadan da uygulama kullanılabilir.
6. **Ben**: Drive + Calendar route'ları (1.2, 1.4).
7. **Ben**: Faz 3 domain adaptasyonu (il/birim, Operasyon Risk gerçek veri).
8. **Ben**: Faz 4 responsive test turu.
9. **Sen**: Vercel deploy + domain (2.5).

Bu sıralama zorunlu değil — istediğin adımı öne alabiliriz. Örneğin Drive
entegrasyonunu hiç istemiyorsan 1.2/2.4'ü tamamen atlayabiliriz.
