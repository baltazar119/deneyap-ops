import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase as defaultClient } from '@/lib/supabase/client'

/**
 * Verilen isimde temiz bir realtime kanalı açar.
 *
 * `supabase.channel(name)` aynı isimli bir kanal zaten varsa yenisini
 * üretmez, mevcut olanı döndürür. Bir React effect'i birden fazla kez
 * çalıştığında (geliştirme modunda effect'ler iki kez çalışır; ayrıca
 * bağımlılıklar geç yüklendiğinde effect yeniden tetiklenir) zaten
 * `subscribe()` edilmiş kanala tekrar `.on()` eklenmeye çalışılır ve
 * Supabase şu hatayı fırlatır:
 *
 *   cannot add `postgres_changes` callbacks for realtime:<isim> after `subscribe()`
 *
 * Bu yüzden kanalı oluşturmadan önce aynı isimli açık kanallar kaldırılır.
 */
export function openChannel(name: string, client: SupabaseClient = defaultClient) {
  client
    .getChannels()
    .filter((c) => c.topic === `realtime:${name}`)
    .forEach((c) => { client.removeChannel(c) })

  return client.channel(name)
}
