-- ─────────────────────────────────────────────────────────────────────────────
-- 046 · Org Logo Storage Bucket
-- ─────────────────────────────────────────────────────────────────────────────

-- Bucket oluştur (5 MB limit, public)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'org-logos',
  'org-logos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- Mevcut politikaları temizle
DROP POLICY IF EXISTS "org_logos_public_read"           ON storage.objects;
DROP POLICY IF EXISTS "org_logos_admin_upload"          ON storage.objects;
DROP POLICY IF EXISTS "org_logos_admin_delete"          ON storage.objects;
DROP POLICY IF EXISTS "org_logos_authenticated_manage"  ON storage.objects;

-- Herkes okuyabilir (logo public URL ile görüntülenir)
CREATE POLICY "org_logos_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'org-logos');

-- Kimlik doğrulanmış kullanıcılar yükleyebilir
-- (API katmanında zaten admin kontrolü yapılıyor)
CREATE POLICY "org_logos_authenticated_manage"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'org-logos')
  WITH CHECK (bucket_id = 'org-logos');
