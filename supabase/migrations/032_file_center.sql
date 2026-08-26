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
