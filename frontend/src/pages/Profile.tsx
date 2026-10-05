import { useQuery } from '@tanstack/react-query'
import { BadgeCheck, CalendarDays, Globe, Lightbulb, MapPin, MessageSquareWarning, Pencil, Rocket, Star, Trophy, Users } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { FollowUserButton, ReportButton } from '../components/actions'
import { ProblemCard, SolutionCard } from '../components/cards'
import { Page } from '../components/Layout'
import { Avatar, CardSkeleton, CategoryBadge, EmptyState, ErrorState, PageLoader, Tabs, btn } from '../components/ui'
import { useDocumentTitle, useMeta } from '../hooks/misc'
import { api } from '../lib/api'
import { compact, formatDate, num, roleLabel } from '../lib/format'
import type { Paged, Problem, Profile as TProfile, Solution } from '../lib/types'

export default function Profile() {
  const { username = '' } = useParams()
  const meta = useMeta()
  const [tab, setTab] = useState<'solutions' | 'problems'>('solutions')
  const q = useQuery({ queryKey: ['profile', username], queryFn: () => api.get<TProfile>(`/users/${username}`) })
  const sols = useQuery({ queryKey: ['solutions', 'user', username], queryFn: () => api.get<Paged<Solution>>(`/users/${username}/solutions`, { page_size: 30 }), enabled: tab === 'solutions' })
  const probs = useQuery({ queryKey: ['problems', 'user', username], queryFn: () => api.get<Paged<Problem>>(`/users/${username}/problems`, { page_size: 30 }), enabled: tab === 'problems' })
  useDocumentTitle(q.data?.name)
  if (q.isLoading) return <PageLoader />
  if (q.isError || !q.data)
    return (
      <Page>
        <ErrorState error={q.error} />
      </Page>
    )
  const u = q.data
  const st = u.stats
  const impact = [
    { icon: Rocket, label: 'Implemented solutions', value: st.implemented, tone: 'text-atlas-700' },
    { icon: Users, label: 'Citizens impacted', value: st.citizens_impacted, tone: 'text-atlas-700' },
    { icon: Star, label: 'Community stars', value: st.stars, tone: 'text-saffron-600' },
    { icon: Trophy, label: 'Selected by institutions', value: st.selected, tone: 'text-saffron-600' },
  ]
  const activity = [
    ['Solutions', st.solutions],
    ['Problems reported', st.problems],
    ['Collaborations', st.collaborations],
    ['Comments', st.comments],
    ['Followers', st.followers],
  ] as const
  const cats = meta.data?.categories ?? []

  return (
    <Page wide>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-5">
          <section className="card overflow-hidden">
            <div className="zellige h-20 bg-atlas-50" aria-hidden />
            <div className="-mt-10 px-5 pb-5">
              <Avatar user={u} size={80} className="ring-4 ring-white" />
              <h1 className="mt-3 flex items-center gap-1.5 text-xl font-extrabold text-sand-900">
                {u.name}
                {u.verified && <BadgeCheck className="size-5 text-atlas-600" aria-label="Verified" />}
              </h1>
              <p className="text-sm font-semibold text-sand-700">{u.headline || roleLabel(u)}</p>
              <p className="mt-0.5 text-xs font-semibold text-sand-500">{roleLabel(u)}</p>
              <div className="mt-3 space-y-1 text-sm text-sand-600">
                {u.city && (
                  <p className="flex items-center gap-1.5">
                    <MapPin className="size-4 text-sand-400" aria-hidden /> {u.city}, Morocco
                  </p>
                )}
                {u.website && (
                  <a href={u.website} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-1.5 text-atlas-700 hover:underline">
                    <Globe className="size-4" aria-hidden /> {u.website.replace(/^https?:\/\//, '')}
                  </a>
                )}
                <p className="flex items-center gap-1.5">
                  <CalendarDays className="size-4 text-sand-400" aria-hidden /> Joined {formatDate(u.created_at)}
                </p>
              </div>
              {u.bio && <p className="mt-4 text-sm leading-relaxed text-sand-700">{u.bio}</p>}
              <div className="mt-5 flex gap-2">
                {u.is_me ? (
                  <Link to="/settings" className={btn('secondary', 'md', 'flex-1')}>
                    <Pencil className="size-4" aria-hidden /> Edit profile
                  </Link>
                ) : (
                  <>
                    <div className="flex-1 [&>button]:w-full">
                      <FollowUserButton username={u.username} following={u.is_following} />
                    </div>
                    <ReportButton targetType="user" targetId={u.id} />
                  </>
                )}
              </div>
            </div>
          </section>

          {u.skills.length > 0 && (
            <section className="card p-5">
              <h2 className="text-sm font-bold text-sand-900">Skills</h2>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {u.skills.map((s) => (
                  <Link key={s} to={`/search?q=${encodeURIComponent(s)}`} className="chip hover:border-atlas-300">
                    {s}
                  </Link>
                ))}
              </div>
            </section>
          )}

          {u.focus_categories.length > 0 && (
            <section className="card p-5">
              <h2 className="text-sm font-bold text-sand-900">Focus areas</h2>
              <ul className="mt-3 space-y-2">
                {u.focus_categories.map((f) => {
                  const c = cats.find((x) => x.slug === f.slug)
                  return c ? (
                    <li key={f.slug} className="flex items-center justify-between">
                      <CategoryBadge category={c} link />
                      <span className="text-xs font-bold text-sand-500">{f.count}</span>
                    </li>
                  ) : null
                })}
              </ul>
            </section>
          )}
        </aside>

        <div className="min-w-0 space-y-6">
          <section aria-labelledby="impact-title">
            <h2 id="impact-title" className="sr-only">
              Civic impact
            </h2>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {impact.map((i) => (
                <div key={i.label} className="card p-4">
                  <i.icon className={`size-5 ${i.tone}`} aria-hidden />
                  <div className="mt-2 text-2xl font-extrabold text-sand-900 tabular-nums">{compact(i.value)}</div>
                  <div className="text-xs font-semibold text-sand-500">{i.label}</div>
                </div>
              ))}
            </div>
            <div className="card mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3.5">
              <span className="text-sm font-bold text-sand-900">
                Civic reputation <span className="ml-1 rounded-md bg-atlas-50 px-1.5 text-atlas-800 tabular-nums">{num(st.reputation)}</span>
              </span>
              {activity.map(([k, v]) => (
                <span key={k} className="text-sm text-sand-600">
                  <span className="font-bold text-sand-900 tabular-nums">{v}</span> {k}
                </span>
              ))}
            </div>
            <p className="mt-2 text-xs text-sand-500">Reputation weighs implemented and selected solutions far above stars — real outcomes over popularity.</p>
          </section>

          <Tabs
            label="Contributions"
            value={tab}
            onChange={setTab}
            items={[
              { value: 'solutions', label: 'Solutions', count: st.solutions },
              { value: 'problems', label: 'Problems', count: st.problems },
            ]}
            className="w-fit"
          />
          {tab === 'solutions' ? (
            sols.isLoading ? (
              <CardSkeleton />
            ) : !sols.data?.items.length ? (
              <EmptyState icon={Lightbulb} title="No solutions yet" body={u.is_me ? 'Pick an open problem and propose your first solution.' : `${u.name} hasn't proposed a solution yet.`} />
            ) : (
              <div className="space-y-3">
                {sols.data.items.map((s) => (
                  <SolutionCard key={s.id} solution={s} showProblem />
                ))}
              </div>
            )
          ) : probs.isLoading ? (
            <CardSkeleton />
          ) : !probs.data?.items.length ? (
            <EmptyState icon={MessageSquareWarning} title="No problems reported" />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {probs.data.items.map((p) => (
                <ProblemCard key={p.id} problem={p} />
              ))}
            </div>
          )}
        </div>
      </div>
    </Page>
  )
}
