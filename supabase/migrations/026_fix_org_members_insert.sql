-- ============================================================
-- Migration 026: Fix org_members_insert RLS (chicken-and-egg)
--
-- Problem: Yeni org oluşturulduğunda ilk üye insert'i başarısız
-- çünkü is_org_admin() henüz üye olmayan kullanıcı için false döner.
--
-- Fix: Org created_by kullanıcısının kendini owner olarak
-- ekleyebilmesine izin ver.
-- ============================================================

drop policy if exists "org_members_insert" on public.organization_members;

create policy "org_members_insert"
  on public.organization_members for insert
  with check (
    -- Mevcut admin/owner üye ekleyebilir (davet kabulü hariç, o service role ile yapılır)
    public.is_org_admin(organization_id)
    or
    -- Org kurucusu kendini ilk üye olarak ekleyebilir (chicken-and-egg fix)
    (
      user_id = auth.uid()
      and exists (
        select 1 from public.organizations o
        where o.id = organization_id
          and o.created_by = auth.uid()
      )
    )
  );
