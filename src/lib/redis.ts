/**
 * Upstash Redis client — dağıtık rate limiting ve cache için.
 * Env: UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 *
 * Bu değişkenleri Vercel Dashboard > Settings > Environment Variables'a ekleyin.
 * Upstash ücretsiz plan: https://console.upstash.com
 */

import { Redis } from '@upstash/redis'

// Redis client — env değişkenleri yoksa null döner (geliştirme ortamı için güvenli)
function createRedisClient(): Redis | null {
  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    return null
  }
  return Redis.fromEnv()
}

export const redis = createRedisClient()

export const REDIS_AVAILABLE = redis !== null
