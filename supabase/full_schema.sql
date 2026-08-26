-- ============================================================
-- DENEYAP Ops — TAM ŞEMA (tek dosyada kurulum)
-- ============================================================
-- Bu dosya migrations/ klasöründeki 49 dosyanın sırayla
-- birleştirilmiş halidir. Supabase Dashboard → SQL Editor'e
-- yapıştırıp bir kez çalıştırmak yeterlidir.
--
-- Kaynak dosyalar korunmuştur; ileride eklenecek migration'lar
-- migrations/ klasörüne yeni dosya olarak eklenir, bu dosya
-- yeniden üretilir (docs/SUPABASE_SETUP.md'e bakınız).
-- ============================================================


-- ╔══════════════════════════════════════════════════════════
-- ║ 001_initial_schema.sql
-- ╚══════════════════════════════════════════════════════════

-- ============================================
-- DENEYAP Ops - Initial Schema Migration
-- ============================================

-- Enable UUID extension
create extension if not exists "pgcrypto";

-- ============================================
-- TABLES
-- ============================================

-- Profiles table (extends auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'member')) default 'member',
  full_name text,
  created_at timestamptz not null default now()
);

-- Schedules table
create table if not exists public.schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  start_time timestamptz not null,
  end_time timestamptz not null,
  note text,
  created_at timestamptz not null default now()
);

-- Checkins table
create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('in', 'out')),
  timestamp timestamptz not null default now(),
  note text
);

-- Tasks table
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status text not null check (status in ('backlog', 'doing', 'blocked', 'done')) default 'backlog',
  assignee_id uuid references auth.users(id) on delete set null,
  due_date date,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Task outputs table
create table if not exists public.task_outputs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  kind text not null check (kind in ('link', 'note')),
  value text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ============================================
-- INDEXES
-- ============================================

create index if not exists schedules_user_id_idx on public.schedules(user_id);
create index if not exists checkins_user_id_idx on public.checkins(user_id);
create index if not exists checkins_timestamp_idx on public.checkins(timestamp desc);
create index if not exists tasks_assignee_id_idx on public.tasks(assignee_id);
create index if not exists tasks_status_idx on public.tasks(status);
create index if not exists task_outputs_task_id_idx on public.task_outputs(task_id);

-- ============================================
-- TRIGGER: Auto-create profile on signup
-- ============================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name)
  values (
    new.id,
    'member',
    coalesce(new.raw_user_meta_data->>'full_name', new.email)
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

-- Enable RLS on all tables
alter table public.profiles enable row level security;
alter table public.schedules enable row level security;
alter table public.checkins enable row level security;
alter table public.tasks enable row level security;
alter table public.task_outputs enable row level security;

-- ============================================
-- HELPER FUNCTION: Check if current user is admin
-- ============================================

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
    and role = 'admin'
  );
$$;

-- ============================================
-- RLS POLICIES: profiles
-- ============================================

-- Kullanıcı kendi profilini okuyabilir
create policy "profiles: kullanıcı kendi profilini okur"
  on public.profiles for select
  using (auth.uid() = id);

-- Admin tüm profilleri okuyabilir
create policy "profiles: admin tüm profilleri okur"
  on public.profiles for select
  using (public.is_admin());

-- Kullanıcı kendi profilini güncelleyebilir
create policy "profiles: kullanıcı kendi profilini günceller"
  on public.profiles for update
  using (auth.uid() = id);

-- Admin tüm profilleri güncelleyebilir
create policy "profiles: admin tüm profilleri günceller"
  on public.profiles for update
  using (public.is_admin());

-- ============================================
-- RLS POLICIES: schedules
-- ============================================

-- Üye kendi kayıtlarını okuyabilir
create policy "schedules: üye kendi kayıtlarını okur"
  on public.schedules for select
  using (auth.uid() = user_id);

-- Admin tüm kayıtları okuyabilir
create policy "schedules: admin tüm kayıtları okur"
  on public.schedules for select
  using (public.is_admin());

-- Üye kendi kayıtlarını ekleyebilir
create policy "schedules: üye kendi kaydını ekler"
  on public.schedules for insert
  with check (auth.uid() = user_id);

-- Üye kendi kayıtlarını güncelleyebilir
create policy "schedules: üye kendi kaydını günceller"
  on public.schedules for update
  using (auth.uid() = user_id);

-- Üye kendi kayıtlarını silebilir
create policy "schedules: üye kendi kaydını siler"
  on public.schedules for delete
  using (auth.uid() = user_id);

-- ============================================
-- RLS POLICIES: checkins
-- ============================================

-- Üye kendi checkin kayıtlarını okuyabilir
create policy "checkins: üye kendi kayıtlarını okur"
  on public.checkins for select
  using (auth.uid() = user_id);

-- Admin tüm checkin kayıtlarını okuyabilir
create policy "checkins: admin tüm kayıtları okur"
  on public.checkins for select
  using (public.is_admin());

-- Üye kendi checkin kaydını ekleyebilir
create policy "checkins: üye kendi kaydını ekler"
  on public.checkins for insert
  with check (auth.uid() = user_id);

-- ============================================
-- RLS POLICIES: tasks
-- ============================================

-- Admin tüm görevleri okuyabilir
create policy "tasks: admin tüm görevleri okur"
  on public.tasks for select
  using (public.is_admin());

-- Üye sadece kendisine atanmış görevleri okuyabilir
create policy "tasks: üye atanmış görevleri okur"
  on public.tasks for select
  using (auth.uid() = assignee_id);

-- Admin görev oluşturabilir
create policy "tasks: admin görev oluşturur"
  on public.tasks for insert
  with check (public.is_admin());

-- Admin görev güncelleyebilir
create policy "tasks: admin görev günceller"
  on public.tasks for update
  using (public.is_admin());

-- Admin görev silebilir
create policy "tasks: admin görev siler"
  on public.tasks for delete
  using (public.is_admin());

-- ============================================
-- RLS POLICIES: task_outputs
-- ============================================

-- Admin tüm çıktıları okuyabilir
create policy "task_outputs: admin tüm çıktıları okur"
  on public.task_outputs for select
  using (public.is_admin());

-- Üye sadece kendisine atanmış görevlerin çıktılarını görebilir
create policy "task_outputs: üye atanmış görev çıktılarını okur"
  on public.task_outputs for select
  using (
    exists (
      select 1 from public.tasks
      where tasks.id = task_outputs.task_id
      and tasks.assignee_id = auth.uid()
    )
  );

-- Üye sadece kendisine atanmış göreve çıktı ekleyebilir
create policy "task_outputs: üye atanmış göreve çıktı ekler"
  on public.task_outputs for insert
  with check (
    auth.uid() = created_by
    and exists (
      select 1 from public.tasks
      where tasks.id = task_outputs.task_id
      and tasks.assignee_id = auth.uid()
    )
  );

-- Admin çıktı ekleyebilir
create policy "task_outputs: admin çıktı ekler"
  on public.task_outputs for insert
  with check (public.is_admin());

-- Admin çıktı silebilir
create policy "task_outputs: admin çıktı siler"
  on public.task_outputs for delete
  using (public.is_admin());


-- ╔══════════════════════════════════════════════════════════
-- ║ 002_fix_trigger_and_backfill.sql
-- ╚══════════════════════════════════════════════════════════

-- ============================================
-- FIX: Trigger + Mevcut kullanıcıları backfill
-- ============================================
-- Bu dosyayı Supabase SQL Editor'de çalıştırın.
-- ============================================

-- 1) Eski trigger'ı ve fonksiyonu tamamen sıfırla
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

-- 2) Fonksiyonu yeniden oluştur (daha sağlam versiyon)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  -- Eğer zaten varsa insert etme (idempotent)
  insert into public.profiles (id, role, full_name)
  values (
    new.id,
    'member',
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- 3) Trigger'ı yeniden oluştur
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4) Mevcut auth.users içinde profiles tablosunda kaydı olmayan
--    kullanıcıları backfill et
insert into public.profiles (id, role, full_name)
select
  u.id,
  'member',
  coalesce(
    u.raw_user_meta_data->>'full_name',
    u.raw_user_meta_data->>'name',
    split_part(u.email, '@', 1)
  )
from auth.users u
where not exists (
  select 1 from public.profiles p where p.id = u.id
)
on conflict (id) do nothing;

-- 5) Kontrol: Kaç kullanıcı var vs kaç profil var
select
  (select count(*) from auth.users) as auth_users_count,
  (select count(*) from public.profiles) as profiles_count;


-- ╔══════════════════════════════════════════════════════════
-- ║ 003_fix_profiles_insert_policy.sql
-- ╚══════════════════════════════════════════════════════════

-- ============================================
-- FIX: profiles tablosuna INSERT policy ekle
-- Kullanıcı kendi profilini oluşturabilmeli
-- ============================================

-- Önce varsa eski insert policy'yi kaldır
drop policy if exists "profiles: kullanıcı kendi profilini oluşturur" on public.profiles;

-- Yeni policy: kullanıcı sadece kendi id'siyle insert yapabilir
create policy "profiles: kullanıcı kendi profilini oluşturur"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Admin de insert yapabilsin (opsiyonel ama iyi pratik)
drop policy if exists "profiles: admin profil oluşturur" on public.profiles;
create policy "profiles: admin profil oluşturur"
  on public.profiles for insert
  with check (public.is_admin());


-- ╔══════════════════════════════════════════════════════════
-- ║ 004_add_full_name_and_fix_all.sql
-- ╚══════════════════════════════════════════════════════════

-- ============================================
-- FIX: full_name kolonu ekle + trigger + backfill
-- ============================================
-- Supabase SQL Editor'de çalıştırın.
-- ============================================

-- 1) full_name kolonu yoksa ekle
alter table public.profiles
  add column if not exists full_name text;

-- 2) Eski trigger ve fonksiyonu temizle
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

-- 3) Yeni fonksiyonu oluştur
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.profiles (id, role, full_name)
  values (
    new.id,
    'member',
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 4) Trigger'ı yeniden kur
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 5) Mevcut kullanıcıları backfill et
insert into public.profiles (id, role, full_name)
select
  u.id,
  'member',
  coalesce(
    u.raw_user_meta_data->>'full_name',
    u.raw_user_meta_data->>'name',
    split_part(u.email, '@', 1)
  )
from auth.users u
where not exists (
  select 1 from public.profiles p where p.id = u.id
)
on conflict (id) do nothing;

-- 6) profiles INSERT policy ekle (eğer yoksa)
drop policy if exists "profiles: kullanıcı kendi profilini oluşturur" on public.profiles;
create policy "profiles: kullanıcı kendi profilini oluşturur"
  on public.profiles for insert
  with check (auth.uid() = id);

-- 7) Kontrol sorgusu
select
  (select count(*) from auth.users) as auth_users_count,
  (select count(*) from public.profiles) as profiles_count;


-- ╔══════════════════════════════════════════════════════════
-- ║ 005_full_reset_and_setup.sql
-- ╚══════════════════════════════════════════════════════════

-- ============================================
-- FULL RESET & SETUP — DENEYAP Ops
-- Her şeyi sıfırdan doğru sırayla kurar.
-- Supabase SQL Editor'de çalıştırın.
-- ============================================

-- ============================================
-- 1) POLİCY'LERİ TEMİZLE
-- ============================================
drop policy if exists "profiles: kullanıcı kendi profilini okur" on public.profiles;
drop policy if exists "profiles: admin tüm profilleri okur" on public.profiles;
drop policy if exists "profiles: kullanıcı kendi profilini günceller" on public.profiles;
drop policy if exists "profiles: admin tüm profilleri günceller" on public.profiles;
drop policy if exists "profiles: kullanıcı kendi profilini oluşturur" on public.profiles;
drop policy if exists "profiles: admin profil oluşturur" on public.profiles;

drop policy if exists "schedules: üye kendi kayıtlarını okur" on public.schedules;
drop policy if exists "schedules: admin tüm kayıtları okur" on public.schedules;
drop policy if exists "schedules: üye kendi kaydını ekler" on public.schedules;
drop policy if exists "schedules: üye kendi kaydını günceller" on public.schedules;
drop policy if exists "schedules: üye kendi kaydını siler" on public.schedules;

drop policy if exists "checkins: üye kendi kayıtlarını okur" on public.checkins;
drop policy if exists "checkins: admin tüm kayıtları okur" on public.checkins;
drop policy if exists "checkins: üye kendi kaydını ekler" on public.checkins;

drop policy if exists "tasks: admin tüm görevleri okur" on public.tasks;
drop policy if exists "tasks: üye atanmış görevleri okur" on public.tasks;
drop policy if exists "tasks: admin görev oluşturur" on public.tasks;
drop policy if exists "tasks: admin görev günceller" on public.tasks;
drop policy if exists "tasks: admin görev siler" on public.tasks;

drop policy if exists "task_outputs: admin tüm çıktıları okur" on public.task_outputs;
drop policy if exists "task_outputs: üye atanmış görev çıktılarını okur" on public.task_outputs;
drop policy if exists "task_outputs: üye atanmış göreve çıktı ekler" on public.task_outputs;
drop policy if exists "task_outputs: admin çıktı ekler" on public.task_outputs;
drop policy if exists "task_outputs: admin çıktı siler" on public.task_outputs;

-- ============================================
-- 2) TRİGGER'I TEMİZLE
-- ============================================
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop function if exists public.is_admin();

-- ============================================
-- 3) TABLOLARI OLUŞTUR (varsa atla)
-- ============================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'member')) default 'member',
  full_name text,
  created_at timestamptz not null default now()
);

-- full_name kolonu yoksa ekle (eski kurulumlar için)
alter table public.profiles add column if not exists full_name text;

create table if not exists public.schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  start_time timestamptz not null,
  end_time timestamptz not null,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('in', 'out')),
  timestamp timestamptz not null default now(),
  note text
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status text not null check (status in ('backlog', 'doing', 'blocked', 'done')) default 'backlog',
  assignee_id uuid references auth.users(id) on delete set null,
  due_date date,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.task_outputs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  kind text not null check (kind in ('link', 'note')),
  value text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ============================================
-- 4) RLS'İ AKTİF ET
-- ============================================
alter table public.profiles enable row level security;
alter table public.schedules enable row level security;
alter table public.checkins enable row level security;
alter table public.tasks enable row level security;
alter table public.task_outputs enable row level security;

-- ============================================
-- 5) is_admin() FONKS İYONUNU OLUŞTUR
-- (Policy'lerden ÖNCE olması şart!)
-- ============================================
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
    and role = 'admin'
  );
