-- ── Chat Okuma Durumu & Mesaj Silme ──────────────────────────────────────────

-- chat_messages DELETE: gönderen kendi mesajını silebilir; org admin/owner hepsini silebilir
CREATE POLICY "chat_message_delete" ON public.chat_messages
  FOR DELETE USING (
    sender_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.chat_channels cc
      JOIN public.organization_members om ON om.organization_id = cc.organization_id
      WHERE cc.id = chat_messages.channel_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

-- ── Okuma durumu tablosu ──────────────────────────────────────────────────────
-- Her kullanıcı her kanalda hangi mesaja kadar okuduğunu tutar

CREATE TABLE public.chat_message_reads (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id          UUID REFERENCES public.chat_channels(id) ON DELETE CASCADE NOT NULL,
  user_id             UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  last_read_message_id UUID REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  updated_at          TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE (channel_id, user_id)
);

CREATE INDEX chat_reads_channel ON public.chat_message_reads(channel_id);

ALTER TABLE public.chat_message_reads ENABLE ROW LEVEL SECURITY;

-- SELECT: kanalı görebilen üyeler okuma durumlarını görebilir
CREATE POLICY "reads_select" ON public.chat_message_reads
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.chat_channels cc
      WHERE cc.id = chat_message_reads.channel_id
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

-- INSERT: kendi user_id'si ile kayıt ekleyebilir
CREATE POLICY "reads_insert" ON public.chat_message_reads
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- UPDATE: kendi kaydını güncelleyebilir
CREATE POLICY "reads_update" ON public.chat_message_reads
  FOR UPDATE USING (user_id = auth.uid());

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_message_reads;
