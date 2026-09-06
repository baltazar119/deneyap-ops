'use client'

import ResponsiveModal from '@/components/responsive/ResponsiveModal'
import { TASK_TYPES } from '@/lib/taskTypes'
import { STATUS_OPTIONS, PRIORITY_OPTIONS, gecikmisMi, yaklasanMi, type TaskWithAssignee } from './gorevMeta'
import { ATANMAMIS, type GorevFiltreDegerleri } from '@/lib/useGorevFiltreleri'
import { deneyaplariIleGoreGrupla, deneyapKisaEtiket } from '@/lib/deneyap'
import type { Profile, TaskType, Deneyap } from '@/types/database'

interface Props {
  acik: boolean
  onKapat: () => void
  /** Sayaçların tabanı DAİMA kapsam süzülmüş liste — ham `tasks` değil. */
  gorunurTasks: TaskWithAssignee[]
  filtreler: GorevFiltreDegerleri
  ayarla: <K extends keyof GorevFiltreDegerleri>(alan: K, deger: GorevFiltreDegerleri[K]) => void
  temizle: () => void
  filtreSayisi: number
  kullanilanIller: string[]
  members: Profile[]
  deneyaplar: Deneyap[]
  /** Kullanıcının ili — DENEYAP listesinde o il en üstte. */
  kullaniciIl?: string | null
}

/**
 * Filtre paneli — "Filtrele" düğmesinin arkasında.
 *
 * Faz 1'de bu kontroller mobil ve masaüstünde iki ayrı kümeydi (mobilde durum
 * sekmeleri + öncelik chip'leri, masaüstünde chip'ler + dört etiketsiz
 * select). Artık TEK küme, etiketli gruplar halinde; `ResponsiveModal`
 * sayesinde masaüstünde ortalı, mobilde alttan sheet.
 */