$$;

-- ============================================
-- 6) TRİGGER FONKS İYONUNU OLUŞTUR
-- ============================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.profiles (id, role, full_name)
  values (
    new.id,
    'member',
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================
-- 7) POLİCY'LERİ OLUŞTUR
-- ============================================

-- profiles
create policy "profiles: kullanıcı kendi profilini okur"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles: admin tüm profilleri okur"
  on public.profiles for select
  using (public.is_admin());

create policy "profiles: kullanıcı kendi profilini oluşturur"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles: kullanıcı kendi profilini günceller"
  on public.profiles for update
  using (auth.uid() = id);

create policy "profiles: admin tüm profilleri günceller"
  on public.profiles for update
  using (public.is_admin());

-- schedules
create policy "schedules: üye kendi kayıtlarını okur"
  on public.schedules for select
  using (auth.uid() = user_id);

create policy "schedules: admin tüm kayıtları okur"
  on public.schedules for select
  using (public.is_admin());

create policy "schedules: üye kendi kaydını ekler"
  on public.schedules for insert
  with check (auth.uid() = user_id);

create policy "schedules: üye kendi kaydını günceller"
  on public.schedules for update
  using (auth.uid() = user_id);

create policy "schedules: üye kendi kaydını siler"
  on public.schedules for delete
  using (auth.uid() = user_id);

-- checkins
create policy "checkins: üye kendi kayıtlarını okur"
  on public.checkins for select
  using (auth.uid() = user_id);

create policy "checkins: admin tüm kayıtları okur"
  on public.checkins for select
  using (public.is_admin());

create policy "checkins: üye kendi kaydını ekler"
  on public.checkins for insert
  with check (auth.uid() = user_id);

-- tasks
create policy "tasks: admin tüm görevleri okur"
  on public.tasks for select
  using (public.is_admin());

create policy "tasks: üye atanmış görevleri okur"
  on public.tasks for select
  using (auth.uid() = assignee_id);

create policy "tasks: admin görev oluşturur"
  on public.tasks for insert
  with check (public.is_admin());

create policy "tasks: admin görev günceller"
  on public.tasks for update
  using (public.is_admin());

create policy "tasks: admin görev siler"
  on public.tasks for delete
  using (public.is_admin());

-- task_outputs
create policy "task_outputs: admin tüm çıktıları okur"
  on public.task_outputs for select
  using (public.is_admin());

create policy "task_outputs: üye atanmış görev çıktılarını okur"
  on public.task_outputs for select
  using (
    exists (
      select 1 from public.tasks
      where tasks.id = task_outputs.task_id
      and tasks.assignee_id = auth.uid()
    )
  );

create policy "task_outputs: üye atanmış göreve çıktı ekler"
  on public.task_outputs for insert
  with check (
    auth.uid() = created_by
    and exists (
      select 1 from public.tasks
      where tasks.id = task_outputs.task_id
      and tasks.assignee_id = auth.uid()
    )
  );

create policy "task_outputs: admin çıktı ekler"
  on public.task_outputs for insert
  with check (public.is_admin());

create policy "task_outputs: admin çıktı siler"
  on public.task_outputs for delete
  using (public.is_admin());

-- ============================================
-- 8) MEV CUT KULLANICILARI BACKFILL ET
-- ============================================
insert into public.profiles (id, role, full_name)
select
  u.id,
  'member',
  coalesce(
    u.raw_user_meta_data->>'full_name',
    u.raw_user_meta_data->>'name',
    split_part(u.email, '@', 1)
  )
from auth.users u
where not exists (
  select 1 from public.profiles p where p.id = u.id
)
on conflict (id) do nothing;

-- ============================================
-- 9) KONTROL
-- ============================================
select
  (select count(*) from auth.users)   as auth_users_count,
  (select count(*) from public.profiles) as profiles_count;


-- ╔══════════════════════════════════════════════════════════
-- ║ 006_clean_install.sql
-- ╚══════════════════════════════════════════════════════════

-- ============================================
-- DENEYAP Ops — TEMİZ KURULUM
-- ============================================
-- NOT (DENEYAP uyarlaması): Bu dosya orijinalinde "önce drop_all çalıştır"
-- notuyla, Supabase SQL Editor'de elle çalıştırılmak üzere yazılmıştı ve
-- 001-005'in oluşturduğu tabloların düşürülmüş olmasını varsayıyordu.
-- `supabase db push` ile sıralı çalıştırıldığında "relation already exists"
-- hatası vermemesi için beklediği temizliği artık kendisi yapıyor.
-- Bu dosya şemanın gerçek başlangıç noktasıdır; 007+ bunun üzerine kurulur.
-- ============================================

create extension if not exists "pgcrypto";

drop trigger if exists on_auth_user_created on auth.users;
drop table if exists public.task_outputs cascade;
drop table if exists public.tasks        cascade;
drop table if exists public.checkins     cascade;
drop table if exists public.schedules    cascade;
drop table if exists public.profiles     cascade;

-- 1) TABLOLAR
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'member')) default 'member',
  full_name text,
  created_at timestamptz not null default now()
);

create table public.schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  start_time timestamptz not null,
  end_time timestamptz not null,
  note text,
  created_at timestamptz not null default now()
);

create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('in', 'out')),
  timestamp timestamptz not null default now(),
  note text
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status text not null check (status in ('backlog', 'doing', 'blocked', 'done')) default 'backlog',
  assignee_id uuid references auth.users(id) on delete set null,
  due_date date,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.task_outputs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  kind text not null check (kind in ('link', 'note')),
  value text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- 2) RLS AKTİF ET
alter table public.profiles enable row level security;
alter table public.schedules enable row level security;
alter table public.checkins enable row level security;
alter table public.tasks enable row level security;
alter table public.task_outputs enable row level security;

-- 3) is_admin() FONKSİYONU (policy'lerden ÖNCE!)
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
    and role = 'admin'
  );
$$;

-- 4) TRIGGER
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name)
  values (
    new.id,
    'member',
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 5) POLİCYLER — profiles
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_select_admin"
  on public.profiles for select
  using (public.is_admin());

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);

create policy "profiles_update_admin"
  on public.profiles for update
  using (public.is_admin());

-- 5) POLİCYLER — schedules
create policy "schedules_select_own"
  on public.schedules for select
  using (auth.uid() = user_id);

create policy "schedules_select_admin"
  on public.schedules for select
  using (public.is_admin());

create policy "schedules_insert_own"
  on public.schedules for insert
  with check (auth.uid() = user_id);

create policy "schedules_update_own"
  on public.schedules for update
  using (auth.uid() = user_id);

create policy "schedules_delete_own"
  on public.schedules for delete
  using (auth.uid() = user_id);

-- 5) POLİCYLER — checkins
create policy "checkins_select_own"
  on public.checkins for select
  using (auth.uid() = user_id);

create policy "checkins_select_admin"
  on public.checkins for select
  using (public.is_admin());

create policy "checkins_insert_own"
  on public.checkins for insert
  with check (auth.uid() = user_id);

-- 5) POLİCYLER — tasks
create policy "tasks_select_admin"
  on public.tasks for select
  using (public.is_admin());

create policy "tasks_select_assignee"
  on public.tasks for select
  using (auth.uid() = assignee_id);

create policy "tasks_insert_admin"
  on public.tasks for insert
  with check (public.is_admin());

create policy "tasks_update_admin"
  on public.tasks for update
  using (public.is_admin());

create policy "tasks_delete_admin"
  on public.tasks for delete
  using (public.is_admin());

-- 5) POLİCYLER — task_outputs
create policy "outputs_select_admin"
  on public.task_outputs for select
  using (public.is_admin());

create policy "outputs_select_assignee"
  on public.task_outputs for select
  using (
    exists (
      select 1 from public.tasks
      where tasks.id = task_outputs.task_id
      and tasks.assignee_id = auth.uid()
    )
  );

create policy "outputs_insert_assignee"
  on public.task_outputs for insert
  with check (
    auth.uid() = created_by
    and exists (
      select 1 from public.tasks
      where tasks.id = task_outputs.task_id
      and tasks.assignee_id = auth.uid()
    )
  );

create policy "outputs_insert_admin"
  on public.task_outputs for insert
  with check (public.is_admin());

create policy "outputs_delete_admin"
  on public.task_outputs for delete
  using (public.is_admin());

-- 6) MEVCUT KULLANICILARI BACKFILL ET
insert into public.profiles (id, role, full_name)
select
  u.id,
  'member',
  coalesce(
    u.raw_user_meta_data->>'full_name',
    u.raw_user_meta_data->>'name',
    split_part(u.email, '@', 1)
  )
from auth.users u
on conflict (id) do nothing;

-- 7) KONTROL
select
  (select count(*) from auth.users) as auth_users,
  (select count(*) from public.profiles) as profiles;


-- ╔══════════════════════════════════════════════════════════
-- ║ 007_task_enhancements.sql
-- ╚══════════════════════════════════════════════════════════

-- Migration 007: Task enhancements
-- Adds priority, task_type, estimated_hours, actual_hours to tasks table

alter table public.tasks
  add column if not exists priority text not null default 'normal'
    check (priority in ('critical', 'high', 'normal', 'low')),
  add column if not exists task_type text not null default 'other'
    check (task_type in ('mechanical', 'electrical', 'software', 'research', 'documentation', 'test', 'other')),
  add column if not exists estimated_hours numeric(5,1) default null,
  add column if not exists actual_hours numeric(5,1) default null;

-- Add comments for clarity
comment on column public.tasks.priority is 'critical | high | normal | low';
comment on column public.tasks.task_type is 'mechanical | electrical | software | research | documentation | test | other';
comment on column public.tasks.estimated_hours is 'Estimated time in hours';
comment on column public.tasks.actual_hours is 'Actual time spent in hours (manually entered)';


-- ╔══════════════════════════════════════════════════════════
-- ║ 008_task_dependencies.sql
-- ╚══════════════════════════════════════════════════════════

-- Migration 008: Task dependencies
-- A task can depend on one or more other tasks (must be done first)

create table if not exists public.task_dependencies (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  depends_on  uuid not null references public.tasks(id) on delete cascade,
  created_at  timestamptz not null default now(),
  constraint no_self_dependency check (task_id <> depends_on),
  constraint unique_dependency unique (task_id, depends_on)
);

alter table public.task_dependencies enable row level security;

-- Admins can manage all dependencies
create policy "Admins manage dependencies"
  on public.task_dependencies for all
  using (public.is_admin())
  with check (public.is_admin());

-- Members can read dependencies for tasks assigned to them
create policy "Members read their task dependencies"
  on public.task_dependencies for select
  using (
    exists (
      select 1 from public.tasks t
      where t.id = task_dependencies.task_id
        and t.assignee_id = auth.uid()
    )
  );


-- ╔══════════════════════════════════════════════════════════
-- ║ 009_drive_tokens.sql
-- ╚══════════════════════════════════════════════════════════

-- Migration 009: Store Google Drive OAuth tokens per user
create table if not exists public.drive_tokens (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade unique,
  access_token  text not null,
  refresh_token text not null,
  expiry        timestamptz not null,
  folder_id     text,          -- "DENEYAP Ops" klasörünün Drive ID'si
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.drive_tokens enable row level security;

-- Users can only read/write their own tokens
create policy "Users manage own drive tokens"
  on public.drive_tokens for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- task_files tablosu: hangi göreve hangi Drive dosyası bağlı
create table if not exists public.task_files (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references public.tasks(id) on delete cascade,
  uploaded_by  uuid not null references auth.users(id),
  drive_file_id   text not null,
  file_name    text not null,
  file_size    bigint,
  mime_type    text,
  drive_url    text not null,
  created_at   timestamptz not null default now()
);

alter table public.task_files enable row level security;

create policy "Admins manage all task files"
  on public.task_files for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "Members read files of their tasks"
  on public.task_files for select
  using (
    exists (
      select 1 from public.tasks t
      where t.id = task_files.task_id
        and t.assignee_id = auth.uid()
    )
  );

create policy "Members insert files to their tasks"
  on public.task_files for insert
  with check (
    auth.uid() = uploaded_by
    and exists (
      select 1 from public.tasks t
      where t.id = task_files.task_id
        and t.assignee_id = auth.uid()
    )
  );


-- ╔══════════════════════════════════════════════════════════
-- ║ 010_drive_tokens_fix.sql
-- ╚══════════════════════════════════════════════════════════

-- Migration 010: Fix drive_tokens - refresh_token can be null (some Google flows don't return it)
alter table public.drive_tokens
  alter column refresh_token drop not null;

-- Also allow null values going forward
alter table public.drive_tokens
  alter column refresh_token set default null;


-- ╔══════════════════════════════════════════════════════════
-- ║ 011_sprints.sql
-- ╚══════════════════════════════════════════════════════════

-- Migration 011: Sprint tablosu ve tasks tablosuna sprint_id kolonu

create table if not exists public.sprints (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  start_date  date not null,
  end_date    date not null,
  is_active   boolean not null default false,
  created_by  uuid not null references auth.users(id),
  created_at  timestamptz not null default now()
);

alter table public.sprints enable row level security;

create policy "Admins manage sprints"
  on public.sprints for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "Members read sprints"
  on public.sprints for select
  using (auth.uid() is not null);

-- tasks tablosuna sprint_id ekle
alter table public.tasks
  add column if not exists sprint_id uuid references public.sprints(id) on delete set null;

-- Sadece bir sprint aktif olabilsin (trigger)
create or replace function public.ensure_single_active_sprint()
returns trigger language plpgsql as $$
begin
  if NEW.is_active = true then
    update public.sprints set is_active = false where id != NEW.id;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_single_active_sprint on public.sprints;
create trigger trg_single_active_sprint
  before insert or update on public.sprints
  for each row execute function public.ensure_single_active_sprint();


-- ╔══════════════════════════════════════════════════════════
-- ║ 012_add_testing_status.sql
-- ╚══════════════════════════════════════════════════════════

-- tasks.status alanina 'testing' degerini ekle
-- Mevcut check constraint'i kaldirip yenisini ekle
alter table public.tasks
  drop constraint if exists tasks_status_check;

alter table public.tasks
  add constraint tasks_status_check
  check (status in ('backlog', 'doing', 'testing', 'blocked', 'done'));


-- ╔══════════════════════════════════════════════════════════
-- ║ 013_consultant_module.sql
-- ╚══════════════════════════════════════════════════════════

-- ============================================
-- DENEYAP Ops — Danışman Modülü
-- UI Danışmanlık: rol + tablolar + RLS
-- ============================================

-- 1) profiles tablosundaki role kısıtlamasını güncelle
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin', 'member', 'consultant'));

-- 2) is_consultant() yardımcı fonksiyonu
create or replace function public.is_consultant()
returns boolean language sql security definer
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'consultant'
  );
