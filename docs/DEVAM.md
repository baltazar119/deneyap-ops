# DEVAM — yeni bir oturuma devretme notu

Bu dosya, işi başka bir Claude oturumunda kaldığı yerden sürdürmek için yazıldı.
Ayrıntılı 14 fazlık plan: **[docs/YOL-HARITASI.md](YOL-HARITASI.md)**

---

## Yeni oturumda ilk mesaj olarak şunu yaz

> Proje: `C:\Users\Abdulgazi\Desktop\DENEYAP-Ops`
> `docs/DEVAM.md` ve `docs/YOL-HARITASI.md` dosyalarını oku, Faz 8'den devam et.
>
> ÖNEMLİ KURAL: `C:\Users\Abdulgazi\Desktop\Tarlis-uygulama-main` klasörüne
> HİÇBİR değişiklik yapma — o ayrı bir proje, sadece bu klasörle çalış.

---

## Proje nedir

DENEYAP OYS — T3 Vakfı Yapay Zekâ Creathon için operasyon yönetim sistemi.
Next.js 14 (App Router) + TypeScript strict + Supabase + Vercel.

- Canlı: https://deneyap-ops.vercel.app
- Depo: https://github.com/baltazar119/deneyap-ops (branch `master`)
- Her `git push` sonrası Vercel otomatik yayına alır.

**Dört rol** (`organization_members.role`):
`owner` = Merkez Operasyon Ekibi · `admin` = Koordinatör ·
`member` = İl Sorumlusu · `viewer` = Yetkili Yönetici

**Demo hesaplar** (şifre hepsinde `Deneyap2026!`):
`merkez@deneyap.demo` · `koordinator@deneyap.demo` · `ankara@deneyap.demo` ·
`izmir@deneyap.demo` · `yonetici@deneyap.demo`
Workspace slug: `deneyap-demo`

---

## Şu anki durum

Son commit: `35dd984`. Çalışma ağacı temiz, GitHub ile senkron.
`npx tsc --noEmit` temiz · **381 test yeşil** · `npx next build` başarılı.
**Migration 059, 060, 061, 062 uygulandı. 063 HENÜZ UYGULANMADI** (kod
onsuz da çalışıyor — aşağıya bak).

### Faz 0 — TAMAMLANDI (3 commit)

| Ne | Nerede |
|---|---|
| **Dönem filtresi gerçekten uygulanıyor** — eskiden "Bu hafta" = "Tüm zamanlar" idi, seçici sadece etiketi değiştiriyordu | `rapor/hesapla.ts` `donemeGirerMi()` |
| **`donemCoz('tumu')` bitişi bugün değil sınırsız** — gelecek terminli görevler eleniyordu, "Tüm zamanlar" < "Bu çeyrek" çıkıyordu | `rapor/donem.ts` |
| Ekran/API dönem varsayılanı hizalandı (`tumu` → `bu-ay`) + ekrana dönem tanımı yazıldı | `raporlar/page.tsx` |
| **`fingerprint.test.ts`** — 18 altın değer testi (dosyanın hiç testi yoktu) | `lib/import/` |
| `ResponsiveModal` sağlamlaştırıldı: Escape, scroll kilidi, aria, `kapatilamaz` | `components/responsive/` |
| Panelden ölü `schedules` sorgusu kaldırıldı | `dashboard/page.tsx` |
| `KpiModal` masaüstünde ortalanıyor (ölçüldü: üst 104 = alt 104) | `dashboard/page.tsx` |
| Görevler sayaç tabanı `tasks` → `gorunurTasks` | `tasks/page.tsx` |

Gerçek API ile doğrulanan dönem sonuçları (demo veri):
`tumu 11 · ceyrek 11 · Ağustos 7 · Eylül 4 · bu hafta 3`, `yaklasan` her dönemde 1.

### Faz 1 — TAMAMLANDI (commit `27f41c5`)

`tasks/page.tsx` **1157 → 366 satır**. İki ayrı JSX ağacı (mobil 379-651,
masaüstü 654-1144) tek ağaca indi. Davranış değişmedi.

