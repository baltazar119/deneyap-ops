-- 038_calendar_events.sql
-- Takvim etkinlikleri — görev listesinden bağımsız, saat desteğiyle

CREATE TABLE IF NOT EXISTS calendar_events (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title           TEXT NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by      UUID NOT NULL REFERENCES auth.users(id),
  assignee_id     UUID REFERENCES auth.users(id),
  event_date      DATE NOT NULL,
  is_all_day      BOOLEAN NOT NULL DEFAULT true,
  start_slot      SMALLINT,  -- 0–47 (30 dakikalık dilimler: 0=00:00, 1=00:30, …)
  end_slot        SMALLINT,  -- 0–47
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_select_cal_events" ON calendar_events
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org_members_insert_cal_events" ON calendar_events
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
    AND created_by = auth.uid()
  );

CREATE POLICY "creator_update_cal_events" ON calendar_events
  FOR UPDATE USING (created_by = auth.uid());

CREATE POLICY "creator_delete_cal_events" ON calendar_events
  FOR DELETE USING (created_by = auth.uid());
