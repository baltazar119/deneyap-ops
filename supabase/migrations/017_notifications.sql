-- ── 017: Bildirim Merkezi (Notification Center) ──────────────────────────────

create table if not exists public.notifications (
  id            uuid        default gen_random_uuid() primary key,
  user_id       uuid        references auth.users(id) on delete cascade not null,
  type          text        not null,
  event_type    text        not null,
  title         text        not null,
  description   text,
  actor_id      uuid        references auth.users(id) on delete set null,
  actor_name    text,
  link          text,
  is_read       boolean     default false not null,
  created_at    timestamptz default now() not null,

  constraint notifications_type_check check (
    type in ('task', 'review', 'sprint', 'system')
  ),
  constraint notifications_event_type_check check (
    event_type in (
      'task_assigned',
      'task_status_changed',
      'task_overdue',
      'review_reply',
      'mention',
      'annotation_resolved',
      'new_version',
      'sprint_changed'
    )
  )
);

-- Row Level Security
alter table public.notifications enable row level security;

create policy "notif_select"
  on public.notifications for select
  using (auth.uid() = user_id);

create policy "notif_insert"
  on public.notifications for insert
  with check (auth.uid() is not null);

create policy "notif_update"
  on public.notifications for update
  using (auth.uid() = user_id);

create policy "notif_delete"
  on public.notifications for delete
  using (auth.uid() = user_id);

-- Indexes
create index if not exists notifications_user_created_idx
  on public.notifications(user_id, created_at desc);

create index if not exists notifications_unread_idx
  on public.notifications(user_id, is_read)
  where not is_read;

-- Enable Supabase Realtime for live push
alter publication supabase_realtime add table public.notifications;