| Ne | Nerede |
|---|---|
| Durum/öncelik sabitleri, rozet meta | `tasks/_components/gorevMeta.ts` |
| Görev öğesi — `variant: satir \| kart`, **rozet mantığı tek yerde** | `_components/GorevSatiri.tsx` |
| Liste kabuğu (`useIsMobile` ile kart↔satır) | `_components/GorevListesi.tsx` |
| Filtre kontrolleri | `_components/GorevFiltrePaneli.tsx` |
| Form — **tek alan sırası**, `ResponsiveModal` üstünde | `_components/GorevFormModal.tsx` |
| Filtre durumu + saf `gorevleriSuz()` | `lib/useGorevFiltreleri.ts` |
| `gecikmisMi` / `yaklasanMi` tek tanım | `lib/gorevTermin.ts` |
| **`gorevFiltre.test.ts`** — `?il=` üç anlamı + termin sınırları (9 test) | `lib/` |

Yan kazanımlar (form birleşmesinin doğal sonucu): mobil formda artık tahmini
ve gerçekleşen süre + dosya ekleme var (**8 → 13 alan**), Escape ile kapanma ve
arka plan kaydırma kilidi mobilde de çalışıyor.

**Refactor sırasında yakalanan gerçek hata:** satır içi `style={{display:'flex'}}`
Tailwind'in `md:hidden`'ını eziyordu → mobil öncelik chip'leri masaüstünde de
görünüyordu. `className="flex md:hidden"`e çevrildi. *Bunu tip kontrolü de
testler de kaçırdı, yalnızca ekran görüntüsüyle görüldü.*

`useIsMobile` yalnızca iki yerde kaldı: kart↔satır ve FAB↔düğme.

### Faz 2 — TAMAMLANDI (commit `cd5bd42`)

Sürekli ekranda duran kontrol sayısı **11 → 3**: görünüm satırı, arama,
"Filtrele" düğmesi. Mobil ve masaüstü artık **aynı kontrol kümesini** gösteriyor.

| Ne | Nerede |
|---|---|
| Hazır görünümler (saf, test edilir) | `lib/gorevGorunumleri.ts` |
| Arama — `trFold` token AND | `lib/gorevArama.ts` |
| Görünüm + arama + Filtrele çubuğu | `_components/GorevAramaVeGorunumler.tsx` |
| Filtre paneli → `ResponsiveModal`, etiketli gruplar | `_components/GorevFiltrePaneli.tsx` |
| URL senkronu + `ATANMAMIS` sabiti | `lib/useGorevFiltreleri.ts` |
| 34 yeni test (görünüm, arama, URL, rozet) | `lib/gorev*.test.ts` |

**Görünümler:** Tümü · Bana atananlar · Gecikenler · Bu hafta ·
"*İl* görevleri" (yalnız İl Sorumlusu) · Atanmamış (yalnız owner/admin).
Varsayılan: `member` → Bana atananlar, diğerleri → Tümü. Bilinmeyen ya da rolün
göremeyeceği `?gorunum=` değeri **sessizce varsayılana düşer** — boş liste gibi
görünüp kullanıcıyı yanıltmaz. Chip sayaçları "bu görünüme geçersem şu anki
filtre ve aramayla kaç görev görürüm" sorusunu yanıtlar.

**Arama:** başlık, açıklama, il ve atanan adı; 150ms debounce; katlanmış
metinler `useMemo` ile önceden hesaplanıyor.

**URL:** `?il=` (boş-değer semantiği korunarak) · `?durum=` `?oncelik=` `?tur=`
`?termin=` `?atanan=` `?gorunum=` `?q=`. `router.replace` + `scroll:false`,
varsayılanlar URL'e yazılmaz.

**Düzeltilen hata:** "Atanmamış" filtresi boş metin gönderiyordu, `assignee_id`
`null` olduğu için hiçbir görevle eşleşmiyor ve **liste sessizce boşalıyordu**.
Artık ayrı `ATANMAMIS` sabiti var. `il`'in boş değeri URL'de anlamlı olduğu için
orada bilerek korundu — ikisi farklı semantik.

### Faz 3 — TAMAMLANDI (commit `b55c010`)

