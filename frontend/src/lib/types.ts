export type Role = 'citizen' | 'talent' | 'organization' | 'municipality' | 'admin'
export type Level = 'low' | 'medium' | 'high' | 'critical'
export type ProblemStatus = 'open' | 'under_review' | 'in_progress' | 'solved' | 'archived'
export type SolutionStatus = 'proposed' | 'developing' | 'under_evaluation' | 'selected' | 'implemented'

export interface UserBrief {
  id: number
  username: string
  name: string
  role: Role
  org_kind: string | null
  headline: string | null
  city: string | null
  avatar_url: string | null
  verified: boolean
  skills: string[]
}

export interface Me extends UserBrief {
  email: string
  bio: string | null
  website: string | null
  is_demo: boolean
  created_at: string
}

export interface UserStats {
  solutions: number
  stars: number
  implemented: number
  selected: number
  problems: number
  comments: number
  collaborations: number
  citizens_impacted: number
  followers: number
  reputation: number
  following?: number
}

export interface UserWithStats extends UserBrief {
  stats: UserStats
}

export interface Profile extends UserWithStats {
  bio: string | null
  website: string | null
  created_at: string
  focus_categories: { slug: string; count: number }[]
  is_following: boolean
  is_me: boolean
}

export interface CategoryBrief {
  slug: string
  name: string
  icon: string
  color: string
}

export interface Category extends CategoryBrief {
  description: string
  skills: string[]
  problems: number
}

export interface ProblemAnalysis {
  provider: string
  category: string
  category_name: string
  category_confidence: number
  alternatives: string[]
  subcategory: string
  frequency: string | null
  urgency: Level
  impact: Level
  impact_areas: string[]
  affected_groups: string[]
  affected_estimate: number
  locations: string[]
  keywords: string[]
  summary: string
  fallback_reason?: string
}

export interface Problem {
  id: number
  title: string
  excerpt: string
  category: CategoryBrief
  city: string
  neighborhood: string | null
  location: string | null
  lat: number | null
  lng: number | null
  image_url: string | null
  impact: Level
  urgency: Level
  status: ProblemStatus
  is_official: boolean
  author: UserBrief
  supporters_count: number
  followers_count: number
  solutions_count: number
  comments_count: number
  tags: string[]
  created_at: string
  last_activity_at: string
  supported: boolean
  following: boolean
}

export interface ProblemDetail extends Problem {
  description: string
  ai_analysis: ProblemAnalysis | null
  affected_population: number | null
  solution_status_counts: Partial<Record<SolutionStatus, number>>
  can_edit: boolean
  can_manage_status: boolean
}

export interface SimilarProblem extends Problem {
  similarity: number
  shared_terms: string[]
}

export interface Implementation {
  organization: UserBrief
  implemented_at: string
  location: string | null
  impact_summary: string | null
  citizens_impacted: number | null
  evidence_url: string | null
}

export interface Solution {
  id: number
  title: string
  excerpt: string
  status: SolutionStatus
  stars_count: number
  comments_count: number
  required_skills: string[]
  author: UserBrief
  problem: {
    id: number
    title: string
    city: string
    neighborhood: string | null
    category: CategoryBrief
    status: ProblemStatus
    description?: string
    supporters_count?: number
    solutions_count?: number
  }
  tags: string[]
  created_at: string
  updated_at: string
  last_activity_at: string
  starred: boolean
  decided_by: UserBrief | null
  decided_at: string | null
  implementation: Implementation | null
}

export interface AISummary {
  provider: string
  problem: string
  solution: string
  how?: string
  impact: string
  required: string
  fallback_reason?: string
}

export interface Contributor {
  user: UserBrief
  role: 'author' | 'contributor'
  status: 'pending' | 'accepted' | 'declined'
  message: string | null
  created_at: string
}

export interface SolutionDetail extends Solution {
  description: string
  approach: string
  impact: string
  implementation_plan: string
  resources: string | null
  estimated_cost: string | null
  links: string[]
  status_note: string | null
  ai_summary: AISummary | null
  contributors: Contributor[]
  can_edit: boolean
  can_decide: boolean
  my_collaboration: 'pending' | 'accepted' | 'declined' | null
}

export interface Comment {
  id: number
  body: string
  author: UserBrief
  parent_id: number | null
  created_at: string
}

export interface Paged<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  pages: number
}

export interface Activity {
  id: number
  verb: string
  actor: UserBrief
  problem: { id: number; title: string; city: string; category: string } | null
  solution: { id: number; title: string } | null
  meta: Record<string, string> | null
  created_at: string
}

export interface Notification {
  id: number
  type: string
  message: string
  link: string | null
  read: boolean
  actor: UserBrief | null
  created_at: string
}

export interface PlatformStats {
  problems: number
  open_problems: number
  solutions: number
  active_solutions: number
  implemented: number
  selected: number
  participants: number
  organizations: number
  stars: number
  cities: number
}

export interface Meta {
  categories: Category[]
  cities: { name: string; lat: number; lng: number }[]
  skills: string[]
  ai_provider: string
}

export interface ContributorMatch extends UserWithStats {
  match: number
  reasons: string[]
  matched_skills: string[]
}

export interface MapPoint {
  id: number
  title: string
  category: string
  city: string
  neighborhood: string | null
  urgency: Level
  status: ProblemStatus
  lat: number
  lng: number
  supporters_count: number
  solutions_count: number
}
