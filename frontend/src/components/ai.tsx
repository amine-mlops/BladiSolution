import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { Activity as Pulse, BrainCircuit, CalendarClock, Hash, MapPin, Sparkles, Target, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { LEVEL, compact } from '../lib/format'
import type { AISummary, ContributorMatch, ProblemAnalysis } from '../lib/types'
import { Avatar, Skeleton } from './ui'

export function ProviderTag({ provider, fallback }: { provider: string; fallback?: string }) {
  return (
    <span
      className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold', provider === 'claude' ? 'bg-violet-50 text-violet-700' : 'bg-sand-100 text-sand-600')}
      title={fallback ? 'AI service unavailable — local analysis shown' : undefined}
    >
      <Sparkles className="size-3" aria-hidden />
      {provider === 'claude' ? 'Claude' : 'Local AI engine'}
    </span>
  )
}

export function AnalysisCard({ analysis, title = 'AI Problem Analysis', compactView = false }: { analysis: ProblemAnalysis; title?: string; compactView?: boolean }) {
  const rows: { icon: typeof Target; label: string; value: React.ReactNode }[] = [
    {
      icon: Target,
      label: 'Category',
      value: (
        <>
          {analysis.category_name}
          {analysis.subcategory && analysis.subcategory !== 'General' && <span className="text-sand-500"> · {analysis.subcategory}</span>}
        </>
      ),
    },
    { icon: CalendarClock, label: 'Frequency', value: analysis.frequency ?? 'Not specified' },
    { icon: Pulse, label: 'Urgency', value: <span className={LEVEL[analysis.urgency].tone}>{LEVEL[analysis.urgency].label}</span> },
    { icon: Sparkles, label: 'Potential impact', value: analysis.impact_areas.join(' + ') },
    {
      icon: Users,
      label: 'Affected',
      value: (
        <>
          {analysis.affected_groups.join(', ')}
          {analysis.affected_estimate > 0 && <span className="text-sand-500"> · ~{compact(analysis.affected_estimate)} people</span>}
        </>
      ),
    },
  ]
  if (analysis.locations.length) rows.push({ icon: MapPin, label: 'Locations', value: analysis.locations.join(', ') })
  return (
    <section className="card overflow-hidden" aria-label={title}>
      <div className="flex items-center justify-between gap-2 border-b border-sand-100 bg-gradient-to-r from-violet-50/70 to-transparent px-5 py-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-sand-900">
          <BrainCircuit className="size-4 text-violet-600" aria-hidden /> {title}
        </h3>
        <ProviderTag provider={analysis.provider} fallback={analysis.fallback_reason} />
      </div>
      <div className="px-5 py-4">
        {!compactView && <p className="mb-3 text-sm text-sand-700">{analysis.summary}</p>}
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
          {rows.map((r) => (
            <div key={r.label} className="flex gap-2.5">
              <r.icon className="mt-0.5 size-4 shrink-0 text-sand-400" aria-hidden />
              <div className="min-w-0">
                <dt className="text-[11px] font-bold tracking-wide text-sand-500 uppercase">{r.label}</dt>
                <dd className="text-sm font-semibold text-sand-800">{r.value}</dd>
              </div>
            </div>
          ))}
        </dl>
        {analysis.keywords.length > 0 && (
          <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
            <Hash className="size-3.5 text-sand-400" aria-hidden />
            {analysis.keywords.map((k) => (
              <span key={k} className="chip">
                {k}
              </span>
            ))}
          </div>
        )}
        {analysis.fallback_reason && (
          <p className="mt-3 rounded-lg bg-sand-50 px-3 py-2 text-xs text-sand-600">AI analysis is temporarily unavailable — showing the local engine's analysis.</p>
        )}
      </div>
    </section>
  )
}

export function SummaryCard({ summary }: { summary: AISummary }) {
  const rows = [
    ['Problem', summary.problem],
    ['Solution', summary.solution],
    ['How it works', summary.how],
    ['Potential impact', summary.impact],
    ['Required', summary.required],
  ].filter(([, v]) => v)
  return (
    <section className="overflow-hidden rounded-2xl border border-violet-200/70 bg-gradient-to-br from-violet-50/80 via-white to-white" aria-label="AI Summary">
      <div className="flex items-center justify-between px-5 pt-4">
        <h2 className="flex items-center gap-2 text-sm font-bold text-sand-900">
          <BrainCircuit className="size-4 text-violet-600" aria-hidden /> AI Summary
        </h2>
        <ProviderTag provider={summary.provider} fallback={summary.fallback_reason} />
      </div>
      <dl className="grid grid-cols-1 gap-3 px-5 pt-3 pb-5 sm:grid-cols-[140px_1fr]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-[11px] font-bold tracking-wide text-violet-700/80 uppercase sm:pt-0.5">{k}</dt>
            <dd className="-mt-2 text-sm text-sand-800 sm:mt-0">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export function ContributorMatches({ problemId }: { problemId: number }) {
  const q = useQuery({
    queryKey: ['matches', problemId],
    queryFn: () => api.post<ContributorMatch[]>('/ai/match-contributors', { problem_id: problemId }),
    staleTime: 5 * 60_000,
  })
  return (
    <section className="card p-5" aria-labelledby="matches-title">
      <h2 id="matches-title" className="flex items-center gap-2 text-sm font-bold text-sand-900">
        <Target className="size-4 text-clay-500" aria-hidden /> Potential Contributors
      </h2>
      <p className="mt-0.5 text-xs text-sand-500">Matched on skills, past solutions and location.</p>
      {q.isLoading ? (
        <div className="mt-4 space-y-3">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : q.isError ? (
        <p className="mt-3 text-sm text-sand-500">Matching is temporarily unavailable.</p>
      ) : !q.data?.length ? (
        <p className="mt-3 text-sm text-sand-500">No strong matches yet — share this problem with people who can help.</p>
      ) : (
        <ul className="mt-3 space-y-1">
          {q.data.map((m) => (
            <li key={m.id} className="group relative -mx-2 flex items-start gap-3 rounded-xl px-2 py-2 hover:bg-sand-50">
              <Avatar user={m} size={34} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <Link to={`/u/${m.username}`} className="truncate text-sm font-semibold text-sand-900 after:absolute after:inset-0 group-hover:text-atlas-800">
                    {m.name}
                  </Link>
                  <span className="shrink-0 rounded-md bg-atlas-50 px-1.5 text-[11px] font-bold text-atlas-700 tabular-nums">{m.match}%</span>
                </div>
                <p className="truncate text-xs text-sand-500">{(m.matched_skills.length ? m.matched_skills : m.skills).slice(0, 3).join(' · ')}</p>
                {m.reasons[1] && <p className="truncate text-[11px] text-sand-400">{m.reasons.slice(1).join(' · ')}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
