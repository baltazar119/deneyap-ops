# DEVAM — yeni bir oturuma devretme notu

Bu dosya, işi başka bir Claude oturumunda kaldığı yerden sürdürmek için yazıldı.
Ayrıntılı 14 fazlık plan: **[docs/YOL-HARITASI.md](YOL-HARITASI.md)**

---

## Yeni oturumda ilk mesaj olarak şunu yaz

> Proje: `C:\Users\Abdulgazi\Desktop\DENEYAP-Ops`
> `docs/DEVAM.md` ve `docs/YOL-HARITASI.md` dosyalarını oku, Faz 4'ten devam et.
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

Son commit: `b55c010`. Çalışma ağacı temiz, GitHub ile senkron.
`npx tsc --noEmit` temiz · **296 test yeşil** · `npx next build` başarılı.

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

### Sırada: Faz 4 — DENEYAP'ın arayüze bağlanması

YOL-HARITASI.md Faz 4. **Migration gerekmez** — Faz 3'ünkiler yeterli.

Yapılacaklar:
- Görev formuna `DeneyapSecici` (bileşen hazır, sadece bağlanacak).
  DENEYAP seçilince `İl / Birim` alanı `disabled` olup DENEYAP'ın ilinden
  dolmalı + "İl, seçilen DENEYAP'tan alınır" notu — **DB trigger'ının
  kullanıcıya görünen aynası.**
- Filtre paneline DENEYAP grubu + `?deneyap=` URL parametresi.
- **"DENEYAP'ım" görünümü** — `GORUNUMLER` dizisine tek kayıt
  (`userDeneyapId` `orgContext`'te hazır).
- `GorevSatiri`'nda il rozeti yerine DENEYAP adı (varsa).
- `aranabilirMetin`'e DENEYAP adı eklenecek.

Faz 2'nin bıraktığı bağlantı noktaları (hepsi tek dosyada):
görünüm → `lib/gorevGorunumleri.ts` · filtre → `GorevFiltreDegerleri` +
`gorevleriSuz` + `urlSorgusuKur` + panel grubu · arama → `lib/gorevArama.ts`.

---

## SENİN YAPMAN GEREKEN — migration 060 + 061

`supabase/uygula/faz3_deneyap.sql` **henüz uygulanmadı.**
Supabase → SQL Editor → dosyanın tamamını yapıştır → çalıştır.
(060 ve 061 sırayla; tekrar çalıştırmak güvenli.)

Bunsuz DENEYAP ekranı "tablo yok" uyarısı gösterir; **uygulamanın geri kalanı
etkilenmez.** Uygulandıktan sonra:

```bash
node scripts/tr-fold-ikiz.mjs   # SQL/TS ikiz doğrulaması
npm run seed:demo               # demo veriye 5 DENEYAP ekler
```

Demo veri Ankara ve İzmir'e **ikişer** DENEYAP kuruyor — "bir ilde birden
fazla DENEYAP" sunumda görünür olsun diye.

> `migration 059` (`tasks.completed_at`) **uygulandı** — `completed_at`
> sütununun varlığı REST sorgusuyla doğrulandı.

> Supabase CLI kurulu ama **bağlı değil** (bağlamak DB şifresi ister — şifreyi
> sohbete yazma, migration'ları SQL editöründen çalıştır).

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
