-- ============================================================
-- Migration 023: Org-Scoped Helper Functions
-- Mevcut global is_admin() / is_consultant() fonksiyonlarının
-- org-scoped karşılıkları. RLS politikaları bunları kullanır.
-- ============================================================

-- Kullanıcının verilen org'daki rolünü döndürür (yoksa null)
create or replace function public.get_org_role(org_id uuid)
returns public.org_role
language sql
security definer
stable
set search_path = public
as $$
  select role
  from public.organization_members
  where organization_id = org_id
    and user_id = auth.uid()
  limit 1;
$$;

-- Caller bu org'da owner veya admin mi?
create or replace function public.is_org_admin(org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members
    where organization_id = org_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

-- Caller bu org'un herhangi bir üyesi mi?
create or replace function public.is_org_member(org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members
    where organization_id = org_id
      and user_id = auth.uid()
  );
$$;

-- Bu org Pro planında mı?
create or replace function public.org_is_pro(org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.organizations
    where id = org_id
      and plan = 'pro'
  );
$$;

-- Caller bu org'da consultant mı?
create or replace function public.is_org_consultant(org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members
    where organization_id = org_id
      and user_id = auth.uid()
      and role = 'consultant'
  );
$$;
