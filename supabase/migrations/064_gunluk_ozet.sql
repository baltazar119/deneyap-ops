-- 064_gunluk_ozet.sql
--
-- Trend grafikleri için günlük anlık görüntü (snapshot) tablosu.
--
-- NEDEN SNAPSHOT, NEDEN DURUM GEÇMİŞİ TABLOSU DEĞİL:
-- "Bloke görev sayısı 3 haftadır düşmüyor" gibi bir cümle için görevin
-- geçmişteki durumunu bilmek gerekiyor. Tam bir durum-değişikliği geçmişi
-- (her status update için satır) çok daha pahalı ve yalnızca trend için
-- gereğinden fazla. Günde bir kez fotoğraf çekmek grafik için yeterli.
--
-- Bugünkü veriden GERİYE DÖNÜK türetilebilenler (açılan, tamamlanan, açık,
-- geciken) zaten created_at / completed_at / due_date'ten hesaplanabiliyor;
-- bu tablo asıl olarak TÜRETİLEMEYENLER için var: bloke, atanmamış, risk
-- skoru. Uygulama tarafı gün başına "ölçüm mü türetme mi" kararı verir.

create table if not exists public.gunluk_ozet (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  -- Ölçümün ait olduğu gün (yerel gün, YYYY-MM-DD)
  gun date not null,

  -- Kırılım seviyesi. 'org' satırında il ve deneyap_id null olur.
  kirilim text not null check (kirilim in ('org', 'il', 'deneyap')),
  il text,
  deneyap_id uuid,   -- FK YOK: DENEYAP silinse bile tarihsel ölçüm bozulmasın

  -- Metrikler ayrı sütunlar (jsonb değil): grafik sorgusu 90 satırda birkaç
  -- sütun okur, tipli sütun indekslenebilir ve CHECK konabilir.
  toplam              integer not null default 0,
  acik                integer not null default 0,
  tamamlanan          integer not null default 0,
  devam_eden          integer not null default 0,
  bekleyen            integer not null default 0,
  bloke               integer not null default 0,
  geciken             integer not null default 0,
  gecikme_gun_toplam  integer not null default 0,
  atanmamis           integer not null default 0,
  kritik_atanmamis    integer not null default 0,
  termini_yaklasan    integer not null default 0,
  yeni_olusturulan    integer not null default 0,
  gun_icinde_tamamlanan integer not null default 0,
  risk_skoru          integer,
  risk_seviyesi       text check (risk_seviyesi in ('low', 'medium', 'high')),

  -- İleride migration yazmadan metrik eklemek için kaçış kapısı
  ek jsonb not null default '{}'::jsonb,

  -- DEMO VERİSİNİN GERÇEKLE KARIŞMAMASI: sunum için üretilen geçmiş
  -- 'demo' olarak işaretlenir ve tek sorguyla temizlenebilir. Bu sütun
  -- olmasaydı demo verisi gerçek ölçümlerin arasında kalıcı olarak kaybolurdu.
  kaynak text not null default 'cron' check (kaynak in ('cron', 'turetilmis', 'demo')),

  hesaplandi_at timestamptz not null default now()
);

-- Upsert idempotent olsun: cron iki kez çalışsa da satır tekrarlamaz.
-- coalesce'ler null'ları tekilleştirmek için (null <> null olduğundan
-- düz bir unique constraint 'org' satırlarını tekilleştiremezdi).
create unique index if not exists gunluk_ozet_tekil_idx
  on public.gunluk_ozet (
    organization_id, gun, kirilim,
    coalesce(il, ''),
    coalesce(deneyap_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

-- Grafiklerin ana okuma deseni: son N gün, belirli kırılım
create index if not exists gunluk_ozet_okuma_idx
  on public.gunluk_ozet (organization_id, kirilim, gun desc);

alter table public.gunluk_ozet enable row level security;

-- Okuma org üyesine açık; YAZMA yalnızca service-role (cron ve demo script'i).
-- Kullanıcıya yazma izni verilseydi geçmiş ölçümler değiştirilebilirdi.
drop policy if exists gunluk_ozet_select on public.gunluk_ozet;
create policy gunluk_ozet_select on public.gunluk_ozet
  for select using (public.is_org_member(organization_id));

comment on table public.gunluk_ozet is
  'Günlük operasyon anlık görüntüsü. Cron her gece yazar. `kaynak` sütunu '
  'demo verisini gerçek ölçümden ayırır. Trend grafikleri gün başına '
  '"ölçüm var mı" diye bakar, yoksa görev tarihlerinden türetir.';
comment on column public.gunluk_ozet.kaynak is
  'cron = gerçek gece ölçümü · turetilmis = geçmişe dönük hesap · '
  'demo = sunum için üretildi (scripts/ozet-demo.mjs --temizle ile silinir)';
