import { supabase } from '@/lib/supabase/client'
import type { NotificationType, NotificationEvent } from '@/types/database'

export interface CreateNotificationParams {
  user_id: string
  type: NotificationType
  event_type: NotificationEvent
  title: string
  description?: string | null
  actor_id?: string | null
  actor_name?: string | null
  link?: string | null
  /** Cooldown için entity kimliği, örn. "task:uuid". Belirtilmezse cooldown uygulanmaz. */
  entity_key?: string | null
  /** Workspace kimliği */
  org_id?: string | null
}

/** DB bildirimini kaydeder ve e-posta API'sine fire-and-forget çağrı yapar. */
export async function createNotification(params: CreateNotificationParams): Promise<void> {
  // 1. Notification DB kaydı — hata olsa bile email göndermeyi dene
  const { error } = await supabase.from('notifications').insert({
    user_id:    params.user_id,
    type:       params.type,
    event_type: params.event_type,
    title:      params.title,
    description: params.description ?? null,
    actor_id:   params.actor_id ?? null,
    actor_name: params.actor_name ?? null,
    link:            params.link ?? null,
    is_read:         false,
    organization_id: params.org_id ?? null,
  })
  if (error) {
    console.error('[createNotification] DB insert error:', error.message)
    // return kaldırıldı — DB hatası email göndermeyi engellemeyecek
  }

  // 2. E-posta gönderimi — fire-and-forget, sonucu konsola yaz
  // CRON_SECRET client-side tanımsız, kullanıcının session token'ını kullan
  const { data: { session } } = await supabase.auth.getSession()
  const authToken = session?.access_token
  if (!authToken) return  // oturum yoksa mail gönderemeyiz

  const appUrl = typeof window !== 'undefined'
    ? window.location.origin
    : (process.env.NEXT_PUBLIC_APP_URL || 'https://deneyap-ops.vercel.app')

  fetch(`${appUrl}/api/send-email`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
    },
    body: JSON.stringify({
      user_id:     params.user_id,
      type:        params.type,
      event_type:  params.event_type,
      title:       params.title,
      description: params.description ?? null,
      actor_name:  params.actor_name ?? null,
      link:        params.link ?? null,
      entity_key:  params.entity_key ?? null,  // null → cooldown uygulanmaz
    }),
  })
    .then(r => r.json())
    .then(data => {
      if (!data.ok) {
        console.warn('[createNotification] email not sent:', data.reason, { user: params.user_id, event: params.event_type })
      }
    })
    .catch(err => console.error('[createNotification] fetch error:', err))
}

export async function createNotificationForAll(
  params: Omit<CreateNotificationParams, 'user_id'>,
  targetRole?: 'admin' | 'member' | 'consultant'
): Promise<void> {
  const query = supabase.from('profiles').select('id')
  const { data: profiles } = targetRole
    ? await query.eq('role', targetRole)
    : await query

  if (!profiles?.length) return

  const rows = profiles.map((p) => ({
    user_id:     p.id,
    type:        params.type,
    event_type:  params.event_type,
    title:       params.title,
    description: params.description ?? null,
    actor_id:    params.actor_id ?? null,
    actor_name:  params.actor_name ?? null,
    link:            params.link ?? null,
    is_read:         false,
    organization_id: params.org_id ?? null,
  }))

  const { error } = await supabase.from('notifications').insert(rows)
  if (error) {
    console.error('[createNotificationForAll] error:', error.message)
  }

  // Her kullanıcı için e-posta isteği — fire-and-forget
  const { data: { session: allSession } } = await supabase.auth.getSession()
  const allAuthToken = allSession?.access_token
  if (!allAuthToken) return

  const allAppUrl = typeof window !== 'undefined'
    ? window.location.origin
    : (process.env.NEXT_PUBLIC_APP_URL || 'https://deneyap-ops.vercel.app')

  for (const p of profiles) {
    fetch(`${allAppUrl}/api/send-email`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${allAuthToken}`,
      },
      body: JSON.stringify({
        user_id:     p.id,
        type:        params.type,
        event_type:  params.event_type,
        title:       params.title,
        description: params.description ?? null,
        actor_name:  params.actor_name ?? null,
        link:        params.link ?? null,
        entity_key:  params.entity_key ?? null,
      }),
    }).catch(() => {})
  }
}
