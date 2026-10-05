import clsx from 'clsx'
import { HandHeart, Landmark, Lightbulb, MapPin, MessageSquare, Rocket, Sparkles, Star, Trophy, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { compact, formatDate, isRecent, num, roleLabel, timeAgo } from '../lib/format'
import type { Activity, Problem, Solution, UserWithStats } from '../lib/types'
import { StarButton } from './actions'
import { Avatar, CategoryBadge, LevelMeter, ProblemStatusBadge, SolutionStatusBadge, UserLink } from './ui'

export function ProblemCard({ problem, compactCard = false }: { problem: Problem; compactCard?: boolean }) {
  return (
    <article className="card group relative flex flex-col p-5 transition-shadow hover:shadow-md hover:shadow-sand-200/60">
      <div className="mb-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <CategoryBadge category={problem.category} />
        {problem.is_official && (
          <span className="inline-flex items-center gap-1 rounded-full bg-atlas-700 px-2 py-0.5 text-[11px] font-bold text-white">
            <Landmark className="size-3" aria-hidden /> Official challenge
          </span>
        )}
        <span className="ml-auto">
          <ProblemStatusBadge status={problem.status} />
        </span>
      </div>
      <h3 className="text-[16px] leading-snug font-bold text-sand-900">
        <Link to={`/problems/${problem.id}`} className="after:absolute after:inset-0 group-hover:text-atlas-800">
          {problem.title}
        </Link>
      </h3>
      <p className="mt-1 flex items-center gap-1 text-[13px] text-sand-500">
        <MapPin className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">
          {problem.city}
          {problem.neighborhood && ` · ${problem.neighborhood}`}
        </span>
      </p>
      {!compactCard && <p className="mt-2.5 line-clamp-2 text-sm text-sand-600">{problem.excerpt}</p>}
      <div className="mt-auto flex items-center gap-4 pt-4 text-[13px] font-semibold text-sand-600">
        <span className="inline-flex items-center gap-1" title="Supporters">
          <HandHeart className="size-4 text-clay-500" aria-hidden /> {compact(problem.supporters_count)}
          <span className="sr-only">supporters</span>
        </span>
        <span className="inline-flex items-center gap-1" title="Solutions">
          <Lightbulb className="size-4 text-saffron-600" aria-hidden /> {problem.solutions_count}
          <span className="sr-only">solutions</span>
        </span>
        <span className="inline-flex items-center gap-1" title="Comments">
          <MessageSquare className="size-4 text-sand-400" aria-hidden /> {problem.comments_count}
          <span className="sr-only">comments</span>
        </span>
        <span className="ml-auto hidden sm:inline">
          <LevelMeter level={problem.urgency} label="Urgency" />
        </span>
      </div>
    </article>
  )
}

export function SolutionCard({ solution, showProblem = false, highlightNew = false }: { solution: Solution; showProblem?: boolean; highlightNew?: boolean }) {
  const fresh = highlightNew && isRecent(solution.created_at)
  return (
    <article className={clsx('card group relative flex gap-4 p-4 sm:p-5', fresh && 'ring-2 ring-atlas-200')}>
      <div className="relative z-10 hidden sm:block">
        <StarButton solutionId={solution.id} starred={solution.starred} count={solution.stars_count} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          {fresh && (
            <span className="inline-flex items-center gap-1 rounded-full bg-atlas-700 px-2 py-0.5 text-[11px] font-bold text-white">
              <Sparkles className="size-3" aria-hidden /> New
            </span>
          )}
          <SolutionStatusBadge status={solution.status} />
          {solution.status === 'implemented' && solution.implementation?.citizens_impacted ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-atlas-700">
              <Users className="size-3.5" aria-hidden /> {compact(solution.implementation.citizens_impacted)} citizens impacted
            </span>
          ) : solution.decided_by && solution.status === 'selected' ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-saffron-700">
              <Trophy className="size-3.5" aria-hidden /> Selected by {solution.decided_by.name}
            </span>
          ) : null}
        </div>
        <h3 className="text-[16px] leading-snug font-bold text-sand-900">
          <Link to={`/solutions/${solution.id}`} className="after:absolute after:inset-0 group-hover:text-atlas-800">
            {solution.title}
          </Link>
        </h3>
        {showProblem && (
          <p className="mt-0.5 truncate text-[13px] text-sand-500">
            for <span className="font-semibold text-sand-700">{solution.problem.title}</span>
          </p>
        )}
        <p className="mt-1.5 line-clamp-2 text-sm text-sand-600">{solution.excerpt}</p>
        {solution.required_skills.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {solution.required_skills.slice(0, 4).map((s) => (
              <span key={s} className="chip">
                {s}
              </span>
            ))}
          </div>
        )}
        <div className="relative z-10 mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-sand-500">
          <span className="sm:hidden">
            <StarButton solutionId={solution.id} starred={solution.starred} count={solution.stars_count} size="sm" />
          </span>
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <Avatar user={solution.author} size={20} />
            <UserLink user={solution.author} />
          </span>
          <span>{timeAgo(solution.created_at)}</span>
          <span className="inline-flex items-center gap-1">
            <MessageSquare className="size-3.5" aria-hidden /> {solution.comments_count}
          </span>
        </div>
      </div>
    </article>
  )
}

