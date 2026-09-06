import type { PlanType } from '@/types/database'

export type Feature =
  | 'ai_assistant'        // AI Görev Asistanı — Pro + AI Eklentisi gerektirir
  | 'consultant_module'   // Danışmanlık modülü (Q&A, annotation, dosyalar)
  | 'google_drive'        // Google Drive entegrasyonu
  | 'unlimited_members'   // 5'ten fazla üye (Free: max 5)
  | 'unlimited_sprints'   // Birden fazla aktif sprint (Free: max 1)
  | 'email_notifications' // Email bildirimleri (Free: sadece uygulama içi)
  | 'custom_branding'     // Özel logo ve renkler
  | 'data_export'         // CSV dışa aktarma

// AI asistan ayrı eklenti paketi gerektirir (Pro + ai_addon)
const AI_ADDON_ONLY: Feature[] = ['ai_assistant']

// Sadece Pro plan gerektirir (ai_assistant bu listede değil)
const PRO_ONLY: Feature[] = [
  'consultant_module',
  'google_drive',
  'unlimited_members',
  'unlimited_sprints',
  'email_notifications',
  'custom_branding',
  'data_export',
]

export function isFeatureEnabled(
  feature: Feature,
  plan: PlanType,
  aiAddon: boolean = false
): boolean {
  // AI eklentisi: Pro plan + ai_addon flag'i gerektirir
  if (AI_ADDON_ONLY.includes(feature)) return plan === 'pro' && aiAddon
  // Diğer Pro özellikleri
  if (plan === 'pro') return true
  return !PRO_ONLY.includes(feature)
}

export const FEATURE_LABELS: Record<Feature, string> = {
  ai_assistant: 'AI Asistan (Pro + AI Eklentisi)',
  consultant_module: 'Danışmanlık Modülü',
  google_drive: 'Google Drive Entegrasyonu',
  unlimited_members: 'Sınırsız Üye',
  unlimited_sprints: 'Sınırsız Aktif Sprint',
  email_notifications: 'Email Bildirimleri',
  custom_branding: 'Özel Marka (Logo & Renkler)',
  data_export: 'Veri Dışa Aktarma (CSV)',
}

export const FREE_LIMITS = {
  maxMembers: 5,
  maxActiveSprints: 1,
} as const

/** Günlük AI çağrı limitleri (kullanıcı başına) */
export const AI_DAILY_LIMITS = {
  generateRevise: 20,   // generate + revise birlikte
  reviseTask: 50,       // tek görev revizyonu
  analyze: 10,          // sprint analizi, rapor, tahmin vb.
  raporYorum: 15,       // rapor yorumunu AI ile derinlestirme
} as const
