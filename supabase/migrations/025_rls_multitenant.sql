-- ============================================================
-- Migration 025: Multi-Tenant RLS Politikaları
-- Tüm tablolarda eski politikalar kaldırılır,
-- org-scoped yeni politikalar eklenir.
-- ============================================================

-- ── organizations ────────────────────────────────────────────
drop policy if exists "organizations_select" on public.organizations;
drop policy if exists "organizations_insert" on public.organizations;
drop policy if exists "organizations_update" on public.organizations;

create policy "organizations_select"
  on public.organizations for select
  using (public.is_org_member(organizations.id));

create policy "organizations_insert"
  on public.organizations for insert
  with check (auth.uid() = created_by);

create policy "organizations_update"
  on public.organizations for update
  using (public.is_org_admin(organizations.id));

create policy "organizations_delete"
  on public.organizations for delete
  using (
    exists (
      select 1 from public.organization_members om
      where om.organization_id = organizations.id
        and om.user_id = auth.uid()
        and om.role = 'owner'
    )
  );

-- ── organization_members ─────────────────────────────────────
drop policy if exists "org_members_select" on public.organization_members;
drop policy if exists "org_members_insert" on public.organization_members;
drop policy if exists "org_members_update" on public.organization_members;
drop policy if exists "org_members_delete" on public.organization_members;

-- Üyeler birbirini görebilir
create policy "org_members_select"
  on public.organization_members for select
  using (
    public.is_org_member(organization_id)
    or user_id = auth.uid()
  );

-- Admin üye ekleyebilir; org kurucusu kendini ilk üye olarak ekleyebilir
create policy "org_members_insert"
  on public.organization_members for insert
  with check (
    public.is_org_admin(organization_id)
    or (
      user_id = auth.uid()
      and exists (
        select 1 from public.organizations o
        where o.id = organization_id and o.created_by = auth.uid()
      )
    )
  );

-- Admin rol değiştirebilir
create policy "org_members_update"
  on public.organization_members for update
  using (public.is_org_admin(organization_id));

-- Admin üye çıkarabilir (owner çıkarılamaz — app katmanında kontrol)
create policy "org_members_delete"
  on public.organization_members for delete
  using (public.is_org_admin(organization_id));

-- ── organization_invitations ─────────────────────────────────
drop policy if exists "invitations_select" on public.organization_invitations;
drop policy if exists "invitations_insert" on public.organization_invitations;
drop policy if exists "invitations_update" on public.organization_invitations;
drop policy if exists "invitations_delete" on public.organization_invitations;

create policy "invitations_select"
  on public.organization_invitations for select
  using (public.is_org_admin(organization_id) or email = (select email from auth.users where id = auth.uid()));

create policy "invitations_insert"
  on public.organization_invitations for insert
  with check (public.is_org_admin(organization_id) and invited_by = auth.uid());

create policy "invitations_update"
  on public.organization_invitations for update
  using (true); -- token redemption service role ile

create policy "invitations_delete"
  on public.organization_invitations for delete
  using (public.is_org_admin(organization_id));

-- ── profiles ─────────────────────────────────────────────────
-- Profiller hâlâ kullanıcıya ait, ama diğer org üyeleri görebilir
drop policy if exists "profiles_select_own"    on public.profiles;
drop policy if exists "profiles_select_admin"  on public.profiles;
drop policy if exists "profiles_update_own"    on public.profiles;
drop policy if exists "profiles_insert_own"    on public.profiles;

-- Kendi profilini her zaman görebilir
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = profiles.id);

-- Aynı org'daki birini görebilir
create policy "profiles_select_org_member"
  on public.profiles for select
  using (
    exists (
      select 1 from public.organization_members om1
      join public.organization_members om2
        on om1.organization_id = om2.organization_id
      where om1.user_id = auth.uid()
        and om2.user_id = profiles.id
    )
  );

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = profiles.id);

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = profiles.id);

-- ── tasks ────────────────────────────────────────────────────
drop policy if exists "tasks_select_admin"    on public.tasks;
drop policy if exists "tasks_select_assignee" on public.tasks;
drop policy if exists "tasks_insert_admin"    on public.tasks;
drop policy if exists "tasks_update_admin"    on public.tasks;
drop policy if exists "tasks_update_assignee" on public.tasks;
drop policy if exists "tasks_delete_admin"    on public.tasks;
drop policy if exists "tasks_select"          on public.tasks;
drop policy if exists "tasks_write"           on public.tasks;

