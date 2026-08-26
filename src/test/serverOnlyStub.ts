/**
 * `server-only` paketinin test karşılığı.
 *
 * Gerçek paket, istemci paketine sızan sunucu modüllerini derleme zamanında
 * yakalamak için hata fırlatır. Vitest jsdom ortamında da istemci sayılıp
 * hata fırlattığı için sunucu modüllerinin testi mümkün olmuyordu.
 * Bu stub yalnızca test çalıştırıcısında devreye girer; uygulama derlemesinde
 * gerçek paket kullanılmaya devam eder.
 */
export {}
