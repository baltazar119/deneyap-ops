import Link from 'next/link'

interface Props {
  title: string
  description: string
}

/**
 * Yasal sayfalar (KVKK, gizlilik, kullanım şartları, DPA) için ortak
 * placeholder kabuk. Gerçek metin DENEYAP tarafından sağlanana kadar
 * bu sayfalar Tarlis'in gerçek şirket bilgilerini içeren metinleri
 * taşımaz — sadece görsel yapı korunur.
 */
export default function LegalPagePlaceholder({ title, description }: Props) {
  return (
    <div style={{ background: '#f5f7fa', minHeight: '100vh', padding: '40px 16px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', background: '#fff', borderRadius: 20, padding: '48px 40px', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0d1a2a', margin: '0 0 8px' }}>
            {title}
          </h1>
          <p style={{ color: '#64748b', fontSize: 14, margin: 0 }}>{description}</p>
        </div>

        <div
          style={{
            background: '#f0fbff',
            border: '1px solid #bee5f0',
            borderRadius: 14,
            padding: '20px 24px',
            fontSize: 14,
            lineHeight: 1.7,
            color: '#182c3f',
          }}
        >
          <p style={{ margin: '0 0 8px', fontWeight: 700, color: '#2288c9' }}>
            Bu sayfa içeriği DENEYAP tarafından doldurulacaktır.
          </p>
          <p style={{ margin: 0 }}>
            Bu metin, DENEYAP&apos;ın gerçek kurum bilgileri (unvan, adres, veri sorumlusu
            iletişim bilgileri) ve hukuki gereksinimlerine göre hazırlanana kadar
            yer tutucu olarak görüntülenmektedir.
          </p>
        </div>

        <div style={{ marginTop: 32 }}>
          <Link href="/login" style={{ fontSize: 13, fontWeight: 600, color: '#2288c9' }}>
            ← Girişe dön
          </Link>
        </div>
      </div>
    </div>
  )
}
