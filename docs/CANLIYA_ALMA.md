# DENEYAP OYS — Canlıya Alma

Kod tarafı tamamlandı. Bu belge, canlıya almak için **senin yapman gerekenleri**
ve **bilinçli olarak sonraya bırakılanları** listeliyor.

---

## 1. Supabase — migration durumu

Hepsi çalıştırıldı:

| No | İçerik | Durum |
|---|---|---|
| 001–053 | Temel şema, il alanı, viewer rolü, kategoriler | ✅ |
| 054 | `tasks.updated_at` + trigger | ✅ |
| 055 | İçe aktarma tabloları | ✅ |
| 056 | `import_tasks_apply` / `import_tasks_revert` | ✅ |
| 057 | Telegram kanalı + eylem tokenları | ✅ |
| 058 | Haftalık rapor ayarları | ✅ |

Yeni bir migration eklenirse `supabase/migrations/` altına konur ve
SQL Editor'dan çalıştırılır.

---

## 2. Vercel'e deploy

### 2.1 Ortam değişkenleri

Vercel → Project → Settings → Environment Variables. `.env.local`'deki
değerlerin aynısı (Production + Preview):

**Zorunlu**
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_APP_URL          ← deploy sonrası GERÇEK adres
CRON_SECRET
```

**E-posta (bildirimler ve haftalık rapor)**
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER
SMTP_PASS                    ← Gmail uygulama şifresi
FROM_EMAIL
```

**Telegram**
```
TELEGRAM_BOT_TOKEN
TELEGRAM_WEBHOOK_SECRET
```

**AI Asistan (opsiyonel)**
```
GEMINI_API_KEY               ← henüz alınmadı; onsuz AI ekranı açılır ama görev üretmez
```

**Demo paneli — DİKKAT**
```
NEXT_PUBLIC_DEMO_MODE        ← Production'da TANIMLAMA
```
Tanımlarsan giriş sayfasında çalışan demo şifreleri herkese görünür.

### 2.2 Deploy sonrası tek seferlik adımlar

**a) `NEXT_PUBLIC_APP_URL`'i düzelt** — gerçek Vercel adresiyle. E-posta
linkleri ve Telegram webhook adresi buna bağlı.

**b) Telegram webhook'unu kaydet:**
```bash
curl -X POST "https://<adresin>/api/kanal/telegram/kurulum" \
  -H "Authorization: Bearer <CRON_SECRET>"
```
Bu, Telegram'a webhook adresini ve gizli anahtarı bildirir. **Yerelde
yapılamaz** çünkü Telegram herkese açık bir HTTPS adresi ister.

**c) Cron.** `vercel.json`'da **tek** cron var:

| Zaman | İş |
|---|---|
| Her gün 07:00 | `/api/cron/gunluk` |

Bu uç, günün hangi işleri gerektirdiğine kendisi karar verir:

- **Her gün:** gecikme/termin kontrolleri (e-posta + Telegram), günlük özet
- **Pazartesi ayrıca:** haftalık özet, haftalık PDF raporu

Dört ayrı cron yerine tek uç kullanılmasının sebebi Vercel **Hobby**
planının az sayıda cron ve günde bir çalıştırma vermesi. Pro planda da
aynı şekilde çalışır.

Elle çalıştırma / test:
```bash
# e-posta göndermeden dene
curl -H "Authorization: Bearer <CRON_SECRET>"   "https://<adresin>/api/cron/gunluk?deneme=1"

# Pazartesi'ymiş gibi davran (haftalık işleri de tetikler)
curl -H "Authorization: Bearer <CRON_SECRET>"   "https://<adresin>/api/cron/gunluk?deneme=1&gun=1"
```

Ölçülen süreler (Hobby, üretim): günlük kontroller ~20 sn, haftalık rapor
(5 PDF) ~7 sn. Süre sınırı sorun çıkarmıyor.

**d) Upstash Redis (önerilir).** `UPSTASH_REDIS_REST_URL` ve
`UPSTASH_REDIS_REST_TOKEN` tanımlı değilse rate limit bellek içinde çalışır;
serverless'ta her istek farklı bir örneğe düşebildiği için gerçek koruma
sağlamaz.

---

## 3. Senden bekleyenler

| İş | Neden gerekli |
|---|---|
| **Gemini API anahtarı** | AI Asistan görev üretemiyor |
| **DENEYAP logosu** | `public/logo.svg` hâlâ placeholder "D" |
| **Yasal metinler** | kvkk, gizlilik, dpa, kullanım şartları placeholder |
| **PWA ikonları** | `public/icons/` ve `manifest.json` yok |
| **Telegram token'ını yenile** | Sohbete yazıldı; BotFather → `/revoke` |
| **Gmail uygulama şifresini yenile** | Sohbete yazıldı |

---

## 4. Bilinçli olarak sonraya bırakılanlar

**Responsive tam tur.** Yeni ekranlar (Rapor Merkezi, içe aktarma sihirbazı,
profil) mobilde kontrol edildi, yatay taşma yok. Ama 375/390/430/768/1024/
1366/1440/1920 px'te **tüm** ekranların sistematik turu yapılmadı.

**Bağımlılık güvenlik borcu.** `npm audit` 12 zafiyet gösteriyor ve
**çoğu bu projeden önce vardı**. İkisi doğrudan ilgili:
- `next` 14.2.35 — Image Optimizer `remotePatterns` üzerinden DoS
  (`next.config.js` remotePatterns kullanıyor)
- `nodemailer` — `raw` seçeneği dosya okuma/SSRF'e açık (biz `raw`
  kullanmıyoruz)

`npm audit fix` bunları kıramadan çözemiyor; hepsi major sürüm atlaması
gerektiriyor. Ayrı bir iş olarak ele alınmalı.

**Google OAuth borcu** (Sheets kesildiği için bu planın dışında kaldı):
- OAuth `state` nonce'ı üretiliyor ama doğrulanmıyor → CSRF
- Drive token'ı org bazlı seçilmiyor ("en son güncellenen satır") →
  workspace'ler arası sızıntı riski
- `api/drive/*` uçlarında auth kontrolü yok
- `api/drive/debug` production'da açık ve env bilgisi sızdırıyor
- `api/org/[slug]/meetings` GET'te auth bloğu yok ve tüm kullanıcı
  e-postalarını döndürüyor

**WhatsApp.** Adaptör kod olarak hazır (`src/lib/kanal/whatsapp.ts`) ama
env tanımlı olmadığı için devre dışı. Meta işletme doğrulaması ve şablon
onayı tamamlanınca yalnızca o dosya doldurulacak.

---

## 5. Doğrulama komutları

```bash
npm run seed:demo       # demo hesapları ve örnek veriyi kurar
npm run smoke:import    # Excel içe aktarmayı uçtan uca dener
npm run smoke:rapor     # dört rol × üç format rapor üretir
npx vitest run          # 173 birim testi
npx tsc --noEmit        # tip kontrolü
```

Haftalık raporu e-posta göndermeden denemek için:
```bash
curl -H "Authorization: Bearer <CRON_SECRET>" \
  "https://<adresin>/api/cron/haftalik-rapor?deneme=1"
```
