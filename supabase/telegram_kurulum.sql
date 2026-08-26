-- 057_kanal_baglantilari.sql
-- Bildirim kanalları (Telegram, ileride WhatsApp) ve tek kullanımlık
-- eylem tokenları.

/* ── Kanal bağlantıları ─────────────────────────────────────────────────── */

create table if not exists public.channel_links (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kanal           text not null check (kanal in ('telegram','whatsapp')),
  -- telegram chat_id / whatsapp wa_id
  harici_id       text not null,
  gorunen_ad      text,
  aktif           boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (user_id, organization_id, kanal)
);

-- Bir Telegram hesabı aynı org'da iki kullanıcıya bağlanamasın
create unique index if not exists channel_links_harici_uq
  on public.channel_links (organization_id, kanal, harici_id);

create index if not exists channel_links_user_idx
  on public.channel_links (user_id, aktif);

/* ── Bağlama kodları ────────────────────────────────────────────────────── */
-- Kullanıcı profil sayfasından kod alır, bota yazar; bot chat_id'yi doğrular.

create table if not exists public.channel_link_codes (
  kod             text primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kanal           text not null check (kanal in ('telegram','whatsapp')),
  expires_at      timestamptz not null,
  kullanildi_at   timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists channel_link_codes_exp_idx
  on public.channel_link_codes (expires_at);

/* ── Gönderim kaydı (cooldown + teşhis) ─────────────────────────────────── */
-- email_log ile aynı mantık; kanal bağımsız tekrar koruması

create table if not exists public.channel_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete set null,
  kanal       text not null,
  olay_tipi   text,
  entity_key  text,
  durum       text not null default 'gonderildi',
  hata        text,
  sent_at     timestamptz not null default now()
);

create index if not exists channel_log_cooldown_idx
  on public.channel_log (user_id, entity_key, sent_at desc);

/* ── Eylem tokenları ────────────────────────────────────────────────────── */
-- E-postadaki "Tamamlandı olarak işaretle" düğmesi için.
--
-- Ham token VERİTABANINDA TUTULMAZ, yalnızca SHA-256 özeti. Veritabanı
-- sızsa bile tokenlar kullanılamaz.

create table if not exists public.email_action_tokens (
  id              uuid primary key default gen_random_uuid(),
  token_hash      text not null unique,
  user_id         uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  eylem           text not null check (eylem in ('gorev_tamamla','termin_ertele')),
  hedef_id        uuid not null,
  yuk             jsonb not null default '{}'::jsonb,
  expires_at      timestamptz not null,
  kullanildi_at   timestamptz,
  kullanan_ip     text,
  created_at      timestamptz not null default now()
);

create index if not exists email_action_tokens_exp_idx
  on public.email_action_tokens (expires_at);

/* ── RLS ────────────────────────────────────────────────────────────────── */

alter table public.channel_links       enable row level security;
alter table public.channel_link_codes  enable row level security;
alter table public.channel_log         enable row level security;
alter table public.email_action_tokens enable row level security;

-- Kullanıcı yalnızca kendi bağlantılarını görür ve silebilir.
-- Yazma işini webhook service-role ile yapar (RLS'i atlar).
drop policy if exists "channel_links_own" on public.channel_links;
create policy "channel_links_own" on public.channel_links for select
  using (user_id = auth.uid());

drop policy if exists "channel_links_own_delete" on public.channel_links;
create policy "channel_links_own_delete" on public.channel_links for delete
  using (user_id = auth.uid());

-- Kodlar ve loglar yalnızca sunucu tarafından okunur/yazılır: politika yok,
-- RLS açık → anon/authenticated erişemez.
