-- ── 018: E-posta Bildirim Tercihleri ──────────────────────────────────────────

-- profiles tablosuna email kolonu ekle (send-email route'un kullanıcı emailine ihtiyacı var)
alter table public.profiles
  add column if not exists email text;

-- ── email_preferences ────────────────────────────────────────────────────────

create table if not exists public.email_preferences (
  id                   uuid        default gen_random_uuid() primary key,
  user_id              uuid        references auth.users(id) on delete cascade not null unique,

  -- Master toggle
  email_enabled        boolean     default false not null,

  -- Event toggles
  task_assigned        boolean     default true  not null,
  mention              boolean     default true  not null,
  review_reply         boolean     default true  not null,
  annotation_resolved  boolean     default true  not null,
  sprint_changed       boolean     default true  not null,
  new_version          boolean     default false not null,

  -- Frequency: instant | daily | weekly
  frequency            text        default 'instant' not null,

  created_at           timestamptz default now() not null,
  updated_at           timestamptz default now() not null,

  constraint email_preferences_frequency_check
    check (frequency in ('instant', 'daily', 'weekly'))
);

alter table public.email_preferences enable row level security;

create policy "email_pref_select"
  on public.email_preferences for select
  using (auth.uid() = user_id);

create policy "email_pref_insert"
  on public.email_preferences for insert
  with check (auth.uid() = user_id);

create policy "email_pref_update"
  on public.email_preferences for update
  using (auth.uid() = user_id);

-- ── email_log (cooldown + gönderim kaydı) ────────────────────────────────────

create table if not exists public.email_log (
  id           uuid        default gen_random_uuid() primary key,
  user_id      uuid        references auth.users(id) on delete cascade not null,
  event_type   text        not null,
  entity_key   text,                      -- örn: "task:uuid" ya da "digest"
  sent_at      timestamptz default now()  not null
);

alter table public.email_log enable row level security;

-- Sadece service role okuyabilir / insert edebilir (API route service role kullanır)
create policy "email_log_insert"
  on public.email_log for insert
  with check (true);

create policy "email_log_select"
  on public.email_log for select
  using (auth.uid() = user_id);

create index if not exists email_log_cooldown_idx
  on public.email_log(user_id, event_type, entity_key, sent_at desc);
