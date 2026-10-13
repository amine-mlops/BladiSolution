import { useQuery } from '@tanstack/react-query'
import { Bell, Lightbulb, LogIn, MessageSquareWarning, Star } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { Page } from '../components/Layout'
import { ProblemCard, SolutionCard } from '../components/cards'
import { CardSkeleton, EmptyState, ErrorState, Tabs, btn } from '../components/ui'
import { useAuth } from '../hooks/auth'
import { useDocumentTitle } from '../hooks/misc'
import { api } from '../lib/api'
import type { Paged, Problem, Solution } from '../lib/types'

type Tab = 'problems' | 'solutions' | 'starred'

export default function MyActivity() {
  useDocumentTitle('My Activity')
  const { user, loading } = useAuth()
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const tab: Tab = raw === 'solutions' || raw === 'starred' ? raw : 'problems'
  const username = user?.username ?? ''

  const problems = useQuery({
    queryKey: ['problems', 'user', username, 'mine'],
    queryFn: () => api.get<Paged<Problem>>(`/users/${username}/problems`, { page_size: 50 }),
    enabled: !!user,
  })
  const solutions = useQuery({
    queryKey: ['solutions', 'user', username, 'mine'],
    queryFn: () => api.get<Paged<Solution>>(`/users/${username}/solutions`, { page_size: 50 }),
    enabled: !!user,
  })
  const starred = useQuery({
    queryKey: ['solutions', 'starred'],
    queryFn: () => api.get<Paged<Solution>>('/me/starred', { page_size: 50 }),
    enabled: !!user,
  })

  if (loading) return null
  if (!user)
    return (
      <Page>
        <EmptyState
          icon={LogIn}
          title="Sign in to see your activity"
          body="Your problems, your solutions and the solutions you've starred, in one place."
          action={
            <Link to="/login?next=/activity" className={btn('primary', 'md')}>
              Sign in
            </Link>
          }
        />
      </Page>
    )

  const current = tab === 'problems' ? problems : tab === 'solutions' ? solutions : starred
  return (
    <Page>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-navy-900 sm:text-3xl">My Activity</h1>
          <p className="mt-1 text-sand-600">Everything you've shared and supported on BladiSolution Campus.</p>
        </div>
        <Link to="/notifications" className={btn('secondary', 'md')}>
          <Bell className="size-4" aria-hidden /> Notifications
        </Link>
      </div>
      <Tabs
        label="My activity"
        value={tab}
        onChange={(t) => setParams(t === 'problems' ? {} : { tab: t }, { replace: true })}
        className="mt-6 w-fit max-w-full"
        items={[
          { value: 'problems' as Tab, label: 'My problems', count: problems.data?.total },
          { value: 'solutions' as Tab, label: 'My solutions', count: solutions.data?.total },
          { value: 'starred' as Tab, label: 'Starred', count: starred.data?.total },
        ]}
      />
      <div className="mt-5">
        {current.isLoading ? (
          <div className="space-y-3">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : current.isError ? (
          <ErrorState error={current.error} onRetry={() => current.refetch()} />
        ) : tab === 'problems' ? (
          problems.data?.items.length ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {problems.data.items.map((p) => (
                <ProblemCard key={p.id} problem={p} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={MessageSquareWarning}
              title="You haven't shared a problem yet"
              action={
                <Link to="/problems/new" className={btn('primary', 'md')}>
                  Submit a problem
                </Link>
              }
            />
          )
        ) : (tab === 'solutions' ? solutions : starred).data?.items.length ? (
          <div className="space-y-3">
            {(tab === 'solutions' ? solutions : starred).data!.items.map((s) => (
              <SolutionCard key={s.id} solution={s} showProblem />
            ))}
          </div>
        ) : tab === 'solutions' ? (
          <EmptyState
            icon={Lightbulb}
            title="You haven't proposed a solution yet"
            body="Problems with no solutions yet are a good place to start."
            action={
              <Link to="/problems?sort=unsolved" className={btn('primary', 'md')}>
                Find a problem to solve
              </Link>
            }
          />
        ) : (
          <EmptyState
            icon={Star}
            title="No starred solutions"
            body="Star the solutions you believe in. It helps them rise in the rankings."
            action={
              <Link to="/solutions?sort=top" className={btn('secondary', 'md')}>
                Browse solutions
              </Link>
            }
          />
        )}
      </div>
    </Page>
  )
}
