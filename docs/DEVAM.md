# DEVAM — yeni bir oturuma devretme notu

Bu dosya, işi başka bir Claude oturumunda kaldığı yerden sürdürmek için yazıldı.
Ayrıntılı 14 fazlık plan: **[docs/YOL-HARITASI.md](YOL-HARITASI.md)**

---

## Yeni oturumda ilk mesaj olarak şunu yaz

> Proje: `C:\Users\Abdulgazi\Desktop\DENEYAP-Ops`
> `docs/DEVAM.md` ve `docs/YOL-HARITASI.md` dosyalarını oku, Faz 1'den devam et.
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

Son commit: `b166318`. Çalışma ağacı temiz, GitHub ile senkron.
`npx tsc --noEmit` temiz · **208 test yeşil** · `npx next build` başarılı.

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

### Sırada: Faz 1 — Görevler sayfası yapısal bölme

`src/app/org/[slug]/tasks/page.tsx` **1145 satır** ve içinde **iki ayrı JSX ağacı**
var: mobil (379-651) ve masaüstü (654-1144). Form, filtreler ve liste satırı iki kez
ayrı ayrı yazılmış.

**Bu faz davranışı DEĞİŞTİRMEZ** — sadece böler. Ayrı commit olmalı ki sonraki UX
commit'iyle karışmasın (bisect edilebilirlik).

Hedef bölünme (YOL-HARITASI.md Faz 1'de ayrıntılı):
`page.tsx` (~280) · `_components/GorevAramaVeGorunumler` · `GorevFiltrePaneli` ·
`GorevListesi` · `GorevSatiri` (`variant: satir|kart`) · `GorevFormModal` ·
`gorevMeta.ts` · `lib/useGorevFiltreleri.ts`

**Neden DENEYAP seçicisinden önce:** seçiciyi ikiz ağaca eklemek onu iki kez
eklemek olurdu.

---

## SENİN YAPMAN GEREKEN — migration 059

`supabase/migrations/059_tasks_completed_at.sql` **henüz uygulanmadı.**
Supabase → SQL Editor → dosya içeriğini yapıştır → çalıştır.

Görevin ne zaman tamamlandığını kaydetmeye başlar; tamamlanma trendi (Faz 8-9
grafikleri) bunsuz hesaplanamaz. Ne kadar erken çalıştırılırsa o kadar erken veri
birikir.

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
