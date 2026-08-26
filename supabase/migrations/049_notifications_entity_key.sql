-- 049: notifications tablosuna entity_key ekle (cron cooldown için zorunlu)
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS entity_key TEXT;

CREATE INDEX IF NOT EXISTS notifications_entity_key_idx
  ON public.notifications(user_id, entity_key)
  WHERE entity_key IS NOT NULL;
