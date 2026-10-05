import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, ChevronRight, Landmark, Lightbulb, MapPin, Pencil, Plus, Trash2, Users } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { FollowProblemButton, ReportButton, ShareButton, SupportButton } from '../components/actions'
import { AnalysisCard, ContributorMatches } from '../components/ai'
import { SolutionCard } from '../components/cards'
import { CommentThread } from '../components/comments'
import { Page } from '../components/Layout'
import {
  Avatar,
  Button,
  CardSkeleton,
  CategoryBadge,
  EmptyState,
  ErrorState,
  Field,
  LevelMeter,
  Modal,
  PageLoader,
  ProblemStatusBadge,
  Segmented,
  Tabs,
  UserLink,
  btn,
} from '../components/ui'
import { useAuth } from '../hooks/auth'
import { useDocumentTitle, useToast } from '../hooks/misc'
import { api, errorMessage } from '../lib/api'
import { PROBLEM_STATUS, SOLUTION_FLOW, SOLUTION_STATUS, compact, formatDate, num, roleLabel, timeAgo } from '../lib/format'
import type { Level, Paged, ProblemDetail as TProblem, ProblemStatus, Solution } from '../lib/types'

const MiniMap = lazy(() => import('../components/MapView').then((m) => ({ default: m.MiniMap })))

const SOL_TABS = [
  { value: 'top', label: 'Top' },
  { value: 'latest', label: 'Latest' },
  { value: 'discussed', label: 'Discussed' },
  { value: 'implemented', label: 'Implemented' },
] as const
type SolSort = (typeof SOL_TABS)[number]['value']

function EditProblem({ p, open, onClose }: { p: TProblem; open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [form, setForm] = useState({ title: p.title, description: p.description, neighborhood: p.neighborhood ?? '', location: p.location ?? '', urgency: p.urgency, impact: p.impact })
  const m = useMutation({
    mutationFn: () => api.patch(`/problems/${p.id}`, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['problem', p.id] })
      toast('Problem updated.')
      onClose()
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })
  const levels: { value: Level; label: string }[] = ['low', 'medium', 'high', 'critical'].map((v) => ({ value: v as Level, label: v[0].toUpperCase() + v.slice(1) }))
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit problem"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={m.isPending} onClick={() => m.mutate()}>
            Save changes
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Title" htmlFor="e-title">
          <input id="e-title" className="input" value={form.title} maxLength={160} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </Field>
        <Field label="Description" htmlFor="e-desc">
          <textarea id="e-desc" className="input min-h-36" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Neighbourhood" htmlFor="e-n">
            <input id="e-n" className="input" value={form.neighborhood} onChange={(e) => setForm({ ...form, neighborhood: e.target.value })} />
          </Field>
          <Field label="Location" htmlFor="e-l">
            <input id="e-l" className="input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </Field>
          <Field label="Urgency">
            <Segmented label="Urgency" value={form.urgency} onChange={(v) => setForm({ ...form, urgency: v })} options={levels} />
          </Field>
          <Field label="Impact">
            <Segmented label="Impact" value={form.impact} onChange={(v) => setForm({ ...form, impact: v })} options={levels} />
          </Field>
        </div>
      </div>
    </Modal>
  )
}

