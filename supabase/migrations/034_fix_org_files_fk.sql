-- ============================================================
-- Migration 034: Fix org_files.uploaded_by FK
-- org_files.uploaded_by → auth.users yerine profiles'a işaret etmeli
-- Böylece Supabase PostgREST join'ı çalışır.
-- ============================================================

-- 1. Eski FK'yı kaldır (auth.users'a işaret ediyordu)
ALTER TABLE public.org_files
  DROP CONSTRAINT IF EXISTS org_files_uploaded_by_fkey;

-- 2. Yeni FK: profiles(id)'ye referans ver (profiles.id = auth.users.id)
ALTER TABLE public.org_files
  ADD CONSTRAINT org_files_uploaded_by_fkey
  FOREIGN KEY (uploaded_by)
  REFERENCES public.profiles(id)
  ON DELETE SET NULL;

-- NOT NULL kaldır (kullanıcı silinirse NULL olabilsin)
ALTER TABLE public.org_files
  ALTER COLUMN uploaded_by DROP NOT NULL;
