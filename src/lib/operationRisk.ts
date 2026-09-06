import type { Task, Sprint, Profile } from '@/types/database'

/**
 * SAF modül — veritabanına BAKMAZ.
 *
 * Eskiden burada `@/lib/supabase/client` (tarayıcı istemcisi) import
 * ediliyordu; bu yüzden modül sunucuda kullanılamıyor, dolayısıyla risk
 * bölümü rapora ve PDF'e hiç giremiyordu. Veri çekme iki ayrı dosyaya alındı:
 *   `risk/istemciVeri.ts` — tarayıcı, RLS aktif
 *   `risk/sunucuVeri.ts`  — sunucu, RLS YOK; kapsam taskScope ile uygulanır
 */

/**
 * Operasyon Risk hesaplama.
 *
 * Ayrı bir "riskler" tablosu tutulmaz; risk sinyalleri mevcut görev, sprint
 * ve üye verisinden türetilir. Böylece kimsenin elle risk girmesi gerekmez,
 * ekran kendi kendini besler.
 *
 * Hesaplama saf bir fonksiyondur (computeRisk) — veri çekmeden test edilebilir.
 */

export type RiskLevel = 'low' | 'medium' | 'high'

export interface RiskSignal {
  id: string
  level: RiskLevel
  title: string
  detail: string
  /** Kullanıcıyı ilgili ekrana götürecek yol (org slug'ı çağıran tarafından eklenir) */
  link?: string
  /** Sinyale konu olan kayıt sayısı — kartlarda rozet olarak gösterilir */
  count?: number
  /** "Ne yapılmalı" — soyut bir uyarı değil, somut bir sonraki adım */
  action: string
}

export interface ProvinceRisk {
  /** İl/birim adı; il girilmemiş görevler "İl Belirtilmemiş" altında toplanır */
  il: string
  score: number
  level: RiskLevel
  openCount: number
  overdueCount: number
  blockedCount: number
  unassignedCriticalCount: number
  /** En dikkat çeken tek cümlelik özet, kartın altında gösterilir */
  topIssue: string | null
}

export interface RiskInput {
  tasks: Task[]
  sprints: Sprint[]
  members: Profile[]
  /** organization'ın kendi aşırı yük eşiği (automation_settings) */
  overloadThreshold: number
}

export interface RiskResult {
  /** 0–100; 100 = en riskli */
  score: number
  level: RiskLevel
  signals: RiskSignal[]
  /** İl/birim bazlı kırılım, en riskliden en az riskliye sıralı; sinyali olmayan iller listede yer almaz */
  provinces: ProvinceRisk[]
  /** Ekranın en üstünde tek cümlede özet — "3 acil konu var, en kritik: Ankara." */
  headline: string
  counts: {
    overdue: number
    dueSoon: number
    blocked: number
    overloaded: number
    unassignedCritical: number
    stale: number
  }
}

const GUN_MS = 86_400_000
/** Termini bu kadar gün içinde olan görevler "yaklaşan" sayılır */
const YAKLASAN_GUN = 3
/** Bu kadar gündür beklemede duran görevler "duraklamış" sayılır */
const DURAKLAMA_GUN = 14

function gunBasi(d: Date): Date {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}

function isim(members: Profile[], id: string | null): string {
  if (!id) return 'Atanmamış'
  return members.find((m) => m.id === id)?.full_name || 'Bilinmeyen üye'
}

/** Sinyallerden 0–100 arası bir toplam risk skoru üretir */
function skorHesapla(signals: RiskSignal[]): number {
  const agirlik: Record<RiskLevel, number> = { high: 25, medium: 12, low: 5 }
  const toplam = signals.reduce((acc, s) => acc + agirlik[s.level], 0)
  return Math.min(100, toplam)
}

function seviyeBelirle(score: number): RiskLevel {
  if (score >= 60) return 'high'
  if (score >= 25) return 'medium'
  return 'low'
}

/**
 * Görevleri il/birim bazında gruplayıp her biri için mini bir risk skoru
 * üretir. PRD'nin merkez soruyu tam olarak buradan cevaplaması bekleniyor:
 * "hangi ile öncelikle bakmalıyım?" — tek bir toplu organizasyon skoru bu
 * soruyu cevaplamıyordu. Sorunsuz iller listede hiç görünmez; gürültü
 * yaratmasın diye yalnızca en az bir sinyali olan iller döner.
 */
