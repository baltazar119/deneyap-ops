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
