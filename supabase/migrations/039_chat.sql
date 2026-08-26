-- ── Chat Modülü ──────────────────────────────────────────────────────────────
-- Kanal tablosu: workspace (ekip geneli) veya dm (ikili özel sohbet)

CREATE TABLE public.chat_channels (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  type            TEXT CHECK (type IN ('workspace', 'dm')) NOT NULL,
  -- DM için iki katılımcı (participant_a < participant_b — UUID karşılaştırma ile sıralı)
  participant_a   UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  participant_b   UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Workspace kanalı: org başına en fazla bir tane
CREATE UNIQUE INDEX chat_workspace_per_org
  ON public.chat_channels(organization_id)
  WHERE type = 'workspace';

-- DM: aynı org içinde aynı çift için tek kanal
CREATE UNIQUE INDEX chat_dm_unique_pair
  ON public.chat_channels(organization_id, participant_a, participant_b)
  WHERE type = 'dm';

-- ── Mesaj tablosu ─────────────────────────────────────────────────────────────

CREATE TABLE public.chat_messages (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id UUID REFERENCES public.chat_channels(id) ON DELETE CASCADE NOT NULL,
  sender_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  content    TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX chat_messages_channel_created
  ON public.chat_messages(channel_id, created_at DESC);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.chat_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages  ENABLE ROW LEVEL SECURITY;

-- chat_channels SELECT: org üyesi workspace kanalını görür; DM → yalnızca katılımcılar
CREATE POLICY "chat_channel_select" ON public.chat_channels
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = chat_channels.organization_id
        AND om.user_id = auth.uid()
    )
    AND (
      type = 'workspace'
      OR participant_a = auth.uid()
      OR participant_b = auth.uid()
    )
  );

-- chat_channels INSERT: org üyesi yeni kanal açabilir
CREATE POLICY "chat_channel_insert" ON public.chat_channels
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = chat_channels.organization_id
        AND om.user_id = auth.uid()
    )
  );

-- chat_messages SELECT: kanalı görebiliyorsa mesajları da görür
CREATE POLICY "chat_message_select" ON public.chat_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.chat_channels cc
      WHERE cc.id = chat_messages.channel_id
        AND EXISTS (
          SELECT 1 FROM public.organization_members om
          WHERE om.organization_id = cc.organization_id
            AND om.user_id = auth.uid()
        )
        AND (
          cc.type = 'workspace'
          OR cc.participant_a = auth.uid()
          OR cc.participant_b = auth.uid()
        )
    )
  );

-- chat_messages INSERT: sender_id = kendi uid'si olmalı, kanalı görebilmeli
CREATE POLICY "chat_message_insert" ON public.chat_messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.chat_channels cc
      WHERE cc.id = chat_messages.channel_id
        AND EXISTS (
          SELECT 1 FROM public.organization_members om
          WHERE om.organization_id = cc.organization_id
            AND om.user_id = auth.uid()
        )
        AND (
          cc.type = 'workspace'
          OR cc.participant_a = auth.uid()
          OR cc.participant_b = auth.uid()
        )
    )
  );

-- ── Realtime ─────────────────────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
