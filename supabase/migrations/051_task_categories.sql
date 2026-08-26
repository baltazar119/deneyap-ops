-- 051_task_categories.sql
-- DENEYAP görev kategorileri: teknik + operasyon karması.
--
-- Eski küme (Tarlis): mechanical, electrical, software, research, documentation, test, other
-- Yeni küme (DENEYAP): mechanical, electrical, software, training, event, supply,
--                      admin, reporting, other
--
-- Kaldırılan research/documentation/test değerleri 'other'a taşınır.
-- Kod tarafındaki tek kaynak: src/lib/taskTypes.ts

-- ── 1) tasks.task_type ────────────────────────────────────────────────────────

-- Kısıt adı ortama göre değişebildiği için pg_constraint üzerinden bulup düşürüyoruz
do $$
declare c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    where ns.nspname = 'public'
      and rel.relname = 'tasks'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%task_type%'
  loop
    execute format('alter table public.tasks drop constraint %I', c.conname);
  end loop;
end $$;

update public.tasks
   set task_type = 'other'
 where task_type not in ('mechanical','electrical','software','training',
                         'event','supply','admin','reporting','other');

alter table public.tasks
  add constraint tasks_task_type_check
  check (task_type in ('mechanical','electrical','software','training',
                       'event','supply','admin','reporting','other'));

-- ── 2) draft_tasks.category ───────────────────────────────────────────────────

do $$
declare c record;
begin
  if to_regclass('public.draft_tasks') is null then
    return;
  end if;
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    where ns.nspname = 'public'
      and rel.relname = 'draft_tasks'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%category%'
  loop
    execute format('alter table public.draft_tasks drop constraint %I', c.conname);
  end loop;
end $$;

do $$
begin
  if to_regclass('public.draft_tasks') is null then
    return;
  end if;

  update public.draft_tasks
     set category = 'other'
   where category not in ('mechanical','electrical','software','training',
                          'event','supply','admin','reporting','other');

  alter table public.draft_tasks
    add constraint draft_tasks_category_check
    check (category in ('mechanical','electrical','software','training',
                        'event','supply','admin','reporting','other'));
end $$;
