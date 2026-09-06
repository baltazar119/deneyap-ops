-- 066_formlar.sql
--
-- Formlar: kullanıcı kendi formunu hazırlar, birine gönderir, karşı taraf
-- doldurunca bağlı görev tamamlanır ve tanımlıysa SONRAKİ görev cevaplardan
-- önceden doldurulmuş olarak oluşur.
--
-- Üç tablo, üç ayrı ömür:
--   formlar            → yeniden kullanılabilir TANIM (sorular, workflow kuralı)
--   form_gonderimleri  → tanımın bir kişiye/göreve bağlanmış ÖRNEĞİ + token
--   form_yanitlari     → o örneğe gelen CEVAP
--
-- Neden gönderim ayrı bir tablo: aynı form on ayrı göreve gönderilebilmeli.
-- Formun kendisine `gorev_id` koymak, her görev için formu yeniden
-- yazdırırdı.

-- ─────────────────────────────────────────────────────────────────────────
-- notifications.event_type — form bildirimi
-- ─────────────────────────────────────────────────────────────────────────
-- 062'deki listeye ekleme. Kısıt ile src/types/database.ts:NotificationEvent
-- AYNI listeyi taşımalı; ayrışırsa o tipteki bildirimler INSERT anında
-- sessizce düşer (062'de tam bu yüzden 6 tip kaybolmuştu).

alter table public.notifications
  drop constraint if exists notifications_event_type_check;

alter table public.notifications
  add constraint notifications_event_type_check check (
    event_type in (
      'task_assigned', 'task_status_changed', 'task_overdue',
      'review_reply', 'mention', 'annotation_resolved', 'new_version',
      'sprint_changed', 'task_due_soon', 'sprint_ending_soon',
      'meeting_created', 'meeting_cancelled', 'meeting_reminder',
      'member_overloaded', 'announcement',
      -- 066
      'form_yanitlandi'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- formlar — tanım
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.formlar (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  baslik   text not null,
  aciklama text,

  -- Soru listesi. Şema TypeScript'te (src/lib/form/tipler.ts) tanımlı ve
  -- sunucuda doğrulanıyor; jsonb burada esneklik için, doğrulamasızlık için
  -- değil. "tablo" tipi Excel benzeri ızgara sorudur — bu ürünün Google
  -- Form'dan ayrıldığı yer.
  alanlar jsonb not null default '[]'::jsonb,

  -- 'uyeler'   → doldurmak için giriş + org üyeliği şart
  -- 'baglanti' → token'ı olan herkes doldurur, giriş gerekmez
  erisim text not null default 'uyeler'
         constraint formlar_erisim_check check (erisim in ('uyeler', 'baglanti')),

  yayinda boolean not null default false,

  -- ── Workflow: form dolunca ne olacak ──
  -- Bağlı görev her zaman tamamlanır (gönderimdeki gorev_id doluysa).
  -- Aşağıdakiler SONRAKİ görevin şablonu; kapalıysa yeni görev açılmaz.
  sonraki_gorev_aktif    boolean not null default false,
  -- {{alan_id}} yer tutucuları cevaplarla değiştirilir.
  sonraki_gorev_baslik   text,
  sonraki_gorev_aciklama text,
  sonraki_gorev_oncelik  text not null default 'normal',
  sonraki_gorev_tur      text not null default 'other',
  -- Yanıt tarihinden kaç gün sonra termin. null = terminsiz.
  sonraki_gorev_termin_gun integer,
  -- 'gonderen' → formu gönderen kişi, 'yanitlayan' → dolduran (üye ise),
  -- 'sabit'    → sonraki_gorev_atanan_id
  sonraki_gorev_atanan_kaynak text not null default 'gonderen'
    constraint formlar_atanan_kaynak_check
      check (sonraki_gorev_atanan_kaynak in ('gonderen', 'yanitlayan', 'sabit')),
  sonraki_gorev_atanan_id uuid references auth.users(id) on delete set null,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists formlar_org_idx
  on public.formlar (organization_id, yayinda, created_at desc);

drop trigger if exists formlar_updated_at on public.formlar;
create trigger formlar_updated_at
  before update on public.formlar
  for each row execute function public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- form_gonderimleri — "şu form, şu kişiye, şu görev için"
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.form_gonderimleri (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  form_id         uuid not null references public.formlar(id) on delete cascade,

  -- Doldurunca TAMAMLANACAK görev. null = forma bağlı görev yok.
  -- `on delete set null`: görev silinse de gönderim ve cevap kaybolmaz.
  gorev_id uuid references public.tasks(id) on delete set null,

  -- Kime gönderildi. Üye ise user_id, değilse yalnızca etiket/e-posta.
  alici_user_id uuid references auth.users(id) on delete set null,
  alici_etiket  text,

  -- TOKEN HAM HALİYLE TUTULMAZ, yalnızca SHA-256 özeti — eylemToken.ts ile
  -- aynı mantık. Veritabanı sızsa bile bağlantılar kullanılamaz.
  token_ozeti text not null unique,
  -- null = süresiz. Açık bağlantılarda süre vermek önerilir.
  son_gecerlilik timestamptz,

  durum text not null default 'bekliyor'
        constraint form_gonderimleri_durum_check
          check (durum in ('bekliyor', 'yanitlandi', 'iptal')),

  gonderen_id uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists form_gonderimleri_form_idx
  on public.form_gonderimleri (form_id, created_at desc);
create index if not exists form_gonderimleri_gorev_idx
  on public.form_gonderimleri (gorev_id)
  where gorev_id is not null;
create index if not exists form_gonderimleri_alici_idx
  on public.form_gonderimleri (alici_user_id, durum)
  where alici_user_id is not null;

drop trigger if exists form_gonderimleri_updated_at on public.form_gonderimleri;
create trigger form_gonderimleri_updated_at
  before update on public.form_gonderimleri
  for each row execute function public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- form_yanitlari — cevaplar
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.form_yanitlari (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  gonderim_id     uuid not null references public.form_gonderimleri(id) on delete cascade,

  -- { alan_id: değer }. Tablo tipi alanlar dizi-of-nesne tutar.
  cevaplar jsonb not null default '{}'::jsonb,

  -- Açık bağlantıyla dolduranlarda null kalır; forma "adınız" sorusu
  -- eklenerek kim olduğu öğrenilir.
  yanitlayan_user_id uuid references auth.users(id) on delete set null,
  -- Denetim için: anonim yanıtta elimizdeki tek iz.
  yanitlayan_ip text,

  -- Workflow sonucu — hangi görevin açıldığı burada kayıtlı ki
  -- "bu cevap neye yol açtı" sorusu cevaplanabilsin.
  olusan_gorev_id uuid references public.tasks(id) on delete set null,

  created_at timestamptz not null default now()
);

create index if not exists form_yanitlari_gonderim_idx
  on public.form_yanitlari (gonderim_id);
create index if not exists form_yanitlari_org_idx
  on public.form_yanitlari (organization_id, created_at desc);

-- ─────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────

alter table public.formlar enable row level security;

-- Okuma her org üyesine: İl Sorumlusu da formları görüp doldurabilmeli.
drop policy if exists formlar_select on public.formlar;
create policy formlar_select on public.formlar
  for select using (public.is_org_member(organization_id));

-- Kullanıcı kararı: İl Sorumlusu da form OLUŞTURABİLİR. Bu, sahanın kendi
-- form ihtiyacını karşılaması için bilinçli bir istisna — org'da içerik
-- oluşturabilen ilk üye-seviyesi yetki.
drop policy if exists formlar_insert on public.formlar;
create policy formlar_insert on public.formlar
  for insert with check (public.is_org_member(organization_id));

-- Ama DÜZENLEME/SİLME yalnızca sahibinde ya da yöneticide: bir İl Sorumlusu
-- başkasının formunu değiştirememeli.
drop policy if exists formlar_update on public.formlar;
create policy formlar_update on public.formlar
  for update using (created_by = auth.uid() or public.is_org_admin(organization_id))
  with check (created_by = auth.uid() or public.is_org_admin(organization_id));

drop policy if exists formlar_delete on public.formlar;
create policy formlar_delete on public.formlar
  for delete using (created_by = auth.uid() or public.is_org_admin(organization_id));

alter table public.form_gonderimleri enable row level security;

drop policy if exists form_gonderimleri_select on public.form_gonderimleri;
create policy form_gonderimleri_select on public.form_gonderimleri
  for select using (public.is_org_member(organization_id));

drop policy if exists form_gonderimleri_insert on public.form_gonderimleri;
create policy form_gonderimleri_insert on public.form_gonderimleri
  for insert with check (public.is_org_member(organization_id));

drop policy if exists form_gonderimleri_update on public.form_gonderimleri;
create policy form_gonderimleri_update on public.form_gonderimleri
  for update using (gonderen_id = auth.uid() or public.is_org_admin(organization_id))
  with check (gonderen_id = auth.uid() or public.is_org_admin(organization_id));

alter table public.form_yanitlari enable row level security;

drop policy if exists form_yanitlari_select on public.form_yanitlari;
create policy form_yanitlari_select on public.form_yanitlari
  for select using (public.is_org_member(organization_id));

-- INSERT politikası BİLEREK YOK. Yanıtlar yalnızca sunucu ucundan
-- (service-role) yazılır: açık bağlantıyla dolduran kişinin oturumu yok,
-- dolayısıyla anon'a INSERT açmak gerekirdi ve o da herkesin her forma
-- sahte cevap yazabilmesi demekti. Token doğrulaması sunucuda yapılıyor.

comment on table public.formlar is
  'Form tanımları. `alanlar` şeması src/lib/form/tipler.ts''te; "tablo" tipi '
  'Excel benzeri ızgara sorudur. Doğrulama sunucuda yapılır.';
comment on table public.form_gonderimleri is
  'Formun bir kişiye/göreve bağlanmış örneği. `token_ozeti` yalnızca SHA-256; '
  'ham token hiçbir zaman saklanmaz.';
comment on table public.form_yanitlari is
  'Form cevapları. INSERT yalnızca sunucu ucundan yapılır — anon INSERT '
  'politikası bilerek yok.';
