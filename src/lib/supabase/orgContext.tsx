'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import type { OrgRole, PlanType, Organization } from '@/types/database'

export type { OrgRole, PlanType, Organization }

export interface OrgContextValue {
  org: Organization | null
  orgRole: OrgRole | null
  userId: string | null
  userEmail: string | null
  avatarUrl: string | null
  isPro: boolean
  hasAiAddon: boolean
  isAdmin: boolean   // owner veya admin
  isOwner: boolean
  isConsultant: boolean
  loading: boolean
}

export const OrgContext = createContext<OrgContextValue>({
  org: null,
  orgRole: null,
  userId: null,
  userEmail: null,
  avatarUrl: null,
  isPro: false,
  hasAiAddon: false,
  isAdmin: false,
  isOwner: false,
  isConsultant: false,
  loading: true,
})

export function useOrg(): OrgContextValue {
  return useContext(OrgContext)
}

const CACHE_PREFIX = 'deneyap_org_v2_'   // v2: org objesi de dahil

interface CacheData {
  orgRole: OrgRole
  userPlan: PlanType
  orgId: string
  org: Organization
  avatarUrl: string | null
  hasAiAddon: boolean
}

function getCached(userId: string, slug: string): CacheData | null {
  try {
    const raw = sessionStorage.getItem(`${CACHE_PREFIX}${userId}_${slug}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CacheData
    // org alanı yoksa eski format — null döndür, DB'den yenile
    if (!parsed.org || !parsed.org.id) return null
    return parsed
  } catch { return null }
}

function setCache(userId: string, slug: string, data: CacheData) {
  try {
    sessionStorage.setItem(`${CACHE_PREFIX}${userId}_${slug}`, JSON.stringify(data))
  } catch {}
}


/** userId'yi sessionStorage'a kaydet — sayfa bileşenleri senkron init için kullanır */
function storeUserId(userId: string) {
  try { sessionStorage.setItem('deneyap_uid', userId) } catch {}
}

/** Sayfa bileşenlerinin senkron lazy init için kullanabileceği yardımcı */
export function getStoredUserId(): string | null {
  try { return sessionStorage.getItem('deneyap_uid') } catch { return null }
}

const DEFAULT_VALUE: OrgContextValue = {
  org: null, orgRole: null, userId: null, userEmail: null, avatarUrl: null,
  isPro: false, hasAiAddon: false, isAdmin: false, isOwner: false, isConsultant: false,
  loading: true,
}

/** sessionStorage'daki org önbelleğini context değerine çevirir (yoksa null) */
function readCachedValue(slug: string): OrgContextValue | null {
  if (typeof window === 'undefined') return null
  try {
    const uid = sessionStorage.getItem('deneyap_uid')
    if (!uid) return null
    const cached = getCached(uid, slug)
    if (!cached) return null
    return {
      org: cached.org,
      orgRole: cached.orgRole,
      userId: uid,
      userEmail: null,          // session email aşağıdaki useEffect'te güncellenir
      avatarUrl: cached.avatarUrl,
      isPro: cached.userPlan === 'pro',
      hasAiAddon: cached.hasAiAddon,
      isAdmin: cached.orgRole === 'owner' || cached.orgRole === 'admin',
      isOwner: cached.orgRole === 'owner',
      isConsultant: cached.orgRole === 'consultant',
      loading: false,
    }
  } catch { return null }
}

export function OrgProvider({ children }: { children: ReactNode }) {
  const params = useParams()
  const router = useRouter()
  const slug = params?.slug as string | undefined

  const [value, setValue] = useState<OrgContextValue>(DEFAULT_VALUE)

  // Önbellek okuma render sırasında DEĞİL, mount sonrasında yapılır.
  //
  // Daha önce sessionStorage useState'in lazy initializer'ında okunuyordu;
  // sunucuda window olmadığı için DEFAULT_VALUE (loading: true) dönüyor,
  // tarayıcıda ise önbellek dolu geldiği için loading: false dönüyordu.
  // DesktopSidebar bu iki durumda yapısal olarak farklı DOM ürettiğinden
  // React "Hydration failed" hatası veriyordu. Şimdi ilk render her iki
  // tarafta da aynı (loading), önbellek hemen ardından uygulanıyor.
  useEffect(() => {
    if (!slug) return
    const cachedValue = readCachedValue(slug)
    if (cachedValue) setValue(cachedValue)
  }, [slug])

  useEffect(() => {
    if (!slug) return

    async function load() {
      try {
        // 1. Auth session
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          router.replace(`/login?next=/org/${slug}`)
          return
        }
        const userId = session.user.id
        storeUserId(userId)   // sonraki render'lar için kaydet

        // 2. Önbellek varsa hemen göster (sayfa geçişlerinde anlık açılış),
        //    ama DB sorgusunu ATLAMA — arka planda taze veriyle güncelle.
        //    Daha önce önbellek varsa erken return ediliyordu; bu yüzden
        //    plan (free→pro) veya rol değişiklikleri sekme kapanana kadar
        //    arayüze yansımıyordu.
        const cached = getCached(userId, slug as string)
        if (cached) {
          setValue(prev => ({
            ...prev,
            userId,
            userEmail: session.user.email ?? null,
            loading: false,
          }))
        }

        // 3. Org + üyelik ve profil sorgularını paralel çalıştır
        const [membershipResult, profileResult] = await Promise.all([
          supabase
            .from('organization_members')
            .select(`
              role,
              organizations!inner (
                id, name, slug, plan, max_members, logo_url, primary_color, accent_color, created_by, created_at, join_code
              )
            `)
            .eq('user_id', userId)
            .eq('organizations.slug', slug)
            .single(),

          supabase
            .from('profiles')
            .select('avatar_url, plan, ai_addon')
            .eq('id', userId)
            .single(),
        ])

        const { data: membership, error: membershipError } = membershipResult

        if (membershipError || !membership) {
          router.replace('/workspaces')
          return
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const org = (membership.organizations as any) as Organization
        const orgRole = membership.role as OrgRole

        const profile = profileResult.data
        const userPlan = (profile?.plan ?? 'free') as PlanType
        const avatarUrl = profile?.avatar_url ?? null
        const hasAiAddon = profile?.ai_addon ?? false

        setValue({
          org,
          orgRole,
          userId,
          userEmail: session.user.email ?? null,
          avatarUrl,
          isPro: userPlan === 'pro',
          hasAiAddon,
          isAdmin: orgRole === 'owner' || orgRole === 'admin',
          isOwner: orgRole === 'owner',
          isConsultant: orgRole === 'consultant',
          loading: false,
        })

        if (slug) setCache(userId, slug, { orgRole, userPlan, orgId: org.id, org, avatarUrl, hasAiAddon })

      } catch (err) {
        console.error('[OrgContext] load error:', err)
        setValue(prev => ({ ...prev, loading: false }))
      }
    }

    load()
  }, [slug, router])

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>
}

/** Org cache'ini temizle (logout veya workspace değiştirme sırasında) */
export function clearOrgCache(userId?: string) {
  try {
    Object.keys(sessionStorage)
      .filter(k => k.startsWith(CACHE_PREFIX) && (!userId || k.includes(userId)))
      .forEach(k => sessionStorage.removeItem(k))
  } catch {}
}
