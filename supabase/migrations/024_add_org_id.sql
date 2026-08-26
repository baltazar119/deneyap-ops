-- ============================================================
-- Migration 024: Add organization_id to All Data Tables
-- 1) Nullable olarak ekle
-- 2) Default org oluştur (DENEYAP Ops — Pro)
-- 3) Tüm mevcut veriyi backfill et
-- 4) NOT NULL yap
-- 5) Index'leri ekle
-- ============================================================

-- ── Step 1: Nullable organization_id ekle ───────────────────
alter table public.tasks
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

alter table public.sprints
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

alter table public.schedules
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

alter table public.checkins
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

alter table public.task_outputs
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

alter table public.ui_questions
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

alter table public.ui_question_messages
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

alter table public.ui_updates
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

alter table public.ui_update_attachments
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

alter table public.ui_update_comments
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

alter table public.ui_files
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

alter table public.ui_file_comments
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

alter table public.ui_annotation_images
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

alter table public.ui_annotation_pins
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

alter table public.ui_annotation_pin_replies
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

alter table public.draft_sets
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

alter table public.notifications
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

-- drive_tokens: unique(user_id) kısıtı kaldır, org_id ekle
do $$
begin
  if exists (
    select 1 from information_schema.table_constraints
    where table_name = 'drive_tokens'
      and constraint_type = 'UNIQUE'
      and constraint_name like '%user_id%'
  ) then
    alter table public.drive_tokens drop constraint if exists drive_tokens_user_id_key;
  end if;
end $$;

alter table public.drive_tokens
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

-- project_context: singleton kısıtını kaldır, org başına bir satır yap
alter table public.project_context
  drop constraint if exists project_context_id_check;
alter table public.project_context
  drop constraint if exists single_row;
alter table public.project_context
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

-- brand_settings: org başına bir satır
alter table public.brand_settings
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

-- ── Step 2: Default org oluştur ─────────────────────────────
do $$
declare
  v_org_id   uuid;
  v_owner_id uuid;
begin
  -- İlk oluşturulan admin kullanıcıyı bul
  select p.id into v_owner_id
  from public.profiles p
  where p.role = 'admin'
  order by p.created_at asc
  limit 1;

  -- Admin yoksa ilk kullanıcıyı al
  if v_owner_id is null then
    select p.id into v_owner_id
    from public.profiles p
    order by p.created_at asc
    limit 1;
  end if;

  -- Eğer hiç kullanıcı yoksa (fresh install) çık
  if v_owner_id is null then
    return;
  end if;

  -- Default org oluştur (Pro plan — mevcut veri taşınıyor)
  insert into public.organizations (name, slug, plan, max_members, created_by)
  values ('DENEYAP', 'deneyap', 'pro', 999, v_owner_id)
  on conflict (slug) do nothing
  returning id into v_org_id;

  -- Zaten varsa id'yi al
  if v_org_id is null then
    select id into v_org_id from public.organizations where slug = 'deneyap';
  end if;

  -- Tüm mevcut profilleri bu org'a üye yap
  insert into public.organization_members (organization_id, user_id, role)
  select
    v_org_id,
    p.id,
    case
      when p.id = v_owner_id then 'owner'::org_role
      when p.role = 'admin' then 'admin'::org_role
      when p.role = 'consultant' then 'consultant'::org_role
      else 'member'::org_role
    end
  from public.profiles p
  on conflict (organization_id, user_id) do nothing;

  -- ── Step 3: Mevcut veriyi backfill et ───────────────────────
  update public.tasks               set organization_id = v_org_id where organization_id is null;
  update public.sprints             set organization_id = v_org_id where organization_id is null;
  update public.schedules           set organization_id = v_org_id where organization_id is null;
  update public.checkins            set organization_id = v_org_id where organization_id is null;
  update public.task_outputs        set organization_id = v_org_id where organization_id is null;
  update public.ui_questions        set organization_id = v_org_id where organization_id is null;
  update public.ui_question_messages set organization_id = v_org_id where organization_id is null;
  update public.ui_updates          set organization_id = v_org_id where organization_id is null;
  update public.ui_update_attachments set organization_id = v_org_id where organization_id is null;
  update public.ui_update_comments  set organization_id = v_org_id where organization_id is null;
  update public.ui_files            set organization_id = v_org_id where organization_id is null;
  update public.ui_file_comments    set organization_id = v_org_id where organization_id is null;
  update public.ui_annotation_images set organization_id = v_org_id where organization_id is null;
  update public.ui_annotation_pins  set organization_id = v_org_id where organization_id is null;
  update public.ui_annotation_pin_replies set organization_id = v_org_id where organization_id is null;
  update public.draft_sets          set organization_id = v_org_id where organization_id is null;
  update public.notifications       set organization_id = v_org_id where organization_id is null;
  update public.drive_tokens        set organization_id = v_org_id where organization_id is null;
  update public.project_context     set organization_id = v_org_id where organization_id is null;
  update public.brand_settings      set organization_id = v_org_id where organization_id is null;

  -- project_context için org-based PK kur
  -- Eski PK (id=1) yerine organization_id'yi unique yap
  begin
    alter table public.project_context add primary key (organization_id);
  exception when others then
    null; -- Zaten varsa geç
  end;

  -- brand_settings için org unique constraint
  begin
    alter table public.brand_settings
      add constraint brand_settings_org_unique unique (organization_id);
  exception when others then
    null;
  end;