| Ne | Nerede |
|---|---|
| `tr_fold()` + `deneyaplar` tablosu, RLS, unique | `migrations/060_deneyaplar.sql` |
| `deneyap_id` + **iki trigger** | `migrations/061_deneyap_baglanti.sql` |
| Saf yardımcılar (etiket, arama, gruplama) | `lib/deneyap.ts` |
| Liste hook'u (bellek içi cache, sessionStorage'a yazmaz) | `lib/useDeneyaplar.ts` |
| Combobox (arama, il gruplu, render tavanı 60) | `components/DeneyapSecici.tsx` |
| Yönetim ekranı + "il başına oluştur" onaylı aracı | `settings/deneyaplar/page.tsx` |
| Tek yazma yolu | `api/org/[slug]/deneyaplar/` |
| `IL_PLAKA` (81↔81 testli) + `ilGecerliMi` | `lib/iller.ts` (eklemeli) |
| İkiz doğrulama script'i | `scripts/tr-fold-ikiz.mjs` |
| 45 yeni test | `deneyap.test.ts`, `turkce.test.ts`, `taskScope.test.ts` |

`orgContext`: `userDeneyapId` eklendi, `CACHE_PREFIX` **v2→v3**, `clearOrgCache`
eski prefix'i de süpürüyor.

**Backfill YOK** (karar gereği) — yerine Ayarlar'daki onaylı araç. Araç
uygulama anında listeyi **yeniden hesaplıyor**, istemciden gelene güvenmiyor.

**`taskScope.ts` DEĞİŞMEDİ.** İl Sorumlusu kapsamı il seviyesinde kalıyor;
`taskScope.test.ts`'e bunu kilitleyen 4 test eklendi.

#### Faz 3'te öğrenilen iki şey (tekrar etmeyelim)

1. **Deploy sırası tuzağı.** `deneyap_id` önce `orgContext`'in ANA üyelik
   sorgusuna eklenmişti. Migration uygulanmamış bir ortamda o sorgu
   "column does not exist" ile dönüyor, `membership` null oluyor ve kullanıcı
   `/workspaces`'e atılıyor — yani **tüm org sayfaları kırılıyor.** Ayrı ve
   hataya toleranslı bir sorguya alındı. *Kural: kod migration'dan önce yayına
   çıkabilir; yeni kolonlar hiçbir zaman kritik yolun sorgusuna eklenmemeli.*
   Bu yalnızca **tarayıcıda** görüldü — tsc ve testler kaçırdı.
2. **PostgREST'te "tablo yok" kodu `PGRST205`**, Postgres'in `42P01`'i değil
   (ölçüldü). Yalnızca 42P01'e bakan kontrol hiç tetiklenmiyordu.

### Faz 4 — TAMAMLANDI (commit `bcd395e`)

| Ne | Nerede |
|---|---|
| Görev formunda `DeneyapSecici` + **il alanı kilidi** | `_components/GorevFormModal.tsx` |
| Filtre panelinde DENEYAP grubu (il gruplu, sayaçlı) | `_components/GorevFiltrePaneli.tsx` |
| `?deneyap=` (il ile aynı üç anlamlı desen) | `lib/useGorevFiltreleri.ts` |
| **"DENEYAP'ım"** görünümü | `lib/gorevGorunumleri.ts` |
| Satırda il yerine DENEYAP adı, il tooltip'te | `_components/GorevSatiri.tsx` |
| Aramaya DENEYAP adı | `lib/gorevArama.ts` |
| Üye ↔ DENEYAP bağı | `scripts/demo-seed.mjs` |

**İl kilidi** DB trigger'ının kullanıcıya görünen aynası: alan açık bırakılsaydı
kullanıcı başka bir il seçer, kaydeder ve kaydettiğinden farklı sonuç görürdü.
"DENEYAP yok" seçilince alan tekrar açılıyor.

Canlı veriyle doğrulandı: Çankaya filtresi 2 görev getiriyor, **aynı ildeki**
Keçiören'in görevi dışarıda kalıyor — projenin belirleyici gereksinimi çalışıyor.

#### Faz 4'ün bıraktığı bilinen boşluk

**"DENEYAP'ım" görünümü demoda görünmüyor.** Görünüm yalnızca bir DENEYAP'a
bağlı üyede çıkıyor; demoda bağlı olanlar İl Sorumluları ve `/tasks` sayfası
`raporGorebilirMi` ile korunduğu için **member oraya hiç giremiyor**
(`/me`'ye yönleniyor). Mantık doğru çalışıyor (5 birim testi + geçici bir
üye-DENEYAP bağıyla tarayıcıda doğrulandı, bağ geri alındı), ama sunumda
gösterilemiyor.

