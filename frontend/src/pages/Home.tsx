import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  Building2,
  GraduationCap,
  HandHeart,
  Landmark,
  Lightbulb,
  MapPin,
  MessageSquareWarning,
  Rocket,
  Star,
  Trophy,
  Users,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { ActivityItem, ImplementedCard, ProblemCard, SolutionRow } from '../components/cards'
import { StarButton } from '../components/actions'
import { Avatar, CardSkeleton, CategoryIcon, SectionHeader, SolutionStatusBadge, Skeleton, btn } from '../components/ui'
import { useAuth } from '../hooks/auth'
import { useDocumentTitle, useMeta } from '../hooks/misc'
import { api } from '../lib/api'
import { compact, num } from '../lib/format'
import type { Activity, Paged, Problem, PlatformStats, Solution } from '../lib/types'

interface DiscoverData {
  stats: PlatformStats
  trending_problems: Problem[]
  latest_solutions: Solution[]
  recently_implemented: Solution[]
}

function HeroShowcase({ problem }: { problem?: Problem }) {
  const sols = useQuery({
    queryKey: ['solutions', 'problem', problem?.id, 'top', 'hero'],
    queryFn: () => api.get<Paged<Solution>>(`/problems/${problem!.id}/solutions`, { sort: 'top', page_size: 3 }),
    enabled: !!problem,
  })
  if (!problem) return <Skeleton className="h-[380px] rounded-3xl" />
  return (
    <div className="relative">
      <div className="absolute -inset-3 -z-10 rotate-1 rounded-[28px] bg-atlas-700/10" aria-hidden />
      <div className="card overflow-hidden shadow-xl shadow-sand-900/5">
        <div className="border-b border-sand-100 p-5">
          <div className="mb-2 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-clay-50 px-2.5 py-1 text-xs font-bold text-clay-700">
              <MessageSquareWarning className="size-3.5" aria-hidden /> Local problem
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-sand-500">
              <MapPin className="size-3.5" aria-hidden /> {problem.city}
              {problem.neighborhood && ` · ${problem.neighborhood}`}
            </span>
          </div>
          <Link to={`/problems/${problem.id}`} className="text-lg leading-snug font-bold text-sand-900 hover:text-atlas-800">
            {problem.title}
          </Link>
          <div className="mt-3 flex items-center gap-4 text-[13px] font-semibold text-sand-600">
            <span className="inline-flex items-center gap-1">
              <HandHeart className="size-4 text-clay-500" aria-hidden /> {num(problem.supporters_count)} supporters
            </span>
            <span className="inline-flex items-center gap-1">
              <Lightbulb className="size-4 text-saffron-600" aria-hidden /> {problem.solutions_count} solutions
            </span>
          </div>
        </div>
        <div className="bg-sand-50/60 p-3">
          <p className="px-2 pt-1 pb-2 text-[11px] font-bold tracking-wider text-sand-500 uppercase">Top community solutions</p>
          <ul className="space-y-2">
            {sols.isLoading
              ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)
              : sols.data?.items.map((s, i) => (
                  <li key={s.id} className="flex items-center gap-3 rounded-xl border border-sand-200 bg-white px-3 py-2.5">
                    <span className="w-4 text-center text-sm font-extrabold text-sand-300">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <Link to={`/solutions/${s.id}`} className="block truncate text-sm font-bold text-sand-900 hover:text-atlas-800">
                        {s.title}
                      </Link>
                      <div className="mt-0.5 flex items-center gap-2">
                        <SolutionStatusBadge status={s.status} className="!py-0 text-[10px]" />
                        <span className="truncate text-xs text-sand-500">{s.author.name}</span>
                      </div>
                    </div>
                    <StarButton solutionId={s.id} starred={s.starred} count={s.stars_count} size="sm" />
                  </li>
                ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

const LOOP = [
  { icon: MessageSquareWarning, title: 'Problem', text: 'A citizen describes a local issue. AI structures it and spots duplicates.' },
  { icon: Lightbulb, title: 'Solutions', text: 'Students, engineers, startups and NGOs propose concrete solutions.' },
  { icon: Star, title: 'Community', text: 'Neighbours discuss and star the solutions they believe in.' },
  { icon: Users, title: 'Collaboration', text: 'Contributors team up across skills to strengthen proposals.' },
  { icon: Trophy, title: 'Selection', text: 'Municipalities and organizations evaluate and select solutions.' },
  { icon: Rocket, title: 'Implementation', text: 'Solutions are deployed and their real-world impact is tracked.' },
]

const AUDIENCES = [
  { icon: Users, title: 'Citizens', text: 'Report what you see, support problems that matter and follow progress.', cta: 'Submit a problem', to: '/problems/new' },
  { icon: GraduationCap, title: 'Talents & innovators', text: 'Students, engineers, designers: build solutions and earn recognition for real impact.', cta: 'Propose a solution', to: '/problems?sort=unsolved&intent=propose' },
  { icon: Building2, title: 'Organizations', text: 'Startups, NGOs and labs: find challenges that match your mission and collaborators.', cta: 'Explore problems', to: '/problems' },
  { icon: Landmark, title: 'Municipalities', text: 'Publish official challenges, discover community-backed solutions and pilot them.', cta: 'Open the dashboard', to: '/dashboard' },
]

export default function Home() {
  useDocumentTitle()
  const { user } = useAuth()
  const meta = useMeta()
  const d = useQuery({ queryKey: ['discover'], queryFn: () => api.get<DiscoverData & { [k: string]: unknown }>('/discover') })
  const activity = useQuery({ queryKey: ['activity', 'home'], queryFn: () => api.get<Activity[]>('/activity', { limit: 6, exclude_stars: true }) })
  const stats = d.data?.stats

  return (
    <>
      {/* ---------------------------------------------------------- Hero */}
      <section className="zellige relative overflow-hidden border-b border-sand-200 bg-gradient-to-b from-white to-sand-50">
        <div className="mx-auto grid grid-cols-1 max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:py-20">
          <div>
            <p className="eyebrow">Civic innovation for Moroccan & African cities</p>
            <h1 className="mt-3 text-4xl leading-[1.05] font-extrabold tracking-tight text-sand-900 sm:text-5xl lg:text-[3.6rem]">
              Turn Local Problems <span className="text-atlas-700">Into Real Solutions.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-sand-600">
              BladiSolution connects communities, talents, organizations and cities to collaboratively solve local challenges.
            </p>
            <div className="mt-8 grid gap-3 sm:flex sm:flex-wrap">
              <Link to="/problems" className={btn('primary', 'lg')}>
                Explore Problems <ArrowRight className="size-4" aria-hidden />
              </Link>
              <Link to="/problems/new" className={btn('accent', 'lg')}>
                Submit a Problem
              </Link>
              <Link to="/problems?sort=unsolved&intent=propose" className={btn('secondary', 'lg')}>
                <Lightbulb className="size-4" aria-hidden /> Propose a Solution
              </Link>
            </div>
            <dl className="mt-10 grid max-w-xl grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                ['Problems', stats?.problems],
                ['Solutions', stats?.solutions],
                ['Participants', stats?.participants],
                ['Implemented', stats?.implemented],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <dt className="text-xs font-semibold text-sand-500">{label}</dt>
                  <dd className="text-2xl font-extrabold text-sand-900 tabular-nums">{value === undefined ? '—' : compact(value as number)}</dd>
                </div>
              ))}
            </dl>
          </div>
          <HeroShowcase problem={d.data?.trending_problems[0]} />
        </div>
      </section>

      {/* ---------------------------------------------------------- Loop */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6" aria-labelledby="loop-title">
        <div className="max-w-2xl">
          <p className="eyebrow">How it works</p>
          <h2 id="loop-title" className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
            A problem should not end as a complaint.
          </h2>
          <p className="mt-2 text-sand-600">It should become an opportunity for someone to build a solution.</p>
        </div>
        <ol className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {LOOP.map((s, i) => (
            <li key={s.title} className="card relative p-4">
              <span className="absolute top-4 right-4 text-xs font-extrabold text-sand-300">0{i + 1}</span>
              <span className="grid size-10 place-items-center rounded-xl bg-atlas-50 text-atlas-700">
                <s.icon className="size-5" aria-hidden />
              </span>
              <h3 className="mt-3 font-bold">{s.title}</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-sand-600">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------------------------------------------------------- Trending + Latest */}
      <section className="mx-auto grid grid-cols-1 max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[1.6fr_1fr]">
        <div>
          <SectionHeader
            title="Trending problems"
            subtitle="Where the community is most active this week"
            action={
              <Link to="/problems" className="text-sm font-semibold text-atlas-700 hover:underline">
                All problems →
              </Link>
            }
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {d.isLoading ? [0, 1, 2, 3].map((i) => <CardSkeleton key={i} />) : d.data?.trending_problems.slice(0, 4).map((p) => <ProblemCard key={p.id} problem={p} />)}
          </div>
        </div>
        <div>
          <SectionHeader
            title="Latest civic solutions"
            subtitle="Freshly proposed by the community"
            action={
              <Link to="/solutions" className="text-sm font-semibold text-atlas-700 hover:underline">
                Feed →
              </Link>
            }
          />
          <div className="card overflow-hidden">
            <ul className="divide-y divide-sand-100">
              {d.isLoading
                ? [0, 1, 2, 3, 4].map((i) => (
                    <li key={i} className="p-4">
                      <Skeleton className="h-9" />
                    </li>
                  ))
                : d.data?.latest_solutions.slice(0, 6).map((s) => <SolutionRow key={s.id} solution={s} />)}
            </ul>
          </div>
          {activity.data && activity.data.length > 0 && (
            <div className="card mt-4 px-4 py-1">
              <h3 className="pt-3 text-xs font-bold tracking-wider text-sand-500 uppercase">Live activity</h3>
              <ul className="divide-y divide-sand-100">
                {activity.data.slice(0, 4).map((a) => (
                  <ActivityItem key={a.id} a={a} />
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      {/* ---------------------------------------------------------- Implemented */}
      {d.data && d.data.recently_implemented.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pt-14 sm:px-6">
          <SectionHeader
            title="From idea to implementation"
            subtitle="Community solutions that are already changing neighbourhoods"
            action={
              <Link to="/solutions?sort=implemented" className="text-sm font-semibold text-atlas-700 hover:underline">
                All implemented →
              </Link>
            }
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {d.data.recently_implemented.map((s) => (
              <ImplementedCard key={s.id} solution={s} />
            ))}
          </div>
        </section>
      )}

      {/* ---------------------------------------------------------- Categories */}
      <section className="mx-auto max-w-7xl px-4 pt-14 sm:px-6" aria-labelledby="cat-title">
        <SectionHeader id="cat-title" title="12 Smart City challenge areas" subtitle="Browse problems by category" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {meta.data?.categories.map((c) => (
            <Link key={c.slug} to={`/problems?category=${c.slug}`} className="card group flex flex-col gap-3 p-4 transition-colors hover:border-sand-300">
              <span className="grid size-10 place-items-center rounded-xl" style={{ backgroundColor: `${c.color}14`, color: c.color }}>
                <CategoryIcon icon={c.icon} className="size-5" />
              </span>
              <span className="text-sm leading-tight font-bold text-sand-900 group-hover:text-atlas-800">{c.name}</span>
              <span className="mt-auto text-xs font-semibold text-sand-500">
                {c.problems} problem{c.problems === 1 ? '' : 's'}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------- Audiences */}
      <section className="mx-auto max-w-7xl px-4 pt-14 sm:px-6" aria-labelledby="aud-title">
        <SectionHeader id="aud-title" title="Built for everyone who makes a city work" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {AUDIENCES.map((a) => (
            <div key={a.title} className="card flex flex-col p-5">
              <a.icon className="size-6 text-clay-500" aria-hidden />
              <h3 className="mt-3 font-bold">{a.title}</h3>
              <p className="mt-1 flex-1 text-sm text-sand-600">{a.text}</p>
              <Link to={a.to} className="mt-4 text-sm font-semibold text-atlas-700 hover:underline">
                {a.cta} →
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------- Closing */}
      <section className="mx-auto max-w-7xl px-4 pt-14 sm:px-6">
        <div className="zellige-light relative overflow-hidden rounded-3xl bg-atlas-800 px-6 py-12 text-center text-white sm:px-12">
          <p className="mx-auto max-w-3xl text-2xl font-extrabold tracking-tight sm:text-3xl">BladiSolution turns local problems into collective action.</p>
          <p className="mx-auto mt-3 max-w-xl text-atlas-100">Problem → Community → Solution → Implementation.</p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            {user ? (
              <Link to="/problems/new" className={btn('accent', 'lg')}>
                Submit a problem
              </Link>
            ) : (
              <Link to="/register" className={btn('accent', 'lg')}>
                Join BladiSolution
              </Link>
            )}
            <Link to="/discover" className={btn('secondary', 'lg', '!border-white/20 !bg-white/10 !text-white hover:!bg-white/20')}>
              See what's happening
            </Link>
          </div>
          <div className="mt-8 flex justify-center -space-x-2" aria-hidden>
            {d.data?.latest_solutions.slice(0, 6).map((s) => (
              <Avatar key={s.id} user={s.author} size={32} className="ring-2 ring-atlas-800" />
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