$$;

-- 3) UI SORULAR tablosu
create table public.ui_questions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  category text not null check (category in ('UI', 'UX', 'Bug', 'İstek', 'Tasarım', 'Diğer')) default 'Diğer',
  priority text not null check (priority in ('critical', 'high', 'normal', 'low')) default 'normal',
  status text not null check (status in ('open', 'closed')) default 'open',
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4) UI SORU MESAJLARI (thread)
create table public.ui_question_messages (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.ui_questions(id) on delete cascade,
  content text not null,
  attachment_url text,
  attachment_name text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- 5) UI GÜNCELLEMELERİ (feed)
create table public.ui_updates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text,
  detail text,
  tag text not null check (tag in ('UI', 'UX', 'Bugfix', 'Release')) default 'UI',
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- 6) UI GÜNCELLEME EKLERİ
create table public.ui_update_attachments (
  id uuid primary key default gen_random_uuid(),
  update_id uuid not null references public.ui_updates(id) on delete cascade,
  file_url text not null,
  file_name text not null,
  file_type text,
  created_at timestamptz not null default now()
);

-- 7) UI GÜNCELLEME YORUMLARI
create table public.ui_update_comments (
  id uuid primary key default gen_random_uuid(),
  update_id uuid not null references public.ui_updates(id) on delete cascade,
  content text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- 8) UI DOSYALAR
create table public.ui_files (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  file_url text not null,
  file_type text not null check (file_type in ('image', 'pdf', 'video', 'link', 'doc', 'other')) default 'other',
  tag text,
  size_bytes bigint,
  figma_url text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- 9) UI DOSYA YORUMLARI
create table public.ui_file_comments (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.ui_files(id) on delete cascade,
  content text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- 10) RLS ETKİNLEŞTİR
alter table public.ui_questions enable row level security;
alter table public.ui_question_messages enable row level security;
alter table public.ui_updates enable row level security;
alter table public.ui_update_attachments enable row level security;
alter table public.ui_update_comments enable row level security;
alter table public.ui_files enable row level security;
alter table public.ui_file_comments enable row level security;

-- 11) RLS POLİCY: ui_questions
-- Admin: tüm CRUD
create policy "ui_questions_admin_all" on public.ui_questions
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Consultant: okuma
create policy "ui_questions_consultant_read" on public.ui_questions
  for select to authenticated
  using (public.is_consultant());

-- 12) RLS POLİCY: ui_question_messages
-- Admin: tüm CRUD
create policy "ui_qmsg_admin_all" on public.ui_question_messages
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Consultant: okuma + kendi mesajını ekleme
create policy "ui_qmsg_consultant_read" on public.ui_question_messages
  for select to authenticated
  using (public.is_consultant());

create policy "ui_qmsg_consultant_insert" on public.ui_question_messages
  for insert to authenticated
  with check (public.is_consultant() and created_by = auth.uid());

-- 13) RLS POLİCY: ui_updates
-- Admin: tüm CRUD
create policy "ui_updates_admin_all" on public.ui_updates
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Consultant: okuma
create policy "ui_updates_consultant_read" on public.ui_updates
  for select to authenticated
  using (public.is_consultant());

-- 14) RLS POLİCY: ui_update_attachments
-- Admin: tüm CRUD
create policy "ui_upd_att_admin_all" on public.ui_update_attachments
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Consultant: okuma
create policy "ui_upd_att_consultant_read" on public.ui_update_attachments
  for select to authenticated
  using (public.is_consultant());

-- 15) RLS POLİCY: ui_update_comments
-- Admin: tüm CRUD
create policy "ui_upd_cmt_admin_all" on public.ui_update_comments
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Consultant: okuma + ekleme + kendi yorumunu güncelleme/silme
create policy "ui_upd_cmt_consultant_read" on public.ui_update_comments
  for select to authenticated
  using (public.is_consultant());

create policy "ui_upd_cmt_consultant_insert" on public.ui_update_comments
  for insert to authenticated
  with check (public.is_consultant() and created_by = auth.uid());

create policy "ui_upd_cmt_consultant_update" on public.ui_update_comments
  for update to authenticated
  using (public.is_consultant() and created_by = auth.uid());

-- 16) RLS POLİCY: ui_files
-- Admin: tüm CRUD
create policy "ui_files_admin_all" on public.ui_files
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Consultant: okuma
create policy "ui_files_consultant_read" on public.ui_files
  for select to authenticated
  using (public.is_consultant());

-- 17) RLS POLİCY: ui_file_comments
-- Admin: tüm CRUD
create policy "ui_fcmt_admin_all" on public.ui_file_comments
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Consultant: okuma + ekleme + kendi yorumunu güncelleme
create policy "ui_fcmt_consultant_read" on public.ui_file_comments
  for select to authenticated
  using (public.is_consultant());

create policy "ui_fcmt_consultant_insert" on public.ui_file_comments
  for insert to authenticated
  with check (public.is_consultant() and created_by = auth.uid());

create policy "ui_fcmt_consultant_update" on public.ui_file_comments
  for update to authenticated
  using (public.is_consultant() and created_by = auth.uid());

-- 18) updated_at trigger ui_questions için
create or replace function public.update_ui_question_timestamp()
returns trigger language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger ui_questions_updated_at
  before update on public.ui_questions
  for each row execute function public.update_ui_question_timestamp();

-- 19) Supabase Storage bucket: ui-consultant (politika SQL yerine UI'dan ayarlanmalı)
-- Not: Supabase Dashboard > Storage'da 'ui-consultant' bucket'ını oluşturun,
--      private yapın ve aşağıdaki politikaları ekleyin:
--      Admin: full access, Consultant: read + download


-- ╔══════════════════════════════════════════════════════════
-- ║ 014_consultant_can_post.sql
-- ╚══════════════════════════════════════════════════════════

-- ============================================
-- DENEYAP Ops — Danışman Yazma Yetkileri
-- Danışmanlar soru açabilir ve dosya yükleyebilir
-- ============================================

-- 1) Danışman: ui_questions INSERT
create policy "ui_questions_consultant_insert" on public.ui_questions
  for insert to authenticated
  with check (public.is_consultant() and created_by = auth.uid());

-- 2) Danışman: ui_files INSERT
create policy "ui_files_consultant_insert" on public.ui_files
  for insert to authenticated
  with check (public.is_consultant() and created_by = auth.uid());


-- ╔══════════════════════════════════════════════════════════
-- ║ 015_image_annotation.sql
-- ╚══════════════════════════════════════════════════════════

-- ============================================
-- DENEYAP Ops — Görsel Annotasyon Sistemi
-- Danışman ve admin görsel üzerine pin bırakabilir
-- NOT: Supabase Storage bucket gereklidir:
--   Dashboard → Storage → New bucket → Name: "ui-annotations", Public: true
-- ============================================

-- 1) Görsel tablosu
create table if not exists public.ui_annotation_images (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  image_url   text not null,
  description text,
  created_by  uuid references auth.users not null,
  created_at  timestamptz default now() not null
);

alter table public.ui_annotation_images enable row level security;

-- Admin: tam erişim
create policy "ann_images_admin_all" on public.ui_annotation_images
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Danışman: okuma
create policy "ann_images_consultant_select" on public.ui_annotation_images
  for select to authenticated
  using (public.is_consultant());

-- Danışman: kendi görseli ekleyebilir
create policy "ann_images_consultant_insert" on public.ui_annotation_images
  for insert to authenticated
  with check (public.is_consultant() and created_by = auth.uid());

-- Danışman: kendi görselini silebilir
create policy "ann_images_consultant_delete_own" on public.ui_annotation_images
  for delete to authenticated
  using (public.is_consultant() and created_by = auth.uid());

-- 2) Pin tablosu
create table if not exists public.ui_annotation_pins (
  id         uuid primary key default gen_random_uuid(),
  image_id   uuid references public.ui_annotation_images on delete cascade not null,
  x_pct      numeric(5,2) not null check (x_pct >= 0 and x_pct <= 100),
  y_pct      numeric(5,2) not null check (y_pct >= 0 and y_pct <= 100),
  label      text,
  status     text not null default 'open' check (status in ('open', 'resolved')),
  created_by uuid references auth.users not null,
  created_at timestamptz default now() not null
);

alter table public.ui_annotation_pins enable row level security;

-- Admin: tam erişim
create policy "ann_pins_admin_all" on public.ui_annotation_pins
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Danışman: okuma
create policy "ann_pins_consultant_select" on public.ui_annotation_pins
  for select to authenticated
  using (public.is_consultant());

-- Danışman: kendi pinini ekleyebilir
create policy "ann_pins_consultant_insert" on public.ui_annotation_pins
  for insert to authenticated
  with check (public.is_consultant() and created_by = auth.uid());

-- Danışman: kendi pinini silebilir
create policy "ann_pins_consultant_delete_own" on public.ui_annotation_pins
  for delete to authenticated
  using (public.is_consultant() and created_by = auth.uid());

-- 3) Pin yorumları (thread)
create table if not exists public.ui_annotation_pin_replies (
  id         uuid primary key default gen_random_uuid(),
  pin_id     uuid references public.ui_annotation_pins on delete cascade not null,
  content    text not null,
  created_by uuid references auth.users not null,
  created_at timestamptz default now() not null
);

alter table public.ui_annotation_pin_replies enable row level security;

-- Admin: tam erişim
create policy "ann_replies_admin_all" on public.ui_annotation_pin_replies
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Danışman: okuma
create policy "ann_replies_consultant_select" on public.ui_annotation_pin_replies
  for select to authenticated
  using (public.is_consultant());

-- Danışman: kendi yorumunu ekleyebilir
create policy "ann_replies_consultant_insert" on public.ui_annotation_pin_replies
  for insert to authenticated
  with check (public.is_consultant() and created_by = auth.uid());

-- Danışman: kendi yorumunu silebilir
create policy "ann_replies_consultant_delete_own" on public.ui_annotation_pin_replies
  for delete to authenticated
  using (public.is_consultant() and created_by = auth.uid());


-- ╔══════════════════════════════════════════════════════════
-- ║ 016_storage_buckets.sql
-- ╚══════════════════════════════════════════════════════════

-- ============================================
-- DENEYAP Ops — Supabase Storage Bucket Tanımları
-- ui-files   : Dosyalar, mesaj ekleri, güncelleme ekleri
-- ui-annotations : Görsel annotasyon görselleri
-- ============================================

-- Bucket oluşturma (mevcut ise atla)
insert into storage.buckets (id, name, public, file_size_limit)
values
  ('ui-files',       'ui-files',       true, 52428800),  -- 50 MB
  ('ui-annotations', 'ui-annotations', true, 52428800)   -- 50 MB
on conflict (id) do nothing;

-- ── ui-files bucket politikaları ─────────────────────────────────────────────

-- Herkes okuyabilir (dosyalar public URL ile paylaşılır)
create policy "ui_files_storage_public_read"
  on storage.objects for select
  using (bucket_id = 'ui-files');

-- Admin ve danışman yükleyebilir
create policy "ui_files_storage_upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'ui-files'
    and (public.is_admin() or public.is_consultant())
  );

-- Admin ve kendi dosyasını silen danışman
create policy "ui_files_storage_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'ui-files'
    and (
      public.is_admin()
      or (public.is_consultant() and auth.uid()::text = (storage.foldername(name))[1])
    )
  );

-- ── ui-annotations bucket politikaları ───────────────────────────────────────

create policy "ui_ann_storage_public_read"
  on storage.objects for select
  using (bucket_id = 'ui-annotations');

create policy "ui_ann_storage_upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'ui-annotations'
    and (public.is_admin() or public.is_consultant())
  );

create policy "ui_ann_storage_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'ui-annotations'
    and (
      public.is_admin()
      or (public.is_consultant() and auth.uid()::text = (storage.foldername(name))[1])
    )
  );


-- ╔══════════════════════════════════════════════════════════
-- ║ 017_notifications.sql
-- ╚══════════════════════════════════════════════════════════

-- ── 017: Bildirim Merkezi (Notification Center) ──────────────────────────────

create table if not exists public.notifications (
  id            uuid        default gen_random_uuid() primary key,
  user_id       uuid        references auth.users(id) on delete cascade not null,
  type          text        not null,
  event_type    text        not null,
  title         text        not null,
  description   text,
  actor_id      uuid        references auth.users(id) on delete set null,
  actor_name    text,
  link          text,
  is_read       boolean     default false not null,
  created_at    timestamptz default now() not null,

  constraint notifications_type_check check (
    type in ('task', 'review', 'sprint', 'system')
  ),
  constraint notifications_event_type_check check (
    event_type in (
      'task_assigned',
      'task_status_changed',
      'task_overdue',
      'review_reply',
      'mention',
      'annotation_resolved',
      'new_version',
      'sprint_changed'
    )
  )
);

-- Row Level Security
alter table public.notifications enable row level security;

create policy "notif_select"
  on public.notifications for select
  using (auth.uid() = user_id);

create policy "notif_insert"
  on public.notifications for insert
  with check (auth.uid() is not null);

create policy "notif_update"
  on public.notifications for update
  using (auth.uid() = user_id);

create policy "notif_delete"
  on public.notifications for delete
  using (auth.uid() = user_id);

-- Indexes
create index if not exists notifications_user_created_idx
  on public.notifications(user_id, created_at desc);

create index if not exists notifications_unread_idx
  on public.notifications(user_id, is_read)
  where not is_read;

-- Enable Supabase Realtime for live push
alter publication supabase_realtime add table public.notifications;


-- ╔══════════════════════════════════════════════════════════
-- ║ 018_email_preferences.sql
-- ╚══════════════════════════════════════════════════════════

-- ── 018: E-posta Bildirim Tercihleri ──────────────────────────────────────────

