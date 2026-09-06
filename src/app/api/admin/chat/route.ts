import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { onbelleksizFetch } from '@/lib/server/supabaseFetch'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: onbelleksizFetch } },
  )
}

function isSuperAdmin(email: string | undefined): boolean {
  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL
  return !!superAdminEmail && email === superAdminEmail
}

// GET /api/admin/chat
//   ?type=channels  → tüm kanalları org + katılımcı bilgileriyle döndür
//   ?channelId=xxx  → belirli kanalın son 100 mesajını döndür
export async function GET(request: NextRequest) {
  const adminClient = getAdminClient()

  // Bearer token auth
  const authHeader = request.headers.get('authorization')
  if (!authHeader) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: { user } } = await adminClient.auth.getUser(authHeader.replace('Bearer ', ''))
  if (!user || !isSuperAdmin(user.email)) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const channelId = searchParams.get('channelId')

  // ── Mesajlar: belirli kanal ──────────────────────────────────────────────
  if (channelId) {
    const { data: messages, error } = await adminClient
      .from('chat_messages')
      .select('id, channel_id, sender_id, content, created_at')
      .eq('channel_id', channelId)
      .order('created_at', { ascending: true })
      .limit(100)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Gönderen profil bilgilerini çek
    const senderIds = [...new Set((messages ?? []).map(m => m.sender_id).filter(Boolean))]
    const { data: profiles } = senderIds.length
      ? await adminClient
          .from('profiles')
          .select('id, full_name, username, avatar_url')
          .in('id', senderIds)
      : { data: [] }

    const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]))

    const enriched = (messages ?? []).map(m => ({
      ...m,
      sender: m.sender_id ? profileMap[m.sender_id] ?? null : null,
    }))

    return NextResponse.json({ messages: enriched })
  }

  // ── Kanal listesi ────────────────────────────────────────────────────────
  const { data: channels, error } = await adminClient
    .from('chat_channels')
    .select('id, organization_id, type, participant_a, participant_b, created_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Org bilgileri
  const orgIds = [...new Set((channels ?? []).map(c => c.organization_id))]
  const { data: orgs } = orgIds.length
    ? await adminClient
        .from('organizations')
        .select('id, name, slug')
        .in('id', orgIds)
    : { data: [] }
  const orgMap = Object.fromEntries((orgs ?? []).map(o => [o.id, o]))

  // Katılımcı profilleri
  const participantIds = [
    ...(channels ?? []).map(c => c.participant_a),
    ...(channels ?? []).map(c => c.participant_b),
  ].filter(Boolean) as string[]
  const uniqueParticipantIds = [...new Set(participantIds)]

  const { data: profiles } = uniqueParticipantIds.length
    ? await adminClient
        .from('profiles')
        .select('id, full_name, username, avatar_url')
        .in('id', uniqueParticipantIds)
    : { data: [] }
  const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]))

  // Son mesaj tarihi için mesaj sayılarını çek
  const { data: lastMsgs } = await adminClient
    .from('chat_messages')
    .select('channel_id, created_at')
    .order('created_at', { ascending: false })

  const lastMsgByChannel: Record<string, string> = {}
  const msgCountByChannel: Record<string, number> = {}
  for (const m of lastMsgs ?? []) {
    if (!lastMsgByChannel[m.channel_id]) {
      lastMsgByChannel[m.channel_id] = m.created_at
    }
    msgCountByChannel[m.channel_id] = (msgCountByChannel[m.channel_id] ?? 0) + 1
  }

  const enriched = (channels ?? []).map(c => ({
    ...c,
    org: orgMap[c.organization_id] ?? null,
    participantAProfile: c.participant_a ? profileMap[c.participant_a] ?? null : null,
    participantBProfile: c.participant_b ? profileMap[c.participant_b] ?? null : null,
    lastMessageAt: lastMsgByChannel[c.id] ?? null,
    messageCount: msgCountByChannel[c.id] ?? 0,
  }))

  return NextResponse.json({ channels: enriched })
}