create policy "tasks_select"
  on public.tasks for select
  using (public.is_org_member(organization_id));

create policy "tasks_insert"
  on public.tasks for insert
  with check (public.is_org_admin(organization_id));

create policy "tasks_update"
  on public.tasks for update
  using (
    public.is_org_admin(organization_id)
    or assignee_id = auth.uid()
  );

create policy "tasks_delete"
  on public.tasks for delete
  using (public.is_org_admin(organization_id));

-- ── task_outputs ─────────────────────────────────────────────
drop policy if exists "task_outputs_select"  on public.task_outputs;
drop policy if exists "task_outputs_insert"  on public.task_outputs;
drop policy if exists "task_outputs_delete"  on public.task_outputs;

create policy "task_outputs_select"
  on public.task_outputs for select
  using (public.is_org_member(organization_id));

create policy "task_outputs_insert"
  on public.task_outputs for insert
  with check (public.is_org_member(organization_id));

create policy "task_outputs_delete"
  on public.task_outputs for delete
  using (public.is_org_admin(organization_id) or created_by = auth.uid());

-- ── sprints ──────────────────────────────────────────────────
drop policy if exists "sprints_select_all"   on public.sprints;
drop policy if exists "sprints_admin_all"    on public.sprints;
drop policy if exists "sprints_select"       on public.sprints;
drop policy if exists "sprints_write"        on public.sprints;

create policy "sprints_select"
  on public.sprints for select
  using (public.is_org_member(organization_id));

create policy "sprints_insert"
  on public.sprints for insert
  with check (public.is_org_admin(organization_id));

create policy "sprints_update"
  on public.sprints for update
  using (public.is_org_admin(organization_id));

create policy "sprints_delete"
  on public.sprints for delete
  using (public.is_org_admin(organization_id));

-- ── schedules ────────────────────────────────────────────────
drop policy if exists "schedules_select_own"   on public.schedules;
drop policy if exists "schedules_select_admin" on public.schedules;
drop policy if exists "schedules_insert_own"   on public.schedules;
drop policy if exists "schedules_update_own"   on public.schedules;
drop policy if exists "schedules_delete_own"   on public.schedules;

create policy "schedules_select"
  on public.schedules for select
  using (public.is_org_member(organization_id));

create policy "schedules_insert"
  on public.schedules for insert
  with check (public.is_org_member(organization_id) and user_id = auth.uid());

create policy "schedules_update"
  on public.schedules for update
  using (user_id = auth.uid() or public.is_org_admin(organization_id));

create policy "schedules_delete"
  on public.schedules for delete
  using (user_id = auth.uid() or public.is_org_admin(organization_id));

-- ── checkins ─────────────────────────────────────────────────
drop policy if exists "checkins_select_own"   on public.checkins;
drop policy if exists "checkins_select_admin" on public.checkins;
drop policy if exists "checkins_insert_own"   on public.checkins;

create policy "checkins_select"
  on public.checkins for select
  using (public.is_org_member(organization_id));

create policy "checkins_insert"
  on public.checkins for insert
  with check (public.is_org_member(organization_id) and user_id = auth.uid());

create policy "checkins_delete"
  on public.checkins for delete
  using (user_id = auth.uid() or public.is_org_admin(organization_id));

-- ── ui_questions (Pro-only) ──────────────────────────────────
drop policy if exists "ui_questions_admin_all"       on public.ui_questions;
drop policy if exists "ui_questions_consultant_read" on public.ui_questions;
drop policy if exists "ui_questions_consultant_insert" on public.ui_questions;

create policy "ui_questions_select"
  on public.ui_questions for select
  using (public.is_org_member(organization_id) and public.org_is_pro(organization_id));

create policy "ui_questions_insert"
  on public.ui_questions for insert
  with check (public.is_org_member(organization_id) and public.org_is_pro(organization_id));

create policy "ui_questions_update"
  on public.ui_questions for update
  using (public.is_org_admin(organization_id) and public.org_is_pro(organization_id));

create policy "ui_questions_delete"
  on public.ui_questions for delete
  using (public.is_org_admin(organization_id) and public.org_is_pro(organization_id));

-- ── ui_question_messages (Pro-only) ─────────────────────────
drop policy if exists "ui_messages_all" on public.ui_question_messages;

create policy "ui_messages_select"
  on public.ui_question_messages for select
  using (public.is_org_member(organization_id) and public.org_is_pro(organization_id));

create policy "ui_messages_insert"
  on public.ui_question_messages for insert
  with check (public.is_org_member(organization_id) and public.org_is_pro(organization_id));

