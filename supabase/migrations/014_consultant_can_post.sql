-- ============================================
-- DENEYAP Ops — Danışman Yazma Yetkileri
-- Danışmanlar soru açabilir ve dosya yükleyebilir
-- ============================================

-- 1) Danışman: ui_questions INSERT
create policy "ui_questions_consultant_insert" on public.ui_questions
  for insert to authenticated
  with check (public.is_consultant() and created_by = auth.uid());

-- 2) Danışman: ui_files INSERT
create policy "ui_files_consultant_insert" on public.ui_files
  for insert to authenticated
  with check (public.is_consultant() and created_by = auth.uid());
