-- ── 044_meetings.sql ──────────────────────────────────────────────────────────
-- Google Meet entegrasyonlu toplantı yönetimi

-- ── Toplantılar tablosu ────────────────────────────────────────────────────────
CREATE TABLE public.meetings (
  id                       UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by               UUID NOT NULL REFERENCES auth.users(id),
  title                    TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description              TEXT,
  start_time               TIMESTAMPTZ NOT NULL,
  end_time                 TIMESTAMPTZ NOT NULL,
  google_meet_link         TEXT,
  google_calendar_event_id TEXT,
  notes                    TEXT,
  status                   TEXT NOT NULL DEFAULT 'scheduled'
                           CHECK (status IN ('scheduled', 'active', 'ended')),
  created_at               TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ── Katılımcılar tablosu ──────────────────────────────────────────────────────
CREATE TABLE public.meeting_attendees (
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id),
  PRIMARY KEY (meeting_id, user_id)
);

-- ── Google Calendar token'ları ────────────────────────────────────────────────
CREATE TABLE public.gcal_tokens (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES auth.users(id),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  access_token    TEXT NOT NULL,
  refresh_token   TEXT,
  expiry          TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE (user_id, organization_id)
);

-- ── İndeksler ─────────────────────────────────────────────────────────────────
CREATE INDEX meetings_by_org       ON public.meetings(organization_id, start_time);
CREATE INDEX meetings_by_creator   ON public.meetings(created_by);
CREATE INDEX meeting_attendees_uid ON public.meeting_attendees(user_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.meetings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gcal_tokens       ENABLE ROW LEVEL SECURITY;

-- meetings: org üyeleri görebilir
CREATE POLICY "meetings_select" ON public.meetings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = meetings.organization_id
        AND om.user_id = auth.uid()
    )
  );

-- meetings: org üyesi oluşturabilir
CREATE POLICY "meetings_insert" ON public.meetings
  FOR INSERT WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = meetings.organization_id
        AND om.user_id = auth.uid()
    )
  );

-- meetings: creator veya org admin güncelleyebilir
CREATE POLICY "meetings_update" ON public.meetings
  FOR UPDATE USING (
    created_by = auth.uid()
    OR public.is_org_admin(organization_id)
  );

-- meetings: creator veya org admin silebilir
CREATE POLICY "meetings_delete" ON public.meetings
  FOR DELETE USING (
    created_by = auth.uid()
    OR public.is_org_admin(organization_id)
  );

-- meeting_attendees: toplantıya erişimi olan görür
CREATE POLICY "meeting_attendees_select" ON public.meeting_attendees
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.meetings m
      JOIN public.organization_members om ON om.organization_id = m.organization_id
      WHERE m.id = meeting_attendees.meeting_id
        AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "meeting_attendees_insert" ON public.meeting_attendees
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = meeting_attendees.meeting_id
        AND (m.created_by = auth.uid() OR public.is_org_admin(m.organization_id))
    )
  );

CREATE POLICY "meeting_attendees_delete" ON public.meeting_attendees
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = meeting_attendees.meeting_id
        AND (m.created_by = auth.uid() OR public.is_org_admin(m.organization_id))
    )
  );

-- gcal_tokens: sadece sahibi görebilir/düzenleyebilir
CREATE POLICY "gcal_tokens_select" ON public.gcal_tokens
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "gcal_tokens_insert" ON public.gcal_tokens
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "gcal_tokens_update" ON public.gcal_tokens
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "gcal_tokens_delete" ON public.gcal_tokens
  FOR DELETE USING (user_id = auth.uid());
