-- drive_tokens tablosuna workspace başına klasör ID'lerini saklayan kolon ekle
-- { "orgId1": "driveFolderId1", "orgId2": "driveFolderId2" }
ALTER TABLE public.drive_tokens
  ADD COLUMN IF NOT EXISTS folder_map JSONB DEFAULT '{}';
