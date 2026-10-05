import { useQuery } from '@tanstack/react-query'
import { Hash, Search as SearchIcon, SearchX } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PersonRow, ProblemCard, SolutionCard } from '../components/cards'
import { Page } from '../components/Layout'
import { CardSkeleton, EmptyState, ErrorState, Tabs } from '../components/ui'
import { useDocumentTitle } from '../hooks/misc'
import { api } from '../lib/api'
import type { Problem, Solution, UserWithStats } from '../lib/types'

type Kind = 'all' | 'problems' | 'solutions' | 'users'
interface Results {
  problems?: Problem[]
  solutions?: Solution[]
  users?: UserWithStats[]
  tags?: string[]
}
const EXAMPLES = ['waste Rabat', 'youth employment', 'transportation', 'Python', 'urban planning', 'solar']

export default function Search() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const kind = (params.get('type') as Kind) || 'all'
  const [draft, setDraft] = useState(q)
  useEffect(() => setDraft(q), [q])
  useDocumentTitle(q ? `Search: ${q}` : 'Search')
  const res = useQuery({
    queryKey: ['search', q],
    queryFn: () => api.get<Results>('/search', { q, type: 'all', limit: 20 }),
    enabled: q.trim().length > 0,
  })
  const d = res.data
  const counts = { problems: d?.problems?.length ?? 0, solutions: d?.solutions?.length ?? 0, users: d?.users?.length ?? 0 }
  const nothing = d && counts.problems + counts.solutions + counts.users === 0
  const go = (value: string) => setParams(value ? { q: value } : {})

  return (
    <Page>
      <form
        role="search"
        className="relative"
        onSubmit={(e) => {
          e.preventDefault()
          go(draft.trim())
        }}
      >
        <SearchIcon className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-sand-400" aria-hidden />
        <label htmlFor="search-page" className="sr-only">
          Search
        </label>
        <input id="search-page" autoFocus={!q} value={draft} onChange={(e) => setDraft(e.target.value)} className="input !rounded-2xl !py-3.5 !pl-12 !text-base" placeholder="Search problems, solutions, people, skills and tags…" />
      </form>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-sand-500">Try:</span>
        {EXAMPLES.map((e) => (
          <button key={e} type="button" onClick={() => go(e)} className="chip hover:border-atlas-300 hover:text-atlas-800">
            {e}
          </button>
        ))}
      </div>

      {q && (
        <div className="mt-8">
          <Tabs
            label="Result types"
            value={kind}
            onChange={(v) => setParams(v === 'all' ? { q } : { q, type: v })}
            items={[
              { value: 'all' as Kind, label: 'All' },
              { value: 'problems' as Kind, label: 'Problems', count: counts.problems },
              { value: 'solutions' as Kind, label: 'Solutions', count: counts.solutions },
              { value: 'users' as Kind, label: 'People & orgs', count: counts.users },
            ]}
            className="w-fit max-w-full"
          />
          {d?.tags && d.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              <Hash className="size-4 text-sand-400" aria-hidden />
              {d.tags.map((t) => (
                <button key={t} type="button" className="chip hover:border-atlas-300" onClick={() => go(t)}>
                  {t}
                </button>
              ))}
            </div>
          )}
          <div className="mt-6 space-y-10">
            {res.isLoading ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <CardSkeleton />
                <CardSkeleton />
              </div>
            ) : res.isError ? (
              <ErrorState error={res.error} onRetry={() => res.refetch()} />
            ) : nothing ? (
              <EmptyState
                icon={SearchX}
                title={`No results for “${q}”`}
                body={
                  <>
                    Try fewer words or a city name. Can't find your problem?{' '}
                    <Link to="/problems/new" className="font-semibold text-atlas-700 hover:underline">
                      Submit it
                    </Link>
                    .
                  </>
                }
              />
            ) : (
              <>
                {(kind === 'all' || kind === 'problems') && counts.problems > 0 && (
                  <section>
                    <h2 className="mb-3 font-bold">Problems</h2>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      {d!.problems!.slice(0, kind === 'all' ? 4 : undefined).map((p) => (
                        <ProblemCard key={p.id} problem={p} />
                      ))}
                    </div>
                  </section>
                )}
                {(kind === 'all' || kind === 'solutions') && counts.solutions > 0 && (
                  <section>
                    <h2 className="mb-3 font-bold">Solutions</h2>
                    <div className="space-y-3">
                      {d!.solutions!.slice(0, kind === 'all' ? 4 : undefined).map((s) => (
                        <SolutionCard key={s.id} solution={s} showProblem />
                      ))}
                    </div>
                  </section>
                )}
                {(kind === 'all' || kind === 'users') && counts.users > 0 && (
                  <section>
                    <h2 className="mb-3 font-bold">People & organizations</h2>
                    <div className="card overflow-hidden">
                      <ul className="divide-y divide-sand-100">
                        {d!.users!.map((u) => (
                          <PersonRow key={u.id} user={u} />
                        ))}
                      </ul>
                    </div>
                  </section>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </Page>
  )
}
