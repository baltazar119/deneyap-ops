-- ============================================
-- DENEYAP Ops — Supabase Storage Bucket Tanımları
-- ui-files   : Dosyalar, mesaj ekleri, güncelleme ekleri
-- ui-annotations : Görsel annotasyon görselleri
-- ============================================

-- Bucket oluşturma (mevcut ise atla)
insert into storage.buckets (id, name, public, file_size_limit)
values
  ('ui-files',       'ui-files',       true, 52428800),  -- 50 MB
  ('ui-annotations', 'ui-annotations', true, 52428800)   -- 50 MB
on conflict (id) do nothing;

-- ── ui-files bucket politikaları ─────────────────────────────────────────────

-- Herkes okuyabilir (dosyalar public URL ile paylaşılır)
create policy "ui_files_storage_public_read"
  on storage.objects for select
  using (bucket_id = 'ui-files');

-- Admin ve danışman yükleyebilir
create policy "ui_files_storage_upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'ui-files'
    and (public.is_admin() or public.is_consultant())
  );

-- Admin ve kendi dosyasını silen danışman
create policy "ui_files_storage_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'ui-files'
    and (
      public.is_admin()
      or (public.is_consultant() and auth.uid()::text = (storage.foldername(name))[1])
    )
  );

-- ── ui-annotations bucket politikaları ───────────────────────────────────────

create policy "ui_ann_storage_public_read"
  on storage.objects for select
  using (bucket_id = 'ui-annotations');

create policy "ui_ann_storage_upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'ui-annotations'
    and (public.is_admin() or public.is_consultant())
  );

create policy "ui_ann_storage_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'ui-annotations'
    and (
      public.is_admin()
      or (public.is_consultant() and auth.uid()::text = (storage.foldername(name))[1])
    )
  );
