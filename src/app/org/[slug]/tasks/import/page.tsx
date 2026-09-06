'use client'

export const dynamic = 'force-dynamic'

import { useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRouter, useParams } from 'next/navigation'
import { IL_SECENEKLERI } from '@/lib/iller'
import { supabase } from '@/lib/supabase/client'
import { useOrg } from '@/lib/supabase/orgContext'
import { yazabilirMi } from '@/lib/roller'
import { HEDEF_ALANLAR, type AlanAnahtari, type Esleme } from '@/lib/import/columnMap'

/**
 * Excel'den içe aktarma sihirbazı: Yükle → Önizle → Sonuç.
 *
 * Önizleme adımı sunucuya yazma yapmaz; kullanıcı eşlemeyi değiştirebilir ve
 * önizleme yeniden hesaplanır. Bu yüzden dosya istemcide tutuluyor.
 */

type Adim = 'yukle' | 'onizle' | 'sonuc'
type Mod = 'guncelle' | 'atla' | 'her_zaman_olustur'

interface SatirHatasi { alan: string; mesaj: string }

interface OnizlemeSatir {
  satirNo: number
  ham: Record<string, unknown>
  normalize: Record<string, unknown> | null
  hatalar: SatirHatasi[]
  uyarilar: string[]
  eslesiyor: boolean
}

interface Onizleme {
  batchId: string
  dosya: { ad: string; satirSayisi: number; sayfalar: string[]; secilenSayfa: string }
  basliklar: string[]
  esleme: Esleme
  oneriler: { sutun: string; alan: AlanAnahtari | null; guven: number; sebep: string }[]
  eksikZorunlu: string[]
  varsayimlar: string[]
  oncekiYukleme: { tarih: string; batchId: string } | null
  ozet: { toplam: number; gecerli: number; hatali: number; uyarili: number; eslesen: number; yeni: number; dosyaIciTekrar: number }
  eslesmeyenSorumlular: { ham: string; adet: number }[]
  taninmayanDeneyaplar: { ad: string; adet: number; onerilenIl: string | null }[]
  satirlar: OnizlemeSatir[]
  satirKirpildi: boolean
}

interface Sonuc { batchId: string; olusturulan: number; guncellenen: number; atlanan: number }

const MODLAR: { value: Mod; label: string; desc: string }[] = [
  { value: 'guncelle',           label: 'Eşleşeni güncelle', desc: 'Var olan görev güncellenir, yenisi eklenir. Kopya oluşmaz.' },
  { value: 'atla',               label: 'Eşleşeni atla',     desc: 'Var olan görevlere dokunulmaz, yalnızca yeniler eklenir.' },
  { value: 'her_zaman_olustur',  label: 'Hepsini yeni ekle', desc: 'Eşleşme aranmaz. Yanlışlıkla iki kez yüklerseniz kopya oluşur.' },
]