Karar gerekiyor: Görevler sayfası İl Sorumlusuna açılsın mı? Faz 2'de
"`member` → varsayılan görünüm *Bana atananlar*" kuralı zaten bu beklentiyle
yazılmıştı. Açılırsa "*İl* görevleri" görünümü de canlanır. **Kullanıcıya
sorulmalı, sessizce açılmamalı** — yetki genişletmesi.

### Faz 4b — Görevler sayfası İl Sorumlusuna açıldı (commit `4ab2f68`)

Faz 4'ün bıraktığı boşluk kapatıldı. **Yetki ayrı tutuldu:**
`roller.ts:gorevListesiGorebilirMi()` — `raporGorebilirMi` genişletilmedi,
yoksa Panel ve Operasyon Riski de sessizce açılırdı. Testler bu sınırı kilitler.

Kapsam artık **sorguda da** uygulanıyor (`applyTaskScope`): İl Sorumlusu 11
görev yerine 4 görev çekiyor. Salt okunur rollerde Düzenle/Sil düğmeleri artık
**hiç render edilmiyor** (önceden `display:none` idi).

### Faz 5 — TAMAMLANDI (commit `062e32e`)

| Ne | Nerede |
|---|---|
| `duyurular` + `duyuru_okundu` + event_type kısıtı | `migrations/062_duyurular.sql` |
| Hedefleme/sıralama saf kuralları | `lib/duyuru.ts` |
| **Hedefleme sunucuda** | `api/org/[slug]/duyurular/aktif` |
| Okundu işaretleme | `api/.../duyurular/[id]/okundu` |
| CRUD + **org kapsamlı** bildirim | `api/org/[slug]/duyurular` |
| Popup (rolün ana ekranında) | `components/DuyuruPopup.tsx` |
| Yönetim ekranı (owner/admin) | `org/[slug]/duyurular/page.tsx` |
| 16 yeni test | `lib/duyuru.test.ts` |

**Yanında giderilen sessiz hata:** `notifications.event_type` CHECK'i (017) 8
tip tanıyordu, TS 14 üretiyordu. Aradaki 6 tip INSERT anında kısıt ihlaliyle
düşüyordu — **o bildirimler hiç oluşmuyordu.** Kısıt 15 tipe genişletildi.

**Kararlar:** okundu DB'de (cihaz bağımsız) · hedefleme üç boyut VE ile ·
hedef varken değeri olmayan kullanıcı dışarıda · bildirim yalnızca
taslak→yayın geçişinde · `user_id` gövdeden değil oturumdan · kritik duyuru
kapatılamaz · içerik düz metin (HTML render edilmiyor).

`createNotificationForAll` **kullanılmadı** — org filtresiz olduğu için duyuru
tüm çalışma alanlarına giderdi. Yerine org kapsamlı yeni fonksiyon.

### Faz 6 — TAMAMLANDI (commit `da40b19`)

Masaüstü panel `height:100vh; overflow-hidden` idi — ekrana sığmayan her şey
görünmez oluyordu ve **panele blok eklenemiyordu.** Kaydırmaya açıldı.
(Sidebar zaten `fixed`, etkilenmedi — ölçüldü.)

| Blok | Kural |
|---|---|
| Kritik ve gecikmiş | önce öncelik, sonra termin |
| Yaklaşan terminler (7 gün) | gecikmişler **girmiyor** (ayrı blokları var) |
| İl / DENEYAP durumu | DENEYAP'lılar DENEYAP satırında, DENEYAP'sızlar il altında |
| Yaklaşan toplantılar + son dokunulan işler | — |

Hepsi `lib/panelOzet.ts`'teki saf fonksiyonlardan besleniyor (17 test).
Masaüstüne karşılama + hızlı linkler geldi.

**"Son hareketler" değil "son dokunulan işler"** denildi: gerçek denetim kaydı
yok, elimizdeki sinyal `updated_at`. Başlık iddiadan fazlasını söylememeli.

### ⚠ Faz 5'te bulunan SINIFSAL hata — bilmen gereken

**Next.js, route handler içindeki `fetch`'i önbelleğe alıyor; supabase-js de
fetch kullandığı için veri tabanı OKUMALARI önbelleğe giriyordu.**

