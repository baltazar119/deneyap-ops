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