create policy "ui_messages_delete"
  on public.ui_question_messages for delete
  using (created_by = auth.uid() or public.is_org_admin(organization_id));

-- ── ui_updates (Pro-only) ────────────────────────────────────
drop policy if exists "ui_updates_admin_all"       on public.ui_updates;
drop policy if exists "ui_updates_consultant_read" on public.ui_updates;

create policy "ui_updates_select"
  on public.ui_updates for select
  using (public.is_org_member(organization_id) and public.org_is_pro(organization_id));

create policy "ui_updates_insert"
  on public.ui_updates for insert
  with check (public.is_org_admin(organization_id) and public.org_is_pro(organization_id));

create policy "ui_updates_update"
  on public.ui_updates for update
  using (public.is_org_admin(organization_id));

create policy "ui_updates_delete"
  on public.ui_updates for delete
  using (public.is_org_admin(organization_id));

-- ── ui_update_attachments ────────────────────────────────────
drop policy if exists "ui_update_attachments_all" on public.ui_update_attachments;

create policy "ui_update_attachments_select"
  on public.ui_update_attachments for select
  using (public.is_org_member(organization_id) and public.org_is_pro(organization_id));

create policy "ui_update_attachments_insert"
  on public.ui_update_attachments for insert
  with check (public.is_org_admin(organization_id));

create policy "ui_update_attachments_delete"
  on public.ui_update_attachments for delete
  using (public.is_org_admin(organization_id));

-- ── ui_update_comments ───────────────────────────────────────
drop policy if exists "ui_update_comments_all" on public.ui_update_comments;

create policy "ui_update_comments_select"
  on public.ui_update_comments for select
  using (public.is_org_member(organization_id) and public.org_is_pro(organization_id));

create policy "ui_update_comments_insert"
  on public.ui_update_comments for insert
  with check (public.is_org_member(organization_id) and public.org_is_pro(organization_id));

create policy "ui_update_comments_delete"
  on public.ui_update_comments for delete
  using (created_by = auth.uid() or public.is_org_admin(organization_id));

-- ── ui_files (Pro-only) ──────────────────────────────────────
drop policy if exists "ui_files_admin_all"       on public.ui_files;
drop policy if exists "ui_files_consultant_read" on public.ui_files;

create policy "ui_files_select"
  on public.ui_files for select
  using (public.is_org_member(organization_id) and public.org_is_pro(organization_id));

create policy "ui_files_insert"
  on public.ui_files for insert
  with check (public.is_org_admin(organization_id) and public.org_is_pro(organization_id));

create policy "ui_files_delete"
  on public.ui_files for delete
  using (public.is_org_admin(organization_id));

-- ── ui_file_comments ─────────────────────────────────────────
drop policy if exists "ui_file_comments_all" on public.ui_file_comments;

create policy "ui_file_comments_select"
  on public.ui_file_comments for select
  using (public.is_org_member(organization_id) and public.org_is_pro(organization_id));

create policy "ui_file_comments_insert"
  on public.ui_file_comments for insert
  with check (public.is_org_member(organization_id) and public.org_is_pro(organization_id));

create policy "ui_file_comments_delete"
  on public.ui_file_comments for delete
  using (created_by = auth.uid() or public.is_org_admin(organization_id));

-- ── ui_annotation_images (Pro-only) ─────────────────────────
drop policy if exists "ui_annotation_images_admin_all"       on public.ui_annotation_images;
drop policy if exists "ui_annotation_images_consultant_read" on public.ui_annotation_images;

create policy "ui_annotation_images_select"
  on public.ui_annotation_images for select
  using (public.is_org_member(organization_id) and public.org_is_pro(organization_id));

create policy "ui_annotation_images_insert"
  on public.ui_annotation_images for insert
  with check (public.is_org_admin(organization_id) and public.org_is_pro(organization_id));

create policy "ui_annotation_images_delete"
  on public.ui_annotation_images for delete
  using (public.is_org_admin(organization_id));

-- ── ui_annotation_pins (Pro-only) ───────────────────────────
drop policy if exists "ui_annotation_pins_all" on public.ui_annotation_pins;

create policy "ui_annotation_pins_select"
  on public.ui_annotation_pins for select
  using (public.is_org_member(organization_id) and public.org_is_pro(organization_id));

create policy "ui_annotation_pins_insert"
  on public.ui_annotation_pins for insert
  with check (public.is_org_member(organization_id) and public.org_is_pro(organization_id));

