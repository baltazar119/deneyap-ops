# Supabase kurulum kılavuzu (DENEYAP Ops)

Bu proje, Tarlis Atölye'nin Supabase projesinden tamamen bağımsız, DENEYAP'a özgü
yeni bir Supabase projesi kullanmalıdır.

## 1. Yeni Supabase projesi oluştur

1. https://supabase.com/dashboard adresinden yeni bir proje oluştur (ör. `deneyap-ops`).
2. Proje URL'ini ve `anon`/`service_role` anahtarlarını not al.

## 2. Ortam değişkenlerini doldur

`.env.local.example` dosyasını `.env.local` olarak kopyala ve şu değerleri doldur:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- SMTP değişkenleri (bildirim e-postaları için)
- `GEMINI_API_KEY` (AI Görev Asistanı için)

## 3. Migration'ları uygula

```bash
# Supabase CLI kurulu değilse:
npm install -g supabase

# Projeyi bağla
supabase login
supabase link --project-ref <your-project-ref>

# Migration'ları uygula
supabase db push
```

`supabase/migrations/` klasörü, Tarlis'in şema temelinden (orgs, RLS, tasks, kanban,
sprints, notifications, chat, calendar, checklists, files, meetings, members) taşınan
migration'ları ve üzerine eklenen DENEYAP'a özgü migration'ları (il/birim, operasyon
risk, DENEYAP görev alanları) içerir. Mevcut migration dosyaları asla değiştirilmez;
yeni ihtiyaçlar için her zaman yeni bir migration dosyası eklenir.

## Önemli

Bu adımlar kullanıcı tarafından, kendi Supabase hesabıyla yapılmalıdır — otomasyon
gerçek bulut kaynağı oluşturmaz veya canlı bir veritabanına migration uygulamaz.