end $$;

-- ── Step 4: NOT NULL yap ─────────────────────────────────────
alter table public.tasks               alter column organization_id set not null;
alter table public.sprints             alter column organization_id set not null;
alter table public.schedules           alter column organization_id set not null;
alter table public.checkins            alter column organization_id set not null;
alter table public.task_outputs        alter column organization_id set not null;
alter table public.ui_questions        alter column organization_id set not null;
alter table public.ui_question_messages alter column organization_id set not null;
alter table public.ui_updates          alter column organization_id set not null;
alter table public.ui_update_attachments alter column organization_id set not null;
alter table public.ui_update_comments  alter column organization_id set not null;
alter table public.ui_files            alter column organization_id set not null;
alter table public.ui_file_comments    alter column organization_id set not null;
alter table public.ui_annotation_images alter column organization_id set not null;
alter table public.ui_annotation_pins  alter column organization_id set not null;
alter table public.ui_annotation_pin_replies alter column organization_id set not null;
alter table public.draft_sets          alter column organization_id set not null;
alter table public.notifications       alter column organization_id set not null;

-- ── Step 5: Performance index'leri ──────────────────────────
create index if not exists tasks_org_idx                on public.tasks(organization_id);
create index if not exists sprints_org_idx              on public.sprints(organization_id);
create index if not exists schedules_org_idx            on public.schedules(organization_id);
create index if not exists checkins_org_idx             on public.checkins(organization_id);
create index if not exists task_outputs_org_idx         on public.task_outputs(organization_id);
create index if not exists ui_questions_org_idx         on public.ui_questions(organization_id);
create index if not exists ui_updates_org_idx           on public.ui_updates(organization_id);
create index if not exists ui_files_org_idx             on public.ui_files(organization_id);
create index if not exists ui_annotation_images_org_idx on public.ui_annotation_images(organization_id);
create index if not exists draft_sets_org_idx           on public.draft_sets(organization_id);
create index if not exists notifications_org_user_idx   on public.notifications(organization_id, user_id);

-- ── Step 6: ensure_single_active_sprint trigger'ı org-scoped yap ──
create or replace function public.ensure_single_active_sprint()
returns trigger
language plpgsql
as $$
begin
  if NEW.is_active = true then
    update public.sprints
    set is_active = false
    where organization_id = NEW.organization_id
      and id != NEW.id;
  end if;
  return NEW;
end;
$$;
