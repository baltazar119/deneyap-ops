/**
 * Dağıtık rate limiter — Upstash Redis kullanılır.
 * Redis yoksa (geliştirme ortamı / env eksik) in-memory fallback'e düşer.
 *
 * Vercel Functions birden fazla instance çalıştırdığı için in-memory limit
 * her instance'ta sıfırlanır → gerçek koruma sağlamaz.
 * Production'da UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN zorunludur.
 */

import { redis, REDIS_AVAILABLE } from '@/lib/redis'
import { Ratelimit } from '@upstash/ratelimit'

// ── Upstash limiter oluşturucu ────────────────────────────────────────────────
function makeUpstashLimiter(limit: number, windowSeconds: number) {
  if (!REDIS_AVAILABLE || !redis) return null
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, `${windowSeconds} s`),
    analytics: false,
  })
}

// ── In-memory fallback ────────────────────────────────────────────────────────
interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt < now) store.delete(key)
  }
}, 5 * 60 * 1000)

function inMemoryLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now()
  const entry = store.get(key)
  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs }
  }
  if (entry.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt }
  }
  entry.count++
  return { allowed: true, remaining: limit - entry.count, resetAt: entry.resetAt }
}

// ── Dışa açık ana fonksiyon ───────────────────────────────────────────────────
/**
 * @param key      Benzersiz anahtar (örn. "invite:1.2.3.4")
 * @param limit    Pencere başına izin verilen maksimum istek sayısı
 * @param windowMs Pencere süresi (ms) — Upstash için saniyeye çevrilir
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  if (REDIS_AVAILABLE) {
    const windowSeconds = Math.ceil(windowMs / 1000)
    const limiter = makeUpstashLimiter(limit, windowSeconds)
    if (limiter) {
      const { success, remaining, reset } = await limiter.limit(key)
      return { allowed: success, remaining, resetAt: reset }
    }
  }
  // Fallback: in-memory (geliştirme ortamı veya Redis hatalıysa)
  return inMemoryLimit(key, limit, windowMs)
}

/**
 * IP adresini NextRequest headers'dan güvenli biçimde alır.
 * Cloudflare proxy arkasında CF-Connecting-IP header'ını tercih eder.
 */
export function getClientIp(request: Request): string {
  return (
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  )
}
