import type { Level, ProblemStatus, Role, SolutionStatus } from './types'

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

export function timeAgo(iso: string): string {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000
  const abs = Math.abs(diff)
  if (abs < 45) return 'just now'
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['minute', 60],
    ['hour', 3600],
    ['day', 86400],
    ['week', 604800],
    ['month', 2629800],
    ['year', 31557600],
  ]
  let chosen: [Intl.RelativeTimeFormatUnit, number] = units[0]
  for (const u of units) if (abs >= u[1]) chosen = u
  return rtf.format(Math.round(diff / chosen[1]), chosen[0])
}

export function isRecent(iso: string, hours = 48) {
  return Date.now() - new Date(iso).getTime() < hours * 3600 * 1000
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

const nf = new Intl.NumberFormat('en-US')
export const num = (n: number) => nf.format(n)
export function compact(n: number) {
  if (n >= 10000) return `${(n / 1000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, '')}k`
  return nf.format(n)
}

export const SOLUTION_STATUS: Record<SolutionStatus, { label: string; tone: string; dot: string }> = {
  proposed: { label: 'Proposed', tone: 'bg-sand-100 text-sand-700 ring-sand-200', dot: 'bg-sand-400' },
  developing: { label: 'Developing', tone: 'bg-sky-50 text-sky-800 ring-sky-200', dot: 'bg-sky-500' },
  under_evaluation: { label: 'Under Evaluation', tone: 'bg-violet-50 text-violet-800 ring-violet-200', dot: 'bg-violet-500' },
  selected: { label: 'Selected', tone: 'bg-saffron-50 text-saffron-700 ring-saffron-100', dot: 'bg-saffron-500' },
  implemented: { label: 'Implemented', tone: 'bg-atlas-50 text-atlas-800 ring-atlas-200', dot: 'bg-atlas-500' },
}
export const SOLUTION_FLOW: SolutionStatus[] = ['proposed', 'developing', 'under_evaluation', 'selected', 'implemented']

export const PROBLEM_STATUS: Record<ProblemStatus, { label: string; tone: string }> = {
  open: { label: 'Open', tone: 'bg-atlas-50 text-atlas-800 ring-atlas-200' },
  under_review: { label: 'Under Review', tone: 'bg-violet-50 text-violet-800 ring-violet-200' },
  in_progress: { label: 'In Progress', tone: 'bg-sky-50 text-sky-800 ring-sky-200' },
  solved: { label: 'Solved', tone: 'bg-atlas-700 text-white ring-atlas-700' },
  archived: { label: 'Archived', tone: 'bg-sand-100 text-sand-600 ring-sand-200' },
}

export const LEVEL: Record<Level, { label: string; tone: string; bar: number }> = {
  low: { label: 'Low', tone: 'text-sand-600', bar: 1 },
  medium: { label: 'Medium', tone: 'text-saffron-700', bar: 2 },
  high: { label: 'High', tone: 'text-clay-600', bar: 3 },
  critical: { label: 'Critical', tone: 'text-red-700', bar: 4 },
}

// Individuals are all "community members" in the interface: the citizen/talent split is
// historical and carries no permissions.
export const ROLE_LABEL: Record<Role, string> = {
  citizen: 'Community member',
  talent: 'Community member',
  organization: 'Organization',
  municipality: 'Public institution',
  admin: 'Moderator',
}

export const ORG_KIND_LABEL: Record<string, string> = {
  university: 'University or school',
  company: 'Company',
  startup: 'Startup',
  incubator: 'Incubator or accelerator',
  foundation: 'Foundation or funder',
  ngo: 'NGO',
  association: 'Association',
  university_club: 'Student club',
  research_lab: 'Research center or lab',
  institution: 'Public institution',
  municipality: 'Local authority',
}

export function roleLabel(u: { role: Role; org_kind: string | null }) {
  if (u.role === 'organization' && u.org_kind) return ORG_KIND_LABEL[u.org_kind] ?? 'Organization'
  return ROLE_LABEL[u.role]
}

export function isOrganization(u: { role: Role } | null | undefined) {
  return !!u && (u.role === 'organization' || u.role === 'municipality')
}

export const INTEREST_KIND: Record<string, { label: string; verb: string }> = {
  implementation: { label: 'Implementation', verb: 'Interested in implementing' },
  sponsorship: { label: 'Sponsorship or funding', verb: 'Interested in sponsoring' },
  mentorship: { label: 'Mentoring & support', verb: 'Interested in mentoring' },
}

export const DECISION_ROLES: Role[] = ['municipality', 'organization', 'admin']
