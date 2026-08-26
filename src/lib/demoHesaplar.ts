import type { OrgRole } from '@/types/database'

/**
 * Giriş ekranındaki demo hesap paneli — TEK KAYNAK.
 *
 * Bu liste `scripts/demo-seed.mjs` ile birebir aynı olmalı; script hesapları
 * oluşturur, buradaki liste onları giriş ekranında gösterir.
 *
 * GÜVENLİK: Panel yalnızca NEXT_PUBLIC_DEMO_MODE=true iken görünür. Gerçek
 * bir kurulumda bu değişkeni tanımlamayın — aksi halde herkese açık bir
 * sayfada çalışan kimlik bilgileri yayınlamış olursunuz.
 */

export const DEMO_MODU_ACIK = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

/** Demo hesapların ortak şifresi — seed script'iyle aynı olmalı */
export const DEMO_SIFRE = 'Deneyap2026!'

export interface DemoHesap {
  email: string
  /** PRD'deki rol adı */
  rolAdi: string
  role: OrgRole
  /** Sorumlu olduğu il/birim */
  il: string
  /** Bu rolle girince ne görüleceğinin bir cümlelik özeti */
  ozet: string
  renk: { bg: string; border: string; text: string }
}

export const DEMO_HESAPLAR: DemoHesap[] = [
  {
    email: 'merkez@deneyap.demo',
    rolAdi: 'Merkez Operasyon Ekibi',
    role: 'owner',
    il: 'Genel Merkez',
    ozet: 'Tüm illerin görevlerini görür, yeni görev oluşturup il sorumlularına atar.',
    renk: { bg: '#fef9ee', border: '#fcd34d', text: '#92400e' },
  },
  {
    email: 'koordinator@deneyap.demo',
    rolAdi: 'Koordinatör',
    role: 'admin',
    il: 'Genel Merkez',
    ozet: 'Geciken ve kritik görevleri izler; Operasyon Riski ekranı bu rol için.',
    renk: { bg: '#eff6ff', border: '#93c5fd', text: '#1e40af' },
  },
  {
    email: 'ankara@deneyap.demo',
    rolAdi: 'İl Sorumlusu',
    role: 'member',
    il: 'Ankara',
    ozet: 'Yalnızca Ankara görevlerini görür, durumlarını günceller.',
    renk: { bg: '#f8fafc', border: '#e2e8f0', text: '#374151' },
  },
  {
    email: 'izmir@deneyap.demo',
    rolAdi: 'İl Sorumlusu',
    role: 'member',
    il: 'İzmir',
    ozet: 'Yalnızca İzmir görevlerini görür — il bazlı ayrımı karşılaştırmak için.',
    renk: { bg: '#f8fafc', border: '#e2e8f0', text: '#374151' },
  },
  {
    email: 'yonetici@deneyap.demo',
    rolAdi: 'Yetkili Yönetici',
    role: 'viewer',
    il: 'Genel Merkez',
    ozet: 'Salt okunur: tamamlanma oranları ve gecikmeler. Değişiklik yapamaz.',
    renk: { bg: '#f0fdfa', border: '#5eead4', text: '#0f766e' },
  },
]
