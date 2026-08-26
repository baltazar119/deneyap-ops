import { describe, it, expect, beforeEach, vi } from 'vitest'
import { rateLimit } from './rateLimit'

// NOT: rateLimit() Upstash Redis desteği eklenirken async'e çevrilmiş ama bu
// test senkron çağırmaya devam ediyordu; dolayısıyla Promise nesnesi üzerinde
// .allowed okunuyor ve tüm beklentiler sessizce undefined ile karşılaşıyordu.
// Çağrılar await'lendi. Redis env değişkenleri tanımlı olmadığı için
// in-memory fallback test edilir.

beforeEach(() => {
  vi.resetModules()
})

describe('rateLimit', () => {
  it('ilk istekte izin verir', async () => {
    const result = await rateLimit('test-key-1', 5, 60_000)
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(4)
  })

  it('limit dahilinde isteklere izin verir', async () => {
    for (let i = 0; i < 4; i++) {
      const r = await rateLimit('test-key-2', 5, 60_000)
      expect(r.allowed).toBe(true)
    }
    const last = await rateLimit('test-key-2', 5, 60_000)
    expect(last.allowed).toBe(true)
    expect(last.remaining).toBe(0)
  })

  it('limiti aşınca reddeder', async () => {
    for (let i = 0; i < 5; i++) {
      await rateLimit('test-key-3', 5, 60_000)
    }
    const blocked = await rateLimit('test-key-3', 5, 60_000)
    expect(blocked.allowed).toBe(false)
    expect(blocked.remaining).toBe(0)
  })

  it('farklı key\'ler birbirini etkilemez', async () => {
    for (let i = 0; i < 5; i++) await rateLimit('key-a', 5, 60_000)
    const blocked = await rateLimit('key-a', 5, 60_000)
    expect(blocked.allowed).toBe(false)

    const other = await rateLimit('key-b', 5, 60_000)
    expect(other.allowed).toBe(true)
  })

  it('pencere süresi dolunca sıfırlanır', async () => {
    for (let i = 0; i < 5; i++) await rateLimit('test-key-4', 5, 50)
    const blocked = await rateLimit('test-key-4', 5, 50)
    expect(blocked.allowed).toBe(false)

    await new Promise((r) => setTimeout(r, 60))

    const reset = await rateLimit('test-key-4', 5, 50)
    expect(reset.allowed).toBe(true)
  })
})
