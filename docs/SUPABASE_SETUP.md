# Supabase Kurulum Rehberi — DENEYAP OYS

Supabase, bu uygulamanın **veritabanı + kullanıcı girişi + dosya deposu +
gerçek zamanlı güncellemeler** katmanıdır. Uygulama Supabase olmadan
çalışmaz. Bu proje kendi bağımsız Supabase projesini kullanır (Tarlis'in
projesiyle hiçbir bağlantısı yoktur).

## Supabase tam olarak ne yapıyor?

| Katman | Ne yapar | Nerede kullanılıyor |
|---|---|---|
| **Postgres veritabanı** | Tüm veri: görevler, sprintler, üyeler, mesajlar | Her ekran |
| **Auth** | E-posta/şifre + Google ile giriş, oturum yönetimi | Login, tüm korumalı sayfalar |
| **RLS (Row Level Security)** | Kimin hangi satırı görebileceğini veritabanı seviyesinde sınırlar | Multi-tenant izolasyon (bir il diğerinin verisini göremez) |
| **Realtime** | Yeni mesaj/bildirim anında ekrana düşer | Chat, Bildirim Merkezi |
| **Storage** | Görsel ve dosya deposu (`ui-files`, `ui-annotations` bucket'ları) | Danışmanlık modülü, görsel işaretleme |

**RLS önemli**: Uygulamanın güvenliği büyük ölçüde veritabanı politikalarına
dayanıyor. Bu politikalar migration'lar içinde tanımlı — yani şemayı doğru
kurmak aynı zamanda güvenliği kurmak demek.

---

## Adım 1 — Projeyi oluştur

https://supabase.com/dashboard → **New project**

| Alan | Ne girmeli | Neden |
|---|---|---|
| Project name | `deneyap-ops` | Serbest |
| Database password | **Generate a password** ile üret, **kaydet** | `db push` ve doğrudan DB erişimi için gerekli, bir daha gösterilmez |
| **Region** | **Europe (Frankfurt)** | Türkiye'den ~40-60ms; Asia-Pacific seçilirse ~250-300ms olur. **Sonradan değiştirilemez.** |
| Enable Data API | ✅ açık | `supabase-js` kütüphanesi bunu kullanıyor |
| Automatically expose new tables | ✅ açık | Migration'lar tabloları oluşturup RLS ile koruyor; güvenlik oradan geliyor |
| Enable automatic RLS | ⬜ kapalı | Migration'lar RLS'i kendileri açıyor; bu trigger araya girip çakışabilir |
| GitHub (optional) | Bağlamayın | Şemayı elle kontrollü kuracağız |

---

## Adım 2 — Şemayı kur

Bu projedeki 49 migration dosyası orijinalinde **Supabase SQL Editor'de elle**
çalıştırılmak üzere yazılmış (dosya adları `001_`, `002_` şeklinde; Supabase
CLI'nin beklediği zaman damgası formatında değil). Bu yüzden **en garantili
yol SQL Editor** üzerinden kurmak:

1. Supabase Dashboard → sol menüden **SQL Editor** → **New query**
2. Bu depodaki **`supabase/full_schema.sql`** dosyasını aç, tüm içeriğini
   kopyala (49 migration'ın sırayla birleştirilmiş hali — 4092 satır)
3. SQL Editor'e yapıştır → **Run**
4. "Success. No rows returned" görmen gerekiyor

**Hata alırsan**: Hata mesajını bana ilet — hangi satırda kaldıysa oradan
düzeltip devam ederiz. Dosya çok büyük gelirse ikiye bölüp iki seferde
çalıştırabiliriz (bölme noktasını söyleyebilirim).

### Kurulumu doğrula

SQL Editor'de şunu çalıştır:

```sql
select table_name from information_schema.tables
where table_schema = 'public' order by table_name;
```

Beklenen tablolardan bazıları: `profiles`, `organizations`,
`organization_members`, `tasks`, `sprints`, `notifications`,
`chat_messages`, `checklists`, `meetings`, `org_files`, `audit_logs`.

Storage bucket'larını da kontrol et (Dashboard → Storage): `ui-files` ve
`ui-annotations` görünmeli — bunlar migration ile otomatik oluşur.

### Alternatif: Supabase CLI

CLI ile de denenebilir ama dosya adlandırması nedeniyle sorun çıkarabilir:

```bash
npx supabase login
npx supabase link --project-ref <PROJE_REF>
npx supabase db push
```

`<PROJE_REF>`: Dashboard URL'indeki kimlik
(`https://supabase.com/dashboard/project/XXXXX` → `XXXXX`) veya
Settings → General → Reference ID.

CLI "invalid migration version" gibi bir hata verirse SQL Editor yolunu kullan.

---

## Adım 3 — API anahtarlarını al

Dashboard → **Settings** → **API**:

| Değer | Nereye yazılacak | Gizlilik |
|---|---|---|
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` | Herkese açık olabilir |
| `anon` / `public` key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Herkese açık olabilir (RLS koruyor) |
| `service_role` key | `SUPABASE_SERVICE_ROLE_KEY` | **GİZLİ** — RLS'i tamamen bypass eder, asla client tarafına veya git'e koyma |

`.env.local.example` dosyasını `.env.local` olarak kopyalayıp bu değerleri gir.
`.env.local` dosyası `.gitignore`'da — git'e gitmez, doğru olan da bu.

---

## Adım 4 — Auth ayarları

Dashboard → **Authentication** → **URL Configuration**:

- **Site URL**: geliştirme için `http://localhost:3000`, canlıda gerçek
  domain (`https://deneyap-ops.vercel.app` gibi)
- **Redirect URLs**: her iki adresi de ekle:
  - `http://localhost:3000/auth/callback`
  - `https://<canlı-domain>/auth/callback`

Bunlar eksikse Google ile giriş "redirect_uri_mismatch" hatası verir.

### E-posta doğrulama

Authentication → Providers → Email. Varsayılan olarak Supabase kayıt
sonrası doğrulama e-postası ister. İlk testlerde işi kolaylaştırmak için
**"Confirm email"** kapatılabilir — canlıya çıkarken açman önerilir.

### Google ile giriş (opsiyonel)

Authentication → Providers → Google → aç, Google Cloud'dan aldığın Client
ID/Secret'ı gir. Supabase'in gösterdiği callback URL'ini Google Cloud
Console'daki yetkili redirect URI listesine eklemen gerekir.

---

## İleride şema değişikliği gerekirse

Yeni bir migration eklendiğinde (örn. Faz 3'teki il/birim ve operasyon risk
tabloları):

1. `supabase/migrations/050_xxx.sql` gibi yeni dosya eklenir — **mevcut
   dosyalar asla değiştirilmez**
2. Yalnızca yeni dosyanın içeriği SQL Editor'de çalıştırılır
3. `full_schema.sql` yeniden üretilir (sıfırdan kurulumlar için):

```bash
cd supabase && { for f in migrations/*.sql; do echo; echo "-- $(basename $f)"; echo; cat "$f"; done; } > full_schema.sql
```

---

## Sık karşılaşılan sorunlar

| Belirti | Sebep | Çözüm |
|---|---|---|
| "supabaseUrl is required" | `.env.local` yok veya boş | Adım 3'ü tamamla, `npm run dev`'i yeniden başlat |
| Giriş yapıyor ama sayfa boş / workspace'e düşmüyor | Şema kurulmamış | Adım 2'yi tamamla |
| "row-level security policy" hatası | Kullanıcı o org'un üyesi değil | Onboarding'den workspace oluştur veya davet kabul et |
| Google girişte "redirect_uri_mismatch" | Redirect URL eksik | Adım 4'teki URL'leri hem Supabase'e hem Google Cloud'a ekle |
| Dosya yükleme çalışmıyor | Google Drive bağlı değil | Bu Supabase değil, Drive OAuth konusu — `docs/ROADMAP.md` 2.4 |