Belirti sinsiydi: duyuru "Anladım" ile okundu işaretleniyor, kayıt DB'ye
yazılıyor, ama `duyuru_okundu` sorgusu POST'tan önceki **boş** yanıtı
döndürmeye devam ediyor ve popup her girişte tekrar çıkıyordu. İstek 200,
RLS doğru, kayıt yerinde — sadece içerik bayat. İz: 12-20ms yanıt süreleri.

`export const dynamic = 'force-dynamic'` bunu **engellemiyor** (ölçüldü).

Çözüm: `src/lib/server/supabaseFetch.ts` → `onbelleksizFetch`
(`cache: 'no-store'`). **`src/app/api` altında `createClient` çağıran TÜM
route'lara uygulandı** (44 dosya, commit `fd335eb`).

> **KURAL: sunucuda yeni bir Supabase istemcisi kurarken
> `{ global: { fetch: onbelleksizFetch } }` vermeyi UNUTMA.** Tarayıcı
> istemcisi (`lib/supabase/client.ts`) etkilenmiyor.

### Faz 7 — TAMAMLANDI (commit `35dd984`)

Excel'e DENEYAP sütunu geldi. Fazın tamamı **fingerprint kayması riski**
etrafında döndü: "Atölye" başlıklı sütun eskiden `il` alanına eşleniyordu ve
eşleştirme anahtarı `il` üzerinden hesaplanıyor.

| Ne | Nerede |
|---|---|
| Yeni `deneyap` hedefi; `atolye` alias'ı il'den çıktı, **`birim` ve `merkez` il'de KALDI** | `import/columnMap.ts` |
| `normDeneyap` — kod > ad > ad+il bağlamı > yakın yazım(≤2) > yeni | `import/normalize.ts` |
| **"Etkin il"** + `deneyap_id` + `yeniDeneyapAdi` | `import/satirIsle.ts` |
| DENEYAP sütunu; kolon harfleri artık **başlıktan hesaplanıyor** | `import/sablon.ts` |
| DENEYAP listesi satirIsle'ye; tanınmayanlar önerilen ille dönüyor | `import/onizleme/route.ts` |
| Şablona org'un gerçek DENEYAP'ları | `import/sablon/route.ts` |
| "Tanınmayan DENEYAP'lar" paneli (Oluştur / Hepsini oluştur) | `tasks/import/page.tsx` |
| RPC'ye `deneyap_id` (apply + **revert**) | `migrations/063_import_deneyap.sql` |

**Üç katmanlı fingerprint koruması:**
1. `fingerprint.ts`'e tek karakter dokunulmadı.
2. **"Etkin il" geri düşmesi:** DENEYAP çözüldüyse onun ili → yoksa il sütunu
   → *DENEYAP sütunu var, çözülmedi ve İL SÜTUNU YOKSA* `normIl(DENEYAP hücresi)`.
   Bu tek dal, içinde "Ankara" yazan eski dosyaların önceki sürümle **birebir
   aynı** anahtarı üretmesini sağlar.
3. `import_column_presets` hafızası **migrate edilmedi** — eski eşleme aynen
   korunuyor. Kasıtlı; koda gerekçe yazıldı.

**Yol boyunca bulunan tasarım kusuru:** ilk sürümde eski format bir dosya
*"Ankara adında DENEYAP oluştur"* öneriyor ve çelişkili iki uyarı basıyordu.
Geri düşme başarılıysa değer bir **il adıdır**; öneri artık bastırılıyor.

**Gerçek API + gerçek DB ile doğrulandı:**
- Eski format dosya → il=Ankara, 0 hata, sahte DENEYAP önerisi yok
- Yeni format → Çankaya ve Keçiören **ayrı** çözülüyor, ikisi de Ankara
  (bir ilde birden fazla DENEYAP — projenin çekirdek gereksinimi)
- **Aynı dosya iki kez yüklendi: eşleşen=1, yeni=0 → KOPYA YOK**
- DB'deki `import_fingerprint` beklenen değerle birebir aynı
- Test verisi temizlendi, demo 11 göreve döndü

**Migration 063 uygulanmadan da kod çalışıyor** — eski RPC `normalize_veri`
içindeki fazla `deneyap_id` anahtarını yok sayıyor (gerçek içe aktarmayla
ölçüldü). Faz 3'te öğrenilen "kod migration'dan önce yayına çıkabilir" kuralı
korundu.

### Sırada: Faz 8 — Risk ayrımı + trend altyapısı

