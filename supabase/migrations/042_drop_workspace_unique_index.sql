-- Workspace kanalları artık birden fazla olabilir (Slack gibi named channels)
-- Eski unique index yalnızca tek workspace kanalına izin veriyordu, kaldırılıyor.
DROP INDEX IF EXISTS public.chat_workspace_per_org;

-- Yeni indeks: sadece performans için (artık unique değil)
CREATE INDEX IF NOT EXISTS chat_channels_org_type
  ON public.chat_channels(organization_id, type);
