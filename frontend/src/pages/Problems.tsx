import { useInfiniteQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { Landmark, Lightbulb, Plus, Search, SearchX, SlidersHorizontal } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Page } from '../components/Layout'
import { ProblemCard } from '../components/cards'
import { Button, CardSkeleton, CategoryIcon, EmptyState, ErrorState, Tabs, btn } from '../components/ui'
import { useDebounced, useDocumentTitle, useMeta } from '../hooks/misc'
import { api } from '../lib/api'
import { PROBLEM_STATUS } from '../lib/format'
import type { Paged, Problem } from '../lib/types'

const SORTS = [
  { value: 'trending', label: 'Trending' },
  { value: 'latest', label: 'Latest' },
  { value: 'supported', label: 'Most supported' },
  { value: 'discussed', label: 'Most discussed' },
  { value: 'unsolved', label: 'Needs solutions' },
] as const
type Sort = (typeof SORTS)[number]['value']

export default function Problems() {
  const [params, setParams] = useSearchParams()
  const meta = useMeta()
  const sort = (params.get('sort') as Sort) || 'trending'
  const category = params.get('category') ?? ''
  const city = params.get('city') ?? ''
  const status = params.get('status') ?? ''
  const official = params.get('official') === 'true'
  const intent = params.get('intent')
  const [q, setQ] = useState(params.get('q') ?? '')
  const dq = useDebounced(q, 350)
  const [showFilters, setShowFilters] = useState(false)
  const cat = meta.data?.categories.find((c) => c.slug === category)
  useDocumentTitle(intent === 'propose' ? 'Propose a solution' : cat ? `${cat.name} problems` : 'Problems')

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  useEffect(() => {
    if ((params.get('q') ?? '') !== dq) set('q', dq)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq])

  const query = useInfiniteQuery({
    queryKey: ['problems', { sort, category, city, status, official, q: dq }],
    queryFn: ({ pageParam }) => api.get<Paged<Problem>>('/problems', { sort, category, city, status, official, q: dq, page: pageParam, page_size: 12 }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
  })
  const items = query.data?.pages.flatMap((p) => p.items) ?? []
  const total = query.data?.pages[0]?.total
  const activeFilters = [category, city, status, official ? '1' : ''].filter(Boolean).length

  return (
    <Page wide>
      {intent === 'propose' && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-saffron-100 bg-saffron-50 p-4">
          <Lightbulb className="mt-0.5 size-5 shrink-0 text-saffron-600" aria-hidden />
          <div className="text-sm">
            <p className="font-bold text-sand-900">Choose a problem to solve</p>
            <p className="text-sand-700">Open any problem below and click “Submit a Solution”. Problems with no solutions yet are listed first.</p>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{cat ? cat.name : official ? 'Official challenges' : 'Local problems'}</h1>
          <p className="mt-1 text-sand-600">{cat ? cat.description : 'Real issues reported by citizens and institutions — each one an open challenge.'}</p>
        </div>
        <Link to="/problems/new" className={btn('accent', 'md')}>
          <Plus className="size-4" aria-hidden /> Submit a Problem
        </Link>
      </div>

      {/* Category chips */}
      <div className="scrollbar-none -mx-4 mt-6 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        <button type="button" onClick={() => set('category', '')} className={clsx('chip shrink-0 !px-3 !py-1.5 !text-[13px]', !category && '!border-atlas-700 !bg-atlas-700 !text-white')}>
          All categories
        </button>
        {meta.data?.categories.map((c) => (
          <button
            key={c.slug}
            type="button"
            aria-pressed={category === c.slug}
            onClick={() => set('category', category === c.slug ? '' : c.slug)}
            className={clsx('chip shrink-0 !px-3 !py-1.5 !text-[13px]', category === c.slug && '!border-atlas-700 !bg-atlas-700 !text-white')}
          >
            <CategoryIcon icon={c.icon} className="size-3.5" />
            {c.name}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <Tabs label="Sort problems" value={sort} onChange={(v) => set('sort', v === 'trending' ? '' : v)} items={SORTS.map((s) => ({ ...s }))} className="lg:mx-0" />
        <div className="flex flex-1 gap-2 lg:justify-end">
          <div className="relative flex-1 lg:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-sand-400" aria-hidden />
            <label htmlFor="problem-q" className="sr-only">
              Filter problems
            </label>
            <input id="problem-q" className="input !pl-9" placeholder="Filter by keyword, neighbourhood…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Button variant="secondary" onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters}>
            <SlidersHorizontal className="size-4" aria-hidden /> Filters
            {activeFilters > 0 && <span className="rounded-full bg-atlas-700 px-1.5 text-[11px] text-white">{activeFilters}</span>}
          </Button>
        </div>
      </div>
      {showFilters && (
        <div className="card mt-3 grid grid-cols-1 gap-3 p-4 sm:grid-cols-4">
          <div>
            <label htmlFor="f-city" className="label">
              City
            </label>
            <select id="f-city" className="input" value={city} onChange={(e) => set('city', e.target.value)}>
              <option value="">All cities</option>
              {meta.data?.cities.map((c) => (
                <option key={c.name}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="f-status" className="label">
              Status
            </label>
            <select id="f-status" className="input" value={status} onChange={(e) => set('status', e.target.value)}>
              <option value="">Active (not archived)</option>
              {Object.entries(PROBLEM_STATUS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 self-end rounded-xl border border-sand-200 px-3 py-2.5 text-sm font-semibold text-sand-700">
            <input type="checkbox" checked={official} onChange={(e) => set('official', e.target.checked ? 'true' : '')} className="size-4 accent-atlas-700" />
            <Landmark className="size-4 text-atlas-700" aria-hidden /> Official challenges only
          </label>
          <Button variant="ghost" className="self-end" onClick={() => setParams(new URLSearchParams(sort !== 'trending' ? { sort } : {}), { replace: true })}>
            Clear filters
          </Button>
        </div>
      )}

      <p className="mt-5 mb-3 text-sm text-sand-500" aria-live="polite">
        {total !== undefined && `${total} problem${total === 1 ? '' : 's'}`}
      </p>
      {query.isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <CardSkeleton key={i} rows={4} />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No problems match these filters"
          body="Try another category or city — or be the first to report this problem."
          action={
            <Link to="/problems/new" className={btn('primary', 'md')}>
              Submit a Problem
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((p) => (
              <ProblemCard key={p.id} problem={p} />
            ))}
          </div>
          {query.hasNextPage && (
            <div className="mt-8 flex justify-center">
              <Button variant="secondary" loading={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>
                Load more problems
              </Button>
            </div>
          )}
        </>
      )}
    </Page>
  )
}
