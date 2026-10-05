import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, Gavel, Landmark, Lightbulb, MessageSquareWarning, Rocket, Trophy, Users } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { StarButton } from '../components/actions'
import { ActivityItem } from '../components/cards'
import { Page } from '../components/Layout'
import { CategoryBadge, ErrorState, PageLoader, SectionHeader, SolutionStatusBadge, btn } from '../components/ui'
import { useAuth } from '../hooks/auth'
import { useDocumentTitle, useMeta, useToast } from '../hooks/misc'
import { api, errorMessage } from '../lib/api'
import { SOLUTION_FLOW, SOLUTION_STATUS, compact, num } from '../lib/format'
import type { Activity, PlatformStats, Problem, Solution, SolutionStatus } from '../lib/types'

interface DashboardData {
  city: string | null
  stats: PlatformStats
  implementation_rate: number
  resolution_rate: number
  problems_by_category: { slug: string; name: string; color: string; problems: number; solutions: number }[]
  problems_by_city: { city: string; problems: number }[]
  solutions_by_status: { status: SolutionStatus; count: number }[]
  participation: { problems: number[]; solutions: number[]; stars: number[]; comments: number[]; week_starts: string[] }
  top_problems: Problem[]
  top_solutions: Solution[]
  pipeline: Record<'under_evaluation' | 'selected' | 'implemented', Solution[]>
  recent_activity: Activity[]
}

// Validated with the dataviz palette validator (light surface): categorical slots 1–3, ordinal green ramp.
const SERIES = { s1: '#2a78d6', s2: '#eb6834', s3: '#1baf7a' }
const SINGLE = '#146b4b'
const ORDINAL = ['#73bd9a', '#3f9c74', '#1f805a', '#0b5c42', '#08382a']
const AXIS = { fontSize: 12, fill: '#5e574b' }
const GRID = '#ece7dd'

function Tile({ icon: Icon, label, value, sub }: { icon: typeof Users; label: string; value: string; sub?: string }) {
  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-center gap-2 text-xs font-semibold text-sand-500">
        <Icon className="size-4 text-atlas-700" aria-hidden /> {label}
      </div>
      <div className="mt-2 text-3xl font-extrabold tracking-tight text-sand-900 tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-sand-500">{sub}</div>}
    </div>
  )
}

function ChartCard({ title, subtitle, children, className }: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`card p-5 ${className ?? ''}`} aria-label={title}>
      <h2 className="font-bold text-sand-900">{title}</h2>
      {subtitle && <p className="text-xs text-sand-500">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

const tooltipStyle = { borderRadius: 12, border: '1px solid #e7e1d5', boxShadow: '0 8px 24px rgba(27,25,22,.08)', fontSize: 13 }

function QuickDecision({ s }: { s: Solution }) {
  const qc = useQueryClient()
  const toast = useToast()
  const m = useMutation({
    mutationFn: (status: SolutionStatus) => api.patch(`/solutions/${s.id}/status`, { status }),
    onSuccess: (_, status) => {
      toast(`“${s.title}” → ${SOLUTION_STATUS[status].label}. The team has been notified.`)
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['solution', s.id] })
      qc.invalidateQueries({ queryKey: ['solutions'] })
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })
  return (
    <>
      <label htmlFor={`q-${s.id}`} className="sr-only">
        Change status of {s.title}
      </label>
      <select id={`q-${s.id}`} className="input !w-auto !py-1.5 !text-xs" value={s.status} disabled={m.isPending} onChange={(e) => m.mutate(e.target.value as SolutionStatus)}>
        {SOLUTION_FLOW.map((st) => (
          <option key={st} value={st}>
            {SOLUTION_STATUS[st].label}
          </option>
        ))}
      </select>
    </>
  )
}

