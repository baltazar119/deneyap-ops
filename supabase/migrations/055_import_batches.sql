-- 055_import_batches.sql
-- Excel/CSV içe aktarma altyapısı.
--
-- Tasarımın iki taşıyıcı fikri:
--
-- 1) import_rows KALICI. Önizleme ile uygulama arasında dosya yeniden
--    ayrıştırılmaz — kullanıcının onayladığı satırlar ile yazılan satırlar
--    bit bit aynıdır. Ayrıca `previous` alanı güncellemelerin geri
--    alınmasını, `errors` alanı da hata raporunun sonradan indirilmesini
--    mümkün kılar.
--
-- 2) external_key / import_fingerprint eşleştirme anahtarıdır. Kullanıcı
--    kararı "eşleşeni güncelle" olduğu için ikinci yüklemede aynı görevin
--    kopyası oluşmamalı. Satır SIRASI anahtar olarak KULLANILMAZ — araya
--    bir satır eklenince tüm eşleşme kayardı.

/* ── Parti başlığı ──────────────────────────────────────────────────────── */

create table if not exists public.import_batches (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  created_by       uuid not null references auth.users(id) on delete cascade,

  kaynak           text not null default 'excel' check (kaynak in ('excel','csv')),
  dosya_adi        text not null,
  dosya_boyutu     bigint,
  -- Aynı dosyanın tekrar yüklendiğini fark edip kullanıcıyı uyarmak için
  dosya_hash       text,

  -- Kullanıcının onayladığı sütun eşlemesi ve seçenekleri
  esleme           jsonb not null default '{}'::jsonb,
  secenekler       jsonb not null default '{}'::jsonb,

  durum            text not null default 'onizleme'
                   check (durum in ('onizleme','uygulaniyor','tamamlandi','kismi','geri_alindi','hatali')),

  satir_sayisi     int not null default 0,
  olusturulan      int not null default 0,
  guncellenen      int not null default 0,
  atlanan          int not null default 0,
  hatali           int not null default 0,
  hata_mesaji      text,

  created_at       timestamptz not null default now(),
  uygulandi_at     timestamptz,
  geri_alindi_at   timestamptz,
  geri_alan        uuid references auth.users(id) on delete set null
);

create index if not exists import_batches_org_idx
  on public.import_batches (organization_id, created_at desc);

/* ── Satır ayrıntısı ────────────────────────────────────────────────────── */

create table if not exists public.import_rows (
  id          uuid primary key default gen_random_uuid(),
  batch_id    uuid not null references public.import_batches(id) on delete cascade,
  -- Excel'deki gerçek satır numarası (başlık satırı dahil) — hata mesajında
  -- kullanıcıya "14. satır" diyebilmek için
  satir_no    int  not null,

  ham         jsonb not null,              -- hücreler, sütun adıyla
  -- 'normalize' PostgreSQL'de anahtar kelime; ayrı bir ad kullanıyoruz
  normalize_veri jsonb,                    -- doğrulamadan geçmiş hâli
  eslesme_anahtari text,

  task_id     uuid references public.tasks(id) on delete set null,
  -- GÜNCELLEME öncesi görev anlık görüntüsü → geri alma bunu geri yazar
  onceki      jsonb,

  eylem       text check (eylem in ('bekliyor','eklendi','guncellendi','atlandi','hatali'))
              default 'bekliyor',
  hatalar     jsonb not null default '[]'::jsonb,
  uyarilar    jsonb not null default '[]'::jsonb,

  unique (batch_id, satir_no)
);

create index if not exists import_rows_batch_idx on public.import_rows (batch_id, satir_no);

/* ── Sütun eşleme hafızası ──────────────────────────────────────────────── */
-- İkinci içe aktarmada kullanıcının aynı eşlemeyi tekrar yapmasına gerek kalmasın

create table if not exists public.import_column_presets (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  esleme          jsonb not null,
  updated_at      timestamptz not null default now()
);

/* ── tasks üzerindeki iz ────────────────────────────────────────────────── */

alter table public.tasks
  add column if not exists import_batch_id uuid references public.import_batches(id) on delete set null,
  add column if not exists external_key text,
  add column if not exists import_fingerprint text;

-- Aynı org içinde bir dış anahtar tek göreve karşılık gelir
create unique index if not exists tasks_org_external_key_uniq
  on public.tasks (organization_id, external_key)
  where external_key is not null;

create index if not exists tasks_org_fingerprint_idx
  on public.tasks (organization_id, import_fingerprint)
  where import_fingerprint is not null;

create index if not exists tasks_import_batch_idx
  on public.tasks (import_batch_id)
  where import_batch_id is not null;

comment on column public.tasks.external_key is
  'Excel''deki Kod/Referans sütunu. Varsa eşleştirme bunun üzerinden yapılır.';
comment on column public.tasks.import_fingerprint is
  'Kod sütunu yoksa türetilen anahtar: normalize(başlık)|il. Bu alanlar değişirse yeni görev oluşur.';

/* ── RLS ────────────────────────────────────────────────────────────────── */
-- İçe aktarma yalnızca Merkez Operasyon / Koordinatör işidir (is_org_admin),
-- RLS'teki tasks_insert kuralıyla aynı sınır.

alter table public.import_batches        enable row level security;
alter table public.import_rows           enable row level security;
alter table public.import_column_presets enable row level security;

drop policy if exists "import_batches_admin" on public.import_batches;
create policy "import_batches_admin" on public.import_batches for all
  using      (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

drop policy if exists "import_rows_admin" on public.import_rows;
create policy "import_rows_admin" on public.import_rows for all
  using (exists (
    select 1 from public.import_batches b
    where b.id = import_rows.batch_id and public.is_org_admin(b.organization_id)
  ))
  with check (exists (
    select 1 from public.import_batches b
    where b.id = import_rows.batch_id and public.is_org_admin(b.organization_id)
  ));

drop policy if exists "import_presets_admin" on public.import_column_presets;
create policy "import_presets_admin" on public.import_column_presets for all
  using      (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));
