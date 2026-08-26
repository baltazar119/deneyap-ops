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
