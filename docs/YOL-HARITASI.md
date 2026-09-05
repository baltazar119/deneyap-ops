# DENEYAP OYS — Duyurular, Panel, Görevler, Yorumlanmış Rapor/Risk ve Türkiye Haritası

## Context

DENEYAP OYS canlıda (https://deneyap-ops.vercel.app), 4 rol, 58 migration, 181 test yeşil.
Excel göçü, rol bazlı PDF/Excel/CSV raporlar, Telegram, zamanlanmış e-posta ve Operasyon
Riski çalışıyor.

Beş yeni istek geldi. Ortak nokta: **sistem bugün veriyi gösteriyor ama yorumlamıyor, ve
DENEYAP birimlerini tanımıyor.**

1. Duyurular sayfası + panelde popup
2. Panelin işlevselleşmesi
3. Görevler sayfasının sadeleşmesi + "bir ilde birden fazla DENEYAP"
4. Rapor/Risk'in role göre kişiselleşmesi + otomatik yorumlanmış veri + geçmişe göre trend
5. Operasyon Riski'ne Türkiye ısı haritası

**Belirleyici mimari gerçek:** 3, 4 ve 5'in hepsi "bir ilde birden fazla DENEYAP"
kavramına dayanıyor. Bugün `il` yalnızca serbest metin (`tasks.il`,
`organization_members.il`) — birim kavramı yok. Bu yüzden DENEYAP modeli önkoşul.

---

## Kullanıcı kararları

| Konu | Karar |
|---|---|
| Birim modeli | **Ayrı tablo**, `il`'i değiştirmeden **eklemeli** |
| Terminoloji | **"DENEYAP"** — "Ankara DENEYAP — Çankaya" |
| DENEYAP listesi | Ayarlar'dan elle yönetim + Excel'de otomatik oluşturma |
| Mevcut veri | **Onaylı araç** ("il başına bir DENEYAP oluştur"), kör migration yok |
| `birim` Excel sütunu | **`il`'de kalır** (yalnız `atolye` DENEYAP'a taşınır) |
| İl Sorumlusu kapsamı | **İl seviyesi kalır** — kimse gördüğü görevi kaybetmez |
| İl Sorumlusu + Risk | **Açılır**, yalnızca kendi ili; ayrı yetki kuralıyla |
| İl Sorumlusu haritası | **Kendi ili büyütülmüş**, ulusal harita değil |
| Duyuru popup | **Bir kez göster**, DB'de tutulur (cihaz bağımsız) |
| Duyuru hedefleme | Rol + il/DENEYAP |
| Duyuru yetkisi | Merkez Operasyon + Koordinatör |
| Panele eklenecek | **Dördü de**: yaklaşan terminler, il/DENEYAP tablosu, kritik+gecikmiş, son hareketler + toplantılar |
| Görevler düzeni | Hazır görünümler + arama; detaylar tek düğme altında, rozetli |
| Yorumlama | **Hibrit** — kural tabanlı her zaman, AI isteğe bağlı üstüne |
| Geçmiş veri | **Günlük özet tablosu** + demo geçmişi |
| Harita | **Gerçek coğrafi**, sadeleştirilmiş, **Natural Earth (kamu malı)** |

---

## Yol boyunca düzeltilecek mevcut hatalar

| Hata | Yer |
|---|---|
| **Dönem filtresi hiç uygulanmıyor** — "Bu hafta" = "Tüm zamanlar", sadece başlık değişiyor | `rapor/hesapla.ts:125`, `veri.ts:22` |
| Öncelik chip'leri, mobil durum sekmeleri ve başlık sayacı **kapsam süzülmemiş** `tasks` kullanıyor → İl Sorumlusu şişik sayı görüyor | `tasks/page.tsx:659,404,723` |
| `operationRisk.ts` tarayıcı client'ı import ediyor → sunucuda kullanılamıyor | `operationRisk.ts:1` |
| `'risk'` rapor bölümü enum'da var, hiç üretilmiyor (ölü değer) | `rapor/kapsam.ts:11` |
| `createNotificationForAll` org filtresiz — tüm workspace'lere gidiyor | `lib/notifications.ts:75` |
| `notifications` INSERT politikası `auth.uid() is not null` — herkes başkası adına yazabilir | migration 017:40 |
| Panelde `schedules` sorgusu çekiliyor, kullanılmıyor | `dashboard/page.tsx:73` |
| `KpiModal` masaüstünde de alta yapışıyor (yorumu "centered" diyor) | `dashboard/page.tsx:539` |
| `ResponsiveModal` yazılmış ama **hiç kullanılmamış**; Escape/scroll kilidi yok | `responsive/ResponsiveModal.tsx` |
| `tasks.completed_at` yok — görevin ne zaman bittiği tutulmuyor | migration 006 |
| `fingerprint.ts`'in **hiç testi yok** (en kritik dosya) | — |
| API varsayılan dönemi `bu-ay`, ekranınki `tumu` | `rapor/route.ts` vs `raporlar/page.tsx:36` |

