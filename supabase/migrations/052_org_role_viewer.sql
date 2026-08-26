-- 052_org_role_viewer.sql
-- PRD'deki "Yetkili Yönetici" rolü: raporları ve tamamlanma oranlarını
-- görür ama görev oluşturamaz/düzenleyemez.
--
-- Mevcut org_role enum'una salt-okunur bir değer ekliyoruz. RLS tarafında
-- ek iş yok: viewer bir organizasyon üyesi olduğu için is_org_member()
-- true döner (okuma açık), is_org_admin() false döner (yazma kapalı).
--
-- DİKKAT: PostgreSQL, aynı transaction içinde eklenen bir enum değerinin
-- kullanılmasına izin vermez. Bu yüzden enum değişikliği kendi migration
-- dosyasında tek başına duruyor; kullanımı 053'te.

alter type public.org_role add value if not exists 'viewer';
