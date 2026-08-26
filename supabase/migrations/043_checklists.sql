-- ── 043_checklists.sql ──────────────────────────────────────────────────────
-- Kişisel ve paylaşımlı checklist (yapılacaklar listesi) özelliği

-- ── Checklist tablosu ─────────────────────────────────────────────────────────
CREATE TABLE public.checklists (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by      UUID NOT NULL REFERENCES auth.users(id),
  title           TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  color           TEXT NOT NULL DEFAULT '#2288c9',
  tag             TEXT,
  is_shared       BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ── Checklist item tablosu ────────────────────────────────────────────────────
CREATE TABLE public.checklist_items (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  checklist_id UUID NOT NULL REFERENCES public.checklists(id) ON DELETE CASCADE,
  text         TEXT NOT NULL CHECK (char_length(text) BETWEEN 1 AND 500),
  is_checked   BOOLEAN NOT NULL DEFAULT false,
  position     INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX checklist_items_by_checklist
  ON public.checklist_items(checklist_id, position ASC);

CREATE INDEX checklists_by_org_creator
  ON public.checklists(organization_id, created_by);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.checklists      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_items ENABLE ROW LEVEL SECURITY;

-- SELECT: Shared → tüm org üyeleri; Personal → yalnızca creator
CREATE POLICY "checklists_select" ON public.checklists
  FOR SELECT USING (
    (is_shared = true AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = checklists.organization_id
        AND om.user_id = auth.uid()
    ))
    OR
    (is_shared = false AND created_by = auth.uid())
  );

-- INSERT: org üyesi, kendi created_by'ı ile
CREATE POLICY "checklists_insert" ON public.checklists
  FOR INSERT WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = checklists.organization_id
        AND om.user_id = auth.uid()
    )
  );

-- UPDATE: yalnızca creator
CREATE POLICY "checklists_update" ON public.checklists
  FOR UPDATE USING (created_by = auth.uid());

-- DELETE: creator veya org admin
CREATE POLICY "checklists_delete" ON public.checklists
  FOR DELETE USING (
    created_by = auth.uid()
    OR public.is_org_admin(organization_id)
  );

-- Items SELECT: parent checklist'e erişim varsa görünür
CREATE POLICY "checklist_items_select" ON public.checklist_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.checklists cl
      WHERE cl.id = checklist_items.checklist_id
        AND (
          (cl.is_shared = true AND EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.organization_id = cl.organization_id AND om.user_id = auth.uid()
          ))
          OR (cl.is_shared = false AND cl.created_by = auth.uid())
        )
    )
  );

-- Items INSERT: parent checklist'e erişim varsa ekleyebilir
CREATE POLICY "checklist_items_insert" ON public.checklist_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.checklists cl
      WHERE cl.id = checklist_items.checklist_id
        AND (
          (cl.is_shared = true AND EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.organization_id = cl.organization_id AND om.user_id = auth.uid()
          ))
          OR (cl.is_shared = false AND cl.created_by = auth.uid())
        )
    )
  );

-- Items UPDATE: parent checklist'e erişim varsa güncelleyebilir (shared → herkes işaretleyebilir)
CREATE POLICY "checklist_items_update" ON public.checklist_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.checklists cl
      WHERE cl.id = checklist_items.checklist_id
        AND (
          (cl.is_shared = true AND EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.organization_id = cl.organization_id AND om.user_id = auth.uid()
          ))
          OR (cl.is_shared = false AND cl.created_by = auth.uid())
        )
    )
  );

-- Items DELETE: parent checklist'e erişim varsa silebilir
CREATE POLICY "checklist_items_delete" ON public.checklist_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.checklists cl
      WHERE cl.id = checklist_items.checklist_id
        AND (
          (cl.is_shared = true AND EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.organization_id = cl.organization_id AND om.user_id = auth.uid()
          ))
          OR (cl.is_shared = false AND cl.created_by = auth.uid())
        )
    )
  );
