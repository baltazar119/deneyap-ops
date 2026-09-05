-- 060_deneyaplar.sql
--
-- "Bir ilde birden fazla DENEYAP" — bugün `il` yalnızca serbest metin
-- (053), birim kavramı yok. Ankara'da iki atölye varsa ikisi de sadece
-- "Ankara" olarak görünüyor; hangi atölyenin işi olduğu kaybediliyor.
--
-- KARAR: `il` DEĞİŞTİRİLMİYOR. DENEYAP ayrı bir tablo ve `tasks.il` olduğu
-- gibi kalıyor (061). `deneyap_id` null olan her şey bugünkü gibi çalışmaya
-- devam eder — geriye dönük uyumun tamamı budur.
--
-- Backfill YOK: `il` ≠ DENEYAP. Altı DENEYAP'lı bir il için tek uydurma
-- kayıt üretmek yanlış veri olurdu. Mevcut veriyi taşımak isteyen için
-- Ayarlar ekranında "il başına bir DENEYAP oluştur" onaylı aracı var.

-- ─────────────────────────────────────────────────────────────────────────
-- tr_fold — TypeScript'teki trFold'un SQL İKİZİ
-- ─────────────────────────────────────────────────────────────────────────
-- İKİZ UYARISI: src/lib/turkce.ts içindeki trFold() ile birebir aynı
-- davranmalı. İkisi ayrışırsa aynı DENEYAP iki kez oluşturulabilir
-- (arayüz "yok" der, unique kısıt "var" der ya da tersi).
--
-- Asıl mesele "İ".toLowerCase(): JavaScript bunu i + U+0307 üretir, bu proje
-- daha önce tam bu yüzden "İSTANBUL" → "i-stanbul" hatası verdi. Çözüm iki
-- tarafta da Türkçe harfleri küçültmeden ÖNCE çevirmek.
--
-- `immutable` olmak zorunda: unique index ifadesinde kullanılıyor.

create or replace function public.tr_fold(s text)
returns text
language sql
immutable
strict
set search_path = public
as $$
  select btrim(
    regexp_replace(
      lower(
        -- Türkçe harfler + TS tarafında NFD ile temizlenen aksanlı Latin
        -- harfleri. Eşleşme çiftleri scripts/tr-fold-ikiz.mjs ile üretildi;
        -- iki dizgenin karakter sayısı EŞİT olmalı (60).
        translate(
          s,
          'İIıĞğÜüŞşÖöÇçâÂàÀáÁäÄãÃåÅêÊèÈéÉëËîÎìÌíÍïÏôÔòÒóÓõÕûÛùÙúÚñÑýÝÿ',
          'iiigguussooccaaaaaaaaaaaaeeeeeeeeiiiiiiiioooooooouuuuuunnyyy'
        )
      ),
      '\s+', ' ', 'g'
    )
  )
$$;

comment on function public.tr_fold(text) is
  'Türkçe metin katlama — src/lib/turkce.ts:trFold() ile İKİZ. Biri '
  'değişirse diğeri de değişmeli; ayrışırsa DENEYAP tekilleştirmesi bozulur '
  've aynı isimde iki kayıt oluşabilir. scripts/deploy-sonrasi.mjs örnek '
  'karşılaştırma yapar.';

-- ─────────────────────────────────────────────────────────────────────────
-- deneyaplar
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.deneyaplar (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  ad     text not null,
  -- DENEYAP'ın bulunduğu il. 061'deki trigger `tasks.il`'i buradan doldurur
  -- ve bu alanın DEĞİŞTİRİLMESİNİ engeller — gerekçe 061'de.
  il     text not null,
  ilce   text,
  -- Kurum içi kod (varsa). Excel eşlemesinde ada göre daha güvenilir.
  kod    text,
  adres  text,
  notlar text,

  -- Silme yok, kapatma var: kapatılan DENEYAP'a bağlı görevlerin geçmişi
  -- korunmalı. Seçicide pasifler gizlenir ama seçili olan görünür.
  aktif      boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Aynı org içinde aynı ad iki kez olamaz. Karşılaştırma tr_fold ile:
-- "Çankaya DENEYAP" ile "cankaya deneyap" aynı kayıttır.
create unique index if not exists deneyaplar_org_ad_uniq
  on public.deneyaplar (organization_id, public.tr_fold(ad));

-- Seçici ve yönetim ekranının ana sorgusu: org + aktif + il.
create index if not exists deneyaplar_org_aktif_il_idx
  on public.deneyaplar (organization_id, aktif, il);

-- 054'teki desen
drop trigger if exists deneyaplar_updated_at on public.deneyaplar;
create trigger deneyaplar_updated_at
  before update on public.deneyaplar
  for each row execute function public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- RLS — okuma her üyeye, yazma yalnızca owner/admin'e (023'teki yardımcılar)
-- ─────────────────────────────────────────────────────────────────────────

alter table public.deneyaplar enable row level security;

drop policy if exists deneyaplar_select on public.deneyaplar;
create policy deneyaplar_select on public.deneyaplar
  for select using (public.is_org_member(organization_id));

drop policy if exists deneyaplar_insert on public.deneyaplar;
create policy deneyaplar_insert on public.deneyaplar
  for insert with check (public.is_org_admin(organization_id));

drop policy if exists deneyaplar_update on public.deneyaplar;
create policy deneyaplar_update on public.deneyaplar
  for update using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

-- DELETE politikası BİLEREK YOK: kayıt silinmiyor, `aktif = false` yapılıyor.
-- Politikasız DELETE, RLS açıkken herkese kapalıdır.

comment on table public.deneyaplar is
  'DENEYAP birimleri. Bir ilde birden fazla olabilir. `il` alanı 061''deki '
  'trigger ile değiştirilemez; yanlışsa DENEYAP kapatılıp doğrusu açılır.';
comment on column public.deneyaplar.aktif is
  'false = kapatılmış. Silme yerine kapatma: bağlı görevlerin geçmişi korunur.';