YOL-HARITASI.md Faz 8. İki parça:

1. **`operationRisk.ts` bölünmesi.** Şu an `@/lib/supabase/client` (tarayıcı
   istemcisi) import ediyor → sunucuda kullanılamıyor. Saf `computeRisk` kalır;
   `risk/istemciVeri.ts` ve `risk/sunucuVeri.ts` ayrılır. Sunucu yolu
   **mutlaka `tumGorevleriGetir(yetki)` üzerinden** olmalı — sunucuda RLS yok,
   kapsam `taskScope` ile uygulanmazsa sızıntı olur. Böylece `kapsam.ts`'teki
   ölü `'risk'` bölümü gerçekten üretilir ve PDF'e girer.
2. **Migration 064 — `gunluk_ozet`** + cron adımı + `scripts/ozet-demo.mjs`
   (90 günlük geçmiş) + `seri.ts` / `karsilastir.ts`.
   `kaynak ∈ (cron|turetilmis|demo)` sütunu demo verisinin gerçekle
   karışmasını yapısal olarak engeller.
   Seri kaynağı **gün başına** seçilir: o gün snapshot varsa ölçüm, yoksa
   türetme. **Bloke / risk skoru / atanmamış türetilemez** (durum geçmişi yok) —
   türetilmiş bölgede çizilmez.
   `karsilastir`'da `guvenilir` bayrağı: önceki dönem n<5 ise yüzde üretilmez.

---

## SENİN YAPMAN GEREKEN — migration 063

`supabase/migrations/063_import_deneyap.sql` → Supabase SQL Editor'de çalıştır.

İçe aktarma RPC'sine `deneyap_id` ekliyor. **Acil değil:** kod onsuz da
sorunsuz çalışıyor (ölçüldü), yalnızca Excel'den gelen DENEYAP bağı göreve
yazılmıyor. Uygulanınca içe aktarılan görevler doğrudan DENEYAP'a bağlanır.

Dosya, 056'nın birebir kopyası + 4 satır; satır satır karşılaştırılarak
doğrulandı.

Demo veride bir örnek duyuru duruyor ("Ankara saha ziyareti — 12 Eylül",
Ankara hedefli, Ankara Sorumlusu okumuş). Sunumda popup'ı yeniden göstermek
istersen Duyurular ekranından silip yeniden oluşturman yeterli.

Yararlı komutlar:

```bash
node scripts/tr-fold-ikiz.mjs   # SQL/TS trFold ikiz doğrulaması
npm run seed:demo               # demo veriyi yeniden kur
```

> **`next build`'i `next dev` çalışırken KOŞTURMA** — bu oturumda iki kez
> `.next`'i bozdu. Bozulursa: dev'i durdur, `rm -rf .next`, yeniden başlat.

