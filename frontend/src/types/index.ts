export interface User {
  id: number
  username: string
  display_name: string
  created_at: string
}

export interface Group {
  id: number
  name: string
  join_code: string
  owner_id: number
  created_at: string
  member_count: number
}

export interface Member {
  user_id: number
  username: string
  display_name: string
  total_score: number
  streak: number
}

export interface GroupDetail extends Group {
  members: Member[]
}

export type DropStatus = 'pending' | 'active' | 'closed'

export interface Drop {
  id: number
  group_id: number
  status: DropStatus
  scheduled_for: string
  started_at: string | null
  expires_at: string | null
  seconds_remaining: number | null
  has_submitted: boolean
}

export interface Submission {
  id: number
  user_id: number
  drop_id: number
  status: 'verified' | 'rejected'
  reject_reason: string | null
  grass_coverage: number
  texture_score: number
  quality_score: number
  speed_score: number
  total_score: number
  response_seconds: number
  submitted_at: string
  image_url: string
  thumbnail_url: string
  username: string | null
}

export interface LeaderboardEntry {
  rank: number
  user_id: number
  username: string
  display_name: string
  total_score: number
  streak: number
  submissions: number
}

export interface MuralTile {
  submission_id: number
  x: number
  y: number
  thumbnail_url: string
  username: string
  dominant_color: string | null
  total_score: number
  submitted_at: string
}

export interface Mural {
  columns: number
  rows: number
  tile_count: number
  tiles: MuralTile[]
}

export type GroupEvent =
  | { type: 'connected'; group_id: number }
  | { type: 'drop.started'; drop_id: number; expires_at: string; triggered_by?: string }
  | { type: 'drop.closed'; drop_id: number }
  | {
      type: 'submission.created'
      submission_id: number
      username: string
      total_score: number
      thumbnail_url: string
    }
