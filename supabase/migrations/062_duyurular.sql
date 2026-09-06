-- 062_duyurular.sql
--
-- Duyurular: merkezin sahaya tek yönlü, hedeflenmiş bildirimi. Panelde bir
-- kez popup olarak çıkar, "Anladım" denince bir daha çıkmaz.
--
-- Okundu bilgisi DB'de tutuluyor, localStorage'da DEĞİL: kullanıcı karar
-- olarak "cihaz bağımsız" dedi. Telefonda okuyup bilgisayarda tekrar görmek
-- duyuruyu gürültüye çevirirdi.

-- ─────────────────────────────────────────────────────────────────────────
-- Önce mevcut bir tutarsızlığı gider: notifications.event_type CHECK'i
-- ─────────────────────────────────────────────────────────────────────────
-- 017'deki kısıt 8 tip tanıyor, `src/types/database.ts` ise 14 üretiyor.
-- Aradaki 6 tip (task_due_soon, sprint_ending_soon, meeting_created,
-- meeting_cancelled, meeting_reminder, member_overloaded) INSERT anında
-- kısıt ihlaliyle düşüyor — yani o bildirimler sessizce hiç oluşmuyor.
-- Duyuru için `announcement` eklerken bu borç da kapatılıyor.

alter table public.notifications
  drop constraint if exists notifications_event_type_check;

alter table public.notifications
  add constraint notifications_event_type_check check (
    event_type in (
      -- 017'den gelenler
      'task_assigned',
      'task_status_changed',
      'task_overdue',
      'review_reply',
      'mention',
      'annotation_resolved',
      'new_version',
      'sprint_changed',
      -- Kodda vardı, kısıtta yoktu (sessizce düşüyorlardı)
      'task_due_soon',
      'sprint_ending_soon',
      'meeting_created',
      'meeting_cancelled',
      'meeting_reminder',
      'member_overloaded',
      -- 062 ile gelen
      'announcement'
    )
  );

comment on constraint notifications_event_type_check on public.notifications is
  'src/types/database.ts:NotificationEvent ile AYNI listeyi taşımalı. '
  'Ayrışırsa o tipteki bildirimler sessizce oluşmaz.';

-- ─────────────────────────────────────────────────────────────────────────
-- duyurular
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.duyurular (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  baslik  text not null,
  icerik  text not null,
  onem    text not null default 'normal'
          constraint duyurular_onem_check check (onem in ('kritik', 'onemli', 'normal')),

  -- HEDEFLEME. Üçü de BOŞ DİZİ = "herkes" demek; null değil boş dizi
  -- kullanılıyor ki sorgu tarafı tek bir desenle çalışsın
  -- (`cardinality(x) = 0 or deger = any(x)`).
  hedef_roller      text[] not null default '{}',
  hedef_iller       text[] not null default '{}',
  hedef_deneyap_ids uuid[] not null default '{}',

  -- Yayın penceresi. `yayinda = false` taslak demek.
  yayinda       boolean not null default false,
  baslangic_at  timestamptz,
  bitis_at      timestamptz,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint duyurular_tarih_sirasi
    check (bitis_at is null or baslangic_at is null or bitis_at > baslangic_at)
);

-- "Bu org'un yayındaki duyuruları" — aktif duyuru sorgusunun deseni.
create index if not exists duyurular_org_yayinda_idx
  on public.duyurular (organization_id, yayinda, baslangic_at desc);

drop trigger if exists duyurular_updated_at on public.duyurular;
create trigger duyurular_updated_at
  before update on public.duyurular
  for each row execute function public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- duyuru_okundu — "bir kez göster" burada tutuluyor
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.duyuru_okundu (
  duyuru_id uuid not null references public.duyurular(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  okundu_at timestamptz not null default now(),
  primary key (duyuru_id, user_id)
);

-- "Bu kullanıcının okuduğu duyurular" — popup sorgusu bu yönden okuyor.
create index if not exists duyuru_okundu_user_idx
  on public.duyuru_okundu (user_id);

-- ─────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────

alter table public.duyurular enable row level security;

-- Okuma org üyesine açık. HEDEFLEME BURADA UYGULANMAZ: RLS satır bazlı
-- hedefleme yapabilirdi ama kullanıcının ili/DENEYAP'ı da sorgulanacağı için
-- politika ağırlaşırdı. Hedefleme sunucu ucunda (`duyurular/aktif`)
-- uygulanıyor; istemci bu tabloyu doğrudan okumuyor.
drop policy if exists duyurular_select on public.duyurular;
create policy duyurular_select on public.duyurular
  for select using (public.is_org_member(organization_id));

drop policy if exists duyurular_insert on public.duyurular;
create policy duyurular_insert on public.duyurular
  for insert with check (public.is_org_admin(organization_id));

drop policy if exists duyurular_update on public.duyurular;
create policy duyurular_update on public.duyurular
  for update using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

drop policy if exists duyurular_delete on public.duyurular;
create policy duyurular_delete on public.duyurular
  for delete using (public.is_org_admin(organization_id));

alter table public.duyuru_okundu enable row level security;

-- Kullanıcı YALNIZCA kendi okundu kaydını görür ve yazar. `user_id`'yi
-- with check'te auth.uid()'ye bağlamak şart: aksi halde bir kullanıcı
-- başkası adına "okudu" yazıp duyuruyu ondan gizleyebilirdi.
drop policy if exists duyuru_okundu_select on public.duyuru_okundu;
create policy duyuru_okundu_select on public.duyuru_okundu
  for select using (user_id = auth.uid());

drop policy if exists duyuru_okundu_insert on public.duyuru_okundu;
create policy duyuru_okundu_insert on public.duyuru_okundu
  for insert with check (user_id = auth.uid());

comment on table public.duyurular is
  'Duyurular. Hedefleme dizileri BOŞ ise "herkes" demektir. Hedefleme '
  'sunucuda (api/org/[slug]/duyurular/aktif) uygulanır.';
comment on table public.duyuru_okundu is
  'Duyurunun bir kullanıcıya bir kez gösterilmesini sağlar. Cihaz bağımsız '
  'olması için localStorage değil DB kullanılıyor (kullanıcı kararı).';