export default function GorevFiltrePaneli({
  acik, onKapat, gorunurTasks, filtreler, ayarla, temizle, filtreSayisi, kullanilanIller, members,
  deneyaplar, kullaniciIl,
}: Props) {
  const sayi = (esler: (t: TaskWithAssignee) => boolean) => gorunurTasks.filter(esler).length

  const terminSecenekleri = [
    { deger: 'all'      as const, etiket: 'Tümü',            adet: gorunurTasks.length },
    { deger: 'geciken'  as const, etiket: 'Gecikenler',      adet: sayi(gecikmisMi) },
    { deger: 'yaklasan' as const, etiket: 'Bu hafta biten',  adet: sayi(yaklasanMi) },
  ]

  return (
    <ResponsiveModal open={acik} onClose={onKapat} title="Filtrele" maxWidth="md">
      <div className="space-y-5">

        {/* Termin */}
        <Grup baslik="Termin">
          <div className="flex flex-wrap gap-1.5">
            {terminSecenekleri.map(({ deger, etiket, adet }) => (
              <Chip
                key={deger}
                aktif={filtreler.termin === deger}
                onClick={() => ayarla('termin', deger)}
                renk={deger === 'geciken' ? '#dc2626' : deger === 'yaklasan' ? '#b45309' : '#0f2942'}
                bg={deger === 'geciken' ? '#fee2e2' : deger === 'yaklasan' ? '#fef3c7' : '#e2e8f0'}
              >
                {etiket} <span className="font-bold">{adet}</span>
              </Chip>
            ))}
          </div>
        </Grup>

        {/* Öncelik */}
        <Grup baslik="Öncelik">
          <div className="flex flex-wrap gap-1.5">
            <Chip aktif={filtreler.priority === 'all'} onClick={() => ayarla('priority', 'all')} renk="#0f2942" bg="#e2e8f0">
              Tümü
            </Chip>
            {PRIORITY_OPTIONS.map(p => (
              <Chip
                key={p.value}
                aktif={filtreler.priority === p.value}
                onClick={() => ayarla('priority', filtreler.priority === p.value ? 'all' : p.value)}
                renk={p.color}
                bg={p.bg}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
                {p.label}
                {/* Kapanmış işler öncelik sayacını şişirmesin — "hâlâ açık kaç
                    kritik iş var" sorusunun cevabı bekleniyor. */}
                <span className="font-bold">{sayi(t => t.priority === p.value && t.status !== 'done')}</span>
              </Chip>
            ))}
          </div>
        </Grup>

        {/* Durum */}
        <Grup baslik="Durum">
          <div className="flex flex-wrap gap-1.5">
            <Chip aktif={filtreler.status === 'all'} onClick={() => ayarla('status', 'all')} renk="#0f2942" bg="#e2e8f0">
              Tümü <span className="font-bold">{gorunurTasks.length}</span>
            </Chip>
            {STATUS_OPTIONS.map(s => (
              <Chip
                key={s.value}
                aktif={filtreler.status === s.value}
                onClick={() => ayarla('status', filtreler.status === s.value ? 'all' : s.value)}
                renk="#0369a1"
                bg="#e0f2fe"
              >
                {s.label} <span className="font-bold">{sayi(t => t.status === s.value)}</span>
              </Chip>
            ))}
          </div>
        </Grup>

        {/* Tür */}
        <Grup baslik="Tür">
          <select
            value={filtreler.type}
            onChange={e => ayarla('type', e.target.value as TaskType | 'all')}
            className="input"
            aria-label="Tür filtresi"
          >
            <option value="all">Tüm Türler</option>
            {TASK_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Grup>

        {/* İl */}
        <Grup baslik="İl / Birim">
          <select
            value={filtreler.il}
            onChange={e => ayarla('il', e.target.value)}
            className="input"
            aria-label="İl filtresi"
          >
            {/* Yalnızca görevlerde fiilen kullanılan iller listeleniyor —
                82 seçenekli bir filtre kullanışsız olurdu.
                '' değeri "İl atanmamış" demek; 'all' ile karıştırılmamalı. */}
            <option value="all">Tüm İller</option>
            <option value="">İl atanmamış</option>
            {kullanilanIller.map(il => <option key={il} value={il}>{il}</option>)}
          </select>
        </Grup>

        {/* DENEYAP — yalnızca tanımlıysa gösterilir; hiç DENEYAP'ı olmayan
            bir çalışma alanında boş bir grup göstermek gürültü olurdu. */}
        {deneyaplar.length > 0 && (
          <Grup baslik="DENEYAP">
            <select
              value={filtreler.deneyap}
              onChange={e => ayarla('deneyap', e.target.value)}
              className="input"
              aria-label="DENEYAP filtresi"
            >
              {/* `il` filtresiyle aynı üç anlamlı desen: 'all' / '' / id */}
              <option value="all">Tüm DENEYAP&apos;lar</option>
              <option value="">DENEYAP atanmamış ({sayi(t => !t.deneyap_id)})</option>
              {deneyaplariIleGoreGrupla(deneyaplar, kullaniciIl).map(grup => (
                <optgroup key={grup.il} label={grup.il}>
                  {grup.deneyaplar.map(d => (
                    <option key={d.id} value={d.id}>
                      {deneyapKisaEtiket(d)}{d.aktif ? '' : ' (kapalı)'}
                      {' · '}{sayi(t => t.deneyap_id === d.id)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Grup>
        )}

        {/* Atanan */}
        <Grup baslik="Atanan Üye">
          <select
            value={filtreler.assignee}
            onChange={e => ayarla('assignee', e.target.value)}
            className="input"
            aria-label="Atanan üye filtresi"
          >
            <option value="all">Tüm Üyeler</option>
            {/* Boş metin değil ayrı bir sabit: `assignee_id` null olduğu için
                '' hiçbir görevle eşleşmiyordu ve liste sessizce boşalıyordu. */}
            <option value={ATANMAMIS}>Atanmamış ({sayi(t => !t.assignee_id)})</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.full_name || m.id}</option>)}
          </select>
        </Grup>

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={temizle}
            disabled={filtreSayisi === 0}
            className="btn-secondary flex-1"
            style={{ opacity: filtreSayisi === 0 ? 0.5 : 1 }}
          >
            Temizle
          </button>
          <button type="button" onClick={onKapat} className="btn-primary flex-1">
            {filtreSayisi > 0 ? `${filtreSayisi} filtreyle göster` : 'Kapat'}
          </button>
        </div>
      </div>
    </ResponsiveModal>
  )
}

function Grup({ baslik, children }: { baslik: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        className="text-[11px] font-bold uppercase mb-2"
        style={{ color: '#64748b', letterSpacing: '0.04em' }}
      >{baslik}</div>
      {children}
    </div>
  )
}

function Chip({
  aktif, onClick, renk, bg, children,
}: {
  aktif: boolean; onClick: () => void; renk: string; bg: string; children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={aktif}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
      style={{
        background: aktif ? bg : '#fff',
        color: aktif ? renk : '#64748b',
        border: `1px solid ${aktif ? renk : '#e5e7eb'}`,
      }}
    >
      {children}
    </button>
  )
}