function computeProvinceRisks(acikGorevler: Task[]): ProvinceRisk[] {
  const bugun = gunBasi(new Date())
  const gruplar = new Map<string, Task[]>()
  for (const t of acikGorevler) {
    const key = t.il?.trim() || 'İl Belirtilmemiş'
    const liste = gruplar.get(key)
    if (liste) liste.push(t)
    else gruplar.set(key, [t])
  }

  const sonuc: ProvinceRisk[] = []
  for (const [il, gorevler] of gruplar) {
    const overdueCount = gorevler.filter((t) => t.due_date && gunBasi(new Date(t.due_date)) < bugun).length
    const blockedCount = gorevler.filter((t) => t.status === 'blocked').length
    const unassignedCriticalCount = gorevler.filter((t) => t.priority === 'critical' && !t.assignee_id).length

    const score = Math.min(100, overdueCount * 15 + blockedCount * 20 + unassignedCriticalCount * 25)
    if (score === 0) continue

    let topIssue: string | null = null
    if (blockedCount > 0) topIssue = `${blockedCount} görev bloke`
    else if (unassignedCriticalCount > 0) topIssue = `${unassignedCriticalCount} kritik görev atanmamış`
    else if (overdueCount > 0) topIssue = `${overdueCount} görevin termini geçti`

    sonuc.push({
      il, score, level: seviyeBelirle(score),
      openCount: gorevler.length, overdueCount, blockedCount, unassignedCriticalCount,
      topIssue,
    })
  }

  return sonuc.sort((a, b) => b.score - a.score)
}

/** Ekranın en üstünde gösterilecek tek cümlelik özet — soyut bir skor yerine ne kadar acele edilmesi gerektiğini söyler */
function headlineUret(signals: RiskSignal[], provinces: ProvinceRisk[]): string {
  const acil = signals.filter((s) => s.level === 'high').length
  const orta = signals.filter((s) => s.level === 'medium').length

  if (acil === 0 && orta === 0) return 'Şu an acele edilmesi gereken bir durum yok.'

  const parcalar: string[] = []
  if (acil > 0) parcalar.push(`${acil} acil`)
  if (orta > 0) parcalar.push(`${orta} orta öncelikli`)

  const enKritikIl = provinces[0]
  const ilMetni = enKritikIl && enKritikIl.level !== 'low' ? ` En kritik: ${enKritikIl.il}.` : ''

  return `${parcalar.join(', ')} konu var.${ilMetni}`
}