-- profiles tablosuna email kolonu ekle (send-email route'un kullanıcı emailine ihtiyacı var)
alter table public.profiles
  add column if not exists email text;

-- ── email_preferences ────────────────────────────────────────────────────────

create table if not exists public.email_preferences (
  id                   uuid        default gen_random_uuid() primary key,
  user_id              uuid        references auth.users(id) on delete cascade not null unique,

  -- Master toggle
  email_enabled        boolean     default false not null,

  -- Event toggles
  task_assigned        boolean     default true  not null,
  mention              boolean     default true  not null,
  review_reply         boolean     default true  not null,
  annotation_resolved  boolean     default true  not null,
  sprint_changed       boolean     default true  not null,
  new_version          boolean     default false not null,

  -- Frequency: instant | daily | weekly
  frequency            text        default 'instant' not null,

  created_at           timestamptz default now() not null,
  updated_at           timestamptz default now() not null,

  constraint email_preferences_frequency_check
    check (frequency in ('instant', 'daily', 'weekly'))
);

alter table public.email_preferences enable row level security;

create policy "email_pref_select"
  on public.email_preferences for select
  using (auth.uid() = user_id);

create policy "email_pref_insert"
  on public.email_preferences for insert
  with check (auth.uid() = user_id);

create policy "email_pref_update"
  on public.email_preferences for update
  using (auth.uid() = user_id);

-- ── email_log (cooldown + gönderim kaydı) ────────────────────────────────────

create table if not exists public.email_log (
  id           uuid        default gen_random_uuid() primary key,
  user_id      uuid        references auth.users(id) on delete cascade not null,
  event_type   text        not null,
  entity_key   text,                      -- örn: "task:uuid" ya da "digest"
  sent_at      timestamptz default now()  not null
);

alter table public.email_log enable row level security;

-- Sadece service role okuyabilir / insert edebilir (API route service role kullanır)
create policy "email_log_insert"
  on public.email_log for insert
  with check (true);

create policy "email_log_select"
  on public.email_log for select
  using (auth.uid() = user_id);

create index if not exists email_log_cooldown_idx
  on public.email_log(user_id, event_type, entity_key, sent_at desc);


-- ╔══════════════════════════════════════════════════════════
-- ║ 019_profile_enhancements.sql
-- ╚══════════════════════════════════════════════════════════

-- ============================================
-- DENEYAP Ops — Profil Geliştirmeleri (019)
-- profiles tablosuna yeni alanlar
-- brand_settings tablosu (admin)
-- avatars storage bucket
-- email_preferences'a danışman bildirimleri
-- ============================================

-- ── profiles tablosuna yeni kolonlar ──────────────────────────────────────────

alter table public.profiles
  add column if not exists username           text unique,
  add column if not exists title              text,
  add column if not exists bio                text,
  add column if not exists skills             text[] default '{}',
  add column if not exists avatar_url         text,
  add column if not exists consultant_expertise     text,
  add column if not exists consultant_availability  text,
  add column if not exists consultant_contact_pref  text[] default '{}';

-- username için index
create unique index if not exists profiles_username_idx
  on public.profiles (lower(username))
  where username is not null;

-- ── email_preferences tablosuna danışman bildirimleri ─────────────────────────

alter table public.email_preferences
  add column if not exists question_received   boolean not null default true,
  add column if not exists file_shared         boolean not null default true,
  add column if not exists update_note_shared  boolean not null default false;

-- ── brand_settings tablosu ────────────────────────────────────────────────────

create table if not exists public.brand_settings (
  id           uuid primary key default gen_random_uuid(),
  org_name     text not null default 'DENEYAP Ops',
  logo_url     text,
  primary_color  text not null default '#0d1a2a',
  accent_color   text not null default '#2288c9',
  updated_by   uuid references public.profiles(id),
  updated_at   timestamptz not null default now()
);

-- Sadece 1 satır olacak (singleton); insert yerine upsert kullanılacak
-- RLS
alter table public.brand_settings enable row level security;

create policy "brand_settings_read"
  on public.brand_settings for select
  using (true);

create policy "brand_settings_write"
  on public.brand_settings for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ── avatars storage bucket ───────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit)
values ('avatars', 'avatars', true, 3145728)  -- 3 MB
on conflict (id) do nothing;

-- Herkes okuyabilir (public CDN)
create policy "avatars_public_read"
  on storage.objects for select
  using (bucket_id = 'avatars');

-- Kendi klasörüne yükleyebilir; admin her yere
create policy "avatars_upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (
      public.is_admin()
      or auth.uid()::text = (storage.foldername(name))[1]
    )
  );

-- Kendi dosyasını güncelleyebilir; admin her şeyi
create policy "avatars_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (
      public.is_admin()
      or auth.uid()::text = (storage.foldername(name))[1]
    )
  );

-- Kendi dosyasını silebilir; admin her şeyi
create policy "avatars_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (
      public.is_admin()
      or auth.uid()::text = (storage.foldername(name))[1]
    )
  );


-- ╔══════════════════════════════════════════════════════════
-- ║ 020_ai_draft_tasks.sql
-- ╚══════════════════════════════════════════════════════════

-- ============================================
-- DENEYAP Ops — AI Taslak Görevler (020)
-- draft_sets + draft_tasks tabloları
-- Yalnızca admin erişimi (is_admin() RLS)
-- ============================================

-- ── draft_sets tablosu ────────────────────────────────────────────────────────

create table if not exists public.draft_sets (
  id           uuid        primary key default gen_random_uuid(),
  title        text        not null,
  goal_summary text        not null,
  status       text        not null default 'draft'
                           check (status in ('draft', 'reviewing', 'published', 'archived')),
  version      int         not null default 1,
  created_by   uuid        not null references public.profiles(id) on delete cascade,
  sprint_id    uuid        references public.sprints(id) on delete set null,
  created_at   timestamptz not null default now()
);

-- ── draft_tasks tablosu ───────────────────────────────────────────────────────

create table if not exists public.draft_tasks (
  id                  uuid        primary key default gen_random_uuid(),
  draft_set_id        uuid        not null references public.draft_sets(id) on delete cascade,
  title               text        not null,
  description         text        not null default '',
  category            text        not null default 'other'
                                  check (category in ('mechanical', 'electrical', 'software', 'research', 'documentation', 'test', 'other')),
  priority            text        not null default 'normal'
                                  check (priority in ('critical', 'high', 'normal', 'low')),
  due_date            date,
  estimated_hours     numeric(6,2),
  acceptance_criteria jsonb       not null default '[]'::jsonb,
  depends_on          uuid        references public.draft_tasks(id) on delete set null,
  order_index         int         not null default 0,
  created_at          timestamptz not null default now()
);

-- ── RLS ───────────────────────────────────────────────────────────────────────

alter table public.draft_sets  enable row level security;
alter table public.draft_tasks enable row level security;

-- Sadece admin tüm operasyonlara erişebilir
create policy "draft_sets_admin_all"
  on public.draft_sets for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "draft_tasks_admin_all"
  on public.draft_tasks for all
  using (public.is_admin())
  with check (public.is_admin());

-- ── İndeksler ─────────────────────────────────────────────────────────────────

create index if not exists draft_sets_created_at_idx
  on public.draft_sets (created_at desc);

create index if not exists draft_tasks_set_order_idx
  on public.draft_tasks (draft_set_id, order_index);


-- ╔══════════════════════════════════════════════════════════
-- ║ 021_project_context.sql
-- ╚══════════════════════════════════════════════════════════

-- Migration 021: Proje Bağlamı tablosu
-- AI Görev Asistanı'nın proje hakkında bilgi sahibi olması için

create table if not exists public.project_context (
  id         int primary key default 1,
  content    text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  constraint single_row check (id = 1)
);

alter table public.project_context enable row level security;

-- Herkes okuyabilir (AI çağrısı için)
create policy "context_read"  on public.project_context
  for select using (true);

-- Sadece admin yazabilir
create policy "context_write" on public.project_context
  for all using (public.is_admin()) with check (public.is_admin());

-- Başlangıç satırı (tek satır her zaman var)
insert into public.project_context (id, content)
values (1, '')
on conflict (id) do nothing;


-- ╔══════════════════════════════════════════════════════════
-- ║ 022_organizations.sql
-- ╚══════════════════════════════════════════════════════════

-- ============================================================
-- Migration 022: Multi-Tenancy — Organizations, Members, Invitations
-- ============================================================

-- ── Plan ve rol tipleri ──────────────────────────────────────
create type public.plan_type as enum ('free', 'pro');
create type public.org_role  as enum ('owner', 'admin', 'member', 'consultant');

-- ── Organizations ────────────────────────────────────────────
create table public.organizations (
  id            uuid        primary key default gen_random_uuid(),
  name          text        not null,
  slug          text        not null unique,
  plan          plan_type   not null default 'free',
  max_members   int         not null default 5,
  logo_url      text,
  primary_color text        not null default '#0d1a2a',
  accent_color  text        not null default '#2288c9',
  created_by    uuid        not null references auth.users(id) on delete cascade,
  created_at    timestamptz not null default now()
);

create unique index organizations_slug_lower_idx on public.organizations (lower(slug));

alter table public.organizations enable row level security;

-- ── Organization Members ─────────────────────────────────────
create table public.organization_members (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  user_id         uuid        not null references auth.users(id) on delete cascade,
  role            org_role    not null default 'member',
  joined_at       timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index org_members_org_idx  on public.organization_members (organization_id);
create index org_members_user_idx on public.organization_members (user_id);

alter table public.organization_members enable row level security;

-- ── Organization Invitations ─────────────────────────────────
create table public.organization_invitations (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  email           text        not null,
  role            org_role    not null default 'member',
  token           text        not null unique default encode(gen_random_bytes(32), 'hex'),
  invited_by      uuid        not null references auth.users(id) on delete cascade,
  expires_at      timestamptz not null default (now() + interval '7 days'),
  accepted_at     timestamptz,
  created_at      timestamptz not null default now()
);

create index invitations_token_idx on public.organization_invitations (token);
create index invitations_email_idx on public.organization_invitations (email);
create index invitations_org_idx   on public.organization_invitations (organization_id);

alter table public.organization_invitations enable row level security;


-- ╔══════════════════════════════════════════════════════════
-- ║ 023_org_helpers.sql
-- ╚══════════════════════════════════════════════════════════

-- ============================================================
-- Migration 023: Org-Scoped Helper Functions
-- Mevcut global is_admin() / is_consultant() fonksiyonlarının
-- org-scoped karşılıkları. RLS politikaları bunları kullanır.
-- ============================================================

-- Kullanıcının verilen org'daki rolünü döndürür (yoksa null)
create or replace function public.get_org_role(org_id uuid)
returns public.org_role
language sql
security definer
stable
set search_path = public
as $$
  select role
  from public.organization_members
  where organization_id = org_id
    and user_id = auth.uid()
  limit 1;
$$;

-- Caller bu org'da owner veya admin mi?
create or replace function public.is_org_admin(org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members
    where organization_id = org_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

-- Caller bu org'un herhangi bir üyesi mi?
create or replace function public.is_org_member(org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members
    where organization_id = org_id
      and user_id = auth.uid()
  );
$$;

-- Bu org Pro planında mı?
create or replace function public.org_is_pro(org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.organizations
    where id = org_id
      and plan = 'pro'
  );
$$;

-- Caller bu org'da consultant mı?
create or replace function public.is_org_consultant(org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members
    where organization_id = org_id
      and user_id = auth.uid()
      and role = 'consultant'
  );
$$;


-- ╔══════════════════════════════════════════════════════════
-- ║ 024_add_org_id.sql
-- ╚══════════════════════════════════════════════════════════

-- ============================================================
-- Migration 024: Add organization_id to All Data Tables
-- 1) Nullable olarak ekle
-- 2) Default org oluştur (DENEYAP Ops — Pro)
-- 3) Tüm mevcut veriyi backfill et
-- 4) NOT NULL yap
-- 5) Index'leri ekle
-- ============================================================

-- ── Step 1: Nullable organization_id ekle ───────────────────
alter table public.tasks
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

alter table public.sprints
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

alter table public.schedules
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

alter table public.checkins
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

alter table public.task_outputs
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

alter table public.ui_questions
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

alter table public.ui_question_messages
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

alter table public.ui_updates
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

alter table public.ui_update_attachments
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

alter table public.ui_update_comments
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

alter table public.ui_files
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

alter table public.ui_file_comments
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

alter table public.ui_annotation_images
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

alter table public.ui_annotation_pins
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

alter table public.ui_annotation_pin_replies
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

alter table public.draft_sets
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

alter table public.notifications
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

-- drive_tokens: unique(user_id) kısıtı kaldır, org_id ekle
do $$
begin
  if exists (
    select 1 from information_schema.table_constraints
    where table_name = 'drive_tokens'
      and constraint_type = 'UNIQUE'
      and constraint_name like '%user_id%'
  ) then
    alter table public.drive_tokens drop constraint if exists drive_tokens_user_id_key;
  end if;
end $$;

alter table public.drive_tokens
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

-- project_context: singleton kısıtını kaldır, org başına bir satır yap
alter table public.project_context
  drop constraint if exists project_context_id_check;
alter table public.project_context
  drop constraint if exists single_row;
alter table public.project_context
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

-- brand_settings: org başına bir satır
alter table public.brand_settings
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

-- ── Step 2: Default org oluştur ─────────────────────────────
do $$
declare
  v_org_id   uuid;
  v_owner_id uuid;
