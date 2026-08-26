-- Migration 007: Task enhancements
-- Adds priority, task_type, estimated_hours, actual_hours to tasks table

alter table public.tasks
  add column if not exists priority text not null default 'normal'
    check (priority in ('critical', 'high', 'normal', 'low')),
  add column if not exists task_type text not null default 'other'
    check (task_type in ('mechanical', 'electrical', 'software', 'research', 'documentation', 'test', 'other')),
  add column if not exists estimated_hours numeric(5,1) default null,
  add column if not exists actual_hours numeric(5,1) default null;

-- Add comments for clarity
comment on column public.tasks.priority is 'critical | high | normal | low';
comment on column public.tasks.task_type is 'mechanical | electrical | software | research | documentation | test | other';
comment on column public.tasks.estimated_hours is 'Estimated time in hours';
comment on column public.tasks.actual_hours is 'Actual time spent in hours (manually entered)';
