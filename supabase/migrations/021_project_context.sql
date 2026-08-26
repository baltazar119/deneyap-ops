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
