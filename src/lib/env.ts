const REQUIRED_ENV_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'GEMINI_API_KEY',
  'NEXT_PUBLIC_APP_URL',
]

/**
 * Uygulama başlangıcında zorunlu env var'ları kontrol eder.
 * Eksik var varsa hata fırlatır — sessiz başarısızlıkları önler.
 */
export function validateEnv(): void {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key])
  if (missing.length > 0) {
    throw new Error(`[env] Eksik ortam değişkenleri: ${missing.join(', ')}`)
  }
}
