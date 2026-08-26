-- ── 047: E-posta tercihleri varsayılan düzeltmesi ───────────────────────────────
-- email_enabled default'u false → true yap
-- Mevcut false olan satırları da true yap (kullanıcılar henüz bilinçli kapatmadı)

ALTER TABLE public.email_preferences
  ALTER COLUMN email_enabled SET DEFAULT true;

-- Mevcut kayıtları güncelle (varsayılan false ile oluşmuş olanlar)
UPDATE public.email_preferences
  SET email_enabled = true
  WHERE email_enabled = false;
