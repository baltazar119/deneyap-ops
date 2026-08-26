-- Her workspace için tek Drive bağlantısı: organization_id'ye partial UNIQUE INDEX
-- NULL olan satırlar (eski/anonim bağlantılar) etkilenmez
CREATE UNIQUE INDEX IF NOT EXISTS drive_tokens_organization_id_key
  ON public.drive_tokens (organization_id)
  WHERE organization_id IS NOT NULL;