/** Dense one-line row used in global feeds ("Latest Civic Solutions"). */
export function SolutionRow({ solution, showTime = true }: { solution: Solution; showTime?: boolean }) {
  return (
    <li className="group relative flex items-start gap-3 px-4 py-3.5 hover:bg-sand-50">
      <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl" style={{ backgroundColor: `${solution.problem.category.color}14`, color: solution.problem.category.color }}>
        {solution.status === 'implemented' ? <Rocket className="size-4" aria-hidden /> : <Lightbulb className="size-4" aria-hidden />}
      </span>
      <div className="min-w-0 flex-1">
        <Link to={`/solutions/${solution.id}`} className="line-clamp-1 font-semibold text-sand-900 after:absolute after:inset-0 group-hover:text-atlas-800">
          {solution.title}
        </Link>
        <p className="truncate text-[13px] text-sand-500">
          {solution.problem.category.name} · {solution.problem.city}
          {showTime && <> · {timeAgo(solution.created_at)}</>}
        </p>
      </div>
      <span className="relative z-10">
        <StarButton solutionId={solution.id} starred={solution.starred} count={solution.stars_count} size="sm" />
      </span>
    </li>
  )
}

export function ImplementedCard({ solution }: { solution: Solution }) {
  const impl = solution.implementation
  return (
    <article className="card group relative flex flex-col overflow-hidden">
      <div className="zellige-light flex items-center justify-between bg-atlas-800 px-5 py-3 text-white">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold tracking-wide uppercase">
          <Rocket className="size-3.5" aria-hidden /> Implemented
        </span>
        {impl && <span className="text-xs text-atlas-100">{formatDate(impl.implemented_at)}</span>}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <CategoryBadge category={solution.problem.category} />
        <h3 className="mt-2 leading-snug font-bold text-sand-900">
          <Link to={`/solutions/${solution.id}`} className="after:absolute after:inset-0 group-hover:text-atlas-800">
            {solution.title}
          </Link>
        </h3>
        <p className="mt-1 text-[13px] text-sand-500">
          {solution.problem.city} · by {solution.author.name}
        </p>
        {impl?.impact_summary && <p className="mt-2.5 line-clamp-3 text-sm text-sand-600">{impl.impact_summary}</p>}
        <div className="mt-auto flex items-end justify-between pt-4">
          {impl?.citizens_impacted ? (
            <div>
              <div className="text-2xl font-extrabold text-atlas-700 tabular-nums">{num(impl.citizens_impacted)}</div>
              <div className="text-xs font-semibold text-sand-500">citizens impacted</div>
            </div>
          ) : (
            <span />
          )}
          {impl && <span className="text-xs font-semibold text-sand-500">with {impl.organization.name}</span>}
        </div>
      </div>
    </article>
  )
}

export function PersonRow({ user, rank }: { user: UserWithStats; rank?: number }) {
  return (
    <li className="group relative flex items-center gap-3 px-4 py-3 hover:bg-sand-50">
      {rank !== undefined && <span className="w-4 text-center text-sm font-bold text-sand-400 tabular-nums">{rank}</span>}
      <Avatar user={user} size={38} />
      <div className="min-w-0 flex-1">
        <Link to={`/u/${user.username}`} className="block truncate font-semibold text-sand-900 after:absolute after:inset-0 group-hover:text-atlas-800">
          {user.name}
        </Link>
        <p className="truncate text-[13px] text-sand-500">{user.headline || roleLabel(user)}</p>
      </div>
      <div className="text-right text-xs leading-tight text-sand-500">
        {user.stats.implemented > 0 ? (
          <span className="inline-flex items-center gap-1 font-bold text-atlas-700"><Rocket className="size-3" aria-hidden /> {user.stats.implemented} implemented</span>
        ) : (
          <span className="font-semibold">{user.stats.solutions} solutions</span>
        )}
        <div className="inline-flex items-center gap-1 tabular-nums"><Star className="size-3 fill-saffron-400 text-saffron-500" aria-hidden /> {compact(user.stats.stars)}</div>
      </div>
    </li>
  )
}

const VERB: Record<string, string> = {
  submitted_solution: 'submitted a solution to',
  published_problem: 'published a problem',
  published_challenge: 'published an official challenge',
  starred_solution: 'starred',
  commented_solution: 'commented on',
  commented_problem: 'commented on',
  supported_problem: 'supported',
  joined_solution: 'joined the team of',
  changed_problem_status: 'updated the status of',
}

export function ActivityItem({ a }: { a: Activity }) {
  let text: React.ReactNode
  if (a.verb === 'changed_solution_status' && a.solution) {
    const label = (a.meta?.new ?? '').replace('_', ' ')
    text = (
      <>
        marked <Link className="font-semibold text-sand-900 hover:text-atlas-700" to={`/solutions/${a.solution.id}`}>“{a.solution.title}”</Link> as{' '}
        <span className="font-semibold capitalize">{label}</span>
      </>
    )
  } else {
    const target = a.solution ?? a.problem
    const to = a.solution ? `/solutions/${a.solution.id}` : a.problem ? `/problems/${a.problem.id}` : '#'
    text = (
      <>
        {VERB[a.verb] ?? a.verb}{' '}
        {target && (
          <Link className="font-semibold text-sand-900 hover:text-atlas-700" to={to}>
            “{target.title}”
          </Link>
        )}
      </>
    )
  }
  return (
    <li className="flex gap-3 py-3">
      <Avatar user={a.actor} size={30} />
      <div className="min-w-0 text-sm leading-snug text-sand-600">
        <UserLink user={a.actor} /> {text}
        <div className="mt-0.5 text-xs text-sand-400">{timeAgo(a.created_at)}</div>
      </div>
    </li>
  )
}
