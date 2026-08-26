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
