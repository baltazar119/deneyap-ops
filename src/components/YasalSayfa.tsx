import Link from 'next/link'
import Image from 'next/image'

/**
 * Yasal sayfaların ortak kabuğu (KVKK, gizlilik, kullanım şartları, DPA).
 *
 * İçerik yapısal olarak veriliyor ki dört sayfa da aynı tipografiyi ve
 * bölüm numaralandırmasını paylaşsın.
 */

export type Blok =
  | { tip: 'p'; metin: string }
  | { tip: 'liste'; maddeler: string[] }
  | { tip: 'tablo'; basliklar: string[]; satirlar: string[][] }
  | { tip: 'not'; metin: string }
  | { tip: 'altbaslik'; metin: string }

export interface Bolum {
  baslik: string
  bloklar: Blok[]
}

interface Props {
  baslik: string
  ustBaslik: string
  guncelleme: string
  girisMetni: string
  bolumler: Bolum[]
}

/** Kurumun doldurması gereken alanlar — gözden kaçmasın diye görünür işaretli */
export const KURUM = {
  unvan: 'T3 Vakfı (Türkiye Teknoloji Takımı Vakfı)',
  program: 'DENEYAP Türkiye',
  iletisim: 'kvkk@t3vakfi.org',
  adres: '[KURUM ADRESİ]',
  verbis: '[VERBİS KAYIT NO]',
}

const S = {
  sayfa:   { background: '#f5f7fa', minHeight: '100vh', padding: '32px 16px 64px' },
  kart:    { maxWidth: 820, margin: '0 auto', background: '#fff', borderRadius: 20, padding: '40px 44px', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' },
  h1:      { fontSize: 28, fontWeight: 800 as const, color: '#0d1a2a', margin: '0 0 6px', letterSpacing: '-0.02em' },
  ust:     { fontSize: 12, fontWeight: 700 as const, color: '#2288c9', textTransform: 'uppercase' as const, letterSpacing: '0.08em', margin: '0 0 10px' },
  tarih:   { fontSize: 13, color: '#94a3b8', margin: '0 0 24px' },
  giris:   { fontSize: 15, lineHeight: 1.75, color: '#374151', margin: '0 0 8px' },
  h2:      { fontSize: 17, fontWeight: 700 as const, color: '#0d1a2a', margin: '32px 0 10px', paddingTop: 20, borderTop: '1px solid #e2e8f0' },
  h3:      { fontSize: 14, fontWeight: 700 as const, color: '#334155', margin: '18px 0 6px' },
  p:       { fontSize: 14.5, lineHeight: 1.75, color: '#374151', margin: '0 0 12px' },
  ul:      { margin: '0 0 12px', paddingLeft: 20 },
  li:      { fontSize: 14.5, lineHeight: 1.7, color: '#374151', marginBottom: 5 },
  not:     { background: '#f0fbff', border: '1px solid #bee5f0', borderRadius: 12, padding: '14px 18px', fontSize: 13.5, lineHeight: 1.7, color: '#182c3f', margin: '0 0 14px' },
  tablo:   { width: '100%', borderCollapse: 'collapse' as const, margin: '0 0 14px', fontSize: 13.5 },
  th:      { textAlign: 'left' as const, padding: '8px 10px', background: '#0d1a2a', color: '#fff', fontWeight: 700 as const, fontSize: 12.5 },
  td:      { padding: '8px 10px', borderBottom: '1px solid #e2e8f0', color: '#374151', verticalAlign: 'top' as const, lineHeight: 1.6 },
}

function BlokCiz({ b, i }: { b: Blok; i: number }) {
  switch (b.tip) {
    case 'p':         return <p style={S.p}>{b.metin}</p>
    case 'altbaslik': return <h3 style={S.h3}>{b.metin}</h3>
    case 'not':       return <div style={S.not}>{b.metin}</div>
    case 'liste':
      return (
        <ul style={S.ul}>
          {b.maddeler.map((m, j) => <li key={j} style={S.li}>{m}</li>)}
        </ul>
      )
    case 'tablo':
      return (
        <div style={{ overflowX: 'auto' }}>
          <table style={S.tablo}>
            <thead>
              <tr>{b.basliklar.map((h, j) => <th key={j} style={S.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {b.satirlar.map((r, j) => (
                <tr key={j} style={{ background: j % 2 ? '#f8fafc' : '#fff' }}>
                  {r.map((c, k) => <td key={k} style={S.td}>{c}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    default:
      return <div key={i} />
  }
}

export default function YasalSayfa({ baslik, ustBaslik, guncelleme, girisMetni, bolumler }: Props) {
  return (
    <div style={S.sayfa}>
      <div style={S.kart}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
          <Image src="/logo.png" alt="DENEYAP" width={30} height={30} />
          <span style={{ fontWeight: 800, fontSize: 16, color: '#0d1a2a', letterSpacing: '-0.02em' }}>
            DENEYAP OYS
          </span>
        </div>

        <p style={S.ust}>{ustBaslik}</p>
        <h1 style={S.h1}>{baslik}</h1>
        <p style={S.tarih}>Son güncelleme: {guncelleme}</p>
        <p style={S.giris}>{girisMetni}</p>

        {bolumler.map((b, i) => (
          <section key={i}>
            <h2 style={S.h2}>{i + 1}. {b.baslik}</h2>
            {b.bloklar.map((blok, j) => <BlokCiz key={j} b={blok} i={j} />)}
          </section>
        ))}

        <div style={{ marginTop: 36, paddingTop: 20, borderTop: '1px solid #e2e8f0', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {[
            ['/kvkk', 'KVKK Aydınlatma Metni'],
            ['/gizlilik', 'Gizlilik Politikası'],
            ['/kullanim-sartlari', 'Kullanım Şartları'],
            ['/dpa', 'Veri İşleme Sözleşmesi'],
          ].map(([href, ad]) => (
            <Link key={href} href={href} style={{ fontSize: 13, color: '#2288c9', textDecoration: 'none', fontWeight: 600 }}>
              {ad}
            </Link>
          ))}
          <Link href="/" style={{ fontSize: 13, color: '#94a3b8', textDecoration: 'none', marginLeft: 'auto' }}>
            Uygulamaya dön
          </Link>
        </div>

      </div>
    </div>
  )
}