begin
  -- İlk oluşturulan admin kullanıcıyı bul
  select p.id into v_owner_id
  from public.profiles p
  where p.role = 'admin'
  order by p.created_at asc
  limit 1;

  -- Admin yoksa ilk kullanıcıyı al
  if v_owner_id is null then
    select p.id into v_owner_id
    from public.profiles p
    order by p.created_at asc
    limit 1;
  end if;

  -- Eğer hiç kullanıcı yoksa (fresh install) çık
  if v_owner_id is null then
    return;
  end if;

  -- Default org oluştur (Pro plan — mevcut veri taşınıyor)
  insert into public.organizations (name, slug, plan, max_members, created_by)
  values ('DENEYAP', 'deneyap', 'pro', 999, v_owner_id)
  on conflict (slug) do nothing
  returning id into v_org_id;

  -- Zaten varsa id'yi al
  if v_org_id is null then
    select id into v_org_id from public.organizations where slug = 'deneyap';
  end if;

  -- Tüm mevcut profilleri bu org'a üye yap
  insert into public.organization_members (organization_id, user_id, role)
  select
    v_org_id,
    p.id,
    case
      when p.id = v_owner_id then 'owner'::org_role
      when p.role = 'admin' then 'admin'::org_role
      when p.role = 'consultant' then 'consultant'::org_role
      else 'member'::org_role
    end
  from public.profiles p
  on conflict (organization_id, user_id) do nothing;

  -- ── Step 3: Mevcut veriyi backfill et ───────────────────────
  update public.tasks               set organization_id = v_org_id where organization_id is null;
  update public.sprints             set organization_id = v_org_id where organization_id is null;
  update public.schedules           set organization_id = v_org_id where organization_id is null;
  update public.checkins            set organization_id = v_org_id where organization_id is null;
  update public.task_outputs        set organization_id = v_org_id where organization_id is null;
  update public.ui_questions        set organization_id = v_org_id where organization_id is null;
  update public.ui_question_messages set organization_id = v_org_id where organization_id is null;
  update public.ui_updates          set organization_id = v_org_id where organization_id is null;
  update public.ui_update_attachments set organization_id = v_org_id where organization_id is null;
  update public.ui_update_comments  set organization_id = v_org_id where organization_id is null;
  update public.ui_files            set organization_id = v_org_id where organization_id is null;
  update public.ui_file_comments    set organization_id = v_org_id where organization_id is null;
  update public.ui_annotation_images set organization_id = v_org_id where organization_id is null;
  update public.ui_annotation_pins  set organization_id = v_org_id where organization_id is null;
  update public.ui_annotation_pin_replies set organization_id = v_org_id where organization_id is null;
  update public.draft_sets          set organization_id = v_org_id where organization_id is null;
  update public.notifications       set organization_id = v_org_id where organization_id is null;
  update public.drive_tokens        set organization_id = v_org_id where organization_id is null;
  update public.project_context     set organization_id = v_org_id where organization_id is null;
  update public.brand_settings      set organization_id = v_org_id where organization_id is null;

  -- project_context için org-based PK kur
  -- Eski PK (id=1) yerine organization_id'yi unique yap
  begin
    alter table public.project_context add primary key (organization_id);
  exception when others then
    null; -- Zaten varsa geç
  end;

  -- brand_settings için org unique constraint
  begin
    alter table public.brand_settings
      add constraint brand_settings_org_unique unique (organization_id);
  exception when others then
    null;
  end;
end $$;

-- ── Step 4: NOT NULL yap ─────────────────────────────────────
alter table public.tasks               alter column organization_id set not null;
alter table public.sprints             alter column organization_id set not null;
alter table public.schedules           alter column organization_id set not null;
alter table public.checkins            alter column organization_id set not null;
alter table public.task_outputs        alter column organization_id set not null;
alter table public.ui_questions        alter column organization_id set not null;
alter table public.ui_question_messages alter column organization_id set not null;
alter table public.ui_updates          alter column organization_id set not null;
alter table public.ui_update_attachments alter column organization_id set not null;
alter table public.ui_update_comments  alter column organization_id set not null;
alter table public.ui_files            alter column organization_id set not null;
alter table public.ui_file_comments    alter column organization_id set not null;
alter table public.ui_annotation_images alter column organization_id set not null;
alter table public.ui_annotation_pins  alter column organization_id set not null;
alter table public.ui_annotation_pin_replies alter column organization_id set not null;
alter table public.draft_sets          alter column organization_id set not null;
alter table public.notifications       alter column organization_id set not null;

-- ── Step 5: Performance index'leri ──────────────────────────
create index if not exists tasks_org_idx                on public.tasks(organization_id);
create index if not exists sprints_org_idx              on public.sprints(organization_id);
create index if not exists schedules_org_idx            on public.schedules(organization_id);
create index if not exists checkins_org_idx             on public.checkins(organization_id);
create index if not exists task_outputs_org_idx         on public.task_outputs(organization_id);
create index if not exists ui_questions_org_idx         on public.ui_questions(organization_id);
create index if not exists ui_updates_org_idx           on public.ui_updates(organization_id);
create index if not exists ui_files_org_idx             on public.ui_files(organization_id);
create index if not exists ui_annotation_images_org_idx on public.ui_annotation_images(organization_id);
create index if not exists draft_sets_org_idx           on public.draft_sets(organization_id);
create index if not exists notifications_org_user_idx   on public.notifications(organization_id, user_id);

-- ── Step 6: ensure_single_active_sprint trigger'ı org-scoped yap ──
create or replace function public.ensure_single_active_sprint()
returns trigger
language plpgsql
as $$
begin
  if NEW.is_active = true then
    update public.sprints
    set is_active = false
    where organization_id = NEW.organization_id
      and id != NEW.id;
  end if;
  return NEW;
end;
$$;


-- ╔══════════════════════════════════════════════════════════
-- ║ 025_rls_multitenant.sql
-- ╚══════════════════════════════════════════════════════════

-- ============================================================
-- Migration 025: Multi-Tenant RLS Politikaları
-- Tüm tablolarda eski politikalar kaldırılır,
-- org-scoped yeni politikalar eklenir.
-- ============================================================

-- ── organizations ────────────────────────────────────────────
drop policy if exists "organizations_select" on public.organizations;
drop policy if exists "organizations_insert" on public.organizations;
drop policy if exists "organizations_update" on public.organizations;

create policy "organizations_select"
  on public.organizations for select
  using (public.is_org_member(organizations.id));

create policy "organizations_insert"
  on public.organizations for insert
  with check (auth.uid() = created_by);

create policy "organizations_update"
  on public.organizations for update
  using (public.is_org_admin(organizations.id));

create policy "organizations_delete"
  on public.organizations for delete
  using (
    exists (
      select 1 from public.organization_members om
      where om.organization_id = organizations.id
        and om.user_id = auth.uid()
        and om.role = 'owner'
    )
  );

-- ── organization_members ─────────────────────────────────────
drop policy if exists "org_members_select" on public.organization_members;
drop policy if exists "org_members_insert" on public.organization_members;
drop policy if exists "org_members_update" on public.organization_members;
drop policy if exists "org_members_delete" on public.organization_members;

-- Üyeler birbirini görebilir
create policy "org_members_select"
  on public.organization_members for select
  using (
    public.is_org_member(organization_id)
    or user_id = auth.uid()
  );

-- Admin üye ekleyebilir; org kurucusu kendini ilk üye olarak ekleyebilir
create policy "org_members_insert"
  on public.organization_members for insert
  with check (
    public.is_org_admin(organization_id)
    or (
      user_id = auth.uid()
      and exists (
        select 1 from public.organizations o
        where o.id = organization_id and o.created_by = auth.uid()
      )
    )
  );

-- Admin rol değiştirebilir
create policy "org_members_update"
  on public.organization_members for update
  using (public.is_org_admin(organization_id));

-- Admin üye çıkarabilir (owner çıkarılamaz — app katmanında kontrol)
create policy "org_members_delete"
  on public.organization_members for delete
  using (public.is_org_admin(organization_id));

-- ── organization_invitations ─────────────────────────────────
drop policy if exists "invitations_select" on public.organization_invitations;
drop policy if exists "invitations_insert" on public.organization_invitations;
drop policy if exists "invitations_update" on public.organization_invitations;
drop policy if exists "invitations_delete" on public.organization_invitations;

create policy "invitations_select"
  on public.organization_invitations for select
  using (public.is_org_admin(organization_id) or email = (select email from auth.users where id = auth.uid()));

create policy "invitations_insert"
  on public.organization_invitations for insert
  with check (public.is_org_admin(organization_id) and invited_by = auth.uid());

create policy "invitations_update"
  on public.organization_invitations for update
  using (true); -- token redemption service role ile

create policy "invitations_delete"
  on public.organization_invitations for delete
  using (public.is_org_admin(organization_id));

-- ── profiles ─────────────────────────────────────────────────
-- Profiller hâlâ kullanıcıya ait, ama diğer org üyeleri görebilir
drop policy if exists "profiles_select_own"    on public.profiles;
drop policy if exists "profiles_select_admin"  on public.profiles;
drop policy if exists "profiles_update_own"    on public.profiles;
drop policy if exists "profiles_insert_own"    on public.profiles;

-- Kendi profilini her zaman görebilir
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = profiles.id);

-- Aynı org'daki birini görebilir
create policy "profiles_select_org_member"
  on public.profiles for select
  using (
    exists (
      select 1 from public.organization_members om1
      join public.organization_members om2
        on om1.organization_id = om2.organization_id
      where om1.user_id = auth.uid()
        and om2.user_id = profiles.id
    )
  );

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = profiles.id);

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = profiles.id);

-- ── tasks ────────────────────────────────────────────────────
drop policy if exists "tasks_select_admin"    on public.tasks;
drop policy if exists "tasks_select_assignee" on public.tasks;
drop policy if exists "tasks_insert_admin"    on public.tasks;
drop policy if exists "tasks_update_admin"    on public.tasks;
drop policy if exists "tasks_update_assignee" on public.tasks;
drop policy if exists "tasks_delete_admin"    on public.tasks;
drop policy if exists "tasks_select"          on public.tasks;
drop policy if exists "tasks_write"           on public.tasks;

create policy "tasks_select"
  on public.tasks for select
  using (public.is_org_member(organization_id));

create policy "tasks_insert"
  on public.tasks for insert
  with check (public.is_org_admin(organization_id));

create policy "tasks_update"
  on public.tasks for update
  using (
    public.is_org_admin(organization_id)
    or assignee_id = auth.uid()
  );

create policy "tasks_delete"
  on public.tasks for delete
  using (public.is_org_admin(organization_id));

-- ── task_outputs ─────────────────────────────────────────────
drop policy if exists "task_outputs_select"  on public.task_outputs;
drop policy if exists "task_outputs_insert"  on public.task_outputs;
drop policy if exists "task_outputs_delete"  on public.task_outputs;

create policy "task_outputs_select"
  on public.task_outputs for select
  using (public.is_org_member(organization_id));

create policy "task_outputs_insert"
  on public.task_outputs for insert
  with check (public.is_org_member(organization_id));

create policy "task_outputs_delete"
  on public.task_outputs for delete
  using (public.is_org_admin(organization_id) or created_by = auth.uid());

-- ── sprints ──────────────────────────────────────────────────
drop policy if exists "sprints_select_all"   on public.sprints;
drop policy if exists "sprints_admin_all"    on public.sprints;
drop policy if exists "sprints_select"       on public.sprints;
drop policy if exists "sprints_write"        on public.sprints;

create policy "sprints_select"
  on public.sprints for select
  using (public.is_org_member(organization_id));

create policy "sprints_insert"
  on public.sprints for insert
  with check (public.is_org_admin(organization_id));

create policy "sprints_update"
  on public.sprints for update
  using (public.is_org_admin(organization_id));

create policy "sprints_delete"
  on public.sprints for delete
  using (public.is_org_admin(organization_id));

-- ── schedules ────────────────────────────────────────────────
drop policy if exists "schedules_select_own"   on public.schedules;
drop policy if exists "schedules_select_admin" on public.schedules;
drop policy if exists "schedules_insert_own"   on public.schedules;
drop policy if exists "schedules_update_own"   on public.schedules;
drop policy if exists "schedules_delete_own"   on public.schedules;

create policy "schedules_select"
  on public.schedules for select
  using (public.is_org_member(organization_id));

create policy "schedules_insert"
  on public.schedules for insert
  with check (public.is_org_member(organization_id) and user_id = auth.uid());

create policy "schedules_update"
  on public.schedules for update
  using (user_id = auth.uid() or public.is_org_admin(organization_id));

create policy "schedules_delete"
  on public.schedules for delete
  using (user_id = auth.uid() or public.is_org_admin(organization_id));

-- ── checkins ─────────────────────────────────────────────────
drop policy if exists "checkins_select_own"   on public.checkins;
drop policy if exists "checkins_select_admin" on public.checkins;
drop policy if exists "checkins_insert_own"   on public.checkins;

create policy "checkins_select"
  on public.checkins for select
  using (public.is_org_member(organization_id));

create policy "checkins_insert"
  on public.checkins for insert
  with check (public.is_org_member(organization_id) and user_id = auth.uid());

create policy "checkins_delete"
  on public.checkins for delete
  using (user_id = auth.uid() or public.is_org_admin(organization_id));

-- ── ui_questions (Pro-only) ──────────────────────────────────
drop policy if exists "ui_questions_admin_all"       on public.ui_questions;
drop policy if exists "ui_questions_consultant_read" on public.ui_questions;
drop policy if exists "ui_questions_consultant_insert" on public.ui_questions;

create policy "ui_questions_select"
  on public.ui_questions for select
  using (public.is_org_member(organization_id) and public.org_is_pro(organization_id));

create policy "ui_questions_insert"
  on public.ui_questions for insert
  with check (public.is_org_member(organization_id) and public.org_is_pro(organization_id));

create policy "ui_questions_update"
  on public.ui_questions for update
  using (public.is_org_admin(organization_id) and public.org_is_pro(organization_id));

create policy "ui_questions_delete"
  on public.ui_questions for delete
  using (public.is_org_admin(organization_id) and public.org_is_pro(organization_id));

-- ── ui_question_messages (Pro-only) ─────────────────────────
drop policy if exists "ui_messages_all" on public.ui_question_messages;

create policy "ui_messages_select"
  on public.ui_question_messages for select
  using (public.is_org_member(organization_id) and public.org_is_pro(organization_id));

create policy "ui_messages_insert"
  on public.ui_question_messages for insert
  with check (public.is_org_member(organization_id) and public.org_is_pro(organization_id));

create policy "ui_messages_delete"
  on public.ui_question_messages for delete
  using (created_by = auth.uid() or public.is_org_admin(organization_id));

-- ── ui_updates (Pro-only) ────────────────────────────────────
drop policy if exists "ui_updates_admin_all"       on public.ui_updates;
drop policy if exists "ui_updates_consultant_read" on public.ui_updates;

create policy "ui_updates_select"
  on public.ui_updates for select
  using (public.is_org_member(organization_id) and public.org_is_pro(organization_id));

create policy "ui_updates_insert"
  on public.ui_updates for insert
  with check (public.is_org_admin(organization_id) and public.org_is_pro(organization_id));

create policy "ui_updates_update"
  on public.ui_updates for update
  using (public.is_org_admin(organization_id));

create policy "ui_updates_delete"
  on public.ui_updates for delete
  using (public.is_org_admin(organization_id));

-- ── ui_update_attachments ────────────────────────────────────
drop policy if exists "ui_update_attachments_all" on public.ui_update_attachments;

create policy "ui_update_attachments_select"
  on public.ui_update_attachments for select
  using (public.is_org_member(organization_id) and public.org_is_pro(organization_id));

