# DENEYAP Ops

DENEYAP operasyon yönetim sistemi. Tarlis Atölye arayüz sisteminden (renk paleti,
spacing, kart/sidebar/kanban/modal tasarımı) türetilmiş, bağımsız bir Next.js
uygulamasıdır. Bu proje Tarlis Atölye kaynak kodundan **kopyalanarak** oluşturulmuştur;
Tarlis reposuyla hiçbir git/kod bağlantısı yoktur.

## Kurulum

```bash
npm install
cp .env.local.example .env.local
# .env.local içindeki değerleri kendi Supabase/SMTP/Gemini bilgilerinle doldur
npm run dev
```

## Supabase kurulumu

Bu proje kendi bağımsız Supabase projesini kullanır (Tarlis'in Supabase projesiyle
paylaşılmaz). Ayrıntılı adımlar için [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md).

## Geliştirme durumu

Bu proje aşamalı olarak geliştiriliyor:

- **Faz 0 — Scaffold & Config**: tamamlandı
- **Faz 1 — Ortak UI sistemi & responsive temel bileşenler**: devam ediyor
- **Faz 2 — Ekranların taşınması**
- **Faz 3 — DENEYAP domain adaptasyonu**
- **Faz 4 — Responsive test turu**

Detaylı plan için proje geçmişindeki plan dokümanına bakınız.

## Test

```bash
npm run test        # vitest (unit)
npm run test:e2e    # playwright (uçtan uca / responsive)
```
