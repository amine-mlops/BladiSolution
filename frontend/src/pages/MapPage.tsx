import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { HandHeart, Lightbulb, MapPin } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ProblemsMap } from '../components/MapView'
import { CategoryIcon, ErrorState, PageLoader, Segmented } from '../components/ui'
import { useDocumentTitle, useMeta } from '../hooks/misc'
import { api } from '../lib/api'
import type { MapPoint } from '../lib/types'

export default function MapPage() {
  useDocumentTitle('Problem map')
  const meta = useMeta()
  const [category, setCategory] = useState('')
  const [mode, setMode] = useState<'problems' | 'intensity'>('problems')
  const q = useQuery({ queryKey: ['map', category], queryFn: () => api.get<MapPoint[]>('/problems/map', { category }) })
  const colors = Object.fromEntries((meta.data?.categories ?? []).map((c) => [c.slug, c.color]))
  if (q.isError)
    return (
      <div className="p-6">
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      </div>
    )
  const points = q.data ?? []
  const sorted = [...points].sort((a, b) => b.supporters_count - a.supporters_count)

  return (
    <div className="grid grid-cols-1 h-[calc(100dvh-4rem-4.5rem)] lg:h-[calc(100dvh-4rem)] lg:grid-cols-[360px_1fr]">
      <aside className="hidden flex-col overflow-hidden border-r border-sand-200 bg-white lg:flex">
        <div className="space-y-3 border-b border-sand-100 p-4">
          <h1 className="text-lg font-extrabold">Problem map</h1>
          <Segmented
            label="Map mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'problems', label: 'Problems' },
              { value: 'intensity', label: 'City intensity' },
            ]}
          />
          <label htmlFor="map-cat" className="sr-only">
            Category
          </label>
          <select id="map-cat" className="input !py-2" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {meta.data?.categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-sand-500">{points.length} problems · marker size shows urgency</p>
        </div>
        <ul className="flex-1 divide-y divide-sand-100 overflow-y-auto">
          {sorted.map((p) => {
            const c = meta.data?.categories.find((x) => x.slug === p.category)
            return (
              <li key={p.id}>
                <Link to={`/problems/${p.id}`} className="flex gap-3 px-4 py-3 hover:bg-sand-50">
                  <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg" style={{ backgroundColor: `${c?.color}1a`, color: c?.color }}>
                    {c && <CategoryIcon icon={c.icon} className="size-4" />}
                  </span>
                  <span className="min-w-0">
                    <span className="line-clamp-2 text-sm leading-snug font-semibold text-sand-900">{p.title}</span>
                    <span className="mt-0.5 flex items-center gap-3 text-xs text-sand-500">
                      <span className="inline-flex items-center gap-0.5">
                        <MapPin className="size-3" aria-hidden /> {p.city}
                      </span>
                      <span className="inline-flex items-center gap-0.5">
                        <HandHeart className="size-3" aria-hidden /> {p.supporters_count}
                      </span>
                      <span className="inline-flex items-center gap-0.5">
                        <Lightbulb className="size-3" aria-hidden /> {p.solutions_count}
                      </span>
                    </span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </aside>
      <div className="relative">
        <div className="absolute inset-x-3 top-3 z-[500] flex gap-2 lg:hidden">
          <select aria-label="Category" className="input !py-2 shadow-md" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {meta.data?.categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setMode(mode === 'problems' ? 'intensity' : 'problems')}
            className="shrink-0 rounded-xl border border-sand-300 bg-white px-3 text-sm font-semibold shadow-md"
          >
            {mode === 'problems' ? 'Intensity' : 'Problems'}
          </button>
        </div>
        {q.isLoading || !meta.data ? (
          <PageLoader />
        ) : (
          <ProblemsMap points={points} colors={colors} mode={mode} cityCenters={meta.data.cities} />
        )}
        <div className="absolute bottom-4 left-3 z-[500] rounded-xl border border-sand-200 bg-white/95 p-3 text-xs shadow-md">
          {mode === 'intensity' ? (
            <ul className="space-y-1.5">
              {[
                ['#dc2626', 'High number of problems'],
                ['#ea580c', 'Medium'],
                ['#16a34a', 'Low'],
              ].map(([c, l]) => (
                <li key={l} className="flex items-center gap-2">
                  <span className="size-3 rounded-full" style={{ background: c }} aria-hidden /> {l}
                </li>
              ))}
            </ul>
          ) : (
            <ul className={clsx('grid gap-x-4 gap-y-1', category ? 'grid-cols-1' : 'grid-cols-2')}>
              {(meta.data?.categories ?? [])
                .filter((c) => !category || c.slug === category)
                .filter((c) => points.some((p) => p.category === c.slug))
                .map((c) => (
                  <li key={c.slug} className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-full" style={{ background: c.color }} aria-hidden /> {c.name}
                  </li>
                ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
