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