create policy "ui_update_attachments_insert"
  on public.ui_update_attachments for insert
  with check (public.is_org_admin(organization_id));

create policy "ui_update_attachments_delete"
  on public.ui_update_attachments for delete
  using (public.is_org_admin(organization_id));

-- ── ui_update_comments ───────────────────────────────────────
drop policy if exists "ui_update_comments_all" on public.ui_update_comments;

create policy "ui_update_comments_select"
  on public.ui_update_comments for select
  using (public.is_org_member(organization_id) and public.org_is_pro(organization_id));

create policy "ui_update_comments_insert"
  on public.ui_update_comments for insert
  with check (public.is_org_member(organization_id) and public.org_is_pro(organization_id));

create policy "ui_update_comments_delete"
  on public.ui_update_comments for delete
  using (created_by = auth.uid() or public.is_org_admin(organization_id));

-- ── ui_files (Pro-only) ──────────────────────────────────────
drop policy if exists "ui_files_admin_all"       on public.ui_files;
drop policy if exists "ui_files_consultant_read" on public.ui_files;

create policy "ui_files_select"
  on public.ui_files for select
  using (public.is_org_member(organization_id) and public.org_is_pro(organization_id));

create policy "ui_files_insert"
  on public.ui_files for insert
  with check (public.is_org_admin(organization_id) and public.org_is_pro(organization_id));

create policy "ui_files_delete"
  on public.ui_files for delete
  using (public.is_org_admin(organization_id));

-- ── ui_file_comments ─────────────────────────────────────────
drop policy if exists "ui_file_comments_all" on public.ui_file_comments;

create policy "ui_file_comments_select"
  on public.ui_file_comments for select
  using (public.is_org_member(organization_id) and public.org_is_pro(organization_id));

create policy "ui_file_comments_insert"
  on public.ui_file_comments for insert
  with check (public.is_org_member(organization_id) and public.org_is_pro(organization_id));

create policy "ui_file_comments_delete"
  on public.ui_file_comments for delete
  using (created_by = auth.uid() or public.is_org_admin(organization_id));

-- ── ui_annotation_images (Pro-only) ─────────────────────────
drop policy if exists "ui_annotation_images_admin_all"       on public.ui_annotation_images;
drop policy if exists "ui_annotation_images_consultant_read" on public.ui_annotation_images;

create policy "ui_annotation_images_select"
  on public.ui_annotation_images for select
  using (public.is_org_member(organization_id) and public.org_is_pro(organization_id));

create policy "ui_annotation_images_insert"
  on public.ui_annotation_images for insert
  with check (public.is_org_admin(organization_id) and public.org_is_pro(organization_id));

create policy "ui_annotation_images_delete"
  on public.ui_annotation_images for delete
  using (public.is_org_admin(organization_id));

-- ── ui_annotation_pins (Pro-only) ───────────────────────────
drop policy if exists "ui_annotation_pins_all" on public.ui_annotation_pins;

create policy "ui_annotation_pins_select"
  on public.ui_annotation_pins for select
  using (public.is_org_member(organization_id) and public.org_is_pro(organization_id));

create policy "ui_annotation_pins_insert"
  on public.ui_annotation_pins for insert
  with check (public.is_org_member(organization_id) and public.org_is_pro(organization_id));

create policy "ui_annotation_pins_update"
  on public.ui_annotation_pins for update
  using (public.is_org_admin(organization_id) or created_by = auth.uid());

create policy "ui_annotation_pins_delete"
  on public.ui_annotation_pins for delete
  using (created_by = auth.uid() or public.is_org_admin(organization_id));

-- ── ui_annotation_pin_replies ────────────────────────────────
drop policy if exists "ui_annotation_pin_replies_all" on public.ui_annotation_pin_replies;

create policy "ui_annotation_pin_replies_select"
  on public.ui_annotation_pin_replies for select
  using (public.is_org_member(organization_id) and public.org_is_pro(organization_id));

create policy "ui_annotation_pin_replies_insert"
  on public.ui_annotation_pin_replies for insert
  with check (public.is_org_member(organization_id) and public.org_is_pro(organization_id));

create policy "ui_annotation_pin_replies_delete"
  on public.ui_annotation_pin_replies for delete
  using (created_by = auth.uid() or public.is_org_admin(organization_id));

-- ── draft_sets (admin-only) ──────────────────────────────────
drop policy if exists "draft_sets_admin_all" on public.draft_sets;

create policy "draft_sets_select"
  on public.draft_sets for select
  using (public.is_org_admin(organization_id) and public.org_is_pro(organization_id));

create policy "draft_sets_insert"
  on public.draft_sets for insert
  with check (public.is_org_admin(organization_id) and public.org_is_pro(organization_id));

create policy "draft_sets_update"
  on public.draft_sets for update
  using (public.is_org_admin(organization_id));

create policy "draft_sets_delete"
  on public.draft_sets for delete
  using (public.is_org_admin(organization_id));

-- ── draft_tasks ──────────────────────────────────────────────
drop policy if exists "draft_tasks_admin_all" on public.draft_tasks;

create policy "draft_tasks_select"
  on public.draft_tasks for select
  using (
    exists (
      select 1 from public.draft_sets ds
      where ds.id = draft_set_id
        and public.is_org_admin(ds.organization_id)
        and public.org_is_pro(ds.organization_id)
    )
  );

create policy "draft_tasks_insert"
  on public.draft_tasks for insert
  with check (
    exists (
      select 1 from public.draft_sets ds
      where ds.id = draft_set_id
        and public.is_org_admin(ds.organization_id)
    )
  );

create policy "draft_tasks_update"
  on public.draft_tasks for update
  using (
    exists (
      select 1 from public.draft_sets ds
      where ds.id = draft_set_id
        and public.is_org_admin(ds.organization_id)
    )
  );

create policy "draft_tasks_delete"
  on public.draft_tasks for delete
  using (
    exists (
      select 1 from public.draft_sets ds
      where ds.id = draft_set_id
        and public.is_org_admin(ds.organization_id)
    )
  );

-- ── project_context ──────────────────────────────────────────
drop policy if exists "project_context_admin_all" on public.project_context;
drop policy if exists "project_context_read_all"  on public.project_context;

create policy "project_context_select"
  on public.project_context for select
  using (public.is_org_member(organization_id));

create policy "project_context_upsert"
  on public.project_context for all
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

-- ── notifications ────────────────────────────────────────────
drop policy if exists "notifications_select_own"  on public.notifications;
drop policy if exists "notifications_update_own"  on public.notifications;
drop policy if exists "notifications_delete_own"  on public.notifications;

create policy "notifications_select"
  on public.notifications for select
  using (user_id = auth.uid());

create policy "notifications_update"
  on public.notifications for update
  using (user_id = auth.uid());

create policy "notifications_delete"
  on public.notifications for delete
  using (user_id = auth.uid());

-- ── brand_settings ───────────────────────────────────────────
drop policy if exists "brand_settings_select_all"  on public.brand_settings;
drop policy if exists "brand_settings_admin_all"   on public.brand_settings;

create policy "brand_settings_select"
  on public.brand_settings for select
  using (public.is_org_member(organization_id));

create policy "brand_settings_upsert"
  on public.brand_settings for all
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

-- ── email_preferences (kullanıcı düzeyi — org_id yok) ───────
-- Bu tablo org-scoped değil, kullanıcı bazlı kalmaya devam eder.
-- Pro plan kontrolü app katmanında yapılır.
drop policy if exists "email_preferences_own" on public.email_preferences;

create policy "email_preferences_select"
  on public.email_preferences for select
  using (user_id = auth.uid());

create policy "email_preferences_upsert"
  on public.email_preferences for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());


-- ╔══════════════════════════════════════════════════════════
-- ║ 026_fix_org_members_insert.sql
-- ╚══════════════════════════════════════════════════════════

-- ============================================================
-- Migration 026: Fix org_members_insert RLS (chicken-and-egg)
--
-- Problem: Yeni org oluşturulduğunda ilk üye insert'i başarısız
-- çünkü is_org_admin() henüz üye olmayan kullanıcı için false döner.
--
-- Fix: Org created_by kullanıcısının kendini owner olarak
-- ekleyebilmesine izin ver.
-- ============================================================

drop policy if exists "org_members_insert" on public.organization_members;

create policy "org_members_insert"
  on public.organization_members for insert
  with check (
    -- Mevcut admin/owner üye ekleyebilir (davet kabulü hariç, o service role ile yapılır)
    public.is_org_admin(organization_id)
    or
    -- Org kurucusu kendini ilk üye olarak ekleyebilir (chicken-and-egg fix)
    (
      user_id = auth.uid()
      and exists (
        select 1 from public.organizations o
        where o.id = organization_id
          and o.created_by = auth.uid()
      )
    )
  );


-- ╔══════════════════════════════════════════════════════════
-- ║ 027_join_code.sql
-- ╚══════════════════════════════════════════════════════════

-- ============================================================
-- Migration 027: Join Code — organizations.join_code kolonu
-- ============================================================

-- 1. Kolonu ekle (nullable olarak başla, backfill sonrası NOT NULL yapılacak)
alter table public.organizations
  add column if not exists join_code text;

-- 2. Mevcut org'lar için benzersiz 6 karakterlik kod üret
do $$
declare
  rec record;
  candidate text;
  collision boolean;
begin
  for rec in
    select id from public.organizations where join_code is null
  loop
    loop
      candidate := upper(substring(encode(gen_random_bytes(4), 'hex') from 1 for 6));
      select exists(
        select 1 from public.organizations where join_code = candidate
      ) into collision;
      exit when not collision;
    end loop;
    update public.organizations set join_code = candidate where id = rec.id;
  end loop;
end; $$;

-- 3. NOT NULL ve UNIQUE kısıtlamaları ekle
alter table public.organizations
  alter column join_code set not null;

alter table public.organizations
  add constraint organizations_join_code_unique unique (join_code);

create unique index if not exists organizations_join_code_idx
  on public.organizations (join_code);

-- 4. Yeni INSERT'lerde otomatik kod üretecek trigger
create or replace function public.generate_join_code()
returns trigger
language plpgsql
as $$
declare
  candidate text;
  collision boolean;
begin
  if new.join_code is null then
    loop
      candidate := upper(substring(encode(gen_random_bytes(4), 'hex') from 1 for 6));
      select exists(
        select 1 from public.organizations where join_code = candidate
      ) into collision;
      exit when not collision;
    end loop;
    new.join_code := candidate;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_org_join_code on public.organizations;

create trigger trg_org_join_code
  before insert on public.organizations
  for each row execute function public.generate_join_code();


-- ╔══════════════════════════════════════════════════════════
-- ║ 028_user_plan.sql
-- ╚══════════════════════════════════════════════════════════

-- Migration 028: User-level plan
-- Plan artık workspace'e değil kullanıcıya (profiles) bağlı

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free'
    CHECK (plan IN ('free', 'pro'));

-- Mevcut veriler: pro plana sahip org'ların owner'larını pro yap
UPDATE public.profiles p
SET plan = 'pro'
WHERE p.id IN (
  SELECT om.user_id
  FROM public.organization_members om
  JOIN public.organizations o ON o.id = om.organization_id
  WHERE om.role = 'owner' AND o.plan = 'pro'
);

-- RLS: kullanıcı kendi planını okuyabilir; güncelleme sadece service role
-- (Varsayılan profiles RLS politikaları zaten bunu kapsıyor)


-- ╔══════════════════════════════════════════════════════════
-- ║ 029_fix_org_create.sql
-- ╚══════════════════════════════════════════════════════════

-- ============================================================
-- Migration 029: Org oluşturma düzeltmesi
--
-- Sorun: INSERT ... RETURNING SELECT politikası ile çakışıyordu.
-- Kullanıcı henüz org'a üye olmadığı için is_org_member() false
-- dönüyor, RETURNING boş geliyor, client hata görüyordu.
-- Org aslında DB'de oluşuyordu ama üye kaydı hiç eklenmiyordu.
--
-- Çözüm 1: Org sahibinin kendi oluşturduğu org'u SELECT edebilmesi
-- Çözüm 2: Üyesi olmayan (orphan) org'ları temizle
-- ============================================================

-- 1. Org kurucusunun kendi org'unu görebilmesine izin ver
--    (INSERT ... RETURNING ve direkt SELECT için gerekli)
drop policy if exists "organizations_select_own" on public.organizations;

create policy "organizations_select_own"
  on public.organizations for select
  using (created_by = auth.uid());

