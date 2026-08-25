/**
 * Basit in-memory sayfa veri önbelleği.
 * Sekme geçişlerinde veriyi anında gösterip arka planda yenileme sağlar.
 */

type CacheEntry<T> = { data: T; timestamp: number }

const cache = new Map<string, CacheEntry<unknown>>()
const TTL = 45_000 // 45 saniye

export function getCachedData<T>(key: string): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined
  if (!entry) return null
  if (Date.now() - entry.timestamp > TTL) {
    cache.delete(key)
    return null
  }
  return entry.data
}

export function setCachedData<T>(key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now() })
}

/** Verilen prefix ile başlayan tüm cache girdilerini sil */
export function invalidateCache(prefix: string): void {
  for (const key of Array.from(cache.keys())) {
    if (key.startsWith(prefix)) cache.delete(key)
  }
}