export default function Dashboard() {
  const { user, isDecisionMaker } = useAuth()
  const meta = useMeta()
  const [city, setCity] = useState(() => (user?.role === 'municipality' && user.city) || '')
  useDocumentTitle('Civic dashboard')
  const q = useQuery({ queryKey: ['dashboard', city], queryFn: () => api.get<DashboardData>('/dashboard', { city }) })
  const [showTable, setShowTable] = useState(false)
  if (q.isLoading) return <PageLoader />
  if (q.isError || !q.data)
    return (
      <Page>
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      </Page>
    )
  const d = q.data
  const cats = [...d.problems_by_category].filter((c) => c.problems || c.solutions).sort((a, b) => b.problems - a.problems)
  const weeks = d.participation.week_starts.map((w, i) => ({
    week: new Date(w).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
    Problems: d.participation.problems[i],
    Solutions: d.participation.solutions[i],
    Comments: d.participation.comments[i],
  }))
  const statusData = d.solutions_by_status.map((s, i) => ({ name: SOLUTION_STATUS[s.status].label, count: s.count, fill: ORDINAL[i] }))
  const meta_cats = meta.data?.categories ?? []
  const catFor = (slug: string) => meta_cats.find((c) => c.slug === slug)

  return (
    <Page wide>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">{city ? `${city} · ` : ''}City civic dashboard</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">What the community needs — and what it proposes</h1>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="dash-city" className="text-sm font-semibold text-sand-600">
            City
          </label>
          <select id="dash-city" className="input !w-44 !py-2" value={city} onChange={(e) => setCity(e.target.value)}>
            <option value="">All cities</option>
            {meta.data?.cities.map((c) => (
              <option key={c.name}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>
      {!isDecisionMaker && (
        <p className="mt-4 rounded-xl border border-sand-200 bg-white px-4 py-3 text-sm text-sand-600">
          You're viewing the public, read-only version. Organizations and municipalities can evaluate, select and mark solutions as implemented from here.{' '}
          {!user && (
            <Link to="/login?next=/dashboard" className="font-semibold text-atlas-700 hover:underline">
              Sign in as an institution →
            </Link>
          )}
        </p>
      )}

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tile icon={MessageSquareWarning} label="Open problems" value={num(d.stats.open_problems)} sub={`${num(d.stats.problems)} reported in total`} />
        <Tile icon={Lightbulb} label="Active solutions" value={num(d.stats.active_solutions)} sub={`${d.stats.selected} selected for pilots`} />
        <Tile icon={Users} label="Citizens participating" value={compact(d.stats.participants)} sub={`${compact(d.stats.stars)} community stars`} />
        <Tile icon={Building2} label="Organizations" value={num(d.stats.organizations)} sub="incl. municipalities" />
        <Tile icon={Rocket} label="Implementation rate" value={`${d.implementation_rate}%`} sub={`${d.stats.implemented} solution${d.stats.implemented === 1 ? '' : 's'} implemented`} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ChartCard title="Problems & solutions by category" subtitle="Where needs concentrate, and how much the community has answered">
          <div style={{ height: Math.max(220, cats.length * 34 + 40) }}>
            <ResponsiveContainer>
              <BarChart data={cats} layout="vertical" margin={{ left: 0, right: 16 }} barGap={2} barCategoryGap={8}>
                <CartesianGrid horizontal={false} stroke={GRID} />
                <XAxis type="number" allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={150} tick={{ ...AXIS, fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#f3efe7' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="problems" name="Problems" fill={SERIES.s1} radius={[0, 4, 4, 0]} barSize={10} />
                <Bar dataKey="solutions" name="Solutions" fill={SERIES.s2} radius={[0, 4, 4, 0]} barSize={10} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <div className="grid gap-5">
          <ChartCard title="Implementation pipeline" subtitle="Solutions at each stage, from proposal to deployment">
            <div style={{ height: 200 }}>
              <ResponsiveContainer>
                <BarChart data={statusData} layout="vertical" margin={{ left: 0, right: 36 }}>
                  <XAxis type="number" hide allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={120} tick={AXIS} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#f3efe7' }} formatter={(v) => [v, 'Solutions']} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={18} label={{ position: 'right', fill: '#433e36', fontSize: 12, fontWeight: 700 }}>
                    {statusData.map((s) => (
                      <Cell key={s.name} fill={s.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
          <ChartCard title="Problems by city">
            <div style={{ height: Math.max(160, d.problems_by_city.length * 26 + 20) }}>
              <ResponsiveContainer>
                <BarChart data={d.problems_by_city} layout="vertical" margin={{ left: 0, right: 32 }}>
                  <XAxis type="number" hide allowDecimals={false} />
                  <YAxis type="category" dataKey="city" width={90} tick={AXIS} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#f3efe7' }} formatter={(v) => [v, 'Problems']} />
                  <Bar dataKey="problems" fill={SINGLE} radius={[0, 4, 4, 0]} barSize={12} label={{ position: 'right', fill: '#433e36', fontSize: 12, fontWeight: 600 }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>
      </div>

      <ChartCard title="Community participation" subtitle="New problems, solutions and comments per week (last 12 weeks)" className="mt-5">
        <div style={{ height: 260 }}>
          <ResponsiveContainer>
            <LineChart data={weeks} margin={{ left: -16, right: 12, top: 8 }}>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="week" tick={AXIS} axisLine={{ stroke: GRID }} tickLine={false} interval="preserveStartEnd" />
              <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="Problems" stroke={SERIES.s1} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              <Line type="monotone" dataKey="Solutions" stroke={SERIES.s2} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              <Line type="monotone" dataKey="Comments" stroke={SERIES.s3} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <button type="button" className="mt-2 text-xs font-semibold text-atlas-700 hover:underline" aria-expanded={showTable} onClick={() => setShowTable((s) => !s)}>
          {showTable ? 'Hide data table' : 'Show data table'}
        </button>
        {showTable && (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-sand-500">
                <tr>
                  <th className="py-1.5 pr-4 font-semibold">Week of</th>
                  <th className="py-1.5 pr-4 font-semibold">Problems</th>
                  <th className="py-1.5 pr-4 font-semibold">Solutions</th>
                  <th className="py-1.5 font-semibold">Comments</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-100 tabular-nums">
                {weeks.map((w) => (
                  <tr key={w.week}>
                    <td className="py-1.5 pr-4">{w.week}</td>
                    <td className="py-1.5 pr-4">{w.Problems}</td>
                    <td className="py-1.5 pr-4">{w.Solutions}</td>
                    <td className="py-1.5">{w.Comments}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ChartCard>

      {/* --------------------------------------------- Top solutions with decisions */}
      <section className="mt-8">
        <SectionHeader
          title="Top community-supported solutions"
          subtitle={isDecisionMaker ? 'Move promising solutions into evaluation, select them, or mark them implemented.' : 'Ranked by community stars, awaiting a decision.'}
        />
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-sand-50 text-xs text-sand-500">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Solution</th>
                  <th className="px-4 py-2.5 font-semibold">Problem</th>
                  <th className="px-4 py-2.5 font-semibold">Stars</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  {isDecisionMaker && <th className="px-4 py-2.5 font-semibold">Decision</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-100">
                {d.top_solutions.map((s) => (
                  <tr key={s.id} className="hover:bg-sand-50/60">
                    <td className="px-4 py-3">
                      <Link to={`/solutions/${s.id}`} className="font-semibold text-sand-900 hover:text-atlas-800">
                        {s.title}
                      </Link>
                      <div className="text-xs text-sand-500">{s.author.name}</div>
                    </td>
                    <td className="max-w-64 px-4 py-3">
                      <Link to={`/problems/${s.problem.id}`} className="line-clamp-1 text-sand-700 hover:text-atlas-800">
                        {s.problem.title}
                      </Link>
                      <div className="text-xs text-sand-500">{s.problem.city}</div>
                    </td>
                    <td className="px-4 py-3">
                      <StarButton solutionId={s.id} starred={s.starred} count={s.stars_count} size="sm" />
                    </td>
                    <td className="px-4 py-3">
                      <SolutionStatusBadge status={s.status} />
                    </td>
                    {isDecisionMaker && (
                      <td className="px-4 py-3">
                        <QuickDecision s={s} />
                      </td>
                    )}
                  </tr>
                ))}
                {d.top_solutions.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sand-500">
                      No solutions awaiting a decision{city ? ` in ${city}` : ''}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* --------------------------------------------- Pipeline board */}
      <section className="mt-8">
        <SectionHeader title="Decision pipeline" subtitle="Solutions that institutions are acting on" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {(
            [
              ['under_evaluation', 'Under evaluation', Gavel],
              ['selected', 'Selected', Trophy],
              ['implemented', 'Implemented', Rocket],
            ] as const
          ).map(([key, label, Icon]) => (
            <div key={key} className="rounded-2xl bg-sand-100/70 p-3">
              <h3 className="flex items-center gap-2 px-1 pb-2 text-sm font-bold text-sand-800">
                <Icon className="size-4" aria-hidden /> {label} <span className="text-sand-400">{d.pipeline[key].length}</span>
              </h3>
              <ul className="space-y-2">
                {d.pipeline[key].map((s) => (
                  <li key={s.id} className="rounded-xl border border-sand-200 bg-white p-3">
                    <Link to={`/solutions/${s.id}`} className="leading-snug font-semibold text-sand-900 hover:text-atlas-800">
                      {s.title}
                    </Link>
                    <p className="mt-0.5 text-xs text-sand-500">
                      {s.problem.city} · {s.stars_count} stars
                      {s.decided_by && ` · ${s.decided_by.name}`}
                    </p>
                    {key === 'implemented' && s.implementation?.citizens_impacted ? (
                      <p className="mt-1 text-xs font-bold text-atlas-700">{num(s.implementation.citizens_impacted)} citizens impacted</p>
                    ) : null}
                  </li>
                ))}
                {d.pipeline[key].length === 0 && <li className="px-1 py-3 text-xs text-sand-500">Nothing here yet.</li>}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section>
          <SectionHeader title="Top community problems" subtitle="Most supported open problems" />
          <ul className="card divide-y divide-sand-100 overflow-hidden">
            {d.top_problems.map((p, i) => {
              const c = catFor(p.category.slug) ?? p.category
              return (
                <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="w-5 text-center text-sm font-bold text-sand-400 tabular-nums">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <Link to={`/problems/${p.id}`} className="line-clamp-1 font-semibold text-sand-900 hover:text-atlas-800">
                      {p.title}
                    </Link>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-sand-500">
                      <CategoryBadge category={c} />
                      <span>{p.city}</span>
                      {p.is_official && (
                        <span className="inline-flex items-center gap-1 font-semibold text-atlas-700">
                          <Landmark className="size-3" aria-hidden /> Official
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    <div className="font-bold text-sand-900 tabular-nums">{num(p.supporters_count)}</div>
                    <div className="text-sand-500">supporters</div>
                  </div>
                </li>
              )
            })}
          </ul>
          {isDecisionMaker && (
            <Link to="/problems/new?official=1" className={btn('primary', 'md', 'mt-4')}>
              <Landmark className="size-4" aria-hidden /> Publish an official challenge
            </Link>
          )}
        </section>
        <section>
          <SectionHeader title="Recent activity" />
          <ul className="card divide-y divide-sand-100 px-4">
            {d.recent_activity.map((a) => (
              <ActivityItem key={a.id} a={a} />
            ))}
          </ul>
        </section>
      </div>
    </Page>
  )
}
