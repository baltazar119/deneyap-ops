export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          role: 'admin' | 'member' | 'consultant'
          plan: 'free' | 'pro'
          ai_addon: boolean
          full_name: string | null
          username: string | null
          title: string | null
          bio: string | null
          skills: string[] | null
          avatar_url: string | null
          consultant_expertise: string | null
          consultant_availability: string | null
          consultant_contact_pref: string[] | null
          created_at: string
        }
        Insert: {
          id: string
          role?: 'admin' | 'member' | 'consultant'
          plan?: 'free' | 'pro'
          ai_addon?: boolean
          full_name?: string | null
          username?: string | null
          title?: string | null
          bio?: string | null
          skills?: string[] | null
          avatar_url?: string | null
          consultant_expertise?: string | null
          consultant_availability?: string | null
          consultant_contact_pref?: string[] | null
          created_at?: string
        }
        Update: {
          id?: string
          role?: 'admin' | 'member' | 'consultant'
          plan?: 'free' | 'pro'
          ai_addon?: boolean
          full_name?: string | null
          username?: string | null
          title?: string | null
          bio?: string | null
          skills?: string[] | null
          avatar_url?: string | null
          consultant_expertise?: string | null
          consultant_availability?: string | null
          consultant_contact_pref?: string[] | null
          created_at?: string
        }
      }
      schedules: {
        Row: {
          id: string
          user_id: string
          start_time: string
          end_time: string
          note: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          start_time: string
          end_time: string
          note?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          start_time?: string
          end_time?: string
          note?: string | null
          created_at?: string
        }
      }
      checkins: {
        Row: {
          id: string
          user_id: string
          type: 'in' | 'out'
          timestamp: string
          note: string | null
        }
        Insert: {
          id?: string
          user_id: string
          type: 'in' | 'out'
          timestamp?: string
          note?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          type?: 'in' | 'out'
          timestamp?: string
          note?: string | null
        }
      }
      tasks: {
        Row: {
          id: string
          title: string
          description: string | null
          status: 'backlog' | 'doing' | 'testing' | 'blocked' | 'done'
          priority: 'critical' | 'high' | 'normal' | 'low'
          task_type: 'mechanical' | 'electrical' | 'software' | 'training' | 'event' | 'supply' | 'admin' | 'reporting' | 'other'
          assignee_id: string | null
          start_date: string | null
          due_date: string | null
          estimated_hours: number | null
          actual_hours: number | null
          sprint_id: string | null
          il: string | null
          organization_id: string
          created_by: string
          created_at: string
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          status?: 'backlog' | 'doing' | 'blocked' | 'done'
          priority?: 'critical' | 'high' | 'normal' | 'low'
          task_type?: 'mechanical' | 'electrical' | 'software' | 'training' | 'event' | 'supply' | 'admin' | 'reporting' | 'other'
          assignee_id?: string | null
          start_date?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          actual_hours?: number | null
          sprint_id?: string | null
          il?: string | null
          organization_id: string
          created_by: string
          created_at?: string
        }
        Update: {
          id?: string
          title?: string
          description?: string | null
          status?: 'backlog' | 'doing' | 'blocked' | 'done'
          priority?: 'critical' | 'high' | 'normal' | 'low'
          task_type?: 'mechanical' | 'electrical' | 'software' | 'training' | 'event' | 'supply' | 'admin' | 'reporting' | 'other'
          assignee_id?: string | null
          start_date?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          actual_hours?: number | null
          sprint_id?: string | null
          il?: string | null
          organization_id?: string
          created_by?: string
          created_at?: string
        }
      }
      calendar_events: {
        Row: {
          id: string
          title: string
          organization_id: string
          created_by: string
          assignee_id: string | null
          event_date: string
          is_all_day: boolean
          start_slot: number | null
          end_slot: number | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          title: string
          organization_id: string
          created_by: string
          assignee_id?: string | null
          event_date: string
          is_all_day?: boolean
          start_slot?: number | null
          end_slot?: number | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          title?: string
          assignee_id?: string | null
          event_date?: string
          is_all_day?: boolean
          start_slot?: number | null
          end_slot?: number | null
          notes?: string | null
        }
      }
      sprints: {
        Row: {
          id: string
          name: string
          start_date: string
          end_date: string
          is_active: boolean
          created_by: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          start_date: string
          end_date: string
          is_active?: boolean
          created_by: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          start_date?: string
          end_date?: string
          is_active?: boolean
          created_by?: string
          created_at?: string
        }
      }
      task_outputs: {
        Row: {
          id: string
          task_id: string
          kind: 'link' | 'note'
          value: string
          created_by: string
          created_at: string
        }
        Insert: {
          id?: string
          task_id: string
          kind: 'link' | 'note'
          value: string
          created_by: string
          created_at?: string
        }
        Update: {
          id?: string
          task_id?: string
          kind?: 'link' | 'note'
          value?: string
          created_by?: string
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}

// ── Multi-Tenant Tipleri ─────────────────────────────────────────────────────

export type PlanType = 'free' | 'pro'
export type OrgRole = 'owner' | 'admin' | 'member' | 'viewer' | 'consultant'

export interface Organization {
  id: string
  name: string
  slug: string
  plan: PlanType
  max_members: number
  logo_url: string | null
  primary_color: string
  accent_color: string
  created_by: string
  created_at: string
  join_code: string
}

export interface OrganizationMember {
  id: string
  organization_id: string
  user_id: string
  role: OrgRole
  joined_at: string
}

export interface OrganizationInvitation {
  id: string
  organization_id: string
  email: string
  role: OrgRole
  token: string
  invited_by: string
  expires_at: string
  accepted_at: string | null
  created_at: string
}

// ── Convenience types ────────────────────────────────────────────────────────

export type Profile = Database['public']['Tables']['profiles']['Row'] & { email?: string }
export type Schedule = Database['public']['Tables']['schedules']['Row']
export type Checkin = Database['public']['Tables']['checkins']['Row']
export type Task = Database['public']['Tables']['tasks']['Row']
export type TaskOutput = Database['public']['Tables']['task_outputs']['Row']
export type Sprint = Database['public']['Tables']['sprints']['Row']
export type TaskDependency = { id: string; task_id: string; depends_on: string; created_at: string }

export type TaskStatus = 'backlog' | 'doing' | 'testing' | 'blocked' | 'done'
export type TaskPriority = 'critical' | 'high' | 'normal' | 'low'
export type TaskType = 'mechanical' | 'electrical' | 'software' | 'training' | 'event' | 'supply' | 'admin' | 'reporting' | 'other'
export type CheckinType = 'in' | 'out'
/** @deprecated Org-scoped OrgRole kullan */
export type UserRole = 'admin' | 'member' | 'consultant'

export interface TaskWithSprint extends Task {
  assigneeName?: string
}

// ── Danışman Modülü Tipleri ──────────────────────────────────────────────────

export type UIQuestionCategory = 'UI' | 'UX' | 'Bug' | 'İstek' | 'Tasarım' | 'Diğer'
export type UIQuestionPriority = 'critical' | 'high' | 'normal' | 'low'
export type UIQuestionStatus = 'open' | 'closed'
export type UIUpdateTag = 'UI' | 'UX' | 'Bugfix' | 'Release'
export type UIFileType = 'image' | 'pdf' | 'video' | 'link' | 'doc' | 'other'

export interface UIQuestion {
  id: string
  title: string
  description: string | null
  category: UIQuestionCategory
  priority: UIQuestionPriority
  status: UIQuestionStatus
  created_by: string
  created_at: string
  updated_at: string
}

export interface UIQuestionMessage {
  id: string
  question_id: string
  content: string
  attachment_url: string | null
  attachment_name: string | null
  created_by: string
  created_at: string
}

export interface UIUpdate {
  id: string
  title: string
  summary: string | null
  detail: string | null
  tag: UIUpdateTag
  created_by: string
  created_at: string
}

export interface UIUpdateAttachment {
  id: string
  update_id: string
  file_url: string
  file_name: string
  file_type: string | null
  created_at: string
}

export interface UIUpdateComment {
  id: string
  update_id: string
  content: string
  created_by: string
  created_at: string
}

export interface UIFile {
  id: string
  name: string
  file_url: string
  file_type: UIFileType
  tag: string | null
  size_bytes: number | null
  figma_url: string | null
  created_by: string
  created_at: string
}

export interface UIFileComment {
  id: string
  file_id: string
  content: string
  created_by: string
  created_at: string
}

// ── Bildirim Tipleri ─────────────────────────────────────────────────────────

export type NotificationType = 'task' | 'review' | 'sprint' | 'system'
export type NotificationEvent =
  | 'task_assigned'
  | 'task_status_changed'
  | 'task_overdue'
  | 'review_reply'
  | 'mention'
  | 'annotation_resolved'
  | 'new_version'
  | 'sprint_changed'
  | 'task_due_soon'
  | 'sprint_ending_soon'
  | 'meeting_created'
  | 'meeting_cancelled'
  | 'meeting_reminder'
  | 'member_overloaded'

export interface AppNotification {
  id: string
  user_id: string
  type: NotificationType
  event_type: NotificationEvent
  title: string
  description: string | null
  actor_id: string | null
  actor_name: string | null
  link: string | null
  is_read: boolean
  created_at: string
  organization_id: string | null
  entity_key: string | null
}

// ── E-posta Bildirim Tipleri ─────────────────────────────────────────────────

export type EmailFrequency = 'instant' | 'daily' | 'weekly'

export interface EmailPreferences {
  id: string
  user_id: string
  email_enabled: boolean
  task_assigned: boolean
  mention: boolean
  review_reply: boolean
  annotation_resolved: boolean
  sprint_changed: boolean
  new_version: boolean
  question_received: boolean
  file_shared: boolean
  update_note_shared: boolean
  frequency: EmailFrequency
  created_at: string
  updated_at: string
}

export interface BrandSettings {
  id: string
  org_name: string
  logo_url: string | null
  primary_color: string
  accent_color: string
  updated_by: string | null
  updated_at: string
}

export interface EmailLog {
  id: string
  user_id: string
  event_type: string
  entity_key: string | null
  sent_at: string
}

// ── Görsel Annotasyon Tipleri ────────────────────────────────────────────────

export type UIAnnotationPinStatus = 'open' | 'resolved'

export interface UIAnnotationImage {
  id: string
  title: string
  image_url: string
  description: string | null
  created_by: string
  created_at: string
}

export interface UIAnnotationPin {
  id: string
  image_id: string
  x_pct: number
  y_pct: number
  label: string | null
  status: UIAnnotationPinStatus
  created_by: string
  created_at: string
}

export interface UIAnnotationPinReply {
  id: string
  pin_id: string
  content: string
  created_by: string
  created_at: string
}

// ── AI Taslak Görev Tipleri ───────────────────────────────────────────────────

export type DraftSetStatus = 'draft' | 'reviewing' | 'published' | 'archived'

export interface DraftSet {
  id: string
  title: string
  goal_summary: string
  status: DraftSetStatus
  version: number
  created_by: string
  created_at: string
  sprint_id: string | null
}

export interface DraftTask {
  id: string
  draft_set_id: string
  title: string
  description: string
  category: TaskType
  priority: TaskPriority
  due_date: string | null
  estimated_hours: number | null
  acceptance_criteria: string[]
  depends_on: string | null
  order_index: number
  created_at: string
}

/** Gemini'den gelen ham görev (id/timestamps yok) */
export interface GeminiDraftTask {
  title: string
  description: string
  category: TaskType
  priority: TaskPriority
  estimated_hours: number | null
  acceptance_criteria: string[]
  order_index: number
}

/** AI Asistan proje bağlamı (org başına bir satır) */
export interface ProjectContext {
  organization_id: string
  content: string
  updated_at: string
  updated_by: string | null
}

// ── Checklist Modülü ─────────────────────────────────────────────────────────

export interface Checklist {
  id: string
  organization_id: string
  created_by: string
  title: string
  color: string
  tag: string | null
  is_shared: boolean
  created_at: string
}

export interface ChecklistItem {
  id: string
  checklist_id: string
  text: string
  is_checked: boolean
  position: number
  created_at: string
}

export interface ChecklistWithProgress extends Checklist {
  total: number
  checked: number
  progress: number  // 0–100
}

// ── Toplantı Modülü ───────────────────────────────────────────────────────────

export interface Meeting {
  id: string
  organization_id: string
  created_by: string
  title: string
  description: string | null
  start_time: string
  end_time: string
  google_meet_link: string | null
  google_calendar_event_id: string | null
  notes: string | null
  status: 'scheduled' | 'active' | 'ended'
  created_at: string
}

export interface MeetingAttendee {
  meeting_id: string
  user_id: string
}

export interface MeetingAttendeeWithProfile extends MeetingAttendee {
  full_name: string | null
  avatar_url: string | null
  email: string
}

export interface MeetingWithAttendees extends Meeting {
  attendees: MeetingAttendeeWithProfile[]
}

// ── Otomasyon Ayarları ────────────────────────────────────────────────────────

export interface AutomationSettings {
  id: string
  organization_id: string
  task_overdue: boolean
  task_due_soon: boolean
  sprint_ending_soon: boolean
  meeting_notifications: boolean
  member_overload: boolean
  overload_threshold: number
  created_at: string
}