---

## Fazlar

| # | Faz | Hizmet ettiği madde |
|---|---|---|
| 0 | Emniyet ağı + görünür hatalar | hepsi |
| 1 | Görevler yapısal bölme (davranış değişmez) | 3 |
| 2 | Görevler UX | 3 |
| 3 | DENEYAP veri modeli | 3,4,5 |
| 4 | DENEYAP'ın arayüze bağlanması | 3 |
| 5 | Duyurular | 1 |
| 6 | Panel | 2 |
| 7 | Excel'de DENEYAP | 3 |
| 8 | Risk ayrımı + trend altyapısı | 4 |
| 9 | Grafikler | 4 |
| 10 | Yorum motoru | 4 |
| 11 | Türkiye ısı haritası | 5 |
| 12 | PDF/Excel hizalama + rol matrisi | 4,5 |
| 13 | AI derinleştirme (isteğe bağlı) | 4 |

Süre daralırsa kesme sırası: **13 → 11'in PDF ayağı → 8'in snapshot'ı**. Faz 9'daki
türetme sayesinde snapshot olmadan da grafikler dolu görünür.

---

### Faz 0 — Emniyet ağı + görünür hatalar

Sonraki her fazın regresyonu buradaki testlerle yakalanacak.

- **`fingerprint.test.ts`** — altın değerler literal sabitlenir, dosyaya "bu değerler
  değişirse üretimde kopya görev oluşur" notu. *Bu planın tek en değerli testi.*
- `src/lib/gorevFiltre.ts` — görevler sayfasının **bugünkü** filtre davranışı saf
  fonksiyonlara çıkarılır + testleri. `?il=Ankara` / `?il=` (boş = "İl atanmamış") /
  parametre yok — **üç ayrı case kilitlenir**; refactor'da en kolay kaybedilecek şey bu.
- `types/database.ts` — `organization_members` ilk kez tiplenir, `as { il: ... }` cast'leri
  temizlenir (`orgContext`, `apiAuth:136`, `members:103`, `rapor/veri.ts:39`).
  **Ayrı, mekanik commit.**
- **Migration 059** — `tasks.completed_at` + `done`'a geçişte dolduran trigger
  (054'teki `touch_updated_at` deseni), `done` olanlar için `updated_at` ile backfill.
- **Dönem filtresi düzeltmesi.** Ürün tanımı: *"bu ay raporu" = bu ay **termini** olan
  işler* — DENEYAP planı termin üzerinden yürüyor. `due_date` yoksa `created_at`'e düşer.
  `hesapla.ts`'te iki küme tutulur: `ilKapsamli` (bugünün fotoğrafı) ve `kapsamli`
  (dönem uygulanmış). **`yaklasan` ve `risk` döneme tabi değil** — "geçen ay" seçilince
  "önümüzdeki 7 gün" boşalırsa hata sanılır; koda yorum yazılır.
- Sayaç tutarsızlığı: tüm sayaçlar tek `sayaclariHesapla()`'dan, tabanı daima
  `kapsamaGoreSuz(...)`. Semantik: "buna tıklarsam kaç tane görürüm".
- `ResponsiveModal`: Escape, body scroll kilidi, `role="dialog"`/`aria-modal`.
- `dashboard`: ölü `schedules` sorgusu silinir, `KpiModal` masaüstünde ortalanır.

### Faz 1 — Görevler yapısal bölme (davranış değişmez)

1145 satır, mobil (379-651) ve masaüstü (654-1144) **iki ayrı JSX ağacı**. Atölye
seçiciyi bu ikiz ağaca eklemek onu **iki kez** eklemek olurdu — o yüzden bölme, DENEYAP
arayüzünden önce.

Tek ağaç + Tailwind; `useIsMobile` yalnızca DOM'un gerçekten farklılaştığı 3 yerde
(modal kabuğu, FAB vs düğme, kart vs satır) — `useIsMobile.ts`'in kendi doc kuralı bu.

Bölünme: `page.tsx` (~280) · `_components/GorevAramaVeGorunumler` ·
`GorevFiltrePaneli` · `GorevListesi` · `GorevSatiri` (`variant: satir|kart`, rozet
mantığı **tek yerde**) · `GorevFormModal` (tek alan sırası) · `gorevMeta.ts` ·
`src/lib/useGorevFiltreleri.ts` (URL ↔ state).

Form birleşince mobilde bugün eksik olan süre alanları, dosya ekleme, Sil ve Excel
içe aktarma otomatik gelir.

### Faz 2 — Görevler UX

- **Hazır görünümler:** Tümü · Bana atananlar · Gecikenler · Bu hafta ·
  *"Ankara görevleri"* (yalnız `member`) · Atanmamış (yalnız admin) ·
  *"Çankaya DENEYAP"* (Faz 4'te açılır). Varsayılan: `member`→Bana atananlar, diğerleri→Tümü.
- Mobildeki durum sekmeleri kaldırılıp filtre paneline taşınır (iki sekme çubuğu kaotik).
- **Arama:** `trFold` ile token AND; başlık, açıklama, atanan, il, DENEYAP adı. 150ms
  debounce, katlanmış metinler `useMemo` ile önceden hesaplanır.
- **Filtre paneli:** tek "Filtrele" düğmesi + `Filtrele · 3` rozeti. Etiketli gruplar
  (bugün 4 select tamamen etiketsiz). Sürekli ekranda duran kontrol sayısı **11 → 3**.
- URL: `?il=` korunur (boş-değer semantiği dahil), `?deneyap=`, `?gorunum=`, `?q=` eklenir.
  Yazarken `router.replace(..., {scroll:false})`, varsayılanlar URL'e yazılmaz.

### Faz 3 — DENEYAP veri modeli

**Migration 060** — `public.tr_fold(text)` `immutable` (TS `trFold` ile birebir ikiz,
migration comment'inde bağ yazılır) + `deneyaplar` tablosu:
`id, organization_id, ad, il, ilce, kod, adres, notlar, aktif, created_by, timestamps`.
Unique `(organization_id, tr_fold(ad))`, index `(organization_id, aktif, il)`.
RLS: okuma `is_org_member`, yazma `is_org_admin`.

**Migration 061** — `tasks.deneyap_id`, `organization_members.deneyap_id`
(`on delete set null`) + **iki trigger**:
1. `BEFORE INSERT/UPDATE` — `deneyap_id` doluysa DENEYAP'ı `(id, organization_id)`
   çiftiyle çek (**çapraz-org enjeksiyonuna karşı**, yoksa `raise exception`) ve
   `NEW.il := deneyap.il`. `deneyap_id` null ise hiçbir şey yapma → **geriye dönük
   uyumun tamamı budur.**
2. `deneyaplar` üzerinde: **`il` değiştirilemez.** Gerekçe: `tasks.import_fingerprint`
   eski ili taşımaya devam eder; il değişirse aynı Excel tekrar yüklenince **kopya görev**
   oluşur. Yanlışsa DENEYAP kapatılır, doğrusu açılır.

Senkron neden trigger: `tasks`'a yazan 6+ yol var ve biri (`import_tasks_apply`) tamamen
plpgsql — TS'e hiç uğramıyor. Uygulama katmanı senkronu birini kaçırır ve
`il ≠ DENEYAP'ın ili` sessizce oluşur.

**Kod:** `iller.ts`'e eklemeli olarak `IL_PLAKA` (harita için; plaka alfabetik sıradan
türetilemez), `ilGecerliMi`. Mevcut export'lar aynen kalır — 41 dosya buradan okuyor.
Yeni `src/lib/deneyap.ts` (saf: etiket, arama, il bazlı gruplama) ·
`useDeneyaplar.ts` (`pageDataCache`, sessionStorage'a yazmaz) ·
`DeneyapSecici.tsx` (combobox: arama, il gruplu, kullanıcının ili üstte, render tavanı
60 + "aramayı daraltın", pasifler gizli ama seçili olan görünür, **"DENEYAP yok — yalnızca
il seç"** kaçış kapısı, admin'e satır içi "+ Yeni") ·
`/org/[slug]/settings/deneyaplar` yönetim ekranı (arama, il filtresi, açık görev sayısı,
düzenlemede **il alanı kilitli** + gerekçe metni, silme yok sadece kapatma,
**"İl başına bir DENEYAP oluştur" onaylı aracı**) ·
`api/org/[slug]/deneyaplar/route.ts` (tek yazma yolu).

`orgContext`: `deneyap_id` eklenir, `CACHE_PREFIX` **v2→v3**, `clearOrgCache` eski
prefix'i de süpürür.

**Backfill migration YOK** — `il` ≠ DENEYAP. 6 DENEYAP'lı bir il için tek uydurma kayıt
üretmek yanlış veri olur. `deneyap_id = null` olan her şey zaten sorunsuz çalışır.

`demo-seed.mjs`: Ankara'ya *Çankaya* + *Keçiören*, İzmir'e *Bornova* + *Karşıyaka*,
Bursa'ya *Nilüfer* — **bir ilde birden fazla DENEYAP** demoda görünür olmalı. Genel Merkez
görevleri `deneyap_id = null` (kaçış kapısını da demolar).

**`taskScope.ts` Faz 3'te değişmez** — İl Sorumlusu ilinin tüm görevlerini görmeye devam
eder (kullanıcı kararı).

### Faz 4 — DENEYAP'ın arayüze bağlanması

Görev formuna `DeneyapSecici`; DENEYAP seçilince `İl / Birim` alanı `disabled` olur ve
DENEYAP'ın ilinden dolar ("İl, seçilen DENEYAP'tan alınır") — DB trigger'ının kullanıcıya
görünen aynası. Filtre paneline DENEYAP filtresi, `?deneyap=`, "DENEYAP'ım" görünümü,
`GorevSatiri`'nda il rozeti yerine DENEYAP adı (varsa).

### Faz 5 — Duyurular

**Migration 062** — `duyurular` (`baslik, icerik, onem, hedef_roller[], hedef_iller[],
hedef_deneyap_ids[], yayinda, baslangic_at, bitis_at`) + `duyuru_okundu`
(`(duyuru_id, user_id)` PK). RLS: okuma `is_org_member`, yazma `is_org_admin`.
`notifications.event_type` CHECK'i `announcement` için genişletilir (kodla kısıt
arasındaki mevcut 6 tiplik uyumsuzluk da giderilir).

`GET /api/org/[slug]/duyurular/aktif` — **hedefleme sunucuda uygulanır**; client-side
filtre yetmezdi, hedeflenmemiş kullanıcı veriyi çekebilirdi.
`POST .../[id]/okundu`. Sayfa `/org/[slug]/duyurular` (owner/admin için CRUD).
`DuyuruPopup.tsx` — `ResponsiveModal` üstüne, `navigation.ts`'teki mevcut `anaEkran()`
ile **rolün ana ekranında** (owner/admin/viewer → `/dashboard`, member → `/me`).
Birden fazla okunmamışsa önem sırasına göre, "1/3" göstergesiyle.
Duyuru bildirimi için **org kapsamlı yeni sunucu fonksiyonu** (mevcut
`createNotificationForAll` org filtresiz, kullanılmaz).

### Faz 6 — Panel

Masaüstü panel bugün `height:100vh; overflow-hidden` — **kaydırmaya açılacak.**
Eklenecekler: yaklaşan terminler (7 gün) · il/DENEYAP durum tablosu · kritik ve gecikmiş
görevler (`priority` bugün panelde hiç kullanılmıyor) · son hareketler + yaklaşan
toplantılar. Ayrıca masaüstüne de karşılama + hızlı linkler (bugün yalnız mobilde),
KPI'lar için limitsiz `tasks` yerine `count` sorgusu.

### Faz 7 — Excel'de DENEYAP (en riskli parça)

- `columnMap.ts`: yeni `deneyap` hedefi; `atolye` alias'ı `il`'den **çıkarılır**,
  **`birim` `il`'de kalır** (kullanıcı kararı — alanın etiketi zaten "İl / Birim").
- **`import_column_presets` hafızası migrate EDİLMEZ** — daha önce "Atölye"→`il`
  eşlemiş bir org aynı eşlemeyi almaya devam eder, fingerprint'i hiç değişmez.
  Kasıtlı koruma, kod comment'i olarak yazılır.
- `normalize.ts`: `normDeneyap` (kod → ad → ad+il → Levenshtein≤2 → yeni). `normIl`
  **hiç değişmez**.
- `satirIsle.ts` **"etkin il"**: DENEYAP çözüldüyse onun ili → yoksa il sütunu → *DENEYAP
  sütunu var ama çözülmedi ve il sütunu YOK ise* **`normIl(deneyapHücresi)`'ye düş**.
  Bu tek satır, alias ayrıştırmasını fingerprint açısından nötr yapar: "Atölye" başlıklı
  ama içinde "Ankara" yazan eski dosyalar önceki sürümle **birebir aynı** anahtarı üretir.
  `fingerprint.ts`'e tek karakter dokunulmaz.
- DENEYAP/il çelişkisi → **hata değil uyarı** (satır düşürülmez).
- Önizlemede **"Tanınmayan DENEYAP'lar"** paneli: Oluştur / Mevcutla eşleştir / Yok say.
  Onay sonrası satırlar `ham` jsonb'den **yeniden normalize** edilir (dosya yeniden
  ayrıştırılmaz) — 055'in "önizleme ile uygulama bit bit aynı" ilkesi korunur.
- `sablon.ts` DENEYAP sütunu + liste sayfası (harf indeksleri kayacak, `sablon.test.ts`
  yakalar). **Migration 063** — RPC'ye `deneyap_id`; `undo` da geri yazmalı.

### Faz 8 — Risk ayrımı + trend altyapısı

**`operationRisk.ts` bölünür:** saf `computeRisk` kalır (tarayıcı importu **kaldırılır**);
`risk/istemciVeri.ts` (mevcut fetch); `risk/sunucuVeri.ts` — **mutlaka
`tumGorevleriGetir(yetki)` üzerinden**, asla ham `admin.from('tasks')`: sunucuda RLS yok,
kapsam `taskScope` ile uygulanmalı. Böylece `'risk'` bölümü gerçekten üretilir ve PDF'e girer.

**Migration 064 — `gunluk_ozet`:** granülarite `(organization_id, gun, kirilim, il,
deneyap_id)`, `kirilim ∈ (org|il|deneyap)`. Metrikler tipli sütunlar + `ek jsonb` kaçış
kapısı. **`kaynak ∈ (cron|turetilmis|demo)`** — demo verisinin gerçekle karışmasını
yapısal olarak engeller, tek sorguyla temizlenir. Upsert idempotent unique index.
~150 satır/gün; 400 günden eskiyi silen adım.

Cron: `gunluk-ozet` işi mevcut dispatcher'ın **en başına** (50sn bütçe dolarsa atlanan son
iş olmamalı). `scripts/ozet-demo.mjs` 90 günlük geçmiş üretir (`kaynak='demo'`,
`--temizle` bayrağı); `demo-seed.mjs` görev tarihlerini son 8 haftaya yayar (bugün 11
görevin hepsi aynı gün → düz çizgi).

**`seri.ts` + `karsilastir.ts` (saf):** kaynak kararı **gün başına** — o gün snapshot
varsa ölçüm, yoksa türetme. Snapshot biriktikçe grafik kendiliğinden gerçeğe kayar.
Türetilebilenler: açılan, tamamlanan (`completed_at`), açık, geciken.
**Türetilemeyenler: bloke, risk skoru, atanmamış** — durum geçmişi yok, bu seriler
türetilmiş bölgede **çizilmez**, "ölçüm başladıktan sonra" notu gösterilir.
Türetilmiş segment **kesikli çizgi** + dipnot.
`karsilastir`'da **`guvenilir`** bayrağı: önceki dönem n<5 ise yüzde üretilmez, mutlak
fark verilir — "1'den 2'ye çıktı, %100 artış" cümlesi güvenilirliği tek başına bitirir.

### Faz 9 — Grafikler

**Grafik kütüphanesi eklenmez.** Gereksinim web VE PDF'te aynı grafik; recharts
@react-pdf'e render edilemez, iki ayrı uygulama = iki farklı grafik.
**Doğrulandı** (kurulu v4.8.1'de çalıştırıldı): `Svg, Path, Line, Polyline, Circle, Rect,
G, Text, Defs, LinearGradient, Stop` — hepsi var. Emsal: `timeline/page.tsx` elle
yazılmış Gantt.

Katmanlar: `grafik/olcek.ts` (saf: ölçek, "güzel" tick) → `grafik/geometri.ts` (saf:
hazır `d` string'leri) → `components/grafik/*` (web `<svg>` + tooltip + klavye +
**görsel gizli `<table>`** ekran okuyucu için) ve `rapor/pdf/grafikler.tsx` (aynı
geometri, @react-pdf primitifleri). **Aynı `d` iki renderer tarafından tüketilir.**

Tipler: çok çizgili zaman serisi **nokta işaretli** (kullanıcı "nokta grafiği" dedi) ·
il karşılaştırma yatay bar · durum dağılımı yığın bar · risk kartlarında sparkline.
Testler: boş seri, tek nokta, tümü sıfır → NaN/Infinity üretmemeli.

### Faz 10 — Yorum motoru

`yorum/kurallar.ts` (her kural küçük saf fonksiyon) + `yorum/uret.ts` + testleri.
~15 kural, **hepsi kanıt sayısı taşır**: gecikme artışı/azalışı (iyi haber de verilmeli),
tek kişide yığılma, gecikmenin tek ilde yoğunlaşması, atanmamış kritik, bloke azalmıyor,
birikme (4 dönem `açılan > tamamlanan`), sessiz il ("veri girişi yapılmamış olabilir" —
suçlamayan dil), termin yığılması, DENEYAP'lar arası fark, **veri kalitesi** (terminsiz
görev >%30 → raporun kendi sınırını itiraf etmesi), sprint sapması, risk sinyali köprüsü,
ve hiçbiri tetiklenmezse "dikkat çeken sapma yok" — **boş yorum bloğu asla gösterilmez**.

**Rol farkı yapısal:** her kural `kisiBazli` bayrağı taşır; `kapsam.kisiBazliVeri` false
ise kural **hiç çalıştırılmaz**. İsim regex ile silinmez — sızıntı orada olur.
Ton: operasyon (owner) / koordinasyon (admin) / il (member, kıyas ülke ortalamasına,
başka il adı geçmez) / yönetim (viewer, isimsiz).

Türkçe: `turkce.ts`'e `bulunmaEki(ad)` — "Ankara'da / Uşak'ta / Bolu'da". Yorumların
"makine yazmış" hissi vermemesi buna bağlı.

### Faz 11 — Türkiye ısı haritası

**Kaynak: Natural Earth 1:10m Admin-1 — kamu malı, atıf bile gerekmiyor.**
MIT etiketli Türkiye GeoJSON depolarının çoğu aslında OSM türevi → gerçek lisans **ODbL**
(paylaş-benzer); depo etiketi bunu geçersiz kılmaz. ODbL kaynağa düşülürse arayüz **ve**
PDF altbilgisinde atıf zorunlu. Seçim `src/lib/harita/KAYNAK.md`'ye yazılır.

Tek seferlik çevrimdışı boru hattı: TR filtrele → sadeleştir → sabit 1000×430 viewBox'a
**önceden yansıt** → tamsayı yuvarla → **TS modülü** (`harita/turkiyeIller.ts`).
Modül olduğu için Vercel `outputFileTracingIncludes` tuzağı (PDF fontlarında **iki kez**
yaşandı) hiç doğmaz. Hedef **≤60KB**; web'de `next/dynamic({ssr:false})` ile ayrı chunk.

**İsim eşlemesi:** "Afyon"↔"Afyonkarahisar", "Hakkari"↔"Hakkâri", "Icel"↔"Mersin",
"K. Maras"↔"Kahramanmaraş" — takma ad tablosu + **81↔81 birebir eşleşme testi**
(yoksa haritada sessizce boş iller kalır).

**En önemli dürüstlük ayrıntısı: verisi olmayan il, düşük riskli ilden görsel olarak
FARKLI olmalı** (nötr gri + tarama deseni). Aksi halde hiç görev girilmemiş 60 il
"her şey yolunda yeşili" olarak okunur ve **harita yalan söyler**.

Renk: 5 kademeli sıralı YlOrRd + ayrı "veri yok" grisi (mevcut 3 renkli kategorik
`RISK_RENK` harita için yetersiz). Renk hiçbir zaman tek kanal değil: açıklık gradyanı +
en yüksek kademede desen + `aria-label`'da sayısal değer + lejant.

Etkileşim: hover tooltip (il + risk + o ildeki DENEYAP'lar), tıklama → `ResponsiveModal`
detay paneli (**her DENEYAP ayrı satır** — bir ilde birden fazla olması bu panelin varlık
sebebi), her `<path>` `tabIndex/role/aria-label` + "Tabloya geç" düğmesi.
**Mobil (<640px): varsayılan tablo**, harita "Haritayı göster" arkasında — 375px'te 81 il
okunamaz. **Harita her zaman bir il tablosuyla birlikte** (erişilebilirlik + yedek).

İl Sorumlusu: ulusal harita yerine **kendi ili büyütülmüş** + DENEYAP kartları.

### Faz 12 — PDF/Excel hizalama + rol matrisi

Grafikler, harita ve yorumlar PDF'e; Excel/CSV'ye trend ve il sayfaları.
`kapsam.ts` genişler: `trend`, `karsilastirma`, `yorum`, `harita`, `deneyap_kirilimi`
+ `yorumTonu`, `karsilastirmaKapsami`.
`roller.ts`'e **ayrı `riskGorebilirMi(rol)`** — `raporGorebilirMi`'yi genişletmek Panel ve
Timeline erişimini de sessizce açardı, kabul edilemez.
PDF'te harita ile **aynı sayfada il tablosu zorunlu** (tooltip yok). Süre ölçülür,
>2sn ise kaba yola düşülür veya `?harita=0` ile kapatılır.

### Faz 13 — AI derinleştirme (isteğe bağlı)

`api/org/[slug]/rapor/yorum-ai` — **sunucu veriyi yeniden hesaplar**, istemciden gelen
sayıya güvenmez. Gemini'ye KPI + ilk 10 il + serinin son 12 noktası + **üretilmiş kural
yorumları** gider; prompt "yalnızca verilen sayıları kullan, yeni sayı üretme".
`aiYetkiCoz` bugün `gerekli:'yazma'` sabitliyor → viewer/member AI alamaz; opsiyonel
parametre eklenir ve bu uç `'uye'` + `raporUretebilirMi` ile çağrılır (**bilinçli yetki
genişletmesi**, sessizce yapılmaz). Kota `ai_usage_logs`'a eklenir.
Hata/kota → ayrı kart yerine tek satır uyarı, sayfa bozulmaz. Anahtar yoksa buton
**hiç render edilmez** (sunumda ölü buton olmaz).
**AI yorumu varsayılan olarak PDF'e girmez** — PDF resmî belge; istenirse ayrı onay +
"yapay zekâ üretimi, doğrulanmadı" damgası.

---

## Doğrulama

**Birim testleri** (mevcut 181 bozulmamalı):
- `fingerprint.test.ts` — altın değerler (yeni, en kritik)
- `gorevFiltre.test.ts` — `?il=` üç case; sayaç regresyonu (`member`/Ankara, 10 görevin
  6'sı başka ilde → chip sayısı 10 değil 4 tabanından)
- `satirIsle.test.ts` — DENEYAP sütunu il adı içeriyor + il sütunu yok →
  **fingerprint eski sürümle birebir aynı**
- `taskScope.test.ts` — `deneyap_id` eklendikten sonra **davranışın değişmediği**
- `hesapla.test.ts` — "bu hafta ≠ tümü"; `yaklasan`'ın dönemden etkilenmediği
- `yorum/uret.test.ts` — nadir tokenla isimlendirilmiş üye, **viewer çıktısında o token'ın
  hiç geçmediği** (property test)
- `harita` — 81↔81 il eşleşmesi; grafik geometrisi — boş/tek/sıfır seri NaN üretmemeli

**Uçtan uca** (`npm run seed:demo`, dört rolle):
1. Duyuru oluştur → İl Sorumlusuyla gir → popup → "Anladım" → çık/gir → **bir daha çıkmamalı**
2. Ankara'ya ikinci DENEYAP → göreve ata → Görevler'de filtrele → haritada Ankara'ya tıkla
   → **iki DENEYAP birden görünmeli**
3. Aynı Excel'i iki kez içe aktar → **kopya görev oluşmamalı**
4. Dört rolle rapor indir → farklı bölümler; **viewer PDF'inde kişi adı yok**; trend ve
   yorum var
5. Harita: hover, tıklama, mobilde tablo varsayılanı, verisi olmayan ilin farklı görünmesi
6. `npx tsc --noEmit` temiz, `npx vitest run` yeşil, `npx next build` başarılı

**Tarayıcı:** 375px ve 1440px, dört rolle — bu oturumda kurulan yöntemle (gerçek oturum +
konsol hatası kontrolü; iki sayfa hatası tam bu yöntemle bulunmuştu).

---

## Riskler

| Risk | Azaltma |
|---|---|
| **Fingerprint kayması → kopya görevler** (en yüksek, sessiz) | `fingerprint.ts` hiç değişmez; "etkin il" geri düşüşü; preset hafızası korunur; altın testler; mevcut "Geri Al" |
| `il` ile DENEYAP'ın ili ayrışması | DB trigger tek boğaz; DENEYAP'ın ili **değiştirilemez** |
| Çapraz org `deneyap_id` enjeksiyonu | Trigger'da org eşleşme kontrolü + `raise exception` |
| Kapsam sızıntısı | `taskScope.ts` Faz 3'te dokunulmaz; sunucu risk yolu `tumGorevleriGetir(yetki)` üzerinden |
| Viewer'a kişi adı sızması | Kural düzeyinde `kisiBazli` bayrağı + property test; regex temizliği yasak |
| **Harita lisansı** | Natural Earth (kamu malı) birincil; ODbL'e düşülürse atıf zorunlu; `KAYNAK.md` |
| **Verisi olmayan il "yeşil" görünür → harita yalan söyler** | Ayrı nötr gri + desen + lejantta "veri yok" |
| Vercel'de harita/font 500 | Varlık TS modülü, runtime dosya okuması yok |
| Trend grafiğinin yanıltıcı olması | Türetilmiş segment kesikli + dipnot; türetilemeyen seriler çizilmez; `guvenilir` bayrağı |
| Demo verisinin gerçekle karışması | `kaynak` sütunu + CHECK + tek komutla temizleme |
| 1145 satırlık refactor'da gizli davranış kaybı | Faz 1 davranış değiştirmez ve ayrı commit; UX ayrı commit — bisect mümkün kalsın |
| Dönem düzeltmesi sayıları değiştirecek → "rapor bozuldu" algısı | Ekranda dönem tanımı yazılır; API/ekran varsayılanı hizalanır; sürüm notu |
| `tr_fold` (SQL) ile `trFold` (TS) ayrışması | Migration comment'inde ikiz bağı; `deploy-sonrasi.mjs`'de örnek karşılaştırma |
| Sunumda AI'ın çalışmaması | Kural tabanlı yorum her zaman görünür; AI yalnızca üstüne ekler |
| Kapsamın büyüklüğü | 14 faz, her biri tek başına çalışır ve teslim edilebilir |
