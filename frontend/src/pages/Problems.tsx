import { useInfiniteQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { Lightbulb, Plus, Search, SearchX } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Page } from '../components/Layout'
import { ProblemCard } from '../components/cards'
import { Button, CardSkeleton, CategoryIcon, EmptyState, ErrorState, Tabs, btn } from '../components/ui'
import { useDebounced, useDocumentTitle, useMeta } from '../hooks/misc'
import { api } from '../lib/api'
import type { Paged, Problem } from '../lib/types'

const SORTS = [
  { value: 'latest', label: 'Newest' },
  { value: 'supported', label: 'Most supported' },
  { value: 'unsolved', label: 'Needs solutions' },
] as const
type Sort = (typeof SORTS)[number]['value']

export default function Problems() {
  const [params, setParams] = useSearchParams()
  const meta = useMeta()
  const rawSort = params.get('sort')
  const sort: Sort = SORTS.some((s) => s.value === rawSort) ? (rawSort as Sort) : 'latest'
  const category = params.get('category') ?? ''
  const intent = params.get('intent') ?? (sort === 'unsolved' ? 'propose' : null)
  const [q, setQ] = useState(params.get('q') ?? '')
  const dq = useDebounced(q, 350)
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
    queryKey: ['problems', { sort, category, q: dq }],
    queryFn: ({ pageParam }) => api.get<Paged<Problem>>('/problems', { sort, category, q: dq, page: pageParam, page_size: 12 }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
  })
  const items = query.data?.pages.flatMap((p) => p.items) ?? []
  const total = query.data?.pages[0]?.total
  const filtered = !!(category || dq)

  return (
    <Page wide>
      {intent === 'propose' && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-saffron-100 bg-saffron-50 p-4">
          <Lightbulb className="mt-0.5 size-5 shrink-0 text-saffron-600" aria-hidden />
          <div className="text-sm">
            <p className="font-bold text-sand-900">Choose a problem to solve</p>
            <p className="text-sand-700">Open any problem below, read the existing solutions, then click “Propose a solution”. Problems with no solutions yet are listed first.</p>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-navy-900 sm:text-3xl">{cat ? cat.name : 'Problems'}</h1>
          <p className="mt-1 text-sand-600">{cat ? cat.description : 'Real challenges shared by students, professionals and organizations. Each one is open for solutions.'}</p>
        </div>
        <Link to="/problems/new" className={btn('primary', 'md')}>
          <Plus className="size-4" aria-hidden /> Submit a Problem
        </Link>
      </div>

      {/* Category chips */}
      <div className="scrollbar-none -mx-4 mt-6 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        <button type="button" aria-pressed={!category} onClick={() => set('category', '')} className={clsx('chip shrink-0 !px-3 !py-1.5 !text-[13px]', !category && '!border-navy-900 !bg-navy-900 !text-white')}>
          All domains
        </button>
        {meta.data?.categories.map((c) => (
          <button
            key={c.slug}
            type="button"
            aria-pressed={category === c.slug}
            onClick={() => set('category', category === c.slug ? '' : c.slug)}
            className={clsx('chip shrink-0 !px-3 !py-1.5 !text-[13px]', category === c.slug && '!border-navy-900 !bg-navy-900 !text-white')}
          >
            <CategoryIcon icon={c.icon} className="size-3.5" />
            {c.name}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Tabs label="Sort problems" value={sort} onChange={(v) => set('sort', v === 'latest' ? '' : v)} items={SORTS.map((s) => ({ ...s }))} className="w-fit max-w-full" />
        <div className="relative flex-1 sm:ml-auto sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-sand-400" aria-hidden />
          <label htmlFor="problem-q" className="sr-only">
            Search problems
          </label>
          <input id="problem-q" type="search" className="input !pl-9" placeholder="Search titles and descriptions…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

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
          title={filtered ? 'No problems match your search' : 'No problems yet'}
          body={filtered ? 'Try another domain or different words, or share this problem yourself.' : 'Be the first to share a real challenge.'}
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
