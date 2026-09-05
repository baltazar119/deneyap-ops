'use client'

import { TASK_TYPES } from '@/lib/taskTypes'
import { STATUS_OPTIONS, PRIORITY_OPTIONS, STATUS_RENK, gecikmisMi, yaklasanMi, type TaskWithAssignee } from './gorevMeta'
import type { GorevFiltreDegerleri } from '@/lib/useGorevFiltreleri'
import type { Profile, TaskStatus, TaskType } from '@/types/database'

interface Props {
  /** Sayaçların tabanı DAİMA kapsam süzülmüş liste — ham `tasks` değil. */
  gorunurTasks: TaskWithAssignee[]
  filtreler: GorevFiltreDegerleri
  ayarla: <K extends keyof GorevFiltreDegerleri>(alan: K, deger: GorevFiltreDegerleri[K]) => void
  temizle: () => void
  aktifMi: boolean
  kullanilanIller: string[]
  members: Profile[]
  /**
   * Mobilde durum sekmeleri beyaz başlık kutusunun İÇİNDE, kalan kontroller
   * kutunun altında duruyor — panel bu yüzden iki çağrıyla iki parça olarak
   * yerleştiriliyor. Faz 2'de sekmeler filtre panelinin içine taşınınca bu
   * bayrak kalkacak.
   */
  sadeceDurumSekmeleri?: boolean
}

const STATUS_SEKMELERI: { value: TaskStatus | 'all'; label: string; color: string }[] = [
  { value: 'all',     label: 'Tümü',      color: '#6b7280' },
  { value: 'backlog', label: 'Beklemede', color: STATUS_RENK.backlog },
  { value: 'doing',   label: 'Yapılıyor', color: STATUS_RENK.doing },
  { value: 'testing', label: 'Test',      color: STATUS_RENK.testing },
  { value: 'blocked', label: 'Bloke',     color: STATUS_RENK.blocked },
  { value: 'done',    label: 'Tamam',     color: STATUS_RENK.done },
]

/**
 * Görevler ekranının filtre kontrolleri.
 *
 * Mobil ve masaüstünde kontrol KÜMESİ farklı (mobilde durum sekmeleri +
 * öncelik chip'leri, masaüstünde chip'ler + dört select), bu yüzden o iki
 * bölüm Tailwind breakpoint'iyle ayrılıyor. Faz 2'de bu ayrım kalkacak:
 * durum sekmeleri filtre panelinin içine taşınacak ve tek "Filtrele" düğmesi
 * gelecek. Bu faz yalnızca yapıyı bölüyor, davranışı değiştirmiyor.
 */
