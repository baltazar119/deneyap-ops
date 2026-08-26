-- ── 037: Audit Log + KVKK kvkk_accepted_at ─────────────────────────────────

-- 1. Audit log tablosu
CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  org_id      UUID        REFERENCES organizations(id) ON DELETE SET NULL,
  action      TEXT        NOT NULL,
  entity_type TEXT,
  entity_id   TEXT,
  metadata    JSONB,
  ip_address  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index'ler
CREATE INDEX IF NOT EXISTS audit_logs_user_id_idx    ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS audit_logs_org_id_idx     ON audit_logs(org_id);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx     ON audit_logs(action);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs(created_at DESC);

-- RLS: Kullanıcı kendi loglarını, admin org loglarını görebilir
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs_user_own"
  ON audit_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "audit_logs_org_admin"
  ON audit_logs FOR SELECT
  USING (
    org_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_id = audit_logs.org_id
        AND user_id = auth.uid()
        AND role IN ('admin', 'owner')
    )
  );

-- Service role insert (API route'larından yazılır)
CREATE POLICY "audit_logs_service_insert"
  ON audit_logs FOR INSERT
  WITH CHECK (true);

-- 2. KVKK onay tarihi — profiles tablosuna ekle
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS kvkk_accepted_at TIMESTAMPTZ;

COMMENT ON COLUMN profiles.kvkk_accepted_at
  IS 'KVKK Gizlilik Politikası ve Kullanım Şartları kabul tarihi (kayıt sırasında set edilir)';
