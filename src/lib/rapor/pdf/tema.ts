/**
 * PDF tema tokenları — tailwind.config.ts'teki `brand` ölçeğinden türetilmiş.
 * Rapor ekrandaki uygulamayla aynı görünsün diye renkler orada ne ise burada da o.
 */
export const T = {
  koyu:      '#0d1a2a',
  koyu2:     '#182c3f',
  birincil:  '#2288c9',
  aksan:     '#2abbd5',
  soluk:     '#bee5f0',
  metin:     '#0d1a2a',
  gri:       '#64748b',
  acikGri:   '#94a3b8',
  cizgi:     '#e2e8f0',
  zebra:     '#f8fafc',
  kirmizi:   '#dc2626',
  kirmiziBg: '#fee2e2',
  amber:     '#b45309',
  amberBg:   '#fef3c7',
  yesil:     '#059669',
  yesilBg:   '#d1fae5',
  mor:       '#7c3aed',
  morBg:     '#ede9fe',
} as const

/** Gecikme gün sayısına göre vurgu rengi — 1-3 amber, 4-14 turuncu, 15+ kırmızı */
export function gecikmeRengi(gun: number): { metin: string; zemin: string } {
  if (gun >= 15) return { metin: '#991b1b', zemin: '#fecaca' }
  if (gun >= 4)  return { metin: '#c2410c', zemin: '#ffedd5' }
  return { metin: T.amber, zemin: T.amberBg }
}

/** Tamamlanma oranına göre bar rengi */
export function oranRengi(oran: number): string {
  if (oran >= 70) return T.yesil
  if (oran >= 40) return T.amber
  return T.kirmizi
}
