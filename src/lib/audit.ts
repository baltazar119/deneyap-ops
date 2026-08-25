import { createClient } from '@supabase/supabase-js'

export type AuditAction =
  | 'member_invited'
  | 'member_removed'
  | 'member_role_changed'
  | 'org_created'
  | 'org_deleted'
  | 'data_exported'
  | 'account_deleted'
  | 'password_changed'
  | 'task_deleted'
  | 'sprint_deleted'
  | 'join_code_rotated'
  | 'owner_claimed'

interface AuditEntry {
  userId: string | null
  orgId?: string | null
  action: AuditAction
  entityType?: string
  entityId?: string
  metadata?: Record<string, unknown>
  ipAddress?: string
}

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * Kritik bir aksiyonu audit_logs tablosuna yazar.
 * Hata fırlatmaz — loglama başarısız olsa bile iş akışı devam eder.
 */
export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    const admin = getAdminClient()
    await admin.from('audit_logs').insert({
      user_id:     entry.userId,
      org_id:      entry.orgId ?? null,
      action:      entry.action,
      entity_type: entry.entityType ?? null,
      entity_id:   entry.entityId ?? null,
      metadata:    entry.metadata ?? null,
      ip_address:  entry.ipAddress ?? null,
    })
  } catch (err) {
    // Audit log hataları sessizce geçilir — asıl işlemi engellemez
    console.error('[AuditLog] Write failed:', err)
  }
}
