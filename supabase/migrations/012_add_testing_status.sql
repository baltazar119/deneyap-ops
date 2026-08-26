-- tasks.status alanina 'testing' degerini ekle
-- Mevcut check constraint'i kaldirip yenisini ekle
alter table public.tasks
  drop constraint if exists tasks_status_check;

alter table public.tasks
  add constraint tasks_status_check
  check (status in ('backlog', 'doing', 'testing', 'blocked', 'done'));