export function computeRisk({ tasks, sprints, members, overloadThreshold }: RiskInput): RiskResult {
  const bugun = gunBasi(new Date())
  const acik = tasks.filter((t) => t.status !== 'done')

  // ── 1. Termini geçmiş görevler ─────────────────────────────────────────────
  const overdue = acik.filter((t) => t.due_date && gunBasi(new Date(t.due_date)) < bugun)

  // ── 2. Termini yaklaşan görevler ───────────────────────────────────────────
  const dueSoon = acik.filter((t) => {
    if (!t.due_date) return false
    const fark = gunBasi(new Date(t.due_date)).getTime() - bugun.getTime()
    return fark >= 0 && fark <= YAKLASAN_GUN * GUN_MS
  })

  // ── 3. Bloke görevler ──────────────────────────────────────────────────────
  const blocked = tasks.filter((t) => t.status === 'blocked')

  // ── 4. Aşırı yüklü üyeler ──────────────────────────────────────────────────
  const yukHaritasi = new Map<string, number>()
  for (const t of acik) {
    if (!t.assignee_id) continue
    yukHaritasi.set(t.assignee_id, (yukHaritasi.get(t.assignee_id) ?? 0) + 1)
  }
  const overloaded = [...yukHaritasi.entries()]
    .filter(([, adet]) => adet > overloadThreshold)
    .sort((a, b) => b[1] - a[1])

  // ── 5. Atanmamış kritik görevler ───────────────────────────────────────────
  const unassignedCritical = acik.filter((t) => t.priority === 'critical' && !t.assignee_id)

  // ── 6. Uzun süredir beklemede duran görevler ───────────────────────────────
  const stale = acik.filter(
    (t) =>
      t.status === 'backlog' &&
      bugun.getTime() - gunBasi(new Date(t.created_at)).getTime() > DURAKLAMA_GUN * GUN_MS,
  )

  const signals: RiskSignal[] = []

  if (overdue.length > 0) {
    const ornek = overdue.slice(0, 3).map((t) => t.title).join(', ')
    signals.push({
      id: 'overdue',
      level: overdue.length >= 3 ? 'high' : 'medium',
      title: `${overdue.length} görevin termini geçti`,
      detail: overdue.length > 3 ? `${ornek} ve ${overdue.length - 3} görev daha` : ornek,
      action: 'Sorumlularla konuşup yeni bir termin belirleyin veya görevi başka birine devredin.',
      count: overdue.length,
      link: 'tasks',
    })
  }

  if (blocked.length > 0) {
    const ornek = blocked.slice(0, 3).map((t) => t.title).join(', ')
    signals.push({
      id: 'blocked',
      level: 'high',
      title: `${blocked.length} görev bloke durumda`,
      detail: blocked.length > 3 ? `${ornek} ve ${blocked.length - 3} görev daha` : ornek,
      action: 'Blokaj nedenini öğrenin; engeli kaldırın ya da görevi yeniden atayın.',
      count: blocked.length,
      link: 'kanban',
    })
  }

  if (unassignedCritical.length > 0) {
    signals.push({
      id: 'unassigned-critical',
      level: 'high',
      title: `${unassignedCritical.length} kritik görev atanmamış`,
      detail: unassignedCritical.slice(0, 3).map((t) => t.title).join(', '),
      action: 'Bu görevlere hemen bir sorumlu atayın — kritik önceliğin sahibi yok.',
      count: unassignedCritical.length,
      link: 'tasks',
    })
  }

  if (dueSoon.length > 0) {
    signals.push({
      id: 'due-soon',
      level: 'medium',
      title: `${dueSoon.length} görevin termini ${YAKLASAN_GUN} gün içinde`,
      detail: dueSoon.slice(0, 3).map((t) => `${t.title} (${isim(members, t.assignee_id)})`).join(', '),
      action: 'Sorumlularla son durumu teyit edin; yetişmeyecekse şimdiden haber verin.',
      count: dueSoon.length,
      link: 'tasks',
    })
  }

  for (const [userId, adet] of overloaded.slice(0, 3)) {
    signals.push({
      id: `overload-${userId}`,
      level: adet > overloadThreshold * 2 ? 'high' : 'medium',
      title: `${isim(members, userId)} aşırı yüklü`,
      detail: `${adet} açık görev (eşik: ${overloadThreshold})`,
      action: `${isim(members, userId)}'in görevlerinden bir kısmını başka bir üyeye kaydırmayı değerlendirin.`,
      count: adet,
      link: `members/${userId}`,
    })
  }

  // ── 7. Aktif sprint zaman/ilerleme dengesizliği ────────────────────────────
  const aktifSprint = sprints.find((s) => s.is_active)
  if (aktifSprint) {
    const bas = gunBasi(new Date(aktifSprint.start_date)).getTime()
    const bit = gunBasi(new Date(aktifSprint.end_date)).getTime()
    const sprintGorevleri = tasks.filter((t) => t.sprint_id === aktifSprint.id)
    const tamamlanan = sprintGorevleri.filter((t) => t.status === 'done').length

    if (bit > bas && sprintGorevleri.length > 0) {
      const zamanYuzde = Math.min(
        100,
        Math.max(0, Math.round(((Date.now() - bas) / (bit - bas)) * 100)),
      )
      const ilerlemeYuzde = Math.round((tamamlanan / sprintGorevleri.length) * 100)
      const fark = zamanYuzde - ilerlemeYuzde

      if (fark >= 25) {
        signals.push({
          id: 'sprint-behind',
          level: fark >= 45 ? 'high' : 'medium',
          title: `${aktifSprint.name} takvimin gerisinde`,
          detail: `Süresinin %${zamanYuzde}'i doldu, görevlerin %${ilerlemeYuzde}'i tamamlandı`,
          action: 'Kapsamı daraltın veya sprint\'e ek kaynak/süre ayırın.',
          link: 'sprints',
        })
      }
    }
  }

  if (stale.length > 0) {
    signals.push({
      id: 'stale',
      level: 'low',
      title: `${stale.length} görev ${DURAKLAMA_GUN} gündür beklemede`,
      detail: stale.slice(0, 3).map((t) => t.title).join(', '),
      action: 'Bu görevler hâlâ gerekli mi kontrol edin; değilse kapatın, gerekiyorsa devreye alın.',
      count: stale.length,
      link: 'tasks',
    })
  }

  const siraDegeri: Record<RiskLevel, number> = { high: 0, medium: 1, low: 2 }
  signals.sort((a, b) => siraDegeri[a.level] - siraDegeri[b.level])

  const score = skorHesapla(signals)
  const provinces = computeProvinceRisks(acik)
  const headline = headlineUret(signals, provinces)

  return {
    score,
    level: seviyeBelirle(score),
    signals,
    provinces,
    headline,
    counts: {
      overdue: overdue.length,
      dueSoon: dueSoon.length,
      blocked: blocked.length,
      overloaded: overloaded.length,
      unassignedCritical: unassignedCritical.length,
      stale: stale.length,
    },
  }
}

/** Risk hesaplaması için gereken veriyi tek seferde çeker */
export const RISK_RENK: Record<RiskLevel, { color: string; bg: string; border: string; label: string }> = {
  high:   { color: '#dc2626', bg: '#fee2e2', border: '#fecaca', label: 'Yüksek' },
  medium: { color: '#b45309', bg: '#fef3c7', border: '#fde68a', label: 'Orta' },
  low:    { color: '#059669', bg: '#d1fae5', border: '#a7f3d0', label: 'Düşük' },
}
