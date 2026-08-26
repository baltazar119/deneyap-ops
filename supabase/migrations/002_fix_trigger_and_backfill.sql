-- ============================================
-- FIX: Trigger + Mevcut kullanıcıları backfill
-- ============================================
-- Bu dosyayı Supabase SQL Editor'de çalıştırın.
-- ============================================

-- 1) Eski trigger'ı ve fonksiyonu tamamen sıfırla
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

-- 2) Fonksiyonu yeniden oluştur (daha sağlam versiyon)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  -- Eğer zaten varsa insert etme (idempotent)
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

-- 3) Trigger'ı yeniden oluştur
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4) Mevcut auth.users içinde profiles tablosunda kaydı olmayan
--    kullanıcıları backfill et
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

-- 5) Kontrol: Kaç kullanıcı var vs kaç profil var
select
  (select count(*) from auth.users) as auth_users_count,
  (select count(*) from public.profiles) as profiles_count;
