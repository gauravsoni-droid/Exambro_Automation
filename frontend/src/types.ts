// Mirrors backend/app/schemas.py — the contract between devs (Implementation_Plan §1).

export type Cadence = 'daily' | 'every_2_days'
export type PostFormat = 'post' | 'reel'
export type PostStatus =
  | 'topic_chosen'
  | 'generating'
  | 'content_ready'
  | 'awaiting_approval'
  | 'approved'
  | 'rejected'
  | 'saved'
export type TopicStatus = 'suggested' | 'picked' | 'rejected'
export type IdeaType = 'text' | 'image' | 'link'
export type IdeaStatus = 'pending' | 'used' | 'discarded'
export type Verdict = 'good' | 'needs_work'

export interface Topic {
  id: string
  round_date: string
  slot: number
  title: string
  description: string | null
  pillar_id: string | null
  pillar_name: string | null
  is_rotation_exception: boolean
  from_idea_id: string | null
  status: TopicStatus
}

export interface Post {
  id: string
  topic_id: string
  language: string
  format: PostFormat | null
  caption: string | null
  hashtags: string[]
  script: string | null
  image_paths: string[]
  is_carousel: boolean
  critic_score: number | null
  status: PostStatus
  created_at: string | null
  topics?: {
    title: string | null
    round_date?: string
    pillar_id?: string | null
    pillars: { name: string } | null
  } | null
}

export interface Idea {
  id: string
  type: IdeaType
  payload: string
  image_path: string | null
  status: IdeaStatus
  used_at: string | null
  created_at: string | null
}

export interface Pillar {
  id: string
  name: string
  description: string | null
  active: boolean
  sort_order: number
}

export interface AppSettings {
  id: string
  cadence: Cadence
  bf_who_we_serve: string | null
  bf_core_values: string | null
  bf_liked_topics: string | null
  bf_never_post: string[]
  ta_country: string | null
  ta_state: string | null
  ta_city: string | null
  ta_who: string | null
  english_allowlist: string[]
  competitor_handles: string[]
}

export interface QueueItem extends Post {
  topics: {
    title: string
    round_date: string
    pillar_id: string | null
    pillars: { name: string } | null
  } | null
}

export interface QueueStats {
  tap2_total: number
  approved_without_edits: number
  tweaks: number
  rejects: number
  edit_rate: number
  approve_no_edit_rate: number
  pillar_balance: Record<string, number>
}

export interface CalibrationItem {
  id: string
  content: string
  owner_verdict: Verdict | null
  critic_verdict: Verdict | null
  critic_score: number | null
  agreed: boolean | null
}

export interface CalibrationSummary {
  total: number
  labeled: number
  agreed: number
  pass_gate: boolean
}
