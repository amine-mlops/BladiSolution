import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Building2, Handshake, Lightbulb, MessageSquareWarning, Plus, Star, Telescope } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ProblemCard, SolutionRow } from '../components/cards'
import { CardSkeleton, CategoryIcon, EmptyState, ErrorState, SectionHeader, Skeleton, btn } from '../components/ui'
import { useAuth } from '../hooks/auth'
import { useDocumentTitle, useMeta } from '../hooks/misc'
import { api } from '../lib/api'
import type { Paged, Problem, Solution } from '../lib/types'

const STEPS = [
  { icon: MessageSquareWarning, title: 'Share a real problem', text: 'Anything from a campus accessibility issue to a national agriculture challenge.' },
  { icon: Lightbulb, title: 'Propose solutions', text: 'Students, developers, researchers and startups explain how they would solve it.' },
  { icon: Star, title: 'Star what you support', text: 'One star per person per solution. The most supported ideas rise to the top.' },
  { icon: Handshake, title: 'Organizations step in', text: 'Verified organizations can offer to implement, sponsor or mentor promising solutions.' },
]

export default function Home() {
  useDocumentTitle()
  const { user } = useAuth()
  const meta = useMeta()
  const problems = useQuery({
    queryKey: ['problems', 'home', 'latest'],
    queryFn: () => api.get<Paged<Problem>>('/problems', { sort: 'latest', page_size: 6 }),
  })
  const topSolutions = useQuery({
    queryKey: ['solutions', 'home', 'top'],
    queryFn: () => api.get<Paged<Solution>>('/solutions', { sort: 'top', page_size: 6 }),
  })
  const domains = meta.data?.categories ?? []

  return (
    <>
      {/* ---------------------------------------------------------- Hero */}
      <section className="zellige border-b border-sand-200 bg-gradient-to-b from-white to-sand-50">
        <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:py-16">
          <div>
            <p className="eyebrow">BladiSolution Campus · Morocco</p>
            <h1 className="mt-3 text-4xl leading-[1.08] font-extrabold tracking-tight text-navy-900 sm:text-5xl">
              Real Problems. Collective Intelligence. <span className="text-atlas-700">Practical Solutions.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-sand-600">
              Discover real challenges, share innovative ideas, and help turn promising solutions into real-world impact. BladiSolution Campus brings together
              students, developers, startups, and organizations across Morocco.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link to="/problems" className={btn('primary', 'lg')}>
                Explore problems <ArrowRight className="size-4" aria-hidden />
              </Link>
              <Link to="/problems/new" className={btn('secondary', 'lg')}>
                <Plus className="size-4" aria-hidden /> Submit a problem
              </Link>
            </div>
            {!user && (
              <p className="mt-5 text-sm text-sand-600">
                Browsing is open to everyone.{' '}
                <Link to="/register" className="font-semibold text-atlas-700 hover:underline">
                  Join the community
                </Link>{' '}
                or{' '}
                <Link to="/login" className="font-semibold text-atlas-700 hover:underline">
                  sign in
                </Link>{' '}
                to post and star.
              </p>
            )}
          </div>

          <ol className="card divide-y divide-sand-100 shadow-xl shadow-navy-900/5" aria-label="How it works">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-4 p-4 sm:p-5">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-atlas-50 text-atlas-700">
                  <s.icon className="size-5" aria-hidden />
                </span>
                <div>
                  <h2 className="font-bold text-sand-900">
                    <span className="mr-1.5 text-sand-400 tabular-nums">{i + 1}.</span>
                    {s.title}
                  </h2>
                  <p className="mt-0.5 text-sm text-sand-600">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------------------------------------------------------- Feed */}
      <section className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-4 pt-12 sm:px-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="min-w-0">
          <SectionHeader
            title="Recent problems"
            subtitle="The latest challenges shared by the community"
            action={
              <Link to="/problems" className="text-sm font-semibold text-atlas-700 hover:underline">
                All problems →
              </Link>
            }
          />
          {problems.isLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          ) : problems.isError ? (
            <ErrorState error={problems.error} onRetry={() => problems.refetch()} />
          ) : !problems.data?.items.length ? (
            <EmptyState
              icon={Telescope}
              title="No problems yet"
              body="Be the first to share a real challenge you've seen on campus, in your city or in your field."
              action={
                <Link to="/problems/new" className={btn('primary', 'md')}>
                  Submit a problem
                </Link>
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {problems.data.items.map((p) => (
                <ProblemCard key={p.id} problem={p} />
              ))}
            </div>
          )}
        </div>

        <div className="min-w-0">
          <SectionHeader
            title="Most supported solutions"
            subtitle="Ranked by community stars"
            action={
              <Link to="/solutions?sort=top" className="text-sm font-semibold text-atlas-700 hover:underline">
                All solutions →
              </Link>
            }
          />
          <div className="card overflow-hidden">
            {topSolutions.isLoading ? (
              <ul className="divide-y divide-sand-100">
                {[0, 1, 2, 3].map((i) => (
                  <li key={i} className="p-4">
                    <Skeleton className="h-9" />
                  </li>
                ))}
              </ul>
            ) : topSolutions.isError ? (
              <div className="p-4">
                <ErrorState error={topSolutions.error} onRetry={() => topSolutions.refetch()} />
              </div>
            ) : !topSolutions.data?.items.length ? (
              <p className="p-5 text-sm text-sand-600">No solutions yet. Open a problem and propose the first one.</p>
            ) : (
              <ul className="divide-y divide-sand-100">
                {topSolutions.data.items.map((s) => (
                  <SolutionRow key={s.id} solution={s} />
                ))}
              </ul>
            )}
          </div>
          <p className="mt-2 text-xs text-sand-500">Stars show community interest. They are not a technical review or a guarantee of feasibility.</p>
        </div>
      </section>

      {/* ---------------------------------------------------------- Domains */}
      <section className="mx-auto max-w-7xl px-4 pt-14 sm:px-6" aria-labelledby="domains-title">
        <SectionHeader id="domains-title" title="Browse by domain" subtitle="Campus is where the community starts, not a limit on the problems it tackles" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {domains.map((c) => (
            <Link key={c.slug} to={`/problems?category=${c.slug}`} className="card group flex flex-col items-start gap-2 p-3.5 transition-colors hover:border-sand-300 sm:flex-row sm:items-center sm:gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl" style={{ backgroundColor: `${c.color}14`, color: c.color }}>
                <CategoryIcon icon={c.icon} className="size-[18px]" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm leading-tight font-bold text-sand-900 group-hover:text-navy-800">{c.name}</span>
                <span className="text-xs text-sand-500">
                  {c.problems} problem{c.problems === 1 ? '' : 's'}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------- Organizations + vision */}
      <section className="mx-auto grid max-w-7xl grid-cols-1 gap-4 px-4 pt-14 sm:px-6 lg:grid-cols-2">
        <div className="card flex flex-col p-6">
          <Building2 className="size-6 text-atlas-700" aria-hidden />
          <h2 className="mt-3 text-lg font-extrabold text-navy-900">For universities, companies and other organizations</h2>
          <p className="mt-2 flex-1 text-sm text-sand-600">
            Publish the challenges you care about, review what the community proposes and see which ideas have the most support. Once your organization account is
            verified, you can tell a solution's author that you'd like to discuss implementing, sponsoring or mentoring it. That is an expression of interest that
            starts a conversation, not a commitment.
          </p>
          <div className="mt-4">
            <Link to={user ? '/problems/new' : '/register'} className={btn('secondary', 'md')}>
              {user ? 'Publish a challenge' : 'Create an organization account'}
            </Link>
          </div>
        </div>
        <div className="card flex flex-col bg-navy-900 p-6 text-white">
          <img src="/BladiSolution_icon.png" alt="" aria-hidden className="size-10 rounded-lg bg-white p-1" />
          <h2 className="mt-3 text-lg font-extrabold">From Campus to BladiSolution</h2>
          <p className="mt-2 flex-1 text-sm text-navy-100">
            BladiSolution is a long-term vision: a platform where communities, institutions and companies across Morocco publish real problems and the people able to
            solve them can step forward. Campus is its first version, built with students and university communities, and open to every developer, researcher,
            startup and professional who wants to contribute.
          </p>
          {!user && (
            <div className="mt-4">
              <Link to="/register" className={btn('accent', 'md')}>
                Join BladiSolution Campus
              </Link>
            </div>
          )}
        </div>
      </section>
    </>
  )
}