-- 2. Orphan org'ları temizle
--    (üyesi olmayan, yani başarısız yaratma girişimlerinden kalan org'lar)
delete from public.organizations
where id not in (
  select distinct organization_id from public.organization_members
);


-- ╔══════════════════════════════════════════════════════════
-- ║ 030_ai_addon.sql
-- ╚══════════════════════════════════════════════════════════

-- ============================================================
-- Migration 030: AI Asistan Eklenti Paketi
-- profiles.ai_addon: kullanıcı bazlı AI eklentisi flag'i
-- ai_usage_logs: AI çağrı izleme tablosu
-- ============================================================

-- 1. profiles'a ai_addon kolonu
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ai_addon BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. AI kullanım logu tablosu
CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action          TEXT        NOT NULL CHECK (action IN ('generate', 'revise', 'revise_task')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_usage_logs_user_date_idx
  ON public.ai_usage_logs (user_id, created_at);

CREATE INDEX IF NOT EXISTS ai_usage_logs_org_date_idx
  ON public.ai_usage_logs (organization_id, created_at);

ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

-- Sadece org adminleri kendi org'larının loglarını görebilir
CREATE POLICY "ai_usage_select"
  ON public.ai_usage_logs FOR SELECT
  USING (public.is_org_admin(organization_id));


-- ╔══════════════════════════════════════════════════════════
-- ║ 031_task_start_date.sql
-- ╚══════════════════════════════════════════════════════════

-- Migration 031: tasks tablosuna start_date kolonu ekle
-- Takvim ve Gantt/Timeline görünümleri için gerekli

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS start_date DATE;


-- ╔══════════════════════════════════════════════════════════
-- ║ 032_file_center.sql
-- ╚══════════════════════════════════════════════════════════

-- ============================================================
-- Migration 032: Dosya Merkezi (File Center)
-- Dosyalar artık proje seviyesinde (org_files) tutulur.
-- Görevlere task_file_links junction tablosu ile bağlanır.
-- ============================================================

-- ── org_files: proje arşivi ───────────────────────────────────
create table if not exists public.org_files (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  uploaded_by     uuid not null references auth.users(id),
  drive_file_id   text not null,
  file_name       text not null,
  file_size       bigint,
  mime_type       text,
  drive_url       text not null,
  -- Kategori: mekanik | elektronik | yazilim | test | genel | diger
  category        text not null default 'genel'
                  check (category in ('mekanik','elektronik','yazilim','test','genel','diger')),
  description     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.org_files enable row level security;

-- Org üyeleri okuyabilir
create policy "org_files_select"
  on public.org_files for select
  using (public.is_org_member(organization_id));

-- Org üyeleri yükleyebilir (kendi adına)
create policy "org_files_insert"
  on public.org_files for insert
  with check (
    public.is_org_member(organization_id)
    and uploaded_by = auth.uid()
  );

-- Admin veya yükleyen güncelleyebilir
create policy "org_files_update"
  on public.org_files for update
  using (
    public.is_org_admin(organization_id)
    or uploaded_by = auth.uid()
  );

-- Admin veya yükleyen silebilir
create policy "org_files_delete"
  on public.org_files for delete
  using (
    public.is_org_admin(organization_id)
    or uploaded_by = auth.uid()
  );

-- ── task_file_links: dosya ↔ görev bağlantısı ─────────────────
create table if not exists public.task_file_links (
  id          uuid primary key default gen_random_uuid(),
  org_file_id uuid not null references public.org_files(id) on delete cascade,
  task_id     uuid not null references public.tasks(id) on delete cascade,
  linked_by   uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  unique (org_file_id, task_id)
);

alter table public.task_file_links enable row level security;

-- Org üyeleri bağlantıları görebilir
create policy "task_file_links_select"
  on public.task_file_links for select
  using (
    exists (
      select 1 from public.org_files f
      where f.id = task_file_links.org_file_id
        and public.is_org_member(f.organization_id)
    )
  );

-- Org üyeleri bağlantı ekleyebilir
create policy "task_file_links_insert"
  on public.task_file_links for insert
  with check (
    linked_by = auth.uid()
    and exists (
      select 1 from public.org_files f
      where f.id = task_file_links.org_file_id
        and public.is_org_member(f.organization_id)
    )
  );

-- Admin, bağlayan veya dosyanın sahibi kaldırabilir
create policy "task_file_links_delete"
  on public.task_file_links for delete
  using (
    linked_by = auth.uid()
    or exists (
      select 1 from public.org_files f
      where f.id = task_file_links.org_file_id
        and (
          public.is_org_admin(f.organization_id)
          or f.uploaded_by = auth.uid()
        )
    )
  );


-- ╔══════════════════════════════════════════════════════════
-- ║ 033_ai_analyze_action.sql
-- ╚══════════════════════════════════════════════════════════

-- Migration 033: ai_usage_logs action constraint'ine 'analyze' ekle
ALTER TABLE public.ai_usage_logs
  DROP CONSTRAINT IF EXISTS ai_usage_logs_action_check;

ALTER TABLE public.ai_usage_logs
  ADD CONSTRAINT ai_usage_logs_action_check
  CHECK (action IN ('generate', 'revise', 'revise_task', 'analyze'));


-- ╔══════════════════════════════════════════════════════════
-- ║ 034_fix_org_files_fk.sql
-- ╚══════════════════════════════════════════════════════════

-- ============================================================
-- Migration 034: Fix org_files.uploaded_by FK
-- org_files.uploaded_by → auth.users yerine profiles'a işaret etmeli
-- Böylece Supabase PostgREST join'ı çalışır.
-- ============================================================

-- 1. Eski FK'yı kaldır (auth.users'a işaret ediyordu)
ALTER TABLE public.org_files
  DROP CONSTRAINT IF EXISTS org_files_uploaded_by_fkey;

-- 2. Yeni FK: profiles(id)'ye referans ver (profiles.id = auth.users.id)
ALTER TABLE public.org_files
  ADD CONSTRAINT org_files_uploaded_by_fkey
  FOREIGN KEY (uploaded_by)
  REFERENCES public.profiles(id)
  ON DELETE SET NULL;

-- NOT NULL kaldır (kullanıcı silinirse NULL olabilsin)
ALTER TABLE public.org_files
  ALTER COLUMN uploaded_by DROP NOT NULL;


-- ╔══════════════════════════════════════════════════════════
-- ║ 035_drive_workspace_folders.sql
-- ╚══════════════════════════════════════════════════════════

-- drive_tokens tablosuna workspace başına klasör ID'lerini saklayan kolon ekle
-- { "orgId1": "driveFolderId1", "orgId2": "driveFolderId2" }
ALTER TABLE public.drive_tokens
  ADD COLUMN IF NOT EXISTS folder_map JSONB DEFAULT '{}';


-- ╔══════════════════════════════════════════════════════════
-- ║ 036_drive_org_unique.sql
-- ╚══════════════════════════════════════════════════════════

-- Her workspace için tek Drive bağlantısı: organization_id'ye partial UNIQUE INDEX
-- NULL olan satırlar (eski/anonim bağlantılar) etkilenmez
CREATE UNIQUE INDEX IF NOT EXISTS drive_tokens_organization_id_key
  ON public.drive_tokens (organization_id)
  WHERE organization_id IS NOT NULL;


-- ╔══════════════════════════════════════════════════════════
-- ║ 037_audit_log_kvkk.sql
-- ╚══════════════════════════════════════════════════════════

-- ── 037: Audit Log + KVKK kvkk_accepted_at ─────────────────────────────────

-- 1. Audit log tablosu
CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  org_id      UUID        REFERENCES organizations(id) ON DELETE SET NULL,
  action      TEXT        NOT NULL,
  entity_type TEXT,
  entity_id   TEXT,
  metadata    JSONB,
  ip_address  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index'ler
CREATE INDEX IF NOT EXISTS audit_logs_user_id_idx    ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS audit_logs_org_id_idx     ON audit_logs(org_id);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx     ON audit_logs(action);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs(created_at DESC);

-- RLS: Kullanıcı kendi loglarını, admin org loglarını görebilir
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs_user_own"
  ON audit_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "audit_logs_org_admin"
  ON audit_logs FOR SELECT
  USING (
    org_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_id = audit_logs.org_id
        AND user_id = auth.uid()
        AND role IN ('admin', 'owner')
    )
  );

-- Service role insert (API route'larından yazılır)
CREATE POLICY "audit_logs_service_insert"
  ON audit_logs FOR INSERT
  WITH CHECK (true);

-- 2. KVKK onay tarihi — profiles tablosuna ekle
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS kvkk_accepted_at TIMESTAMPTZ;

COMMENT ON COLUMN profiles.kvkk_accepted_at
  IS 'KVKK Gizlilik Politikası ve Kullanım Şartları kabul tarihi (kayıt sırasında set edilir)';


-- ╔══════════════════════════════════════════════════════════
-- ║ 038_calendar_events.sql
-- ╚══════════════════════════════════════════════════════════

-- 038_calendar_events.sql
-- Takvim etkinlikleri — görev listesinden bağımsız, saat desteğiyle

CREATE TABLE IF NOT EXISTS calendar_events (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title           TEXT NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by      UUID NOT NULL REFERENCES auth.users(id),
  assignee_id     UUID REFERENCES auth.users(id),
  event_date      DATE NOT NULL,
  is_all_day      BOOLEAN NOT NULL DEFAULT true,
  start_slot      SMALLINT,  -- 0–47 (30 dakikalık dilimler: 0=00:00, 1=00:30, …)
  end_slot        SMALLINT,  -- 0–47
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_select_cal_events" ON calendar_events
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org_members_insert_cal_events" ON calendar_events
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
    AND created_by = auth.uid()
  );

CREATE POLICY "creator_update_cal_events" ON calendar_events
  FOR UPDATE USING (created_by = auth.uid());

CREATE POLICY "creator_delete_cal_events" ON calendar_events
  FOR DELETE USING (created_by = auth.uid());


-- ╔══════════════════════════════════════════════════════════
-- ║ 039_chat.sql
-- ╚══════════════════════════════════════════════════════════

-- ── Chat Modülü ──────────────────────────────────────────────────────────────
-- Kanal tablosu: workspace (ekip geneli) veya dm (ikili özel sohbet)

CREATE TABLE public.chat_channels (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  type            TEXT CHECK (type IN ('workspace', 'dm')) NOT NULL,
  -- DM için iki katılımcı (participant_a < participant_b — UUID karşılaştırma ile sıralı)
  participant_a   UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  participant_b   UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Workspace kanalı: org başına en fazla bir tane
CREATE UNIQUE INDEX chat_workspace_per_org
  ON public.chat_channels(organization_id)
  WHERE type = 'workspace';

-- DM: aynı org içinde aynı çift için tek kanal
CREATE UNIQUE INDEX chat_dm_unique_pair
  ON public.chat_channels(organization_id, participant_a, participant_b)
  WHERE type = 'dm';

-- ── Mesaj tablosu ─────────────────────────────────────────────────────────────

CREATE TABLE public.chat_messages (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id UUID REFERENCES public.chat_channels(id) ON DELETE CASCADE NOT NULL,
  sender_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  content    TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX chat_messages_channel_created
  ON public.chat_messages(channel_id, created_at DESC);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.chat_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages  ENABLE ROW LEVEL SECURITY;

-- chat_channels SELECT: org üyesi workspace kanalını görür; DM → yalnızca katılımcılar
CREATE POLICY "chat_channel_select" ON public.chat_channels
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = chat_channels.organization_id
        AND om.user_id = auth.uid()
    )
    AND (
      type = 'workspace'
      OR participant_a = auth.uid()
      OR participant_b = auth.uid()
    )
  );

-- chat_channels INSERT: org üyesi yeni kanal açabilir
CREATE POLICY "chat_channel_insert" ON public.chat_channels
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = chat_channels.organization_id
        AND om.user_id = auth.uid()
    )
  );

-- chat_messages SELECT: kanalı görebiliyorsa mesajları da görür
CREATE POLICY "chat_message_select" ON public.chat_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.chat_channels cc
      WHERE cc.id = chat_messages.channel_id
        AND EXISTS (
          SELECT 1 FROM public.organization_members om
          WHERE om.organization_id = cc.organization_id
            AND om.user_id = auth.uid()
        )
        AND (
          cc.type = 'workspace'
          OR cc.participant_a = auth.uid()
          OR cc.participant_b = auth.uid()
        )
    )
  );

-- chat_messages INSERT: sender_id = kendi uid'si olmalı, kanalı görebilmeli
CREATE POLICY "chat_message_insert" ON public.chat_messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.chat_channels cc
      WHERE cc.id = chat_messages.channel_id
        AND EXISTS (
          SELECT 1 FROM public.organization_members om
          WHERE om.organization_id = cc.organization_id
            AND om.user_id = auth.uid()
        )
        AND (
          cc.type = 'workspace'
          OR cc.participant_a = auth.uid()
          OR cc.participant_b = auth.uid()
        )
    )
  );

-- ── Realtime ─────────────────────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;


-- ╔══════════════════════════════════════════════════════════
-- ║ 040_chat_reads_and_delete.sql
-- ╚══════════════════════════════════════════════════════════

-- ── Chat Okuma Durumu & Mesaj Silme ──────────────────────────────────────────

-- chat_messages DELETE: gönderen kendi mesajını silebilir; org admin/owner hepsini silebilir
CREATE POLICY "chat_message_delete" ON public.chat_messages
  FOR DELETE USING (
    sender_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.chat_channels cc
      JOIN public.organization_members om ON om.organization_id = cc.organization_id
      WHERE cc.id = chat_messages.channel_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

-- ── Okuma durumu tablosu ──────────────────────────────────────────────────────
-- Her kullanıcı her kanalda hangi mesaja kadar okuduğunu tutar

CREATE TABLE public.chat_message_reads (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id          UUID REFERENCES public.chat_channels(id) ON DELETE CASCADE NOT NULL,
  user_id             UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  last_read_message_id UUID REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  updated_at          TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE (channel_id, user_id)
);

CREATE INDEX chat_reads_channel ON public.chat_message_reads(channel_id);

ALTER TABLE public.chat_message_reads ENABLE ROW LEVEL SECURITY;

-- SELECT: kanalı görebilen üyeler okuma durumlarını görebilir
CREATE POLICY "reads_select" ON public.chat_message_reads
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.chat_channels cc
      WHERE cc.id = chat_message_reads.channel_id
        AND EXISTS (
          SELECT 1 FROM public.organization_members om
          WHERE om.organization_id = cc.organization_id
            AND om.user_id = auth.uid()
        )
        AND (
          cc.type = 'workspace'
          OR cc.participant_a = auth.uid()
          OR cc.participant_b = auth.uid()
        )
    )
  );

-- INSERT: kendi user_id'si ile kayıt ekleyebilir
CREATE POLICY "reads_insert" ON public.chat_message_reads
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- UPDATE: kendi kaydını güncelleyebilir
CREATE POLICY "reads_update" ON public.chat_message_reads
  FOR UPDATE USING (user_id = auth.uid());

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_message_reads;


-- ╔══════════════════════════════════════════════════════════
-- ║ 041_chat_slack.sql
-- ╚══════════════════════════════════════════════════════════

-- ── Slack Benzeri Chat — Şema Güncellemeleri ─────────────────────────────────

-- ── 1. chat_channels: named channel desteği ──────────────────────────────────
ALTER TABLE public.chat_channels
  ADD COLUMN IF NOT EXISTS name        TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Mevcut workspace kanallarına varsayılan isim ver
UPDATE public.chat_channels SET name = 'Genel' WHERE type = 'workspace' AND name IS NULL;

-- ── 2. chat_messages: thread desteği ─────────────────────────────────────────
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS parent_message_id UUID REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS thread_count      INTEGER DEFAULT 0 NOT NULL;

CREATE INDEX IF NOT EXISTS chat_messages_thread
  ON public.chat_messages(parent_message_id)
  WHERE parent_message_id IS NOT NULL;

-- ── 3. profiles: user status ──────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS chat_status       TEXT DEFAULT 'online'
    CHECK (chat_status IN ('online','away','dnd','offline')),
  ADD COLUMN IF NOT EXISTS status_emoji      TEXT,
  ADD COLUMN IF NOT EXISTS status_text       TEXT,
  ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ;

