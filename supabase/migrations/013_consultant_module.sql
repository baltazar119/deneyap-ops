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
