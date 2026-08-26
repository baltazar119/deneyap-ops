-- Migration 028: User-level plan
-- Plan artık workspace'e değil kullanıcıya (profiles) bağlı

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free'
    CHECK (plan IN ('free', 'pro'));

-- Mevcut veriler: pro plana sahip org'ların owner'larını pro yap
UPDATE public.profiles p
SET plan = 'pro'
WHERE p.id IN (
  SELECT om.user_id
  FROM public.organization_members om
  JOIN public.organizations o ON o.id = om.organization_id
  WHERE om.role = 'owner' AND o.plan = 'pro'
);

-- RLS: kullanıcı kendi planını okuyabilir; güncelleme sadece service role
-- (Varsayılan profiles RLS politikaları zaten bunu kapsıyor)
