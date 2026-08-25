export interface Profile {
  id: string
  full_name: string | null
  username: string | null
  avatar_url: string | null
  chat_status?: string | null
  status_emoji?: string | null
  status_text?: string | null
}

export interface ChatChannel {
  id: string
  type: 'workspace' | 'dm'
  name: string | null
  description: string | null
  participant_a: string | null
  participant_b: string | null
  created_by: string | null
  organization_id: string
}

export interface ChatMessage {
  id: string
  channel_id: string
  sender_id: string | null
  content: string
  created_at: string
  parent_message_id: string | null
  thread_count: number
  sender?: Profile | null
}

export interface ChatReaction {
  id: string
  message_id: string
  user_id: string
  emoji: string
  created_at: string
}

export interface ChatPin {
  id: string
  channel_id: string
  message_id: string
  pinned_by: string | null
  created_at: string
  message?: ChatMessage | null
}

export interface OrgMember {
  user_id: string
  role: string
  profile: Profile | null
}

// Derived: DM channel with resolved "other person"
export type DmChannel = ChatChannel & { otherProfile: Profile | null }
