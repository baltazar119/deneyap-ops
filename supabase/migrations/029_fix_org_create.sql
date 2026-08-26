-- ============================================================
-- Migration 029: Org oluşturma düzeltmesi
--
-- Sorun: INSERT ... RETURNING SELECT politikası ile çakışıyordu.
-- Kullanıcı henüz org'a üye olmadığı için is_org_member() false
-- dönüyor, RETURNING boş geliyor, client hata görüyordu.
-- Org aslında DB'de oluşuyordu ama üye kaydı hiç eklenmiyordu.
--
-- Çözüm 1: Org sahibinin kendi oluşturduğu org'u SELECT edebilmesi
-- Çözüm 2: Üyesi olmayan (orphan) org'ları temizle
-- ============================================================

-- 1. Org kurucusunun kendi org'unu görebilmesine izin ver
--    (INSERT ... RETURNING ve direkt SELECT için gerekli)
drop policy if exists "organizations_select_own" on public.organizations;

create policy "organizations_select_own"
  on public.organizations for select
  using (created_by = auth.uid());

-- 2. Orphan org'ları temizle
--    (üyesi olmayan, yani başarısız yaratma girişimlerinden kalan org'lar)
delete from public.organizations
where id not in (
  select distinct organization_id from public.organization_members
);
