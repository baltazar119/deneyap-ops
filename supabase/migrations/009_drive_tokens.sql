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
