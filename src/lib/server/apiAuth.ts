import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { yazabilirMi, raporGorebilirMi } from '@/lib/roller'
import type { OrgRole, PlanType } from '@/types/database'

/**
 * Org kapsamlı API yetkilendirmesi — TEK KAYNAK.
 *
 * `Bearer token → auth.getUser → organizations → organization_members`
 * zinciri 46 route'ta elle tekrar ediyordu. Kopyalar birbirinden ayrışmıştı:
 * bazıları org'un varlığını 404 ile sızdırıyor, `meetings` GET'te blok
 * tamamen unutulmuş, bazıları service key yoksa sessizce anon key'e düşüyor.
 *
 * Burada dikkat edilen üç şey:
 *  1. `admin` istemcisi RLS'i BYPASS eder — yetki kontrolü tamamen bu
 *     modülün ve çağıranın sorumluluğundadır.
 *  2. `asUser` istemcisi kullanıcının kendi JWT'siyle çalışır, RLS aktiftir.
 *     Salt okuma yapan route'lar bunu tercih etmeli ki RLS ikinci savunma
 *     hattı olsun.
 *  3. Org var ama üye değilsin → 403. Org hiç yok → yine 403. Aradaki farkı
 *     sızdırmak, oturum açmış birine hangi slug'ların var olduğunu saydırır.
 */

export interface OrgYetki {
  user: { id: string; email: string | null }
  org: { id: string; slug: string; name: string; plan: PlanType }
  rol: OrgRole
  /** organization_members.il — İl Sorumlusu kapsamı için */
  il: string | null
  /** service-role, RLS bypass */
  admin: SupabaseClient
  /** kullanıcının JWT'si, RLS aktif */
  asUser: SupabaseClient
  token: string
  ip: string
}

export type YetkiSonuc =
  | { ok: true; yetki: OrgYetki }
  | { ok: false; res: NextResponse }

export interface YetkiSecenekleri {
  /** [slug] route'ları için params.slug */
  slug?: string
  /** slug yoksa doğrudan org id (gövde/query'den) */
  orgId?: string
  /**
   * 'uye'   — org'un herhangi bir üyesi
   * 'rapor' — Panel/Rapor görebilenler (owner, admin, viewer)
   * 'yazma' — görev oluşturup düzenleyebilenler (owner, admin)
   * 'sahip' — yalnızca owner
   */
  gerekli?: 'uye' | 'rapor' | 'yazma' | 'sahip'
  /** true ise org planı 'pro' değilse 402 döner */
  proGerekli?: boolean
}

function servisAnahtari(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) {
    // Anon key'e sessizce düşmek, yetki hatalarını "boş sonuç"a çevirip
    // teşhisi imkânsızlaştırıyordu. Açıkça patlaması daha iyi.
    throw new Error('SUPABASE_SERVICE_ROLE_KEY tanımlı değil')
  }
  return key
}

function adminClient(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, servisAnahtari(), {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function userClient(token: string): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    },
  )
}

export function istemciIp(req: NextRequest): string {
  return (
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'bilinmiyor'
  )
}

function reddet(mesaj: string, status: number): { ok: false; res: NextResponse } {
  return { ok: false, res: NextResponse.json({ error: mesaj }, { status }) }
}

export async function orgYetkiCoz(
  req: NextRequest,
  opts: YetkiSecenekleri,
): Promise<YetkiSonuc> {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return reddet('Oturum bulunamadı.', 401)

  let admin: SupabaseClient
  try {
    admin = adminClient()
  } catch (e) {
    console.error('[apiAuth]', e)
    return reddet('Sunucu yapılandırma hatası.', 500)
  }

  const { data: { user }, error: authErr } = await admin.auth.getUser(token)
  if (authErr || !user) return reddet('Oturum geçersiz veya süresi dolmuş.', 401)

  // Üyelik ve org tek sorguda — org yoksa da üye değilsen de aynı sonuç
  let q = admin
    .from('organization_members')
    .select('role, il, organizations!inner(id, slug, name, plan)')
    .eq('user_id', user.id)

  if (opts.slug) q = q.eq('organizations.slug', opts.slug)
  else if (opts.orgId) q = q.eq('organization_id', opts.orgId)
  else return reddet('Organizasyon belirtilmedi.', 400)

  const { data: uyelik } = await q.maybeSingle()
  if (!uyelik) return reddet('Bu çalışma alanına erişiminiz yok.', 403)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orgRaw = (uyelik as any).organizations
  const org = (Array.isArray(orgRaw) ? orgRaw[0] : orgRaw) as {
    id: string; slug: string; name: string; plan: PlanType
  }
  const rol = (uyelik as { role: OrgRole }).role
  const il = ((uyelik as { il: string | null }).il) ?? null

  const gerekli = opts.gerekli ?? 'uye'
  if (gerekli === 'sahip' && rol !== 'owner') {
    return reddet('Bu işlem yalnızca çalışma alanı sahibi tarafından yapılabilir.', 403)
  }
  if (gerekli === 'yazma' && !yazabilirMi(rol)) {
    return reddet('Bu işlem için yetkiniz yok.', 403)
  }
  if (gerekli === 'rapor' && !raporGorebilirMi(rol)) {
    return reddet('Bu içeriği görüntüleme yetkiniz yok.', 403)
  }

  if (opts.proGerekli && org.plan !== 'pro') {
    return reddet('Bu özellik Pro plana dahildir.', 402)
  }

  return {
    ok: true,
    yetki: {
      user: { id: user.id, email: user.email ?? null },
      org,
      rol,
      il,
      admin,
      asUser: userClient(token),
      token,
      ip: istemciIp(req),
    },
  }
}
