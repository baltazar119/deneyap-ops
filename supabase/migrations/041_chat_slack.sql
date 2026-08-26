-- ── Slack Benzeri Chat — Şema Güncellemeleri ─────────────────────────────────

-- ── 1. chat_channels: named channel desteği ──────────────────────────────────
ALTER TABLE public.chat_channels
  ADD COLUMN IF NOT EXISTS name        TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Mevcut workspace kanallarına varsayılan isim ver
UPDATE public.chat_channels SET name = 'Genel' WHERE type = 'workspace' AND name IS NULL;

-- ── 2. chat_messages: thread desteği ─────────────────────────────────────────
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS parent_message_id UUID REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS thread_count      INTEGER DEFAULT 0 NOT NULL;

CREATE INDEX IF NOT EXISTS chat_messages_thread
  ON public.chat_messages(parent_message_id)
  WHERE parent_message_id IS NOT NULL;

-- ── 3. profiles: user status ──────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS chat_status       TEXT DEFAULT 'online'
    CHECK (chat_status IN ('online','away','dnd','offline')),
  ADD COLUMN IF NOT EXISTS status_emoji      TEXT,
  ADD COLUMN IF NOT EXISTS status_text       TEXT,
  ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ;

-- ── 4. chat_reactions tablosu ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_reactions (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID REFERENCES public.chat_messages(id) ON DELETE CASCADE NOT NULL,
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  emoji      TEXT NOT NULL CHECK (char_length(emoji) <= 10),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE (message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS chat_reactions_message ON public.chat_reactions(message_id);

ALTER TABLE public.chat_reactions ENABLE ROW LEVEL SECURITY;

-- Mesajı görebilen herkes reactionları görebilir
CREATE POLICY "reaction_select" ON public.chat_reactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.chat_messages cm
      JOIN public.chat_channels cc ON cc.id = cm.channel_id
      JOIN public.organization_members om ON om.organization_id = cc.organization_id
      WHERE cm.id = chat_reactions.message_id
        AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "reaction_insert" ON public.chat_reactions
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "reaction_delete" ON public.chat_reactions
  FOR DELETE USING (user_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_reactions;

-- ── 5. chat_pins tablosu ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_pins (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id UUID REFERENCES public.chat_channels(id) ON DELETE CASCADE NOT NULL,
  message_id UUID REFERENCES public.chat_messages(id) ON DELETE CASCADE NOT NULL,
  pinned_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE (channel_id, message_id)
);

CREATE INDEX IF NOT EXISTS chat_pins_channel ON public.chat_pins(channel_id);

ALTER TABLE public.chat_pins ENABLE ROW LEVEL SECURITY;

-- Org üyesi pinleri görebilir
CREATE POLICY "pin_select" ON public.chat_pins
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.chat_channels cc
      JOIN public.organization_members om ON om.organization_id = cc.organization_id
      WHERE cc.id = chat_pins.channel_id AND om.user_id = auth.uid()
    )
  );

-- Admin/owner pinleyebilir
CREATE POLICY "pin_insert" ON public.chat_pins
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      JOIN public.chat_channels cc ON cc.organization_id = om.organization_id
      WHERE cc.id = chat_pins.channel_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

-- Admin/owner pinleri kaldırabilir
CREATE POLICY "pin_delete" ON public.chat_pins
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      JOIN public.chat_channels cc ON cc.organization_id = om.organization_id
      WHERE cc.id = chat_pins.channel_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );
