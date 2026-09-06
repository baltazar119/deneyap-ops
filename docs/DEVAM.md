# DEVAM — yeni bir oturuma devretme notu

Bu dosya, işi başka bir Claude oturumunda kaldığı yerden sürdürmek için yazıldı.
Ayrıntılı 14 fazlık plan: **[docs/YOL-HARITASI.md](YOL-HARITASI.md)**

---

## Yeni oturumda ilk mesaj olarak şunu yaz

> Proje: `C:\Users\Abdulgazi\Desktop\DENEYAP-Ops`
> `docs/DEVAM.md` ve `docs/YOL-HARITASI.md` dosyalarını oku, Faz 6'dan devam et.
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

Son commit: `062e32e`. Çalışma ağacı temiz, GitHub ile senkron.
`npx tsc --noEmit` temiz · **331 test yeşil** · `npx next build` başarılı.
**Migration 059, 060, 061 uygulandı. 062 BEKLİYOR** (aşağıya bak).

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

### Sırada: Faz 6 — Panel

YOL-HARITASI.md Faz 6. **Migration gerekmez.**

- Masaüstü panel bugün `height:100vh; overflow-hidden` — **kaydırmaya açılacak.**
- Eklenecek dört blok: yaklaşan terminler (7 gün) · il/DENEYAP durum tablosu ·
  kritik ve gecikmiş görevler (`priority` panelde hiç kullanılmıyor) · son
  hareketler + yaklaşan toplantılar.
- Masaüstüne de karşılama + hızlı linkler (bugün yalnız mobilde).
- KPI'lar için limitsiz `tasks` yerine `count` sorgusu.

Hazır bağlantı noktaları: `lib/gorevTermin.ts` (`gecikmisMi`/`yaklasanMi`),
`lib/deneyap.ts` (`deneyaplariIleGoreGrupla`), `lib/useDeneyaplar.ts`.

---

## SENİN YAPMAN GEREKEN — migration 062

`supabase/uygula/faz5_duyurular.sql` **henüz uygulanmadı.**
Supabase → SQL Editor → dosyanın tamamını yapıştır → çalıştır.

Bunsuz duyuru ekranı "tablo yok" uyarısı gösterir, popup hiç açılmaz;
**uygulamanın geri kalanı etkilenmez.** Uygulandıktan sonra Faz 5 uçtan uca
doğrulanmalı (dört rolle: duyuru oluştur → hedeflenen kişiyle gir → popup →
"Anladım" → çık/gir → bir daha çıkmamalı).

Uygulanmış migration'lar: **059, 060, 061.**

Yararlı komutlar:

```bash
node scripts/tr-fold-ikiz.mjs   # SQL/TS trFold ikiz doğrulaması
npm run seed:demo               # demo veriyi yeniden kur
```

> **`next build`'i `next dev` çalışırken KOŞTURMA** — bu oturumda iki kez
> `.next`'i bozdu. Bozulursa: dev'i durdur, `rm -rf .next`, yeniden başlat.

> **Migration'ları REST ile doğrulama** (bu oturumda işe yaradı):
> `select=<kolon>` 200 dönüyorsa kolon var, 400 + `42703` dönüyorsa yok.
> Tablo yoksa PostgREST `PGRST205` döner.

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
