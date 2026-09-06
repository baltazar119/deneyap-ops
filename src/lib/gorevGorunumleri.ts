import { gecikmisMi, yaklasanMi } from '@/lib/gorevTermin'
import type { Task, OrgRole } from '@/types/database'

/**
 * Hazır görünümler — "bir tıkla gitmek istediğim yer".
 *
 * Görünüm, filtrelerin ÜSTÜNE uygulanan ayrı bir süzgeç; filtreleri
 * değiştirmez. Böylece "Gecikenler" görünümündeyken il filtresini açmak
 * beklendiği gibi ikisini birden uygular ve görünüm chip'i seçili kalır.
 *
 * Saf tutuluyor: rol/kullanıcı bağlamı parametre olarak geliyor, hook yok,
 * doğrudan test ediliyor.
 */

export type GorunumId =
  | 'tumu' | 'bana' | 'gecikenler' | 'bu-hafta' | 'atanmamis' | 'ilim' | 'deneyapim'

export interface GorunumBaglami {
  role: OrgRole | null
  userId: string
  /** Kullanıcının ili — yalnızca İl Sorumlusu görünümü için. */
  userIl: string | null
  /** Üyenin bağlı olduğu DENEYAP (061) — "DENEYAP'ım" görünümü için. */
  userDeneyapId?: string | null
  /** Chip etiketinde gösterilecek DENEYAP adı. */
  userDeneyapAdi?: string | null
}

/** Görünümlerin dokunduğu alanlar — tam `Task` gerekmiyor. */
export type GorunumGorevi = Pick<Task, 'status' | 'due_date' | 'assignee_id' | 'il' | 'deneyap_id'>

interface GorunumTanimi {
  id: GorunumId
  etiket: string
  /** Rol/bağlam bu görünümü hiç görmüyorsa chip render edilmez. */
  gorunurMu: (b: GorunumBaglami) => boolean
  /** `null` = süzme yok (Tümü). */
  esler: ((t: GorunumGorevi, b: GorunumBaglami) => boolean) | null
}

export const GORUNUMLER: GorunumTanimi[] = [
  {
    id: 'tumu',
    etiket: 'Tümü',
    gorunurMu: () => true,
    esler: null,
  },
  {
    id: 'bana',
    etiket: 'Bana atananlar',
    // Kimliği olmayan bir oturumda anlamsız olurdu.
    gorunurMu: b => !!b.userId,
    esler: (t, b) => t.assignee_id === b.userId,
  },
  {
    id: 'gecikenler',
    etiket: 'Gecikenler',
    gorunurMu: () => true,
    esler: t => gecikmisMi(t),
  },
  {
    id: 'bu-hafta',
    etiket: 'Bu hafta',
    gorunurMu: () => true,
    esler: t => yaklasanMi(t),
  },
  {
    id: 'ilim',
    // Etiket çalışma anında ilin adıyla değişiyor ("Ankara görevleri");
    // bkz. gorunumEtiketi().
    etiket: 'İlim',
    // Yalnızca İl Sorumlusu için anlamlı: diğer roller zaten il filtresini
    // kullanıyor, İl Sorumlusunun ise tek ili var.
    gorunurMu: b => b.role === 'member' && !!b.userIl,
    esler: (t, b) => t.il === b.userIl,
  },
  {
    id: 'deneyapim',
    // Etiket çalışma anında DENEYAP'ın adıyla değişir; bkz. gorunumEtiketi().
    etiket: 'DENEYAP’ım',
    // Üyenin bir DENEYAP'ı yoksa anlamsız. Rolden bağımsız: Merkez'deki biri
    // de bir DENEYAP'a bağlıysa kendi biriminin işlerini görmek isteyebilir.
    gorunurMu: b => !!b.userDeneyapId,
    esler: (t, b) => t.deneyap_id === b.userDeneyapId,
  },
  {
    id: 'atanmamis',
    etiket: 'Atanmamış',
    // Kimseye atanmamış işi görmek atama yetkisi olanın derdi.
    gorunurMu: b => b.role === 'owner' || b.role === 'admin',
    esler: t => !t.assignee_id,
  },
]

/** Chip etiketi — "İlim" ve "DENEYAP'ım" gerçek adla gösterilir. */
export function gorunumEtiketi(g: GorunumTanimi, b: GorunumBaglami): string {
  if (g.id === 'ilim' && b.userIl) return `${b.userIl} görevleri`
  if (g.id === 'deneyapim' && b.userDeneyapAdi) return b.userDeneyapAdi
  return g.etiket
}

export function gorulebilirGorunumler(b: GorunumBaglami): GorunumTanimi[] {
  return GORUNUMLER.filter(g => g.gorunurMu(b))
}

/**
 * Rolün açılış görünümü. İl Sorumlusu listeyi "önce bana ne düştü" diye
 * okuyor; izleyen roller operasyonun tamamına bakıyor.
 */
export function varsayilanGorunum(role: OrgRole | null): GorunumId {
  return role === 'member' ? 'bana' : 'tumu'
}

/** Bilinmeyen `?gorunum=` değeri sessizce varsayılana düşer. */
export function gorunumCoz(deger: string | null, b: GorunumBaglami): GorunumId {
  const bulunan = gorulebilirGorunumler(b).find(g => g.id === deger)
  return bulunan?.id ?? varsayilanGorunum(b.role)
}

export function gorevleriGorunumeGoreSuz<T extends GorunumGorevi>(
  gorevler: T[], gorunum: GorunumId, b: GorunumBaglami,
): T[] {
  const tanim = GORUNUMLER.find(g => g.id === gorunum)
  if (!tanim || !tanim.esler) return gorevler
  // Rolün görmemesi gereken bir görünüm URL'den zorlanmış olabilir.
  if (!tanim.gorunurMu(b)) return gorevler
  const esler = tanim.esler
  return gorevler.filter(t => esler(t, b))
}
