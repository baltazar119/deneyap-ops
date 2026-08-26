-- ============================================
-- DENEYAP Ops — organization_members.last_accessed_at
-- ============================================
-- Bu kolon kaynak projenin (Tarlis) canlı veritabanına elle eklenmiş
-- ama hiçbir migration dosyasına işlenmemişti. Kod ise kullanıyor:
--
--   • /workspaces  → select ile okuyor ("son giriş" bilgisini göstermek için).
--     Kolon yoksa sorgunun tamamı hata veriyor, kullanıcı hiç workspace'i
--     yokmuş gibi "Hoş Geldin / Yeni Workspace Oluştur" ekranına düşüyor.
--   • /org/[slug]/dashboard → update ile yazıyor (sessizce başarısız oluyor).
--
-- Bu yüzden temiz kurulumda eksik kalıyordu.
-- ============================================

alter table public.organization_members
  add column if not exists last_accessed_at timestamptz;

comment on column public.organization_members.last_accessed_at is
  'Kullanıcının bu workspace''e en son giriş zamanı; /workspaces listesinde gösterilir.';
