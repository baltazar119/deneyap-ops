-- ============================================================
-- Migration 030: AI Asistan Eklenti Paketi
-- profiles.ai_addon: kullanıcı bazlı AI eklentisi flag'i
-- ai_usage_logs: AI çağrı izleme tablosu
-- ============================================================

-- 1. profiles'a ai_addon kolonu
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ai_addon BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. AI kullanım logu tablosu
CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action          TEXT        NOT NULL CHECK (action IN ('generate', 'revise', 'revise_task')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_usage_logs_user_date_idx
  ON public.ai_usage_logs (user_id, created_at);

CREATE INDEX IF NOT EXISTS ai_usage_logs_org_date_idx
  ON public.ai_usage_logs (organization_id, created_at);

ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

-- Sadece org adminleri kendi org'larının loglarını görebilir
CREATE POLICY "ai_usage_select"
  ON public.ai_usage_logs FOR SELECT
  USING (public.is_org_admin(organization_id));