-- ── 4. chat_reactions tablosu ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_reactions (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID REFERENCES public.chat_messages(id) ON DELETE CASCADE NOT NULL,
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  emoji      TEXT NOT NULL CHECK (char_length(emoji) <= 10),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE (message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS chat_reactions_message ON public.chat_reactions(message_id);

ALTER TABLE public.chat_reactions ENABLE ROW LEVEL SECURITY;

-- Mesajı görebilen herkes reactionları görebilir
CREATE POLICY "reaction_select" ON public.chat_reactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.chat_messages cm
      JOIN public.chat_channels cc ON cc.id = cm.channel_id
      JOIN public.organization_members om ON om.organization_id = cc.organization_id
      WHERE cm.id = chat_reactions.message_id
        AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "reaction_insert" ON public.chat_reactions
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "reaction_delete" ON public.chat_reactions
  FOR DELETE USING (user_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_reactions;

-- ── 5. chat_pins tablosu ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_pins (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id UUID REFERENCES public.chat_channels(id) ON DELETE CASCADE NOT NULL,
  message_id UUID REFERENCES public.chat_messages(id) ON DELETE CASCADE NOT NULL,
  pinned_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE (channel_id, message_id)
);

CREATE INDEX IF NOT EXISTS chat_pins_channel ON public.chat_pins(channel_id);

ALTER TABLE public.chat_pins ENABLE ROW LEVEL SECURITY;

-- Org üyesi pinleri görebilir
CREATE POLICY "pin_select" ON public.chat_pins
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.chat_channels cc
      JOIN public.organization_members om ON om.organization_id = cc.organization_id
      WHERE cc.id = chat_pins.channel_id AND om.user_id = auth.uid()
    )
  );

-- Admin/owner pinleyebilir
CREATE POLICY "pin_insert" ON public.chat_pins
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      JOIN public.chat_channels cc ON cc.organization_id = om.organization_id
      WHERE cc.id = chat_pins.channel_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

-- Admin/owner pinleri kaldırabilir
CREATE POLICY "pin_delete" ON public.chat_pins
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      JOIN public.chat_channels cc ON cc.organization_id = om.organization_id
      WHERE cc.id = chat_pins.channel_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );


-- ╔══════════════════════════════════════════════════════════
-- ║ 042_drop_workspace_unique_index.sql
-- ╚══════════════════════════════════════════════════════════

-- Workspace kanalları artık birden fazla olabilir (Slack gibi named channels)
-- Eski unique index yalnızca tek workspace kanalına izin veriyordu, kaldırılıyor.
DROP INDEX IF EXISTS public.chat_workspace_per_org;

-- Yeni indeks: sadece performans için (artık unique değil)
CREATE INDEX IF NOT EXISTS chat_channels_org_type
  ON public.chat_channels(organization_id, type);


-- ╔══════════════════════════════════════════════════════════
-- ║ 043_checklists.sql
-- ╚══════════════════════════════════════════════════════════

-- ── 043_checklists.sql ──────────────────────────────────────────────────────
-- Kişisel ve paylaşımlı checklist (yapılacaklar listesi) özelliği

-- ── Checklist tablosu ─────────────────────────────────────────────────────────
CREATE TABLE public.checklists (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by      UUID NOT NULL REFERENCES auth.users(id),
  title           TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  color           TEXT NOT NULL DEFAULT '#2288c9',
  tag             TEXT,
  is_shared       BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ── Checklist item tablosu ────────────────────────────────────────────────────
CREATE TABLE public.checklist_items (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  checklist_id UUID NOT NULL REFERENCES public.checklists(id) ON DELETE CASCADE,
  text         TEXT NOT NULL CHECK (char_length(text) BETWEEN 1 AND 500),
  is_checked   BOOLEAN NOT NULL DEFAULT false,
  position     INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX checklist_items_by_checklist
  ON public.checklist_items(checklist_id, position ASC);

CREATE INDEX checklists_by_org_creator
  ON public.checklists(organization_id, created_by);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.checklists      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_items ENABLE ROW LEVEL SECURITY;

-- SELECT: Shared → tüm org üyeleri; Personal → yalnızca creator
CREATE POLICY "checklists_select" ON public.checklists
  FOR SELECT USING (
    (is_shared = true AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = checklists.organization_id
        AND om.user_id = auth.uid()
    ))
    OR
    (is_shared = false AND created_by = auth.uid())
  );

-- INSERT: org üyesi, kendi created_by'ı ile
CREATE POLICY "checklists_insert" ON public.checklists
  FOR INSERT WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = checklists.organization_id
        AND om.user_id = auth.uid()
    )
  );

-- UPDATE: yalnızca creator
CREATE POLICY "checklists_update" ON public.checklists
  FOR UPDATE USING (created_by = auth.uid());

-- DELETE: creator veya org admin
CREATE POLICY "checklists_delete" ON public.checklists
  FOR DELETE USING (
    created_by = auth.uid()
    OR public.is_org_admin(organization_id)
  );

-- Items SELECT: parent checklist'e erişim varsa görünür
CREATE POLICY "checklist_items_select" ON public.checklist_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.checklists cl
      WHERE cl.id = checklist_items.checklist_id
        AND (
          (cl.is_shared = true AND EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.organization_id = cl.organization_id AND om.user_id = auth.uid()
          ))
          OR (cl.is_shared = false AND cl.created_by = auth.uid())
        )
    )
  );

-- Items INSERT: parent checklist'e erişim varsa ekleyebilir
CREATE POLICY "checklist_items_insert" ON public.checklist_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.checklists cl
      WHERE cl.id = checklist_items.checklist_id
        AND (
          (cl.is_shared = true AND EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.organization_id = cl.organization_id AND om.user_id = auth.uid()
          ))
          OR (cl.is_shared = false AND cl.created_by = auth.uid())
        )
    )
  );

-- Items UPDATE: parent checklist'e erişim varsa güncelleyebilir (shared → herkes işaretleyebilir)
CREATE POLICY "checklist_items_update" ON public.checklist_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.checklists cl
      WHERE cl.id = checklist_items.checklist_id
        AND (
          (cl.is_shared = true AND EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.organization_id = cl.organization_id AND om.user_id = auth.uid()
          ))
          OR (cl.is_shared = false AND cl.created_by = auth.uid())
        )
    )
  );

-- Items DELETE: parent checklist'e erişim varsa silebilir
CREATE POLICY "checklist_items_delete" ON public.checklist_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.checklists cl
      WHERE cl.id = checklist_items.checklist_id
        AND (
          (cl.is_shared = true AND EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.organization_id = cl.organization_id AND om.user_id = auth.uid()
          ))
          OR (cl.is_shared = false AND cl.created_by = auth.uid())
        )
    )
  );


-- ╔══════════════════════════════════════════════════════════
-- ║ 044_meetings.sql
-- ╚══════════════════════════════════════════════════════════

-- ── 044_meetings.sql ──────────────────────────────────────────────────────────
-- Google Meet entegrasyonlu toplantı yönetimi

-- ── Toplantılar tablosu ────────────────────────────────────────────────────────
CREATE TABLE public.meetings (
  id                       UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by               UUID NOT NULL REFERENCES auth.users(id),
  title                    TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description              TEXT,
  start_time               TIMESTAMPTZ NOT NULL,
  end_time                 TIMESTAMPTZ NOT NULL,
  google_meet_link         TEXT,
  google_calendar_event_id TEXT,
  notes                    TEXT,
  status                   TEXT NOT NULL DEFAULT 'scheduled'
                           CHECK (status IN ('scheduled', 'active', 'ended')),
  created_at               TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ── Katılımcılar tablosu ──────────────────────────────────────────────────────
CREATE TABLE public.meeting_attendees (
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id),
  PRIMARY KEY (meeting_id, user_id)
);

-- ── Google Calendar token'ları ────────────────────────────────────────────────
CREATE TABLE public.gcal_tokens (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES auth.users(id),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  access_token    TEXT NOT NULL,
  refresh_token   TEXT,
  expiry          TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE (user_id, organization_id)
);

-- ── İndeksler ─────────────────────────────────────────────────────────────────
CREATE INDEX meetings_by_org       ON public.meetings(organization_id, start_time);
CREATE INDEX meetings_by_creator   ON public.meetings(created_by);
CREATE INDEX meeting_attendees_uid ON public.meeting_attendees(user_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.meetings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gcal_tokens       ENABLE ROW LEVEL SECURITY;

-- meetings: org üyeleri görebilir
CREATE POLICY "meetings_select" ON public.meetings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = meetings.organization_id
        AND om.user_id = auth.uid()
    )
  );

-- meetings: org üyesi oluşturabilir
CREATE POLICY "meetings_insert" ON public.meetings
  FOR INSERT WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = meetings.organization_id
        AND om.user_id = auth.uid()
    )
  );

-- meetings: creator veya org admin güncelleyebilir
CREATE POLICY "meetings_update" ON public.meetings
  FOR UPDATE USING (
    created_by = auth.uid()
    OR public.is_org_admin(organization_id)
  );

-- meetings: creator veya org admin silebilir
CREATE POLICY "meetings_delete" ON public.meetings
  FOR DELETE USING (
    created_by = auth.uid()
    OR public.is_org_admin(organization_id)
  );

-- meeting_attendees: toplantıya erişimi olan görür
CREATE POLICY "meeting_attendees_select" ON public.meeting_attendees
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.meetings m
      JOIN public.organization_members om ON om.organization_id = m.organization_id
      WHERE m.id = meeting_attendees.meeting_id
        AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "meeting_attendees_insert" ON public.meeting_attendees
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = meeting_attendees.meeting_id
        AND (m.created_by = auth.uid() OR public.is_org_admin(m.organization_id))
    )
  );

CREATE POLICY "meeting_attendees_delete" ON public.meeting_attendees
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = meeting_attendees.meeting_id
        AND (m.created_by = auth.uid() OR public.is_org_admin(m.organization_id))
    )
  );

-- gcal_tokens: sadece sahibi görebilir/düzenleyebilir
CREATE POLICY "gcal_tokens_select" ON public.gcal_tokens
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "gcal_tokens_insert" ON public.gcal_tokens
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "gcal_tokens_update" ON public.gcal_tokens
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "gcal_tokens_delete" ON public.gcal_tokens
  FOR DELETE USING (user_id = auth.uid());


-- ╔══════════════════════════════════════════════════════════
-- ║ 045_automation.sql
-- ╚══════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 045 · Otomasyon & Bildirim Genişletmesi
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. notifications event_type constraint'ini genişlet
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_event_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_event_type_check CHECK (
    event_type IN (
      -- Mevcut event'ler
      'task_assigned',
      'task_status_changed',
      'task_overdue',
      'review_reply',
      'mention',
      'annotation_resolved',
      'new_version',
      'sprint_changed',
      -- Yeni otomasyon event'leri
      'task_due_soon',        -- Görev 24 saat içinde bitiyor
      'sprint_ending_soon',   -- Sprint 2 gün içinde bitiyor
      'meeting_created',      -- Toplantıya davet edildi
      'meeting_cancelled',    -- Toplantı iptal edildi
      'meeting_reminder',     -- Toplantı 1 saat içinde başlıyor
      'member_overloaded'     -- Üye aşırı görev yüklendi (admin'e bildirim)
    )
  );

-- 2. email_preferences tablosuna yeni event sütunları ekle
ALTER TABLE public.email_preferences
  ADD COLUMN IF NOT EXISTS task_due_soon      BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS sprint_ending_soon BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS meeting_created    BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS member_overloaded  BOOLEAN DEFAULT true;

-- 3. automation_settings — org bazında otomasyon toggle'ları
CREATE TABLE IF NOT EXISTS public.automation_settings (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id       UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  task_overdue          BOOLEAN DEFAULT true,
  task_due_soon         BOOLEAN DEFAULT true,
  sprint_ending_soon    BOOLEAN DEFAULT true,
  meeting_notifications BOOLEAN DEFAULT true,
  member_overload       BOOLEAN DEFAULT true,
  overload_threshold    INTEGER DEFAULT 5,
  created_at            TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE (organization_id)
);

ALTER TABLE public.automation_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can read automation_settings"
  ON public.automation_settings FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "org admins can manage automation_settings"
  ON public.automation_settings FOR ALL
  USING (is_org_admin(organization_id));


-- ╔══════════════════════════════════════════════════════════
-- ║ 046_org_logos.sql
-- ╚══════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 046 · Org Logo Storage Bucket
-- ─────────────────────────────────────────────────────────────────────────────

-- Bucket oluştur (5 MB limit, public)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'org-logos',
  'org-logos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- Mevcut politikaları temizle
DROP POLICY IF EXISTS "org_logos_public_read"           ON storage.objects;
DROP POLICY IF EXISTS "org_logos_admin_upload"          ON storage.objects;
DROP POLICY IF EXISTS "org_logos_admin_delete"          ON storage.objects;
DROP POLICY IF EXISTS "org_logos_authenticated_manage"  ON storage.objects;

-- Herkes okuyabilir (logo public URL ile görüntülenir)
CREATE POLICY "org_logos_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'org-logos');

-- Kimlik doğrulanmış kullanıcılar yükleyebilir
-- (API katmanında zaten admin kontrolü yapılıyor)
CREATE POLICY "org_logos_authenticated_manage"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'org-logos')
  WITH CHECK (bucket_id = 'org-logos');


-- ╔══════════════════════════════════════════════════════════
-- ║ 047_fix_email_defaults.sql
-- ╚══════════════════════════════════════════════════════════

-- ── 047: E-posta tercihleri varsayılan düzeltmesi ───────────────────────────────
-- email_enabled default'u false → true yap
-- Mevcut false olan satırları da true yap (kullanıcılar henüz bilinçli kapatmadı)

ALTER TABLE public.email_preferences
  ALTER COLUMN email_enabled SET DEFAULT true;

-- Mevcut kayıtları güncelle (varsayılan false ile oluşmuş olanlar)
UPDATE public.email_preferences
  SET email_enabled = true
  WHERE email_enabled = false;


-- ╔══════════════════════════════════════════════════════════
-- ║ 048_notifications_org_id.sql
-- ╚══════════════════════════════════════════════════════════

-- 048: notifications tablosuna org_id ekle
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS notifications_org_idx ON public.notifications(org_id, user_id);


-- ╔══════════════════════════════════════════════════════════
-- ║ 049_notifications_entity_key.sql
-- ╚══════════════════════════════════════════════════════════

-- 049: notifications tablosuna entity_key ekle (cron cooldown için zorunlu)
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS entity_key TEXT;

CREATE INDEX IF NOT EXISTS notifications_entity_key_idx
  ON public.notifications(user_id, entity_key)
  WHERE entity_key IS NOT NULL;