create policy "ui_annotation_pins_update"
  on public.ui_annotation_pins for update
  using (public.is_org_admin(organization_id) or created_by = auth.uid());

create policy "ui_annotation_pins_delete"
  on public.ui_annotation_pins for delete
  using (created_by = auth.uid() or public.is_org_admin(organization_id));

-- ── ui_annotation_pin_replies ────────────────────────────────
drop policy if exists "ui_annotation_pin_replies_all" on public.ui_annotation_pin_replies;

create policy "ui_annotation_pin_replies_select"
  on public.ui_annotation_pin_replies for select
  using (public.is_org_member(organization_id) and public.org_is_pro(organization_id));

create policy "ui_annotation_pin_replies_insert"
  on public.ui_annotation_pin_replies for insert
  with check (public.is_org_member(organization_id) and public.org_is_pro(organization_id));

create policy "ui_annotation_pin_replies_delete"
  on public.ui_annotation_pin_replies for delete
  using (created_by = auth.uid() or public.is_org_admin(organization_id));

-- ── draft_sets (admin-only) ──────────────────────────────────
drop policy if exists "draft_sets_admin_all" on public.draft_sets;

create policy "draft_sets_select"
  on public.draft_sets for select
  using (public.is_org_admin(organization_id) and public.org_is_pro(organization_id));

create policy "draft_sets_insert"
  on public.draft_sets for insert
  with check (public.is_org_admin(organization_id) and public.org_is_pro(organization_id));

create policy "draft_sets_update"
  on public.draft_sets for update
  using (public.is_org_admin(organization_id));

create policy "draft_sets_delete"
  on public.draft_sets for delete
  using (public.is_org_admin(organization_id));

-- ── draft_tasks ──────────────────────────────────────────────
drop policy if exists "draft_tasks_admin_all" on public.draft_tasks;

create policy "draft_tasks_select"
  on public.draft_tasks for select
  using (
    exists (
      select 1 from public.draft_sets ds
      where ds.id = draft_set_id
        and public.is_org_admin(ds.organization_id)
        and public.org_is_pro(ds.organization_id)
    )
  );

create policy "draft_tasks_insert"
  on public.draft_tasks for insert
  with check (
    exists (
      select 1 from public.draft_sets ds
      where ds.id = draft_set_id
        and public.is_org_admin(ds.organization_id)
    )
  );

create policy "draft_tasks_update"
  on public.draft_tasks for update
  using (
    exists (
      select 1 from public.draft_sets ds
      where ds.id = draft_set_id
        and public.is_org_admin(ds.organization_id)
    )
  );

create policy "draft_tasks_delete"
  on public.draft_tasks for delete
  using (
    exists (
      select 1 from public.draft_sets ds
      where ds.id = draft_set_id
        and public.is_org_admin(ds.organization_id)
    )
  );

-- ── project_context ──────────────────────────────────────────
drop policy if exists "project_context_admin_all" on public.project_context;
drop policy if exists "project_context_read_all"  on public.project_context;

create policy "project_context_select"
  on public.project_context for select
  using (public.is_org_member(organization_id));

create policy "project_context_upsert"
  on public.project_context for all
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

-- ── notifications ────────────────────────────────────────────
drop policy if exists "notifications_select_own"  on public.notifications;
drop policy if exists "notifications_update_own"  on public.notifications;
drop policy if exists "notifications_delete_own"  on public.notifications;

create policy "notifications_select"
  on public.notifications for select
  using (user_id = auth.uid());

create policy "notifications_update"
  on public.notifications for update
  using (user_id = auth.uid());

create policy "notifications_delete"
  on public.notifications for delete
  using (user_id = auth.uid());

-- ── brand_settings ───────────────────────────────────────────
drop policy if exists "brand_settings_select_all"  on public.brand_settings;
drop policy if exists "brand_settings_admin_all"   on public.brand_settings;

create policy "brand_settings_select"
  on public.brand_settings for select
  using (public.is_org_member(organization_id));

create policy "brand_settings_upsert"
  on public.brand_settings for all
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

-- ── email_preferences (kullanıcı düzeyi — org_id yok) ───────
-- Bu tablo org-scoped değil, kullanıcı bazlı kalmaya devam eder.
-- Pro plan kontrolü app katmanında yapılır.
drop policy if exists "email_preferences_own" on public.email_preferences;

create policy "email_preferences_select"
  on public.email_preferences for select
  using (user_id = auth.uid());

create policy "email_preferences_upsert"
  on public.email_preferences for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
