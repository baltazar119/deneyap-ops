'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import type { OrgRole, PlanType, Organization } from '@/types/database'

export type { OrgRole, PlanType, Organization }

export interface OrgContextValue {
  org: Organization | null
  orgRole: OrgRole | null
  /** Kullanıcının bu org'da sorumlu olduğu il/birim (İl Sorumlusu filtresi) */
  userIl: string | null
  /**
   * Üyenin bağlı olduğu DENEYAP (061). Kapsam kuralı İL seviyesinde kalır —
   * bu alan yalnızca form varsayılanı ve "DENEYAP'ım" görünümü için.
   */
  userDeneyapId: string | null
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
  userIl: null,
  userDeneyapId: null,
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

// v3: userDeneyapId eklendi. Şema değiştiği için prefix bumplandı — eski v2
// girdileri okunmaya çalışılsa `userDeneyapId` sessizce undefined kalırdı.
const CACHE_PREFIX = 'deneyap_org_v3_'
/** Süpürülecek eski prefix'ler — bkz. clearOrgCache. */
const ESKI_CACHE_PREFIXLERI = ['deneyap_org_v2_']

interface CacheData {
  orgRole: OrgRole
  userIl?: string | null
  userDeneyapId?: string | null
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
  org: null, orgRole: null, userIl: null, userDeneyapId: null, userId: null, userEmail: null, avatarUrl: null,
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
      userIl: cached.userIl ?? null,
      userDeneyapId: cached.userDeneyapId ?? null,
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
        const [membershipResult, deneyapUyelikResult, profileResult] = await Promise.all([
          supabase
            .from('organization_members')
            .select(`
              role,
              il,
              organizations!inner (
                id, name, slug, plan, max_members, logo_url, primary_color, accent_color, created_by, created_at, join_code
              )
            `)
            .eq('user_id', userId)
            .eq('organizations.slug', slug)
            .single(),

          // deneyap_id AYRI ve HATAYA TOLERANSLI sorguda.
          //
          // Ana üyelik sorgusuna eklenirse, migration 061 uygulanmadan
          // yayına çıkan bir sürüm TÜM org sayfalarını kırar: sorgu
          // "column does not exist" ile döner, membership null olur ve
          // kullanıcı /workspaces'e atılır. Ayrı sorguda hata yalnızca
          // deneyap_id'nin null kalmasına yol açar; uygulama çalışmaya
          // devam eder. Kod ile migration'ın aynı anda yayına çıkmadığı
          // her durumda geçerli olan kural.
          supabase
            .from('organization_members')
            .select('deneyap_id, organizations!inner(slug)')
            .eq('user_id', userId)
            .eq('organizations.slug', slug)
            .maybeSingle(),

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
        const userIl  = (membership.il as string | null) ?? null
        // Hata varsa (kolon yok) sessizce null — yukarıdaki gerekçe.
        const userDeneyapId =
          ((deneyapUyelikResult.data as { deneyap_id?: string | null } | null)?.deneyap_id) ?? null

        const profile = profileResult.data
        const userPlan = (profile?.plan ?? 'free') as PlanType
        const avatarUrl = profile?.avatar_url ?? null
        const hasAiAddon = profile?.ai_addon ?? false

        setValue({
          org,
          orgRole,
          userIl,
          userDeneyapId,
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

        if (slug) setCache(userId, slug, { orgRole, userIl, userDeneyapId, userPlan, orgId: org.id, org, avatarUrl, hasAiAddon })

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
    // Eski sürümlerin girdileri de süpürülüyor; kalırlarsa sessionStorage'da
    // sonsuza kadar ölü veri olarak birikirlerdi.
    const prefixler = [CACHE_PREFIX, ...ESKI_CACHE_PREFIXLERI]
    Object.keys(sessionStorage)
      .filter(k => prefixler.some(p => k.startsWith(p)) && (!userId || k.includes(userId)))
      .forEach(k => sessionStorage.removeItem(k))
  } catch {}
}
