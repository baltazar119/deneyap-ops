-- DENEYAP Ops — Excel içe aktarma altyapısı (055 + 056)
-- Supabase SQL Editor'a yapıştırıp bir kez çalıştırın.
-- Tekrar çalıştırılabilir.


-- ============================================================
-- 055_import_batches.sql
-- ============================================================
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

-- ============================================================
-- 056_import_rpc.sql
-- ============================================================
-- 056_import_rpc.sql
-- İçe aktarmayı uygulama ve geri alma fonksiyonları.
--
-- Neden RPC, neden supabase-js'te döngü değil?
--   supabase-js'te transaction yok. Ardışık insert'ler ayrı ayrı commit olur;
--   5. yığında hata alırsanız ilk 4'ünü elle temizlemek gerekir ve fonksiyon
--   süresi ortada dolarsa temizlik hiç çalışmaz. plpgsql fonksiyonu tek
--   transaction'dır: ya hepsi olur ya hiçbiri.
--
-- Doğrulama BURADA YAPILMAZ. Geçersiz satırlar önizleme aşamasında
-- eylem='hatali' işaretlenir ve bu fonksiyon onlara hiç dokunmaz. Burada bir
-- kısıt ihlali olursa bu bir HATADIR → tüm parti geri alınır.

/* ── Uygula ─────────────────────────────────────────────────────────────── */

