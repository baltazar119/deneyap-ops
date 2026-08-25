'use client'

import { Profile } from './types'
import { avatarBg, getInitials } from './helpers'

interface Props {
  profile: Profile | null | undefined
  id: string
  size?: number
}

export default function Avatar({ profile, id, size = 36 }: Props) {
  const bg = avatarBg(id)
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
      background: profile?.avatar_url ? 'transparent' : bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.33, fontWeight: 700, color: '#fff',
    }}>
      {profile?.avatar_url
        ? <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : getInitials(profile)
      }
    </div>
  )
}
