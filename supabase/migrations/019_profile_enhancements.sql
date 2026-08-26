-- ============================================
-- DENEYAP Ops — Profil Geliştirmeleri (019)
-- profiles tablosuna yeni alanlar
-- brand_settings tablosu (admin)
-- avatars storage bucket
-- email_preferences'a danışman bildirimleri
-- ============================================

-- ── profiles tablosuna yeni kolonlar ──────────────────────────────────────────

alter table public.profiles
  add column if not exists username           text unique,
  add column if not exists title              text,
  add column if not exists bio                text,
  add column if not exists skills             text[] default '{}',
  add column if not exists avatar_url         text,
  add column if not exists consultant_expertise     text,
  add column if not exists consultant_availability  text,
  add column if not exists consultant_contact_pref  text[] default '{}';

-- username için index
create unique index if not exists profiles_username_idx
  on public.profiles (lower(username))
  where username is not null;

-- ── email_preferences tablosuna danışman bildirimleri ─────────────────────────

alter table public.email_preferences
  add column if not exists question_received   boolean not null default true,
  add column if not exists file_shared         boolean not null default true,
  add column if not exists update_note_shared  boolean not null default false;

-- ── brand_settings tablosu ────────────────────────────────────────────────────

create table if not exists public.brand_settings (
  id           uuid primary key default gen_random_uuid(),
  org_name     text not null default 'DENEYAP Ops',
  logo_url     text,
  primary_color  text not null default '#0d1a2a',
  accent_color   text not null default '#2288c9',
  updated_by   uuid references public.profiles(id),
  updated_at   timestamptz not null default now()
);

-- Sadece 1 satır olacak (singleton); insert yerine upsert kullanılacak
-- RLS
alter table public.brand_settings enable row level security;

create policy "brand_settings_read"
  on public.brand_settings for select
  using (true);

create policy "brand_settings_write"
  on public.brand_settings for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ── avatars storage bucket ───────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit)
values ('avatars', 'avatars', true, 3145728)  -- 3 MB
on conflict (id) do nothing;

-- Herkes okuyabilir (public CDN)
create policy "avatars_public_read"
  on storage.objects for select
  using (bucket_id = 'avatars');

-- Kendi klasörüne yükleyebilir; admin her yere
create policy "avatars_upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (
      public.is_admin()
      or auth.uid()::text = (storage.foldername(name))[1]
    )
  );

-- Kendi dosyasını güncelleyebilir; admin her şeyi
create policy "avatars_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (
      public.is_admin()
      or auth.uid()::text = (storage.foldername(name))[1]
    )
  );

-- Kendi dosyasını silebilir; admin her şeyi
create policy "avatars_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (
      public.is_admin()
      or auth.uid()::text = (storage.foldername(name))[1]
    )
  );
