-- ============================================
-- FIX: full_name kolonu ekle + trigger + backfill
-- ============================================
-- Supabase SQL Editor'de çalıştırın.
-- ============================================

-- 1) full_name kolonu yoksa ekle
alter table public.profiles
  add column if not exists full_name text;

-- 2) Eski trigger ve fonksiyonu temizle
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

-- 3) Yeni fonksiyonu oluştur
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.profiles (id, role, full_name)
  values (
    new.id,
    'member',
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 4) Trigger'ı yeniden kur
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 5) Mevcut kullanıcıları backfill et
insert into public.profiles (id, role, full_name)
select
  u.id,
  'member',
  coalesce(
    u.raw_user_meta_data->>'full_name',
    u.raw_user_meta_data->>'name',
    split_part(u.email, '@', 1)
  )
from auth.users u
where not exists (
  select 1 from public.profiles p where p.id = u.id
)
on conflict (id) do nothing;

-- 6) profiles INSERT policy ekle (eğer yoksa)
drop policy if exists "profiles: kullanıcı kendi profilini oluşturur" on public.profiles;
create policy "profiles: kullanıcı kendi profilini oluşturur"
  on public.profiles for insert
  with check (auth.uid() = id);

-- 7) Kontrol sorgusu
select
  (select count(*) from auth.users) as auth_users_count,
  (select count(*) from public.profiles) as profiles_count;
