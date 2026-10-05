import { useQuery } from '@tanstack/react-query'
import { Flame, Rocket, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ActivityItem, ImplementedCard, PersonRow, ProblemCard, SolutionRow } from '../components/cards'
import { Page } from '../components/Layout'
import { CardSkeleton, ErrorState, SectionHeader, Skeleton } from '../components/ui'
import { useDocumentTitle } from '../hooks/misc'
import { api } from '../lib/api'
import { compact } from '../lib/format'
import type { Activity, PlatformStats, Problem, Solution, UserWithStats } from '../lib/types'

interface DiscoverData {
  stats: PlatformStats
  trending_problems: Problem[]
  latest_problems: Problem[]
  trending_solutions: Solution[]
  latest_solutions: Solution[]
  recently_implemented: Solution[]
  top_contributors: UserWithStats[]
  active_organizations: UserWithStats[]
}

function ListCard({ children, loading }: { children: React.ReactNode; loading: boolean }) {
  return (
    <div className="card overflow-hidden">
      <ul className="divide-y divide-sand-100">
        {loading
          ? [0, 1, 2, 3].map((i) => (
              <li key={i} className="p-4">
                <Skeleton className="h-9" />
              </li>
            ))
          : children}
      </ul>
    </div>
  )
}

export default function Discover() {
  useDocumentTitle('Discover')
  const q = useQuery({ queryKey: ['discover'], queryFn: () => api.get<DiscoverData>('/discover') })
  const activity = useQuery({ queryKey: ['activity', 'global'], queryFn: () => api.get<Activity[]>('/activity', { limit: 15 }), refetchInterval: 30_000 })
  const d = q.data
  if (q.isError)
    return (
      <Page>
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      </Page>
    )

  return (
    <Page wide>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Discover</h1>
          <p className="mt-1 text-sand-600">What the community is solving right now.</p>
        </div>
        <dl className="flex flex-wrap gap-6">
          {[
            ['Open problems', d?.stats.open_problems],
            ['Active solutions', d?.stats.active_solutions],
            ['Community stars', d?.stats.stars],
            ['Cities', d?.stats.cities],
          ].map(([k, v]) => (
            <div key={k as string}>
              <dt className="text-xs font-semibold text-sand-500">{k}</dt>
              <dd className="text-xl font-extrabold tabular-nums">{v === undefined ? '—' : compact(v as number)}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-10">
          <section>
            <SectionHeader title={<span className="inline-flex items-center gap-2"><Flame className="size-5 text-clay-500" aria-hidden /> Trending problems</span>} action={<Link to="/problems" className="text-sm font-semibold text-atlas-700 hover:underline">All →</Link>} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{q.isLoading ? [0, 1].map((i) => <CardSkeleton key={i} />) : d?.trending_problems.map((p) => <ProblemCard key={p.id} problem={p} />)}</div>
          </section>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            <section>
              <SectionHeader title="Trending solutions" />
              <ListCard loading={q.isLoading}>{d?.trending_solutions.map((s) => <SolutionRow key={s.id} solution={s} />)}</ListCard>
            </section>
            <section>
              <SectionHeader title={<span className="inline-flex items-center gap-2"><Sparkles className="size-5 text-atlas-600" aria-hidden /> Latest solutions</span>} action={<Link to="/solutions" className="text-sm font-semibold text-atlas-700 hover:underline">Feed →</Link>} />
              <ListCard loading={q.isLoading}>{d?.latest_solutions.map((s) => <SolutionRow key={s.id} solution={s} />)}</ListCard>
            </section>
          </div>

          <section>
            <SectionHeader title="Latest problems" action={<Link to="/problems?sort=latest" className="text-sm font-semibold text-atlas-700 hover:underline">All →</Link>} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">{q.isLoading ? [0, 1, 2].map((i) => <CardSkeleton key={i} />) : d?.latest_problems.map((p) => <ProblemCard key={p.id} problem={p} compactCard />)}</div>
          </section>

          {d && d.recently_implemented.length > 0 && (
            <section>
              <SectionHeader title={<span className="inline-flex items-center gap-2"><Rocket className="size-5 text-atlas-700" aria-hidden /> Recently implemented</span>} />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{d.recently_implemented.map((s) => <ImplementedCard key={s.id} solution={s} />)}</div>
            </section>
          )}
        </div>

        <aside className="space-y-8">
          <section>
            <SectionHeader title="Top contributors" subtitle="Ranked by real-world contribution" />
            <ListCard loading={q.isLoading}>{d?.top_contributors.map((u, i) => <PersonRow key={u.id} user={u} rank={i + 1} />)}</ListCard>
          </section>
          <section>
            <SectionHeader title="Active organizations" />
            <ListCard loading={q.isLoading}>{d?.active_organizations.map((u) => <PersonRow key={u.id} user={u} />)}</ListCard>
          </section>
          <section>
            <SectionHeader title="Live activity" />
            <div className="card px-4">
              {activity.isLoading ? (
                <div className="space-y-3 py-4">
                  <Skeleton className="h-10" />
                  <Skeleton className="h-10" />
                </div>
              ) : (
                <ul className="divide-y divide-sand-100">{activity.data?.map((a) => <ActivityItem key={a.id} a={a} />)}</ul>
              )}
            </div>
          </section>
        </aside>
      </div>
    </Page>
  )
}