create or replace function public.import_tasks_apply(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org      uuid;
  v_user     uuid;
  v_mod      text;
  v_row      record;
  v_task     public.tasks%rowtype;
  v_mevcut   uuid;
  v_norm     jsonb;
  v_eklendi  int := 0;
  v_guncel   int := 0;
  v_atlandi  int := 0;
begin
  select organization_id, created_by, coalesce(secenekler->>'mod', 'guncelle')
    into v_org, v_user, v_mod
    from public.import_batches
   where id = p_batch_id;

  if v_org is null then
    raise exception 'İçe aktarma partisi bulunamadı';
  end if;

  -- security definer olduğu için yetkiyi BURADA doğrulamak zorundayız,
  -- aksi halde herhangi bir oturum başka org'un partisini uygulayabilir
  if not public.is_org_admin(v_org) then
    raise exception 'Bu işlem için yetkiniz yok';
  end if;

  update public.import_batches set durum = 'uygulaniyor' where id = p_batch_id;

  for v_row in
    select * from public.import_rows
     where batch_id = p_batch_id and eylem <> 'hatali'
     order by satir_no
  loop
    v_norm := v_row.normalize_veri;
    if v_norm is null then continue; end if;

    -- Eşleşen görevi ara (yalnızca bu org içinde)
    v_mevcut := null;
    if v_mod <> 'her_zaman_olustur' then
      if v_norm->>'external_key' is not null then
        select id into v_mevcut from public.tasks
         where organization_id = v_org and external_key = v_norm->>'external_key'
         limit 1;
      else
        select id into v_mevcut from public.tasks
         where organization_id = v_org and import_fingerprint = v_row.eslesme_anahtari
         limit 1;
      end if;
    end if;

    if v_mevcut is not null and v_mod = 'atla' then
      update public.import_rows
         set eylem = 'atlandi', task_id = v_mevcut
       where id = v_row.id;
      v_atlandi := v_atlandi + 1;

    elsif v_mevcut is not null then
      -- GÜNCELLE. Kritik kural: yalnızca dolu gelen alanlar yazılır.
      -- Excel'de "Durum" sütunu yoksa ya da hücre boşsa, sahada elle
      -- yapılmış güncelleme EZİLMEZ. Bu kural olmadan "göç" özelliği
      -- saha güncellemelerini silen bir silaha dönüşür.
      select * into v_task from public.tasks where id = v_mevcut;

      update public.import_rows
         set onceki = to_jsonb(v_task), task_id = v_mevcut, eylem = 'guncellendi'
       where id = v_row.id;

      update public.tasks set
        title           = coalesce(nullif(v_norm->>'title', ''), title),
        description     = coalesce(nullif(v_norm->>'description', ''), description),
        il              = coalesce(nullif(v_norm->>'il', ''), il),
        status          = coalesce(nullif(v_norm->>'status', '')::text, status),
        priority        = coalesce(nullif(v_norm->>'priority', '')::text, priority),
        task_type       = coalesce(nullif(v_norm->>'task_type', '')::text, task_type),
        start_date      = coalesce((nullif(v_norm->>'start_date', ''))::date, start_date),
        due_date        = coalesce((nullif(v_norm->>'due_date', ''))::date, due_date),
        estimated_hours = coalesce((nullif(v_norm->>'estimated_hours', ''))::numeric, estimated_hours),
        assignee_id     = coalesce((nullif(v_norm->>'assignee_id', ''))::uuid, assignee_id),
        external_key    = coalesce(nullif(v_norm->>'external_key', ''), external_key),
        import_batch_id = p_batch_id
      where id = v_mevcut;

      v_guncel := v_guncel + 1;

    else
      -- EKLE
      insert into public.tasks (
        organization_id, created_by, title, description, il,
        status, priority, task_type, start_date, due_date,
        estimated_hours, assignee_id, external_key, import_fingerprint, import_batch_id
      ) values (
        v_org, v_user,
        v_norm->>'title',
        nullif(v_norm->>'description', ''),
        nullif(v_norm->>'il', ''),
        coalesce(nullif(v_norm->>'status', ''), 'backlog'),
        coalesce(nullif(v_norm->>'priority', ''), 'normal'),
        coalesce(nullif(v_norm->>'task_type', ''), 'other'),
        (nullif(v_norm->>'start_date', ''))::date,
        (nullif(v_norm->>'due_date', ''))::date,
        (nullif(v_norm->>'estimated_hours', ''))::numeric,
        (nullif(v_norm->>'assignee_id', ''))::uuid,
        nullif(v_norm->>'external_key', ''),
        v_row.eslesme_anahtari,
        p_batch_id
      )
      returning id into v_mevcut;

      update public.import_rows
         set eylem = 'eklendi', task_id = v_mevcut
       where id = v_row.id;

      v_eklendi := v_eklendi + 1;
    end if;
  end loop;

  update public.import_batches
     set durum = 'tamamlandi',
         olusturulan = v_eklendi,
         guncellenen = v_guncel,
         atlanan = v_atlandi,
         uygulandi_at = now()
   where id = p_batch_id;

  return jsonb_build_object(
    'olusturulan', v_eklendi,
    'guncellenen', v_guncel,
    'atlanan', v_atlandi
  );
end
$$;

/* ── Geri al ────────────────────────────────────────────────────────────── */

create or replace function public.import_tasks_revert(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org       uuid;
  v_uygulandi timestamptz;
  v_row       record;
  v_onceki    jsonb;
  v_silindi   int := 0;
  v_geri      int := 0;
  v_korunan   int := 0;
begin
  select organization_id, uygulandi_at into v_org, v_uygulandi
    from public.import_batches where id = p_batch_id;

  if v_org is null then raise exception 'İçe aktarma partisi bulunamadı'; end if;
  if not public.is_org_admin(v_org) then raise exception 'Bu işlem için yetkiniz yok'; end if;
  if v_uygulandi is null then raise exception 'Bu parti henüz uygulanmamış'; end if;
  if v_uygulandi < now() - interval '30 days' then
    raise exception '30 günden eski içe aktarmalar geri alınamaz';
  end if;

  for v_row in
    select r.*, t.updated_at
      from public.import_rows r
      join public.tasks t on t.id = r.task_id
     where r.batch_id = p_batch_id and r.eylem in ('eklendi', 'guncellendi')
  loop
    -- İçe aktarmadan SONRA elle düzenlenmiş görevlere dokunmuyoruz.
    -- Kullanıcının sonradan yaptığı işi geri alma adına silmek kabul edilemez.
    if v_row.updated_at > v_uygulandi then
      v_korunan := v_korunan + 1;
      continue;
    end if;

    if v_row.eylem = 'eklendi' then
      delete from public.tasks where id = v_row.task_id;
      v_silindi := v_silindi + 1;
    else
      v_onceki := v_row.onceki;
      if v_onceki is not null then
        update public.tasks set
          title           = v_onceki->>'title',
          description     = v_onceki->>'description',
          il              = v_onceki->>'il',
          status          = v_onceki->>'status',
          priority        = v_onceki->>'priority',
          task_type       = v_onceki->>'task_type',
          start_date      = (nullif(v_onceki->>'start_date', ''))::date,
          due_date        = (nullif(v_onceki->>'due_date', ''))::date,
          estimated_hours = (nullif(v_onceki->>'estimated_hours', ''))::numeric,
          assignee_id     = (nullif(v_onceki->>'assignee_id', ''))::uuid,
          external_key    = nullif(v_onceki->>'external_key', '')
        where id = v_row.task_id;
        v_geri := v_geri + 1;
      end if;
    end if;
  end loop;

  update public.import_batches
     set durum = 'geri_alindi', geri_alindi_at = now(), geri_alan = auth.uid()
   where id = p_batch_id;

  return jsonb_build_object(
    'silinen', v_silindi,
    'geri_alinan', v_geri,
    'korunan', v_korunan
  );
end
$$;

revoke all on function public.import_tasks_apply(uuid)  from public;
revoke all on function public.import_tasks_revert(uuid) from public;
grant execute on function public.import_tasks_apply(uuid)  to authenticated;
grant execute on function public.import_tasks_revert(uuid) to authenticated;
