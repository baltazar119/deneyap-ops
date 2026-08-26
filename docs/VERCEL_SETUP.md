# Vercel Deploy Rehberi — DENEYAP Ops

Vercel, Next.js uygulamasını **çalıştıran** platform. Supabase veriyi tutar,
Vercel uygulamayı sunar. İkisi birlikte çalışır.

## Vercel tam olarak ne yapıyor?

- GitHub'daki repoyu izler; her `git push` sonrası otomatik build alıp yayına
  alır (**CI/CD**)
- Next.js sayfalarını dünya genelinde CDN'den sunar
- `src/app/api/**` altındaki route'ları **serverless fonksiyon** olarak
  çalıştırır (kendi sunucu yönetmene gerek yok)
- `vercel.json` içindeki **cron** tanımlarını zamanlanmış görev olarak
  tetikler (günlük/haftalık özet e-postaları)
- Ortam değişkenlerini (secret'ları) güvenli şekilde saklar

Ücretsiz (Hobby) plan bu proje için başlangıçta yeterli. Not: Hobby planda
cron job'lar **günde bir kez** çalışır — `vercel.json`'daki üç cron'dan
dijest e-postaları etkilenebilir; ticari kullanımda Pro plan gerekir.

---

## Adım 1 — Repoyu import et

Repo zaten hazır: https://github.com/baltazar119/deneyap-ops

1. https://vercel.com → GitHub hesabınla giriş yap
2. **Add New** → **Project**
3. `deneyap-ops` reposunu seç → **Import**
4. Framework: **Next.js** olarak otomatik algılanır — dokunma
5. Build ayarlarını değiştirme (varsayılanlar doğru)
6. **Deploy'a basmadan önce Adım 2'yi yap** — env değişkenleri olmadan build
   başarısız olur veya uygulama açılınca hata verir

---

## Adım 2 — Ortam değişkenlerini gir

Import ekranında **Environment Variables** bölümünü aç (veya sonradan
Settings → Environment Variables). `.env.local.example` dosyasındaki tüm
değişkenleri buraya gir.

**Zorunlu olanlar** (bunlar olmadan uygulama açılmaz):

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_APP_URL
```

`NEXT_PUBLIC_APP_URL`: ilk deploy'da Vercel'in vereceği adresi henüz
bilmiyorsun. Önce `https://deneyap-ops.vercel.app` gir, deploy bitince
gerçek adresi görüp gerekirse düzelt ve yeniden deploy et.

**E-posta bildirimleri için**: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
`SMTP_PASS`, `FROM_EMAIL`, `CRON_SECRET`

**AI Görev Asistanı için**: `GEMINI_API_KEY`

**Google Drive / Takvim / Google ile giriş için**: `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_GCAL_REDIRECT_URI`,
`DRIVE_ADMIN_USER_ID`

**Süper admin paneli için**: `NEXT_PUBLIC_SUPER_ADMIN_EMAIL` ve
`SUPER_ADMIN_EMAIL` — **ikisi de aynı e-posta** olmalı (biri sayfayı, diğeri
API'yi kapılıyor). Boş bırakılırsa `/admin` erişilemez kalır.

**Opsiyonel**: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`,
`NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`

Her değişkeni **Production**, **Preview** ve **Development** ortamlarının
üçü için de işaretle (aksi halde preview deploy'larda uygulama patlar).

---

## Adım 3 — cron secret'ı (elle bir şey yapmana gerek yok)

Vercel cron path'leri ortam değişkeni interpolasyonunu desteklemez, yani
`?secret=$CRON_SECRET` yazmak işe yaramaz. Bu yüzden secret **path'te
taşınmıyor**: Vercel, `vercel.json` içindeki cron'ları çağırırken isteğe
otomatik olarak `Authorization: Bearer $CRON_SECRET` başlığını ekliyor ve
endpoint'ler bunu `src/lib/cronAuth.ts` üzerinden doğruluyor.

Tek yapman gereken, Adım 2'de `CRON_SECRET` env değişkenini Vercel'e
girmiş olmak. Girilmemişse endpoint'ler **her isteği 401 ile reddeder**
(secret yoksa "açık" değil, "kapalı" davranıyor).

Elle test etmek istersen sorgu parametresi de kabul ediliyor:

```bash
curl "https://<projen>.vercel.app/api/cron/daily-checks?secret=<CRON_SECRET>"
```

Dijest e-postalarını şimdilik istemiyorsan `vercel.json`'ı silmek de
geçerli bir seçenek; uygulamanın geri kalanı etkilenmez.

---

## Adım 4 — Deploy ve sonrası

**Deploy** → build ~2-3 dakika sürer. Bittiğinde:

1. Verilen adresi aç, login sayfası görünmeli
2. `NEXT_PUBLIC_APP_URL`'i gerçek adresle güncelle (farklıysa)
3. **Supabase** → Authentication → URL Configuration → Site URL ve Redirect
   URLs'e canlı domain'i ekle (`https://<domain>/auth/callback`)
4. Google OAuth kullanıyorsan Google Cloud Console'daki yetkili redirect
   URI'lara da canlı adresleri ekle

### Kendi domain'ini bağlamak

Settings → Domains → domain'i ekle → Vercel'in verdiği DNS kayıtlarını
(A veya CNAME) domain sağlayıcında tanımla. Bağlandıktan sonra Adım 4'teki
URL'leri yeni domain'e göre güncelle.

---

## Sonraki push'lar

Bundan sonra `git push origin master` yaptığın anda Vercel otomatik build
alıp yayına alır. Ben commit'leyip push ettiğimde değişiklik kendiliğinden
canlıya çıkar — yani deploy için ayrıca bir şey yapman gerekmez.

Build hatası olursa Vercel e-posta atar ve **önceki çalışan sürüm ayakta
kalır** (bozuk sürüm yayına geçmez).

---

## Sık karşılaşılan sorunlar

| Belirti | Sebep | Çözüm |
|---|---|---|
| Build "supabaseUrl is required" ile patlıyor | Env değişkenleri girilmemiş | Adım 2 |
| Sayfa açılıyor ama giriş yapılamıyor | Supabase Site URL / Redirect URL eksik | Adım 4.3 |
| Google girişte redirect hatası | Google Cloud'da canlı URI tanımlı değil | Adım 4.4 |
| Dijest e-postaları gelmiyor | Cron secret placeholder olarak kalmış | Adım 3 |
| `/admin` "yetkisiz" diyor | İki süper admin env değişkeninden biri eksik | Adım 2 |
| Preview deploy'lar patlıyor, production çalışıyor | Env değişkenleri sadece Production'a girilmiş | Adım 2 (üç ortamı da işaretle) |