export default function GorevFiltrePaneli({
  gorunurTasks, filtreler, ayarla, temizle, aktifMi, kullanilanIller, members,
  sadeceDurumSekmeleri = false,
}: Props) {
  const gecikenAdet  = gorunurTasks.filter(gecikmisMi).length
  const yaklasanAdet = gorunurTasks.filter(yaklasanMi).length

  const terminChipleri = [
    { deger: 'geciken'  as const, ikon: '⚠', etiket: 'Gecikenler',     renk: '#dc2626', bg: '#fee2e2', bd: '#fca5a5', adet: gecikenAdet },
    { deger: 'yaklasan' as const, ikon: '⏳', etiket: 'Bu hafta biten', renk: '#b45309', bg: '#fef3c7', bd: '#fcd34d', adet: yaklasanAdet },
  ]

  // ── Durum sekmeleri (yalnız mobil) ──
  const durumSekmeleri = (
        <div className="flex md:hidden" style={{ gap: 4, overflowX: 'auto', scrollbarWidth: 'none' }}>
          {STATUS_SEKMELERI.map(tab => {
            const count = tab.value === 'all'
              ? gorunurTasks.length
              : gorunurTasks.filter(t => t.status === tab.value).length
            const active = filtreler.status === tab.value
            return (
              <button key={tab.value} onClick={() => ayarla('status', tab.value)} style={{
                flexShrink: 0, padding: '7px 12px', border: 'none', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
                background: 'transparent',
                color: active ? tab.color : '#9ca3af',
                borderBottom: active ? `2.5px solid ${tab.color}` : '2.5px solid transparent',
                transition: 'all 0.15s',
              }}>
                {tab.label}
                <span style={{
                  marginLeft: 5, fontSize: 10, fontWeight: 700,
                  padding: '1px 5px', borderRadius: 99,
                  background: active ? tab.color + '18' : '#f1f5f9',
                  color: active ? tab.color : '#9ca3af',
                }}>{count}</span>
              </button>
            )
          })}
        </div>
  )

  if (sadeceDurumSekmeleri) return durumSekmeleri

  return (
    <>
      {/* ── Termin süzgeci — Koordinatör akışının başlangıcı ── */}
      <div className="flex items-center gap-1.5 md:gap-2 flex-nowrap md:flex-wrap overflow-x-auto md:overflow-visible px-4 pt-2.5 md:px-0 md:pt-0 md:mb-3">
        {terminChipleri.map(({ deger, ikon, etiket, renk, bg, bd, adet }) => {
          const aktif = filtreler.termin === deger
          return (
            <button
              key={deger}
              onClick={() => ayarla('termin', aktif ? 'all' : deger)}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1 md:py-1.5 rounded-full text-[11px] md:text-xs font-bold md:font-semibold transition-all"
              style={{
                background: aktif ? bg : '#fff',
                color: aktif ? renk : (adet > 0 ? renk : '#94a3b8'),
                border: `1px solid ${aktif ? bd : '#e5e7eb'}`,
              }}
            >
              {ikon} {etiket}
              <span className="font-bold">{adet}</span>
            </button>
          )
        })}
      </div>

      {/* ── Öncelik chip'leri (mobil) ── */}
      <div className="flex md:hidden" style={{ gap: 6, padding: '10px 16px', overflowX: 'auto', scrollbarWidth: 'none' }}>
        <button onClick={() => ayarla('priority', 'all')} style={{
          flexShrink: 0, padding: '5px 12px', borderRadius: 99, fontSize: 11, fontWeight: 600,
          border: '1px solid', cursor: 'pointer', fontFamily: 'inherit',
          background: filtreler.priority === 'all' ? '#111827' : '#fff',
          color: filtreler.priority === 'all' ? '#fff' : '#6b7280',
          borderColor: filtreler.priority === 'all' ? '#111827' : '#e5e7eb',
        }}>Tüm Öncelikler</button>
        {PRIORITY_OPTIONS.map(p => (
          <button key={p.value} onClick={() => ayarla('priority', filtreler.priority === p.value ? 'all' : p.value)} style={{
            flexShrink: 0, padding: '5px 12px', borderRadius: 99, fontSize: 11, fontWeight: 600,
            border: '1px solid', cursor: 'pointer', fontFamily: 'inherit',
            background: filtreler.priority === p.value ? p.bg : '#fff',
            color: filtreler.priority === p.value ? p.color : '#6b7280',
            borderColor: filtreler.priority === p.value ? p.color : '#e5e7eb',
          }}>
            {p.label}
          </button>
        ))}
      </div>

      {/* ── Öncelik chip'leri (masaüstü — sayaçlı) ── */}
      <div className="hidden md:flex items-center gap-2 flex-wrap mb-4">
        {PRIORITY_OPTIONS.map(p => {
          const count = gorunurTasks.filter(t => t.priority === p.value && t.status !== 'done').length
          const active = filtreler.priority === p.value
          return (
            <button
              key={p.value}
              onClick={() => ayarla('priority', active ? 'all' : p.value)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
              style={{
                background: active ? p.bg : '#fff',
                color: active ? p.color : '#6b7280',
                border: `1px solid ${active ? p.color : '#e5e7eb'}`,
              }}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
              {p.label}
              <span className="font-bold" style={{ color: active ? p.color : '#9ca3af' }}>{count}</span>
            </button>
          )
        })}
      </div>

      {/* ── Select'ler (yalnız masaüstü) ── */}
      <div className="hidden md:flex flex-wrap gap-2 mb-5">
        {[
          {
            value: filtreler.status,
            onChange: (v: string) => ayarla('status', v as TaskStatus | 'all'),
            options: [{ value: 'all', label: 'Tüm Durumlar' }, ...STATUS_OPTIONS],
          },
          {
            value: filtreler.type,
            onChange: (v: string) => ayarla('type', v as TaskType | 'all'),
            options: [{ value: 'all', label: 'Tüm Türler' }, ...TASK_TYPES],
          },
          {
            value: filtreler.il,
            onChange: (v: string) => ayarla('il', v),
            // Yalnızca görevlerde fiilen kullanılan iller listeleniyor —
            // 82 seçenekli bir filtre kullanışsız olurdu.
            // '' değeri "İl atanmamış" demek; 'all' ile karıştırılmamalı.
            options: [
              { value: 'all', label: 'Tüm İller' },
              { value: '', label: 'İl atanmamış' },
              ...kullanilanIller.map(il => ({ value: il, label: il })),
            ],
          },
          {
            value: filtreler.assignee,
            onChange: (v: string) => ayarla('assignee', v),
            options: [
              { value: 'all', label: 'Tüm Üyeler' },
              { value: '', label: 'Atanmamış' },
              ...members.map(m => ({ value: m.id, label: m.full_name || m.id })),
            ],
          },
        ].map((sel, idx) => (
          <select
            key={idx}
            value={sel.value}
            onChange={e => sel.onChange(e.target.value)}
            className="text-xs font-medium px-3 py-1.5 rounded-xl appearance-none cursor-pointer"
            style={{ background: '#fff', border: '1px solid #e5e7eb', color: '#374151', outline: 'none' }}
          >
            {sel.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ))}
        {aktifMi && (
          <button
            onClick={temizle}
            className="text-xs px-3 py-1.5 rounded-xl font-medium"
            style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca' }}
          >
            Temizle ×
          </button>
        )}
      </div>
    </>
  )
}