> **Migration'ları REST ile doğrulama:** `select=<kolon>` 200 dönüyorsa kolon
> var, 400 + `42703` dönüyorsa yok. Tablo yoksa PostgREST `PGRST205` döner.
> Trigger'ları davranışsal test etmek için service-role ile gerçek
> INSERT/UPDATE denemesi en güvenilir yol (Faz 3'te 8 kontrol böyle yapıldı).

---

## Dokunulmaması gerekenler (sessiz bozulma riski)

| Dosya | Neden |
|---|---|
| `src/lib/import/fingerprint.ts` | İçe aktarma tekilleştirme anahtarı. Değişirse aynı Excel ikinci kez yüklendiğinde **kopya görev** oluşur, sessizce. `fingerprint.test.ts` altın değerlerle kilitli — test kırılırsa "beklenen değeri güncelle" YANLIŞ tepkidir. |
| `src/lib/taskScope.ts` | Rol/il kapsam kuralı. Yanlış PostgREST tırnaklaması hata vermez, **sessizce yanlış sonuç** verir. Kullanıcı kararı: Faz 3'te dokunulmayacak, İl Sorumlusu ilinin tüm görevlerini görmeye devam edecek. |
| `src/lib/rapor/kapsam.ts` | `member` için `ilFiltresi` boş küme güvenliği — "tüm iller"e düşmek veri sızıntısıdır. |
| `src/lib/supabase/orgContext.tsx` | sessionStorage cache şeması. Değişirse `CACHE_PREFIX` v2→v3 bumplanmalı. |

---

## Kullanıcının verdiği kararlar (yeniden sorma)

| Konu | Karar |
|---|---|
| Birim modeli | Ayrı `deneyaplar` tablosu, `il`'i değiştirmeden **eklemeli** |
| Arayüz terimi | **"DENEYAP"** (atölye/birim değil) — "Ankara DENEYAP — Çankaya" |
| DENEYAP listesi | Ayarlar'dan elle yönetim + Excel'de otomatik oluşturma |
| Mevcut veri | **Onaylı araç** ("il başına bir DENEYAP oluştur"), kör migration YOK |
| Excel `birim` sütunu | **`il`'de kalır** (yalnız `atolye` DENEYAP'a taşınır) |
| İl Sorumlusu kapsamı | **İl seviyesi kalır** — kimse gördüğü görevi kaybetmesin |
| İl Sorumlusu + Risk | **Açılır**, yalnızca kendi ili; ayrı `riskGorebilirMi()` kuralıyla |
| İl Sorumlusu haritası | Kendi ili büyütülmüş, ulusal harita değil |
| Duyuru popup | **Bir kez göster**, DB'de tutulur (cihaz bağımsız) |
| Duyuru hedefleme | Rol + il/DENEYAP · Yetki: owner + admin |
| Panele eklenecek | Dördü de: yaklaşan terminler, il/DENEYAP tablosu, kritik+gecikmiş, son hareketler + toplantılar |
| Görevler düzeni | Hazır görünümler + arama; detaylar tek düğme altında, rozetli |
| Yorumlama | **Hibrit** — kural tabanlı her zaman, AI isteğe bağlı üstüne |
| Geçmiş veri | Günlük özet tablosu + demo geçmişi |
| Harita | Gerçek coğrafi, sadeleştirilmiş, **Natural Earth (kamu malı)** |
| Sıralama | Sırayla hepsi, temelden — her faz çalışır halde teslim |

---

## Çalışma yöntemi (bu projede işe yarayan)

```bash
npm run dev          # dev server (3000)
npx tsc --noEmit     # tip kontrolü
npx vitest run       # 208 test
npx next build       # üretim derlemesi
npm run seed:demo    # demo veriyi yeniden kur
```

**`next build`'i `next dev` çalışırken KOŞTURMA** — `.next` klasörünü bozuyor ve
`MODULE_NOT_FOUND` veriyor. Bozulursa: dev server'ı durdur, `rm -rf .next`, yeniden başlat.

**Tarayıcı doğrulaması:** bu oturumda iki gerçek hata (Üye Profili hiç açılmıyordu,
Panelim sayfası sessizce çöküyordu) yalnızca **gerçek oturumla sayfayı fiilen açıp
konsola bakarak** bulundu — tip kontrolü ve testler ikisini de kaçırmıştı.
- Form doldururken `computer type` yerine **`form_input`** kullan (React state'ine
  `type` işlemiyor), ya da JS ile native setter + `input` event dispatch et.
- Konsol geçmişi sekmede birikiyor — temiz kontrol için **yeni sekme aç**.

**Migration numaralandırma:** en son **059**. Yeni migration'lar 060'tan devam.

---

## Bilinen, kapsam dışı bırakılmış teknik borç

- Google OAuth: `state` nonce doğrulanmıyor, `api/drive/*` uçlarında auth yok,
  `api/drive/debug` açık, `meetings` GET kimlik doğrulamıyor
- `notifications` INSERT politikası gevşek (`auth.uid() is not null`)
- `createNotificationForAll` org filtresiz — duyuru için org kapsamlı yenisi yazılacak
- `notifications.event_type` CHECK'i TS tipleriyle uyuşmuyor (6 tip kodda var, kısıtta yok)
- PWA ikonları / manifest yok
- `npm audit` borcu (çoğu devralınmış)

---

## Canlıda dikkat

`NEXT_PUBLIC_DEMO_MODE=true` — giriş ekranındaki demo paneli **açık**. Creathon
sunumu için doğru, ama gerçek veriyle kullanıma geçmeden önce Vercel'den kaldırılmalı.

Yasal sayfalarda `src/components/YasalSayfa.tsx` içindeki `KURUM` sabitinde
`[KURUM ADRESİ]` ve `[VERBİS KAYIT NO]` hâlâ doldurulmayı bekliyor.
