-- ============================================
-- DENEYAP Ops — Görsel Annotasyon Sistemi
-- Danışman ve admin görsel üzerine pin bırakabilir
-- NOT: Supabase Storage bucket gereklidir:
--   Dashboard → Storage → New bucket → Name: "ui-annotations", Public: true
-- ============================================

-- 1) Görsel tablosu
create table if not exists public.ui_annotation_images (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  image_url   text not null,
  description text,
  created_by  uuid references auth.users not null,
  created_at  timestamptz default now() not null
);

alter table public.ui_annotation_images enable row level security;

-- Admin: tam erişim
create policy "ann_images_admin_all" on public.ui_annotation_images
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Danışman: okuma
create policy "ann_images_consultant_select" on public.ui_annotation_images
  for select to authenticated
  using (public.is_consultant());

-- Danışman: kendi görseli ekleyebilir
create policy "ann_images_consultant_insert" on public.ui_annotation_images
  for insert to authenticated
  with check (public.is_consultant() and created_by = auth.uid());

-- Danışman: kendi görselini silebilir
create policy "ann_images_consultant_delete_own" on public.ui_annotation_images
  for delete to authenticated
  using (public.is_consultant() and created_by = auth.uid());

-- 2) Pin tablosu
create table if not exists public.ui_annotation_pins (
  id         uuid primary key default gen_random_uuid(),
  image_id   uuid references public.ui_annotation_images on delete cascade not null,
  x_pct      numeric(5,2) not null check (x_pct >= 0 and x_pct <= 100),
  y_pct      numeric(5,2) not null check (y_pct >= 0 and y_pct <= 100),
  label      text,
  status     text not null default 'open' check (status in ('open', 'resolved')),
  created_by uuid references auth.users not null,
  created_at timestamptz default now() not null
);

alter table public.ui_annotation_pins enable row level security;

-- Admin: tam erişim
create policy "ann_pins_admin_all" on public.ui_annotation_pins
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Danışman: okuma
create policy "ann_pins_consultant_select" on public.ui_annotation_pins
  for select to authenticated
  using (public.is_consultant());

-- Danışman: kendi pinini ekleyebilir
create policy "ann_pins_consultant_insert" on public.ui_annotation_pins
  for insert to authenticated
  with check (public.is_consultant() and created_by = auth.uid());

-- Danışman: kendi pinini silebilir
create policy "ann_pins_consultant_delete_own" on public.ui_annotation_pins
  for delete to authenticated
  using (public.is_consultant() and created_by = auth.uid());

-- 3) Pin yorumları (thread)
create table if not exists public.ui_annotation_pin_replies (
  id         uuid primary key default gen_random_uuid(),
  pin_id     uuid references public.ui_annotation_pins on delete cascade not null,
  content    text not null,
  created_by uuid references auth.users not null,
  created_at timestamptz default now() not null
);

alter table public.ui_annotation_pin_replies enable row level security;

-- Admin: tam erişim
create policy "ann_replies_admin_all" on public.ui_annotation_pin_replies
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Danışman: okuma
create policy "ann_replies_consultant_select" on public.ui_annotation_pin_replies
  for select to authenticated
  using (public.is_consultant());

-- Danışman: kendi yorumunu ekleyebilir
create policy "ann_replies_consultant_insert" on public.ui_annotation_pin_replies
  for insert to authenticated
  with check (public.is_consultant() and created_by = auth.uid());

-- Danışman: kendi yorumunu silebilir
create policy "ann_replies_consultant_delete_own" on public.ui_annotation_pin_replies
  for delete to authenticated
  using (public.is_consultant() and created_by = auth.uid());
