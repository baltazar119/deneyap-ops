-- ─────────────────────────────────────────────────────────────────────────────
-- 045 · Otomasyon & Bildirim Genişletmesi
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. notifications event_type constraint'ini genişlet
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_event_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_event_type_check CHECK (
    event_type IN (
      -- Mevcut event'ler
      'task_assigned',
      'task_status_changed',
      'task_overdue',
      'review_reply',
      'mention',
      'annotation_resolved',
      'new_version',
      'sprint_changed',
      -- Yeni otomasyon event'leri
      'task_due_soon',        -- Görev 24 saat içinde bitiyor
      'sprint_ending_soon',   -- Sprint 2 gün içinde bitiyor
      'meeting_created',      -- Toplantıya davet edildi
      'meeting_cancelled',    -- Toplantı iptal edildi
      'meeting_reminder',     -- Toplantı 1 saat içinde başlıyor
      'member_overloaded'     -- Üye aşırı görev yüklendi (admin'e bildirim)
    )
  );

-- 2. email_preferences tablosuna yeni event sütunları ekle
ALTER TABLE public.email_preferences
  ADD COLUMN IF NOT EXISTS task_due_soon      BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS sprint_ending_soon BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS meeting_created    BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS member_overloaded  BOOLEAN DEFAULT true;

-- 3. automation_settings — org bazında otomasyon toggle'ları
CREATE TABLE IF NOT EXISTS public.automation_settings (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id       UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  task_overdue          BOOLEAN DEFAULT true,
  task_due_soon         BOOLEAN DEFAULT true,
  sprint_ending_soon    BOOLEAN DEFAULT true,
  meeting_notifications BOOLEAN DEFAULT true,
  member_overload       BOOLEAN DEFAULT true,
  overload_threshold    INTEGER DEFAULT 5,
  created_at            TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE (organization_id)
);

ALTER TABLE public.automation_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can read automation_settings"
  ON public.automation_settings FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "org admins can manage automation_settings"
  ON public.automation_settings FOR ALL
  USING (is_org_admin(organization_id));
