/** @type {import('next').NextConfig} */

const securityHeaders = [
  // Clickjacking koruması — iframe içine alınamaz
  { key: 'X-Frame-Options', value: 'DENY' },
  // MIME sniffing saldırıları engellenir
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Eski tarayıcılarda XSS filtresi
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  // Referrer bilgisi sınırlandırılır
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Kamera ve mikrofon Jitsi toplantıları için açık, konum kapalı
  { key: 'Permissions-Policy', value: 'camera=*, microphone=*, display-capture=*, fullscreen=*' },
  // HTTPS zorunlu (2 yıl + subdomain + preload)
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  // Content Security Policy
  // NOT: unsafe-inline + unsafe-eval açık — Next.js inline styles ve Sentry için gerekli.
  // UI değişikliklerinden sonra nonce-based CSP'ye geçilecek.
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://vercel.live https://*.vercel.app https://meet.jit.si https://challenges.cloudflare.com",
      "style-src 'self' 'unsafe-inline' https://meet.jit.si",
      "img-src 'self' data: blob: https://*.supabase.co https://lh3.googleusercontent.com https://avatars.githubusercontent.com https://meet.jit.si",
      "font-src 'self' data: https://meet.jit.si",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://generativelanguage.googleapis.com https://vercel.live https://meet.jit.si wss://meet.jit.si https://challenges.cloudflare.com",
      "media-src 'self' https://meet.jit.si",
      "frame-src 'self' https://meet.jit.si https://challenges.cloudflare.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
    ].join('; '),
  },
]

const nextConfig = {
  experimental: {
    // @react-pdf/renderer yoga-layout WASM kullanıyor; bundler'a dokunmaması
    // söylenmezse sunucu tarafı PDF üretimi bozuluyor.
    serverComponentsExternalPackages: ['@react-pdf/renderer'],
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 86400,
    deviceSizes: [640, 750, 1080, 1200, 1920],
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },
}

module.exports = nextConfig
