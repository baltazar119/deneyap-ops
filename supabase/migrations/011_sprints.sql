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
