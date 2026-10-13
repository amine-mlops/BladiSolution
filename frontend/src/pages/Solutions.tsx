import { useInfiniteQuery } from '@tanstack/react-query'
import { Lightbulb, Search, SearchX } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Page } from '../components/Layout'
import { SolutionCard } from '../components/cards'
import { Button, CardSkeleton, EmptyState, ErrorState, Tabs, btn } from '../components/ui'
import { useDebounced, useDocumentTitle, useMeta } from '../hooks/misc'
import { api } from '../lib/api'
import type { Paged, Solution } from '../lib/types'

const SORTS = [
  { value: 'top', label: 'Most supported' },
  { value: 'latest', label: 'Newest' },
] as const
type Sort = (typeof SORTS)[number]['value']

export default function Solutions() {
  useDocumentTitle('Solutions')
  const meta = useMeta()
  const [params, setParams] = useSearchParams()
  const rawSort = params.get('sort')
  const sort: Sort = SORTS.some((s) => s.value === rawSort) ? (rawSort as Sort) : 'top'
  const category = params.get('category') ?? ''
  const [q, setQ] = useState(params.get('q') ?? '')
  const dq = useDebounced(q, 350)
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    setParams(next, { replace: true })
  }
  useEffect(() => {
    if ((params.get('q') ?? '') !== dq) set('q', dq)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq])

  const query = useInfiniteQuery({
    queryKey: ['solutions', 'feed', sort, category, dq],
    queryFn: ({ pageParam }) => api.get<Paged<Solution>>('/solutions', { sort, category, q: dq, page: pageParam, page_size: 12 }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
  })
  const items = query.data?.pages.flatMap((p) => p.items) ?? []
  const total = query.data?.pages[0]?.total
  const filtered = !!(category || dq)

  return (
    <Page wide>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-navy-900 sm:text-3xl">Solutions</h1>
          <p className="mt-1 max-w-2xl text-sand-600">
            Every proposal from the community. “Most supported” ranks by the number of people who starred a solution; ties go to the newest.
          </p>
        </div>
        <Link to="/problems?sort=unsolved" className={btn('primary', 'md')}>
          <Lightbulb className="size-4" aria-hidden /> Propose a solution
        </Link>
      </div>

      <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center">
        <Tabs label="Sort solutions" value={sort} onChange={(v) => set('sort', v === 'top' ? '' : v)} items={SORTS.map((s) => ({ ...s }))} className="w-fit max-w-full" />
        <div className="flex flex-1 flex-col gap-2 sm:flex-row md:justify-end">
          <label htmlFor="s-cat" className="sr-only">
            Domain
          </label>
          <select id="s-cat" className="input sm:max-w-60" value={category} onChange={(e) => set('category', e.target.value)}>
            <option value="">All domains</option>
            {meta.data?.categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-sand-400" aria-hidden />
            <label htmlFor="solution-q" className="sr-only">
              Search solutions
            </label>
            <input id="solution-q" type="search" className="input !pl-9" placeholder="Search solutions…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
      </div>

      <p className="mt-5 mb-3 text-sm text-sand-500" aria-live="polite">
        {total !== undefined && `${total} solution${total === 1 ? '' : 's'}`}
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
        <EmptyState
          icon={SearchX}
          title={filtered ? 'No solutions match your search' : 'No solutions yet'}
          body={filtered ? 'Try another domain or different words.' : 'Pick a problem and propose the first solution.'}
          action={
            <Link to="/problems?sort=unsolved" className={btn('primary', 'md')}>
              Find a problem to solve
            </Link>
          }
        />
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
    </Page>
  )
}
