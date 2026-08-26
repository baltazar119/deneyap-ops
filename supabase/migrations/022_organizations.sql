-- ============================================================
-- Migration 022: Multi-Tenancy — Organizations, Members, Invitations
-- ============================================================

-- ── Plan ve rol tipleri ──────────────────────────────────────
create type public.plan_type as enum ('free', 'pro');
create type public.org_role  as enum ('owner', 'admin', 'member', 'consultant');

-- ── Organizations ────────────────────────────────────────────
create table public.organizations (
  id            uuid        primary key default gen_random_uuid(),
  name          text        not null,
  slug          text        not null unique,
  plan          plan_type   not null default 'free',
  max_members   int         not null default 5,
  logo_url      text,
  primary_color text        not null default '#0d1a2a',
  accent_color  text        not null default '#2288c9',
  created_by    uuid        not null references auth.users(id) on delete cascade,
  created_at    timestamptz not null default now()
);

create unique index organizations_slug_lower_idx on public.organizations (lower(slug));

alter table public.organizations enable row level security;

-- ── Organization Members ─────────────────────────────────────
create table public.organization_members (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  user_id         uuid        not null references auth.users(id) on delete cascade,
  role            org_role    not null default 'member',
  joined_at       timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index org_members_org_idx  on public.organization_members (organization_id);
create index org_members_user_idx on public.organization_members (user_id);

alter table public.organization_members enable row level security;

-- ── Organization Invitations ─────────────────────────────────
create table public.organization_invitations (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  email           text        not null,
  role            org_role    not null default 'member',
  token           text        not null unique default encode(gen_random_bytes(32), 'hex'),
  invited_by      uuid        not null references auth.users(id) on delete cascade,
  expires_at      timestamptz not null default (now() + interval '7 days'),
  accepted_at     timestamptz,
  created_at      timestamptz not null default now()
);

create index invitations_token_idx on public.organization_invitations (token);
create index invitations_email_idx on public.organization_invitations (email);
create index invitations_org_idx   on public.organization_invitations (organization_id);

alter table public.organization_invitations enable row level security;
