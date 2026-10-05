import { useInfiniteQuery } from '@tanstack/react-query'
import { Lightbulb, SearchX } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Page } from '../components/Layout'
import { SolutionCard } from '../components/cards'
import { Button, CardSkeleton, EmptyState, ErrorState, Tabs, btn } from '../components/ui'
import { useDebounced, useDocumentTitle, useMeta } from '../hooks/misc'
import { api } from '../lib/api'
import { SOLUTION_FLOW, SOLUTION_STATUS } from '../lib/format'
import type { Paged, Solution } from '../lib/types'

const SORTS = [
  { value: 'latest', label: 'Latest' },
  { value: 'trending', label: 'Trending' },
  { value: 'top', label: 'Top' },
  { value: 'discussed', label: 'Discussed' },
  { value: 'implemented', label: 'Implemented' },
] as const
type Sort = (typeof SORTS)[number]['value']

export default function Solutions() {
  useDocumentTitle('Latest civic solutions')
  const meta = useMeta()
  const [params, setParams] = useSearchParams()
  const sort = (params.get('sort') as Sort) || 'latest'
  const f = {
    category: params.get('category') ?? '',
    city: params.get('city') ?? '',
    status: params.get('status') ?? '',
    since: params.get('since') ?? '',
  }
  const [neighborhood, setNeighborhood] = useState(params.get('neighborhood') ?? '')
  const [skill, setSkill] = useState(params.get('skill') ?? '')
  const dn = useDebounced(neighborhood, 400)
  const ds = useDebounced(skill, 400)
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    setParams(next, { replace: true })
  }
  const query = useInfiniteQuery({
    queryKey: ['solutions', 'feed', sort, f, dn, ds],
    queryFn: ({ pageParam }) =>
      api.get<Paged<Solution>>('/solutions', { sort, ...f, neighborhood: dn, skill: ds, page: pageParam, page_size: 12 }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
  })
  const items = query.data?.pages.flatMap((p) => p.items) ?? []
  const total = query.data?.pages[0]?.total

  return (
    <Page wide>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{sort === 'implemented' ? 'Implemented solutions' : 'Latest civic solutions'}</h1>
          <p className="mt-1 text-sand-600">Every proposal from the community, across all cities and challenge areas.</p>
        </div>
        <Link to="/problems?sort=unsolved&intent=propose" className={btn('primary', 'md')}>
          <Lightbulb className="size-4" aria-hidden /> Propose a Solution
        </Link>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="card h-fit space-y-4 p-4 lg:sticky lg:top-20" aria-label="Filters">
          <h2 className="text-sm font-bold text-sand-900">Filters</h2>
          <div>
            <label htmlFor="s-cat" className="label !text-xs">
              Category
            </label>
            <select id="s-cat" className="input !py-2" value={f.category} onChange={(e) => set('category', e.target.value)}>
              <option value="">All categories</option>
              {meta.data?.categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
            <div>
              <label htmlFor="s-city" className="label !text-xs">
                City
              </label>
              <select id="s-city" className="input !py-2" value={f.city} onChange={(e) => set('city', e.target.value)}>
                <option value="">All cities</option>
                {meta.data?.cities.map((c) => (
                  <option key={c.name}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="s-n" className="label !text-xs">
                Neighbourhood
              </label>
              <input
                id="s-n"
                className="input !py-2"
                value={neighborhood}
                onChange={(e) => {
                  setNeighborhood(e.target.value)
                  set('neighborhood', e.target.value)
                }}
                placeholder="e.g. Agdal"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
            <div>
              <label htmlFor="s-status" className="label !text-xs">
                Status
              </label>
              <select id="s-status" className="input !py-2" value={f.status} onChange={(e) => set('status', e.target.value)}>
                <option value="">Any status</option>
                {SOLUTION_FLOW.map((s) => (
                  <option key={s} value={s}>
                    {SOLUTION_STATUS[s].label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="s-since" className="label !text-xs">
                Date
              </label>
              <select id="s-since" className="input !py-2" value={f.since} onChange={(e) => set('since', e.target.value)}>
                <option value="">Any time</option>
                <option value="24h">Last 24 hours</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="s-skill" className="label !text-xs">
              Skill
            </label>
            <input
              id="s-skill"
              list="skill-list"
              className="input !py-2"
              value={skill}
              onChange={(e) => {
                setSkill(e.target.value)
                set('skill', e.target.value)
              }}
              placeholder="e.g. Python, IoT"
            />
            <datalist id="skill-list">
              {meta.data?.skills.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => {
              setNeighborhood('')
              setSkill('')
              setParams(sort !== 'latest' ? { sort } : {}, { replace: true })
            }}
          >
            Clear filters
          </Button>
        </aside>

        <div className="min-w-0">
          <Tabs label="Sort solutions" value={sort} onChange={(v) => set('sort', v === 'latest' ? '' : v)} items={SORTS.map((s) => ({ ...s }))} className="w-fit max-w-full" />
          <p className="mt-4 mb-3 text-sm text-sand-500" aria-live="polite">
            {total !== undefined && `${total} solution${total === 1 ? '' : 's'}`}
            {sort === 'trending' && ' · ranked by recent stars, comments and freshness'}
          </p>
          {query.isLoading ? (
            <div className="space-y-3">
              {[0, 1, 2, 3].map((i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          ) : query.isError ? (
            <ErrorState error={query.error} onRetry={() => query.refetch()} />
          ) : items.length === 0 ? (
            <EmptyState icon={SearchX} title="No solutions match these filters" body="Try widening your filters, or propose the first solution yourself." />
          ) : (
            <div className="space-y-3">
              {items.map((s) => (
                <SolutionCard key={s.id} solution={s} showProblem highlightNew={sort === 'latest'} />
              ))}
              {query.hasNextPage && (
                <div className="flex justify-center pt-4">
                  <Button variant="secondary" loading={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>
                    Load more
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Page>
  )
}
