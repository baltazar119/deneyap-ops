-- ============================================
-- FIX: profiles tablosuna INSERT policy ekle
-- Kullanıcı kendi profilini oluşturabilmeli
-- ============================================

-- Önce varsa eski insert policy'yi kaldır
drop policy if exists "profiles: kullanıcı kendi profilini oluşturur" on public.profiles;

-- Yeni policy: kullanıcı sadece kendi id'siyle insert yapabilir
create policy "profiles: kullanıcı kendi profilini oluşturur"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Admin de insert yapabilsin (opsiyonel ama iyi pratik)
drop policy if exists "profiles: admin profil oluşturur" on public.profiles;
create policy "profiles: admin profil oluşturur"
  on public.profiles for insert
  with check (public.is_admin());