export default function ImportPage() {
  const router = useRouter()
  const params = useParams()
  const slug = params.slug as string
  const { org, orgRole, loading: orgLoading } = useOrg()

  const [adim, setAdim] = useState<Adim>('yukle')
  const [dosya, setDosya] = useState<File | null>(null)
  const [onizleme, setOnizleme] = useState<Onizleme | null>(null)
  const [sonuc, setSonuc] = useState<Sonuc | null>(null)
  const [mod, setMod] = useState<Mod>('guncelle')
  const [yalnizGecerli, setYalnizGecerli] = useState(true)
  const [yukleniyor, setYukleniyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const [suzgec, setSuzgec] = useState<'tumu' | 'hatali' | 'uyarili'>('tumu')
  const [deneyapIlleri, setDeneyapIlleri] = useState<Record<string, string>>({})
  const [deneyapOlusuyor, setDeneyapOlusuyor] = useState(false)
  const [geriAliniyor, setGeriAliniyor] = useState(false)
  const [geriSonuc, setGeriSonuc] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const token = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }, [])

  /* ── Şablon indir ── */
  async function sablonIndir() {
    const t = await token()
    const res = await fetch(`/api/org/${slug}/import/sablon`, { headers: { Authorization: `Bearer ${t}` } })
    if (!res.ok) { setHata('Şablon indirilemedi.'); return }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'DENEYAP-gorev-sablonu.xlsx'
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  /* ── Önizleme ── */
  async function onizlemeAl(f: File, esleme?: Esleme) {
    setYukleniyor(true); setHata(null)
    const fd = new FormData()
    fd.append('dosya', f)
    if (esleme) fd.append('esleme', JSON.stringify(esleme))
    fd.append('secenekler', JSON.stringify({ mod }))

    const t = await token()
    const res = await fetch(`/api/org/${slug}/import/onizleme`, {
      method: 'POST', headers: { Authorization: `Bearer ${t}` }, body: fd,
    })
    const j = await res.json()
    setYukleniyor(false)
    if (!res.ok) { setHata(j.error ?? 'Dosya işlenemedi.'); return }
    setOnizleme(j); setAdim('onizle')
  }

  function dosyaSecildi(f: File | null) {
    if (!f) return
    setDosya(f); setOnizleme(null); setSonuc(null)
    onizlemeAl(f)
  }

  function eslemeDegistir(sutun: string, alan: AlanAnahtari | null) {
    if (!onizleme || !dosya) return
    const yeni: Esleme = { ...onizleme.esleme, [sutun]: alan }
    // Aynı alan başka sütuna atanmışsa onu boşalt — yoksa biri diğerini ezer
    if (alan) {
      for (const [s, a] of Object.entries(yeni)) {
        if (s !== sutun && a === alan) yeni[s] = null
      }
    }
    onizlemeAl(dosya, yeni)
  }

  /* ── Tanınmayan DENEYAP'ları oluştur ──────────────────────────────────
   *
   * Oluşturduktan sonra AYRI bir "yeniden çöz" ucu çağırmak yerine önizlemeyi
   * baştan çalıştırıyoruz. Dosya zaten tarayıcıda duruyor ve bu yol
   * önizleme ile uygulamanın bit bit aynı kodtan geçmesini TANIM GEREĞİ
   * garanti eder — iki ayrı normalize yolu tutmak sessiz ayrışma riski
   * doğururdu. Sütun eşlemesi değiştiğinde de zaten aynı şey yapılıyor.
   */
  async function deneyaplariOlustur(hedefler: { ad: string; il: string }[]) {
    if (!dosya || !hedefler.length) return
    setDeneyapOlusuyor(true); setHata(null)
    try {
      const t = await token()
      for (const h of hedefler) {
        const res = await fetch(`/api/org/${slug}/deneyaplar`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ad: h.ad, il: h.il }),
        })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          setHata(j.error ?? `"${h.ad}" oluşturulamadı.`)
          setDeneyapOlusuyor(false)
          return
        }
      }
      await onizlemeAl(dosya, onizleme?.esleme)
    } finally {
      setDeneyapOlusuyor(false)
    }
  }

  /* ── Uygula ── */
  async function uygula() {
    if (!onizleme) return
    setYukleniyor(true); setHata(null)
    const t = await token()
    const res = await fetch(`/api/org/${slug}/import/uygula`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchId: onizleme.batchId, yalnizGecerli, mod }),
    })
    const j = await res.json()
    setYukleniyor(false)
    if (!res.ok) { setHata(j.error ?? 'İçe aktarma uygulanamadı.'); return }
    setSonuc(j); setAdim('sonuc')
  }

  /* ── Geri al ── */
  async function geriAl() {
    if (!sonuc || !confirm('Bu içe aktarma geri alınacak. Eklenen görevler silinecek, güncellenenler eski hâline dönecek. Emin misiniz?')) return
    setGeriAliniyor(true)
    const t = await token()
    const res = await fetch(`/api/org/${slug}/import/${sonuc.batchId}/geri-al`, {
      method: 'POST', headers: { Authorization: `Bearer ${t}` },
    })
    const j = await res.json()
    setGeriAliniyor(false)
    if (!res.ok) { setHata(j.error ?? 'Geri alınamadı.'); return }
    setGeriSonuc(
      `${j.silinen} görev silindi, ${j.geri_alinan} görev eski hâline döndü` +
      (j.korunan > 0 ? `, ${j.korunan} görev korundu (içe aktarmadan sonra düzenlenmişti).` : '.'),
    )
  }

  /* ── Yetki ── */
  if (orgLoading) {
    return <div className="min-h-screen p-6" style={{ background: '#f5f7fa' }}><div className="skeleton h-40 rounded-2xl max-w-3xl mx-auto" /></div>
  }
  if (!yazabilirMi(orgRole)) {
    router.replace(`/org/${slug}/tasks`)
    return null
  }

  const gorunurSatirlar = onizleme?.satirlar.filter(s =>
    suzgec === 'tumu' ? true : suzgec === 'hatali' ? s.hatalar.length > 0 : s.uyarilar.length > 0,
  ) ?? []

  return (
    <div className="min-h-screen px-4 sm:px-6 py-5" style={{ background: '#f5f7fa' }}>
      <div className="max-w-5xl mx-auto space-y-5">

        {/* ── Başlık + adımlar ── */}
        <div>
          <Link href={`/org/${slug}/tasks`} className="text-sm" style={{ color: '#2288c9' }}>← Görevler</Link>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight mt-1" style={{ color: '#0d1a2a' }}>
            Excel&apos;den İçe Aktar
          </h1>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {([['yukle', '1 Dosya'], ['onizle', '2 Önizleme'], ['sonuc', '3 Sonuç']] as const).map(([a, etiket]) => {
              const aktif = adim === a
              const gecti = (['yukle', 'onizle', 'sonuc'] as Adim[]).indexOf(adim) > (['yukle', 'onizle', 'sonuc'] as Adim[]).indexOf(a)
              return (
                <span key={a} className="text-xs font-semibold px-3 py-1.5 rounded-full" style={{
                  background: aktif ? '#2288c9' : gecti ? '#d1fae5' : '#fff',
                  color: aktif ? '#fff' : gecti ? '#065f46' : '#94a3b8',
                  border: `1px solid ${aktif ? '#2288c9' : gecti ? '#6ee7b7' : '#e5e7eb'}`,
                }}>{gecti ? '✓ ' : ''}{etiket}</span>
              )
            })}
          </div>
        </div>

        {hata && (
          <div className="rounded-xl px-4 py-3 text-sm" style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' }}>
            {hata}
          </div>
        )}

        {/* ── ADIM 1 ── */}
        {adim === 'yukle' && (
          <div className="card">
            <div
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); dosyaSecildi(e.dataTransfer.files[0] ?? null) }}
              onClick={() => inputRef.current?.click()}
              className="rounded-2xl flex flex-col items-center justify-center gap-2 cursor-pointer"
              style={{ border: '2px dashed #cbd5e1', background: '#fbfdff', padding: '44px 20px' }}
            >
              <div className="text-3xl">📄</div>
              <div className="font-semibold" style={{ color: '#0d1a2a' }}>
                {yukleniyor ? 'Dosya işleniyor…' : 'Excel dosyanızı buraya bırakın'}
              </div>
              <div className="text-xs" style={{ color: '#94a3b8' }}>
                .xlsx veya .csv · en fazla 4 MB · 20.000 satır
              </div>
              <input
                ref={inputRef} type="file" accept=".xlsx,.csv" className="hidden"
                onChange={e => dosyaSecildi(e.target.files?.[0] ?? null)}
              />
            </div>

            <div className="mt-5 rounded-xl p-4" style={{ background: '#f0fdfa', border: '1px solid #5eead4' }}>
              <div className="font-semibold text-sm mb-1" style={{ color: '#0f766e' }}>
                Excel&apos;iniz farklı görünüyorsa sorun değil
              </div>
              <p className="text-xs mb-3" style={{ color: '#475569' }}>
                Sütunlarınızı bir sonraki adımda eşleştirebilirsiniz. Hazır şablonu kullanmak
                isterseniz sütun başlıkları ve açılır listeler doğru şekilde tanımlı gelir —
                &quot;Sorumlu&quot; listesi ekibinizin e-postalarıyla dolu olur.
              </p>
              <button onClick={sablonIndir} className="btn-secondary text-sm">
                Şablonu İndir (.xlsx)
              </button>
            </div>
          </div>
        )}

        {/* ── ADIM 2 ── */}
        {adim === 'onizle' && onizleme && (
          <>
            {onizleme.oncekiYukleme && (
              <div className="rounded-xl px-4 py-3 text-sm" style={{ background: '#fffbeb', color: '#92400e', border: '1px solid #fcd34d' }}>
                Bu dosya daha önce{' '}
                <strong>{new Date(onizleme.oncekiYukleme.tarih).toLocaleDateString('tr-TR')}</strong>{' '}
                tarihinde içe aktarılmış. &quot;Eşleşeni güncelle&quot; modunda kopya oluşmaz.
              </div>
            )}

            {/* Özet */}
            <div className="card">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div>
                  <div className="font-bold" style={{ color: '#0d1a2a' }}>{onizleme.dosya.ad}</div>
                  <div className="text-xs" style={{ color: '#94a3b8' }}>
                    {onizleme.dosya.secilenSayfa} · {onizleme.ozet.toplam} satır
                  </div>
                </div>
                <button onClick={() => { setAdim('yukle'); setOnizleme(null) }} className="btn-secondary text-sm">
                  Başka dosya seç
                </button>
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                <Rozet renk="#065f46" bg="#d1fae5" bd="#6ee7b7" metin={`${onizleme.ozet.gecerli} geçerli`} />
                {onizleme.ozet.uyarili > 0 && <Rozet renk="#92400e" bg="#fef3c7" bd="#fcd34d" metin={`${onizleme.ozet.uyarili} uyarı`} />}
                {onizleme.ozet.hatali > 0 && <Rozet renk="#991b1b" bg="#fee2e2" bd="#fca5a5" metin={`${onizleme.ozet.hatali} hata`} />}
                <Rozet renk="#1e40af" bg="#eff6ff" bd="#93c5fd" metin={`${onizleme.ozet.eslesen} eşleşen · ${onizleme.ozet.yeni} yeni`} />
                {onizleme.ozet.dosyaIciTekrar > 0 && <Rozet renk="#7c2d12" bg="#ffedd5" bd="#fdba74" metin={`${onizleme.ozet.dosyaIciTekrar} tekrar eden satır`} />}
              </div>

              <div className="rounded-xl p-3 mb-4" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <div className="text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: '#64748b' }}>
                  Nasıl okundu
                </div>
                <ul className="space-y-0.5">
                  {onizleme.varsayimlar.map((v, i) => (
                    <li key={i} className="text-xs" style={{ color: '#475569' }}>· {v}</li>
                  ))}
                </ul>
              </div>

              {onizleme.eksikZorunlu.length > 0 && (
                <div className="rounded-xl px-4 py-3 text-sm mb-4" style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' }}>
                  Zorunlu alan eşlenmedi: <strong>{onizleme.eksikZorunlu.join(', ')}</strong>. Aşağıdan eşleştirin.
                </div>
              )}

              {onizleme.taninmayanDeneyaplar.length > 0 && (
                <div className="rounded-xl px-4 py-3 mb-4" style={{ background: '#eff6ff', border: '1px solid #93c5fd' }}>
                  <div className="text-sm font-semibold mb-1" style={{ color: '#1e40af' }}>
                    Tanınmayan DENEYAP&apos;lar ({onizleme.taninmayanDeneyaplar.length})
                  </div>
                  <p className="text-xs mb-3" style={{ color: '#1e3a8a' }}>
                    Bu satırlar <strong>reddedilmedi</strong> — DENEYAP bağı olmadan aktarılacak.
                    Oluşturursanız görevler doğrudan o DENEYAP&apos;a bağlanır ve il ondan alınır.
                  </p>
                  <div className="space-y-2">
                    {onizleme.taninmayanDeneyaplar.map(d => {
                      const secili = deneyapIlleri[d.ad] ?? d.onerilenIl ?? ''
                      return (
                        <div key={d.ad} className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-medium flex-1 min-w-[140px]" style={{ color: '#1e40af' }}>
                            {d.ad} <span style={{ color: '#64748b' }}>({d.adet} satır)</span>
                          </span>
                          <select
                            value={secili}
                            onChange={e => setDeneyapIlleri(v => ({ ...v, [d.ad]: e.target.value }))}
                            className="text-xs px-2 py-1 rounded-lg"
                            style={{ border: '1px solid #93c5fd', background: '#fff', color: '#1e3a8a' }}
                          >
                            <option value="">İl seçin…</option>
                            {IL_SECENEKLERI.map(il => <option key={il} value={il}>{il}</option>)}
                          </select>
                          <button
                            onClick={() => deneyaplariOlustur([{ ad: d.ad, il: secili }])}
                            disabled={!secili || deneyapOlusuyor || yukleniyor}
                            className="text-xs font-semibold px-3 py-1 rounded-lg disabled:opacity-40"
                            style={{ background: '#2288c9', color: '#fff', border: 'none' }}
                          >
                            {deneyapOlusuyor ? 'Oluşturuluyor…' : 'Oluştur'}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                  {onizleme.taninmayanDeneyaplar.every(d => (deneyapIlleri[d.ad] ?? d.onerilenIl)) &&
                   onizleme.taninmayanDeneyaplar.length > 1 && (
                    <button
                      onClick={() => deneyaplariOlustur(onizleme.taninmayanDeneyaplar.map(d => ({
                        ad: d.ad, il: deneyapIlleri[d.ad] ?? d.onerilenIl ?? '',
                      })))}
                      disabled={deneyapOlusuyor || yukleniyor}
                      className="mt-3 text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-40"
                      style={{ background: '#fff', color: '#1e40af', border: '1px solid #93c5fd' }}
                    >
                      Hepsini oluştur ({onizleme.taninmayanDeneyaplar.length})
                    </button>
                  )}
                </div>
              )}

              {onizleme.eslesmeyenSorumlular.length > 0 && (
                <div className="rounded-xl px-4 py-3 mb-4" style={{ background: '#fffbeb', border: '1px solid #fcd34d' }}>
                  <div className="text-sm font-semibold mb-1" style={{ color: '#92400e' }}>
                    Ekipte bulunamayan sorumlular
                  </div>
                  <p className="text-xs mb-2" style={{ color: '#78350f' }}>
                    Bu görevler <strong>atanmamış</strong> olarak eklenecek; sonradan atayabilirsiniz.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {onizleme.eslesmeyenSorumlular.map(s => (
                      <span key={s.ham} className="text-xs px-2 py-0.5 rounded-lg" style={{ background: '#fff', border: '1px solid #fcd34d', color: '#92400e' }}>
                        {s.ham} ({s.adet})
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Sütun eşleme */}
            <div className="card">
              <h2 className="font-semibold mb-1" style={{ color: '#0d1a2a' }}>Sütun Eşleştirme</h2>
              <p className="text-xs mb-3" style={{ color: '#94a3b8' }}>
                Yanlış eşleşen bir sütun varsa değiştirin — önizleme yeniden hesaplanır.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {onizleme.basliklar.map(sutun => {
                  const oneri = onizleme.oneriler.find(o => o.sutun === sutun)
                  const secili = onizleme.esleme[sutun] ?? ''
                  return (
                    <div key={sutun} className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate" style={{ color: '#374151' }}>{sutun}</div>
                        {oneri && <div className="text-xs truncate" style={{ color: '#9ca3af' }}>{oneri.sebep}</div>}
                      </div>
                      <select
                        value={secili}
                        onChange={e => eslemeDegistir(sutun, (e.target.value || null) as AlanAnahtari | null)}
                        disabled={yukleniyor}
                        className="text-xs font-medium px-2 py-1.5 rounded-lg shrink-0"
                        style={{ background: '#fff', border: '1px solid #cbd5e1', color: '#374151', maxWidth: 165 }}
                      >
                        <option value="">— Aktarma —</option>
                        {HEDEF_ALANLAR.map(a => (
                          <option key={a.key} value={a.key}>{a.label}{a.zorunlu ? ' *' : ''}</option>
                        ))}
                      </select>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Satırlar */}
            <div className="card">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h2 className="font-semibold" style={{ color: '#0d1a2a' }}>Satırlar</h2>
                <div className="flex gap-1.5">
                  {([['tumu', 'Tümü'], ['uyarili', 'Uyarılı'], ['hatali', 'Hatalı']] as const).map(([v, l]) => (
                    <button key={v} onClick={() => setSuzgec(v)}
                      className="text-xs font-semibold px-2.5 py-1 rounded-lg"
                      style={{
                        background: suzgec === v ? '#2288c9' : '#fff',
                        color: suzgec === v ? '#fff' : '#64748b',
                        border: `1px solid ${suzgec === v ? '#2288c9' : '#e5e7eb'}`,
                      }}>{l}</button>
                  ))}
                </div>
              </div>

              <div style={{ maxHeight: 380, overflowY: 'auto' }} className="space-y-1.5">
                {gorunurSatirlar.map(s => {
                  const hataliMi = s.hatalar.length > 0
                  const uyariliMi = !hataliMi && s.uyarilar.length > 0
                  return (
                    <div key={s.satirNo} className="rounded-xl px-3 py-2" style={{
                      background: hataliMi ? '#fff1f2' : uyariliMi ? '#fffbeb' : '#f8fafc',
                      border: `1px solid ${hataliMi ? '#fecaca' : uyariliMi ? '#fde68a' : '#e2e8f0'}`,
                    }}>
                      <div className="flex items-start gap-2">
                        <span className="text-xs font-mono shrink-0 mt-0.5" style={{ color: '#94a3b8' }}>{s.satirNo}</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate" style={{ color: '#0d1a2a' }}>
                            {String(s.normalize?.title ?? Object.values(s.ham)[0] ?? '—')}
                          </div>
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {s.normalize?.il ? <Mini metin={`📍 ${s.normalize.il}`} /> : null}
                            {s.eslesiyor && <Mini metin="↻ mevcut görev güncellenecek" renk="#1e40af" bg="#eff6ff" />}
                          </div>
                          {s.hatalar.map((h, i) => (
                            <div key={i} className="text-xs mt-1" style={{ color: '#b91c1c' }}>✕ {h.mesaj}</div>
                          ))}
                          {s.uyarilar.map((u, i) => (
                            <div key={i} className="text-xs mt-1" style={{ color: '#92400e' }}>⚠ {u}</div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )
                })}
                {gorunurSatirlar.length === 0 && (
                  <div className="text-sm text-center py-6" style={{ color: '#94a3b8' }}>Bu süzgeçte satır yok.</div>
                )}
              </div>

              {onizleme.satirKirpildi && (
                <p className="text-xs mt-3" style={{ color: '#94a3b8' }}>
                  Yalnızca ilk 500 satır gösteriliyor. Aktarma tüm satırları kapsar.
                </p>
              )}
            </div>

            {/* Mod + uygula */}
            <div className="card">
              <h2 className="font-semibold mb-1" style={{ color: '#0d1a2a' }}>Aynı görev zaten varsa</h2>
              <p className="text-xs mb-3" style={{ color: '#94a3b8' }}>
                Eşleştirme &quot;Kod / Referans&quot; sütununa, o yoksa &quot;Görev Başlığı + İl&quot; ikilisine göre yapılır.
              </p>
              <div className="grid gap-2 sm:grid-cols-3 mb-4">
                {MODLAR.map(m => {
                  const secili = mod === m.value
                  return (
                    <button key={m.value} type="button" onClick={() => setMod(m.value)}
                      className="text-left rounded-xl" style={{
                        padding: '10px 12px',
                        background: secili ? '#eff6ff' : '#fff',
                        border: `1.5px solid ${secili ? '#2288c9' : '#e5e7eb'}`,
                      }}>
                      <div className="text-sm font-semibold" style={{ color: secili ? '#1e40af' : '#374151' }}>{m.label}</div>
                      <div className="text-xs mt-0.5" style={{ color: '#9ca3af' }}>{m.desc}</div>
                    </button>
                  )
                })}
              </div>

              <div className="rounded-xl px-3 py-2 mb-4 text-xs" style={{ background: '#f0fdfa', border: '1px solid #5eead4', color: '#0f766e' }}>
                Boş bıraktığınız hücreler mevcut veriyi <strong>silmez</strong> — örneğin &quot;Durum&quot;
                sütununu boş bırakırsanız uygulamada elle yapılmış güncelleme korunur.
              </div>

              {onizleme.ozet.hatali > 0 && (
                <label className="flex items-start gap-2 cursor-pointer mb-4">
                  <input type="checkbox" checked={yalnizGecerli} onChange={e => setYalnizGecerli(e.target.checked)}
                    className="mt-0.5 accent-[#2288c9] w-4 h-4" />
                  <span className="text-sm" style={{ color: '#374151' }}>
                    Yalnızca geçerli satırları aktar ({onizleme.ozet.hatali} hatalı satır atlanacak)
                  </span>
                </label>
              )}

              <button
                onClick={uygula}
                disabled={yukleniyor || onizleme.eksikZorunlu.length > 0 || onizleme.ozet.gecerli === 0 || (onizleme.ozet.hatali > 0 && !yalnizGecerli)}
                className="btn-primary"
              >
                {yukleniyor ? 'Aktarılıyor…' : `${onizleme.ozet.gecerli} görevi aktar`}
              </button>
            </div>
          </>
        )}

        {/* ── ADIM 3 ── */}
        {adim === 'sonuc' && sonuc && (
          <div className="card">
            <div className="text-center py-4">
              <div className="text-4xl mb-2">✅</div>
              <h2 className="text-lg font-bold" style={{ color: '#0d1a2a' }}>İçe aktarma tamamlandı</h2>
              <p className="text-sm mt-1" style={{ color: '#64748b' }}>
                {sonuc.olusturulan} görev oluşturuldu
                {sonuc.guncellenen > 0 && `, ${sonuc.guncellenen} görev güncellendi`}
                {sonuc.atlanan > 0 && `, ${sonuc.atlanan} görev atlandı`}.
              </p>
            </div>

            {geriSonuc && (
              <div className="rounded-xl px-4 py-3 text-sm mb-4" style={{ background: '#f0fdfa', color: '#0f766e', border: '1px solid #5eead4' }}>
                {geriSonuc}
              </div>
            )}

            <div className="flex flex-wrap gap-2 justify-center">
              <Link href={`/org/${slug}/tasks`} className="btn-primary">Görevlere Git</Link>
              <button onClick={() => { setAdim('yukle'); setDosya(null); setOnizleme(null); setSonuc(null); setGeriSonuc(null) }}
                className="btn-secondary">Yeni Dosya Aktar</button>
              {!geriSonuc && (
                <button onClick={geriAl} disabled={geriAliniyor}
                  className="text-sm font-semibold px-4 py-2 rounded-xl"
                  style={{ background: '#fff', color: '#dc2626', border: '1.5px solid #fca5a5' }}>
                  {geriAliniyor ? 'Geri alınıyor…' : 'Bu İçe Aktarmayı Geri Al'}
                </button>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

function Rozet({ metin, renk, bg, bd }: { metin: string; renk: string; bg: string; bd: string }) {
  return (
    <span className="text-xs font-semibold px-2.5 py-1 rounded-lg" style={{ background: bg, color: renk, border: `1px solid ${bd}` }}>
      {metin}
    </span>
  )
}

function Mini({ metin, renk = '#0f766e', bg = '#f0fdfa' }: { metin: string; renk?: string; bg?: string }) {
  return <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: bg, color: renk }}>{metin}</span>
}
