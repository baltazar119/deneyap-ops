'use client'

import Link from 'next/link'
import {
  yaklasanTerminler, kritikVeGecikmis, ilDeneyapKirilimi, sonHareketler, yaklasanToplantilar,
} from '@/lib/panelOzet'
import { gecikmisMi } from '@/lib/gorevTermin'
import type { Task, Deneyap, Meeting } from '@/types/database'

/**
 * Panelin liste blokları.
 *
 * Hepsi aynı kabuğu (`Blok`) paylaşıyor: başlık, sayaç, "tümü →" bağlantısı ve
 * boş durum metni. Boş durumların hepsi ayrı ayrı yazıldı — "kayıt yok" demek
 * ile "gecikmiş görev yok" demek kullanıcı için aynı şey değil; ikincisi iyi
 * haber.
 */

const PRIORITY_RENK: Record<string, string> = {
  critical: '#dc2626', high: '#d97706', normal: '#2288c9', low: '#6b7280',
}

function tarih(v: string | null): string {
  if (!v) return '—'
  return new Date(v).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
}

function Blok({
  baslik, sayac, link, linkEtiket, bosMesaj, children,
}: {
  baslik: string
  sayac?: number
  link?: string
  linkEtiket?: string
  bosMesaj: string
  children: React.ReactNode
}) {
  const bos = !children || (Array.isArray(children) && children.length === 0)
  return (
    <div className="rounded-2xl overflow-hidden flex flex-col" style={{ background: '#fff', border: '1px solid #e5e7eb' }}>
      <div className="shrink-0 px-4 md:px-5 py-3 flex items-center justify-between gap-2"
        style={{ borderBottom: '1px solid #f3f4f6' }}>
        <h2 className="text-sm font-semibold" style={{ color: '#111827' }}>
          {baslik}
          {sayac !== undefined && (
            <span className="ml-1.5 text-xs font-normal" style={{ color: '#9ca3af' }}>{sayac}</span>
          )}
        </h2>
        {link && (
          <Link href={link} className="text-xs font-semibold shrink-0"
            style={{ color: '#2288c9', textDecoration: 'none' }}>
            {linkEtiket ?? 'Tümü'} →
          </Link>
        )}
      </div>
      {bos ? (
        <div className="px-5 py-8 text-center text-xs" style={{ color: '#9ca3af' }}>{bosMesaj}</div>
      ) : (
        <div className="divide-y" style={{ borderColor: '#f3f4f6' }}>{children}</div>
      )}
    </div>
  )
}

function GorevSatiri({ t, slug, saga }: { t: Task; slug: string; saga?: React.ReactNode }) {
  const gecikti = gecikmisMi(t)
  return (
    <Link href={`/org/${slug}/tasks/${t.id}`}
      className="flex items-center gap-3 px-4 md:px-5 py-2.5 hover:bg-slate-50 transition-colors"
      style={{ textDecoration: 'none' }}>
      <span className="w-1 self-stretch rounded-full shrink-0"
        style={{ background: PRIORITY_RENK[t.priority ?? 'normal'], minHeight: 26 }} />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium truncate" style={{ color: '#111827' }}>{t.title}</div>
        {t.il && <div className="text-[11px]" style={{ color: '#9ca3af' }}>{t.il}</div>}
      </div>
      {saga ?? (
        <span className="text-xs font-medium shrink-0" style={{ color: gecikti ? '#dc2626' : '#9ca3af' }}>
          {gecikti && '⚠ '}{tarih(t.due_date)}
        </span>
      )}
    </Link>
  )
}

export function YaklasanTerminlerBloku({ gorevler, slug }: { gorevler: Task[]; slug: string }) {
  const liste = yaklasanTerminler(gorevler)
  return (
    <Blok
      baslik="Yaklaşan terminler"
      sayac={liste.length}
      link={`/org/${slug}/tasks?termin=yaklasan`}
      bosMesaj="Önümüzdeki 7 günde termini dolan görev yok."
    >
      {liste.map(t => <GorevSatiri key={t.id} t={t} slug={slug} />)}
    </Blok>
  )
}

export function KritikVeGecikmisBloku({ gorevler, slug }: { gorevler: Task[]; slug: string }) {
  const liste = kritikVeGecikmis(gorevler)
  return (
    <Blok
      baslik="Kritik ve gecikmiş"
      sayac={liste.length}
      link={`/org/${slug}/tasks?termin=geciken`}
      // Boş olması iyi haber; "kayıt yok" demek bunu anlatmıyor.
      bosMesaj="Kritik ya da gecikmiş görev yok."
    >
      {liste.map(t => <GorevSatiri key={t.id} t={t} slug={slug} />)}
    </Blok>
  )
}

export function IlDeneyapBloku({
  gorevler, deneyaplar, slug,
}: { gorevler: Task[]; deneyaplar: Deneyap[]; slug: string }) {
  const satirlar = ilDeneyapKirilimi(gorevler, deneyaplar)
  return (
    <Blok
      baslik="İl / DENEYAP durumu"
      sayac={satirlar.length}
      link={`/org/${slug}/tasks`}
      bosMesaj="Henüz görev yok."
    >
      {satirlar.map(s => (
        <div key={s.anahtar} className="flex items-center gap-3 px-4 md:px-5 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium truncate" style={{ color: '#111827' }}>{s.etiket}</div>
            {s.altEtiket && <div className="text-[11px]" style={{ color: '#9ca3af' }}>{s.altEtiket}</div>}
          </div>
          <div className="flex items-center gap-3 shrink-0 text-xs">
            <span title="açık görev" style={{ color: '#0369a1' }}>{s.acik} açık</span>
            {s.geciken > 0 && (
              <span title="gecikmiş görev" className="font-semibold" style={{ color: '#dc2626' }}>
                {s.geciken} gecikmiş
              </span>
            )}
            <span title="tamamlanan" style={{ color: '#9ca3af' }}>{s.tamamlanan}/{s.toplam}</span>
          </div>
        </div>
      ))}
    </Blok>
  )
}

export function SonHareketlerBloku({ gorevler, slug }: { gorevler: Task[]; slug: string }) {
  const liste = sonHareketler(gorevler)
  return (
    <Blok
      baslik="Son dokunulan işler"
      link={`/org/${slug}/tasks`}
      bosMesaj="Henüz hareket yok."
    >
      {liste.map(t => (
        <GorevSatiri key={t.id} t={t} slug={slug} saga={
          <span className="text-xs shrink-0" style={{ color: '#9ca3af' }}>
            {tarih(t.updated_at ?? t.created_at)}
          </span>
        } />
      ))}
    </Blok>
  )
}

export function ToplantilarBloku({ toplantilar, slug }: { toplantilar: Meeting[]; slug: string }) {
  const liste = yaklasanToplantilar(toplantilar)
  return (
    <Blok
      baslik="Yaklaşan toplantılar"
      sayac={liste.length}
      link={`/org/${slug}/meetings`}
      bosMesaj="Planlanmış toplantı yok."
    >
      {liste.map(m => (
        <Link key={m.id} href={`/org/${slug}/meetings`}
          className="flex items-center gap-3 px-4 md:px-5 py-2.5 hover:bg-slate-50 transition-colors"
          style={{ textDecoration: 'none' }}>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium truncate" style={{ color: '#111827' }}>{m.title}</div>
          </div>
          <span className="text-xs font-medium shrink-0" style={{ color: '#0369a1' }}>
            {new Date(m.start_time).toLocaleString('tr-TR', {
              day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
            })}
          </span>
        </Link>
      ))}
    </Blok>
  )
}
