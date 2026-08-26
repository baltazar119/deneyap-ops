-- 048: notifications tablosuna org_id ekle
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS notifications_org_idx ON public.notifications(org_id, user_id);
