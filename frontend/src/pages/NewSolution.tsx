import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, HandHeart, Lightbulb, Link2, LogIn, MapPin, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Page } from '../components/Layout'
import { Button, CategoryBadge, ChipInput, EmptyState, ErrorState, Field, PageLoader, btn } from '../components/ui'
import { useAuth } from '../hooks/auth'
import { useDocumentTitle, useMeta, useToast } from '../hooks/misc'
import { ApiError, api, errorMessage } from '../lib/api'
import { num } from '../lib/format'
import type { ProblemDetail, SolutionDetail } from '../lib/types'

const TIPS = [
  'Be concrete: who does what, with which tools, by when.',
  'Explain why your approach fits this neighbourhood and its constraints.',
  'Estimate impact in numbers when you can (people served, % reduction).',
  'A small pilot that can start next month beats a perfect plan.',
]

export default function NewSolution() {
  const { id } = useParams()
  const pid = Number(id)
  const { user, loading } = useAuth()
  const meta = useMeta()
  const toast = useToast()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const problem = useQuery({ queryKey: ['problem', pid], queryFn: () => api.get<ProblemDetail>(`/problems/${pid}`) })
  useDocumentTitle(problem.data ? `Propose a solution · ${problem.data.title}` : 'Propose a solution')

  const [form, setForm] = useState({
    title: '',
    description: '',
    approach: '',
    impact: '',
    implementation_plan: '',
    required_skills: [] as string[],
    resources: '',
    estimated_cost: '',
    links: [] as string[],
  })
  const [link, setLink] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const update = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }))

  const create = useMutation({
    mutationFn: () =>
      api.post<SolutionDetail>(`/problems/${pid}/solutions`, {
        ...form,
        resources: form.resources || null,
        estimated_cost: form.estimated_cost || null,
      }),
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: ['solutions'] })
      qc.invalidateQueries({ queryKey: ['problem', pid] })
      toast('Solution published! Followers of this problem have been notified.')
      navigate(`/solutions/${s.id}`)
    },
    onError: (e) => {
      if (e instanceof ApiError && e.fields) setErrors(e.fields)
      toast(errorMessage(e), 'error')
    },
  })

  const validate = () => {
    const e: Record<string, string> = {}
    if (form.title.trim().length < 6) e.title = 'Give your solution a short, clear name (6+ characters).'
    if (form.description.trim().length < 20) e.description = 'Describe the solution in at least 20 characters.'
    if (form.approach.trim().length < 20) e.approach = 'Explain how it works (20+ characters).'
    if (form.impact.trim().length < 10) e.impact = 'Describe the expected impact (10+ characters).'
    if (form.implementation_plan.trim().length < 10) e.implementation_plan = 'Outline how it could be deployed (10+ characters).'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const addLink = () => {
    const v = link.trim()
    if (!v) return
    if (!/^https?:\/\//.test(v)) {
      setErrors((e) => ({ ...e, links: 'Links must start with http:// or https://' }))
      return
    }
    if (form.links.length < 5 && !form.links.includes(v)) update({ links: [...form.links, v] })
    setLink('')
    setErrors(({ links: _drop, ...rest }) => rest)
  }

  if (loading || problem.isLoading) return <PageLoader />
  if (problem.isError || !problem.data)
    return (
      <Page>
        <ErrorState error={problem.error} onRetry={() => problem.refetch()} />
      </Page>
    )
  const p = problem.data
  if (!user)
    return (
      <Page>
        <EmptyState
          icon={LogIn}
          title="Sign in to propose a solution"
          body="Solutions are public and credited to you on your profile."
          action={
            <Link to={`/login?next=/problems/${pid}/solutions/new`} className={btn('primary', 'md')}>
              Sign in
            </Link>
          }
        />
      </Page>
    )

  const ta = (key: 'description' | 'approach' | 'impact' | 'implementation_plan', label: string, hint: string, placeholder: string, rows = 4) => (
    <Field label={label} htmlFor={key} error={errors[key]} hint={hint}>
      <textarea
        id={key}
        rows={rows}
        className="input"
        value={form[key]}
        aria-invalid={!!errors[key]}
        onChange={(e) => update({ [key]: e.target.value } as Partial<typeof form>)}
        placeholder={placeholder}
      />
    </Field>
  )

  return (
    <Page wide>
      <div className="mb-6 max-w-3xl">
        <p className="eyebrow">Submit a solution</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">How would you solve this?</h1>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
        <form
          noValidate
          className="card space-y-6 p-5 sm:p-7"
          onSubmit={(e) => {
            e.preventDefault()
            if (validate()) create.mutate()
            else document.querySelector('[aria-invalid="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }}
        >
          <Field label="Title" htmlFor="title" error={errors.title} hint="e.g. “AI-Based Waste Overflow Prediction”">
            <input id="title" className="input" maxLength={160} value={form.title} aria-invalid={!!errors.title} onChange={(e) => update({ title: e.target.value })} />
          </Field>
          {ta('description', 'Description', 'What is the solution, in two or three sentences?', 'Predict which containers will overflow and dispatch collection before it happens…', 3)}
          {ta('approach', 'How it works', 'Explain the mechanism: data, tools, people, process.', 'A model trained on collection logs scores each container every evening…', 5)}
          {ta('impact', 'Expected impact', 'What changes for residents? Use numbers when you can.', 'Fewer overflow incidents at weekends; ~40% fewer complaints…')}
          {ta('implementation_plan', 'Implementation', 'How could it be deployed? Phases, partners, timeline.', 'Phase 1 (4 weeks): digitise logs… Phase 2: pilot with one crew…')}
          <Field label="Required skills" htmlFor="skills" hint="Helps the right contributors find your solution.">
            <ChipInput id="skills" value={form.required_skills} onChange={(v) => update({ required_skills: v })} suggestions={meta.data?.skills ?? []} placeholder="Python, IoT, GIS…" />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Resources" htmlFor="resources" optional>
              <textarea id="resources" rows={2} className="input" value={form.resources} onChange={(e) => update({ resources: e.target.value })} placeholder="Data access, hardware, partners…" />
            </Field>
            <Field label="Estimated cost" htmlFor="cost" optional>
              <input id="cost" className="input" maxLength={120} value={form.estimated_cost} onChange={(e) => update({ estimated_cost: e.target.value })} placeholder="≈ 50,000 MAD for the pilot" />
            </Field>
          </div>
          <Field label="Attachments & links" htmlFor="link" optional error={errors.links} hint="Prototype, repository, slides, video…">
            <div className="flex gap-2">
              <input
                id="link"
                className="input"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addLink()
                  }
                }}
                placeholder="https://"
              />
              <Button type="button" variant="secondary" onClick={addLink} aria-label="Add link">
                <Plus className="size-4" aria-hidden />
              </Button>
            </div>
            {form.links.length > 0 && (
              <ul className="mt-2 space-y-1">
                {form.links.map((l) => (
                  <li key={l} className="flex items-center gap-2 text-sm text-sand-700">
                    <Link2 className="size-3.5 text-sand-400" aria-hidden />
                    <span className="truncate">{l}</span>
                    <button type="button" onClick={() => update({ links: form.links.filter((x) => x !== l) })} aria-label={`Remove ${l}`} className="rounded p-0.5 text-sand-400 hover:text-red-700">
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Field>
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-sand-100 pt-5">
            <Link to={`/problems/${pid}`} className={btn('ghost', 'md')}>
              Cancel
            </Link>
            <Button type="submit" size="lg" loading={create.isPending}>
              <Lightbulb className="size-4" aria-hidden /> Publish solution
            </Button>
          </div>
        </form>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <section className="card p-5" aria-label="Problem being solved">
            <p className="text-[11px] font-bold tracking-wide text-sand-500 uppercase">You're solving</p>
            <div className="mt-2">
              <CategoryBadge category={p.category} />
            </div>
            <Link to={`/problems/${p.id}`} className="mt-2 block leading-snug font-bold text-sand-900 hover:text-atlas-800">
              {p.title}
            </Link>
            <p className="mt-1 flex items-center gap-1 text-xs text-sand-500">
              <MapPin className="size-3" aria-hidden /> {p.city}
              {p.neighborhood && ` · ${p.neighborhood}`}
            </p>
            <p className="mt-3 line-clamp-5 text-sm text-sand-600">{p.description}</p>
            <div className="mt-3 flex gap-4 text-xs font-semibold text-sand-600">
              <span className="inline-flex items-center gap-1">
                <HandHeart className="size-3.5 text-clay-500" aria-hidden /> {num(p.supporters_count)} supporters
              </span>
              <span className="inline-flex items-center gap-1">
                <Lightbulb className="size-3.5 text-saffron-600" aria-hidden /> {p.solutions_count} solutions
              </span>
            </div>
          </section>
          <section className="card p-5">
            <h2 className="text-sm font-bold text-sand-900">What makes a strong proposal</h2>
            <ul className="mt-3 space-y-2.5">
              {TIPS.map((t) => (
                <li key={t} className="flex gap-2 text-sm text-sand-600">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-atlas-600" aria-hidden /> {t}
                </li>
              ))}
            </ul>
            <p className="mt-4 rounded-xl bg-sand-50 p-3 text-xs text-sand-600">Your solution is public by default. Anyone can star it, comment, and ask to collaborate.</p>
          </section>
        </aside>
      </div>
    </Page>
  )
}