function StatusControl({ p }: { p: TProblem }) {
  const { user, isDecisionMaker } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const m = useMutation({
    mutationFn: (status: ProblemStatus) => api.patch(`/problems/${p.id}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['problem', p.id] })
      toast('Status updated — followers have been notified.')
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })
  const allowed: ProblemStatus[] = isDecisionMaker ? ['open', 'under_review', 'in_progress', 'solved', 'archived'] : ['open', 'solved', 'archived']
  if (!user || !p.can_manage_status) return null
  return (
    <div>
      <label htmlFor="p-status" className="text-[11px] font-bold tracking-wide text-sand-500 uppercase">
        {isDecisionMaker ? 'Official status' : 'Status'}
      </label>
      <select id="p-status" className="input mt-1 !py-2" value={p.status} disabled={m.isPending} onChange={(e) => m.mutate(e.target.value as ProblemStatus)}>
        {[...new Set([p.status, ...allowed])].map((s) => (
          <option key={s} value={s}>
            {PROBLEM_STATUS[s].label}
          </option>
        ))}
      </select>
    </div>
  )
}

export default function ProblemDetail() {
  const { id } = useParams()
  const pid = Number(id)
  const navigate = useNavigate()
  const toast = useToast()
  const qc = useQueryClient()
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as SolSort) || 'top'
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState(false)

  const q = useQuery({ queryKey: ['problem', pid], queryFn: () => api.get<TProblem>(`/problems/${pid}`), enabled: Number.isFinite(pid) })
  const sols = useQuery({
    queryKey: ['solutions', 'problem', pid, tab, page],
    queryFn: () => api.get<Paged<Solution>>(`/problems/${pid}/solutions`, { sort: tab, page, page_size: 10 }),
    enabled: Number.isFinite(pid),
    placeholderData: keepPreviousData,
  })
  const del = useMutation({
    mutationFn: () => api.del(`/problems/${pid}`),
    onSuccess: () => {
      toast('Problem deleted.', 'info')
      qc.invalidateQueries({ queryKey: ['problems'] })
      navigate('/problems')
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })
  useDocumentTitle(q.data?.title)

  if (q.isLoading) return <PageLoader />
  if (q.isError || !q.data)
    return (
      <Page>
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      </Page>
    )
  const p = q.data
  const closed = p.status === 'solved' || p.status === 'archived'
  const counts = p.solution_status_counts
  const setTab = (t: SolSort) => {
    setPage(1)
    const next = new URLSearchParams(params)
    if (t === 'top') next.delete('tab')
    else next.set('tab', t)
    setParams(next, { replace: true })
  }

  return (
    <Page wide>
      <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1 text-sm text-sand-500">
        <Link to="/problems" className="hover:text-sand-800">
          Problems
        </Link>
        <ChevronRight className="size-3.5" aria-hidden />
        <Link to={`/problems?category=${p.category.slug}`} className="truncate hover:text-sand-800">
          {p.category.name}
        </Link>
      </nav>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
        {/* ------------------------------------------------ main column */}
        <div className="min-w-0 space-y-6">
          <article className="card overflow-hidden">
            {p.is_official && (
              <div className="zellige-light flex items-center gap-2 bg-atlas-800 px-5 py-2.5 text-sm font-semibold text-white sm:px-7">
                <Landmark className="size-4" aria-hidden /> Official challenge published by {p.author.name}
              </div>
            )}
            <div className="p-5 sm:p-7">
              <div className="flex flex-wrap items-center gap-2.5">
                <CategoryBadge category={p.category} size="md" link />
                <ProblemStatusBadge status={p.status} />
              </div>
              <h1 className="mt-3 text-2xl leading-tight font-extrabold tracking-tight text-sand-900 sm:text-3xl">{p.title}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-sand-600">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-4 text-sand-400" aria-hidden />
                  {[p.location, p.neighborhood, p.city].filter(Boolean).join(' · ')}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="size-4 text-sand-400" aria-hidden /> {formatDate(p.created_at)}
                </span>
              </div>
              <div className="mt-4 flex items-center gap-2.5 text-sm">
                <Avatar user={p.author} size={28} />
                <span className="text-sand-600">
                  Reported by <UserLink user={p.author} /> <span className="text-sand-400">· {roleLabel(p.author)} · {timeAgo(p.created_at)}</span>
                </span>
              </div>
              {p.image_url && <img src={p.image_url} alt="" className="mt-5 max-h-96 w-full rounded-xl object-cover" />}
              <div className="prose-civic mt-5 text-[15px] leading-relaxed text-sand-800">
                {p.description.split(/\n{2,}/).map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
              </div>
              {p.tags.length > 0 && (
                <div className="mt-5 flex flex-wrap gap-1.5">
                  {p.tags.map((t) => (
                    <Link key={t} to={`/search?q=${encodeURIComponent(t)}`} className="chip hover:border-atlas-300">
                      #{t}
                    </Link>
                  ))}
                </div>
              )}
              <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-sand-100 pt-5">
                <SupportButton problemId={p.id} supported={p.supported} count={p.supporters_count} />
                <FollowProblemButton problemId={p.id} following={p.following} />
                <ShareButton title={p.title} path={`/problems/${p.id}`} />
                <div className="ml-auto flex items-center gap-1">
                  {p.can_edit && (
                    <Button variant="ghost" onClick={() => setEditing(true)}>
                      <Pencil className="size-4" aria-hidden /> Edit
                    </Button>
                  )}
                  {p.can_edit && p.solutions_count === 0 && (
                    <Button
                      variant="ghost"
                      onClick={() => window.confirm('Delete this problem permanently?') && del.mutate()}
                      loading={del.isPending}
                      className="!text-red-700"
                    >
                      <Trash2 className="size-4" aria-hidden /> Delete
                    </Button>
                  )}
                  {!p.can_edit && <ReportButton targetType="problem" targetId={p.id} />}
                </div>
              </div>
            </div>
          </article>

          {p.ai_analysis && <AnalysisCard analysis={p.ai_analysis} title="AI Insight" />}

          {/* ------------------------------------------------ solutions */}
          <section id="solutions" aria-labelledby="solutions-title">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 id="solutions-title" className="flex items-center gap-2 text-xl font-extrabold tracking-tight">
                <Lightbulb className="size-5 text-saffron-600" aria-hidden /> Solutions
                <span className="rounded-full bg-sand-200/70 px-2 text-sm font-bold text-sand-600">{p.solutions_count}</span>
              </h2>
              {!closed && (
                <Link to={`/problems/${p.id}/solutions/new`} className={btn('primary', 'md')} onClick={(e) => !user && (e.preventDefault(), navigate(`/login?next=/problems/${p.id}/solutions/new`))}>
                  <Plus className="size-4" aria-hidden /> Submit a Solution
                </Link>
              )}
            </div>
            <Tabs
              label="Sort solutions"
              value={tab}
              onChange={setTab}
              items={SOL_TABS.map((t) => ({ ...t, count: t.value === 'implemented' ? (counts.implemented ?? 0) : undefined }))}
              className="mb-4 w-fit max-w-full"
            />
            {tab === 'latest' && <p className="-mt-1 mb-3 text-sm text-sand-500">Newest first, regardless of stars — so new contributors aren't buried.</p>}
            {sols.isLoading ? (
              <div className="space-y-3">
                <CardSkeleton />
                <CardSkeleton />
              </div>
            ) : sols.isError ? (
              <ErrorState error={sols.error} onRetry={() => sols.refetch()} />
            ) : !sols.data?.items.length ? (
              <EmptyState
                icon={tab === 'implemented' ? Users : Lightbulb}
                title={tab === 'implemented' ? 'No solution implemented yet' : 'No solutions yet'}
                body={tab === 'implemented' ? 'When an organization implements a solution, it will appear here with its impact.' : 'Be the first to propose a solution to this problem.'}
                action={
                  !closed && tab !== 'implemented' ? (
                    <Link to={`/problems/${p.id}/solutions/new`} className={btn('primary', 'md')}>
                      Submit a Solution
                    </Link>
                  ) : undefined
                }
              />
            ) : (
              <div className={`space-y-3 transition-opacity ${sols.isPlaceholderData ? 'opacity-60' : ''}`}>
                {sols.data.items.map((s) => (
                  <SolutionCard key={s.id} solution={s} highlightNew={tab === 'latest'} />
                ))}
                {sols.data.pages > 1 && (
                  <div className="flex items-center justify-center gap-2 pt-2">
                    <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                      Previous
                    </Button>
                    <span className="text-sm text-sand-500">
                      Page {page} of {sols.data.pages}
                    </span>
                    <Button variant="secondary" size="sm" disabled={page >= sols.data.pages} onClick={() => setPage(page + 1)}>
                      Next
                    </Button>
                  </div>
                )}
              </div>
            )}
          </section>

          <CommentThread target="problems" id={p.id} />
        </div>

        {/* ------------------------------------------------ side column */}
        <aside className="space-y-5">
          <section className="card overflow-hidden" aria-label="Problem impact">
            {p.lat != null && p.lng != null && (
              <Suspense fallback={<div className="h-44 animate-pulse bg-sand-100" />}>
                <Link to="/map" aria-label="Open the problem map">
                  <MiniMap lat={p.lat} lng={p.lng} color={p.category.color} />
                </Link>
              </Suspense>
            )}
            <dl className="grid grid-cols-2 gap-px bg-sand-100">
              {[
                ['Supporters', num(p.supporters_count)],
                ['Followers', num(p.followers_count)],
                ['Solutions', p.solutions_count],
                ['Comments', p.comments_count],
              ].map(([k, v]) => (
                <div key={k} className="bg-white px-4 py-3">
                  <dt className="text-xs font-semibold text-sand-500">{k}</dt>
                  <dd className="text-xl font-extrabold text-sand-900 tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="space-y-3 border-t border-sand-100 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-sand-600">Urgency</span>
                <LevelMeter level={p.urgency} label="Urgency" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-sand-600">Impact</span>
                <LevelMeter level={p.impact} label="Impact" />
              </div>
              {p.affected_population ? (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-sand-600">People affected (est.)</span>
                  <span className="text-sm font-bold text-sand-900">~{compact(p.affected_population)}</span>
                </div>
              ) : null}
              <StatusControl p={p} />
            </div>
          </section>

          {p.solutions_count > 0 && (
            <section className="card p-4" aria-label="Implementation pipeline">
              <h2 className="text-sm font-bold text-sand-900">Implementation pipeline</h2>
              <ol className="mt-3 space-y-2">
                {SOLUTION_FLOW.map((s) => (
                  <li key={s} className="flex items-center gap-2.5 text-sm">
                    <span className={`size-2 rounded-full ${SOLUTION_STATUS[s].dot}`} aria-hidden />
                    <span className="flex-1 text-sand-700">{SOLUTION_STATUS[s].label}</span>
                    <span className="font-bold text-sand-900 tabular-nums">{counts[s] ?? 0}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <ContributorMatches problemId={p.id} />
        </aside>
      </div>
      {p.can_edit && <EditProblem p={p} open={editing} onClose={() => setEditing(false)} />}
    </Page>
  )
}
