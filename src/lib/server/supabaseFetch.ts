/**
 * Next.js önbelleğini baypas eden fetch — SUNUCU TARAFI Supabase istemcileri
 * için.
 *
 * Next.js App Router, route handler'ların içindeki global `fetch`'i sarmalayıp
 * yanıtları önbelleğe alıyor. supabase-js de fetch kullandığı için bu, veri
 * tabanı OKUMALARININ önbelleğe alınması demek: aynı sorgu, veri değişmiş
 * olsa bile eski yanıtı döndürür.
 *
 * GERÇEK BİR HATAYLA BULUNDU (Faz 5): duyuru "Anladım" ile okundu
 * işaretleniyor, kayıt DB'ye yazılıyor, ama `duyuru_okundu` sorgusu POST'tan
 * ÖNCEKİ boş yanıtı döndürmeye devam ediyor ve popup her girişte tekrar
 * çıkıyordu. Belirti sinsi: istek 200 dönüyor, RLS doğru, kayıt yerinde —
 * sadece içerik bayat.
 *
 * `export const dynamic = 'force-dynamic'` bunu ENGELLEMİYOR; ölçüldü.
 * Önbelleği istemcinin kendi fetch'inde kapatmak tek sağlam yol.
 *
 * KULLANIM: sunucuda `createClient(...)` çağıran her yer üçüncü argümana
 * `{ global: { fetch: onbelleksizFetch } }` vermeli.
 * Tarayıcı istemcisi (`lib/supabase/client.ts`) bundan ETKİLENMEZ — orada
 * Next'in fetch sarmalayıcısı yok.
 */
export const onbelleksizFetch: typeof fetch = (girdi, init) =>
  fetch(girdi, { ...init, cache: 'no-store' })
