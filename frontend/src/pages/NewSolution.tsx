import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Lightbulb, Link2, LogIn, Plus, Star, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Page } from '../components/Layout'
import { Button, CategoryBadge, EmptyState, ErrorState, Field, PageLoader, btn } from '../components/ui'
import { useAuth } from '../hooks/auth'
import { useDocumentTitle, useToast } from '../hooks/misc'
import { ApiError, api, errorMessage } from '../lib/api'
import type { Paged, ProblemDetail, Solution, SolutionDetail } from '../lib/types'

export default function NewSolution() {
  const { id } = useParams()
  const pid = Number(id)
  const { user, loading } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const problem = useQuery({ queryKey: ['problem', pid], queryFn: () => api.get<ProblemDetail>(`/problems/${pid}`) })
  const existing = useQuery({
    queryKey: ['solutions', 'problem', pid, 'top', 'form'],
    queryFn: () => api.get<Paged<Solution>>(`/problems/${pid}/solutions`, { sort: 'top', page_size: 5 }),
  })
  useDocumentTitle(problem.data ? `Propose a solution · ${problem.data.title}` : 'Propose a solution')

  const [form, setForm] = useState({ title: '', description: '', implementation_plan: '', resources: '', links: [] as string[] })
  const [link, setLink] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const submitting = useRef(false)
  const update = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }))

  const create = useMutation({
    mutationFn: () =>
      api.post<SolutionDetail>(`/problems/${pid}/solutions`, {
        title: form.title.trim(),
        description: form.description.trim(),
        implementation_plan: form.implementation_plan.trim() || null,
        resources: form.resources.trim() || null,
        links: form.links,
      }),
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: ['solutions'] })
      qc.invalidateQueries({ queryKey: ['problem', pid] })
      toast('Solution published. People following this problem have been notified.')
      navigate(`/solutions/${s.id}`)
    },
    onError: (e) => {
      submitting.current = false
      if (e instanceof ApiError && e.fields) setErrors(e.fields)
      toast(errorMessage(e), 'error')
    },
  })

  const validate = () => {
    const e: Record<string, string> = {}
    if (form.title.trim().length < 6) e.title = 'Give your solution a short, clear name (at least 6 characters).'
    if (form.description.trim().length < 20) e.description = 'Explain your approach in at least 20 characters.'
    if (link.trim()) e.links = 'Press “Add” to keep this link, or clear the field.'
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
  if (p.status === 'solved' || p.status === 'archived')
    return (
      <Page>
        <EmptyState icon={Lightbulb} title="This problem is closed" body="It no longer accepts new solutions." action={<Link to={`/problems/${pid}`} className={btn('secondary', 'md')}>Back to the problem</Link>} />
      </Page>
    )

  return (
    <Page wide>
      <div className="mb-6 max-w-3xl">
        <p className="eyebrow">Propose a solution</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-navy-900 sm:text-3xl">How would you solve this?</h1>
        <p className="mt-1 text-sand-600">Only the title and your approach are required. You can add details later.</p>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <form
          noValidate
          className="card space-y-6 p-5 sm:p-7"
          onSubmit={(e) => {
            e.preventDefault()
            if (submitting.current) return
            if (!validate()) {
              document.querySelector('[aria-invalid="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
              return
            }
            submitting.current = true
            create.mutate()
          }}
        >
          <Field label="Solution title" htmlFor="title" error={errors.title} hint="e.g. “Shared timetable app for campus shuttles”">
            <input id="title" className="input" maxLength={160} value={form.title} aria-invalid={!!errors.title} onChange={(e) => update({ title: e.target.value })} />
          </Field>
          <Field label="Your proposed approach" htmlFor="description" error={errors.description} hint="What would you do, how would it work, and why would it help?">
            <textarea
              id="description"
              rows={7}
              className="input"
              maxLength={5000}
              value={form.description}
              aria-invalid={!!errors.description}
              onChange={(e) => update({ description: e.target.value })}
            />
          </Field>
          <Field label="Implementation plan" htmlFor="plan" optional hint="Steps, timeline, who would be involved.">
            <textarea id="plan" rows={4} className="input" maxLength={6000} value={form.implementation_plan} onChange={(e) => update({ implementation_plan: e.target.value })} />
          </Field>
          <Field label="Resources or budget" htmlFor="resources" optional hint="Rough estimates are fine: people, equipment, data access, cost.">
            <textarea id="resources" rows={2} className="input" maxLength={2000} value={form.resources} onChange={(e) => update({ resources: e.target.value })} />
          </Field>
          <Field label="Links" htmlFor="link" optional error={errors.links} hint="Prototype, repository, slides, video. Up to 5.">
            <div className="flex gap-2">
              <input
                id="link"
                className="input"
                type="url"
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
              <Button type="button" variant="secondary" onClick={addLink}>
                <Plus className="size-4" aria-hidden /> Add
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
            <Link to={`/problems/${p.id}`} className="mt-2 block leading-snug font-bold text-sand-900 hover:text-navy-800">
              {p.title}
            </Link>
            <p className="mt-2 line-clamp-6 text-sm text-sand-600">{p.description}</p>
          </section>
          <section className="card p-5" aria-labelledby="existing-title">
            <h2 id="existing-title" className="text-sm font-bold text-sand-900">
              Already proposed ({p.solutions_count})
            </h2>
            {existing.isLoading ? null : !existing.data?.items.length ? (
              <p className="mt-1.5 text-sm text-sand-600">No solutions yet. Yours will be the first.</p>
            ) : (
              <>
                <p className="mt-1 text-xs text-sand-500">Read these first. If one is close to your idea, star it or ask to collaborate instead.</p>
                <ul className="mt-3 space-y-2">
                  {existing.data.items.map((s) => (
                    <li key={s.id} className="flex items-start gap-2 text-sm">
                      <span className="mt-0.5 inline-flex shrink-0 items-center gap-0.5 text-xs font-bold text-saffron-700 tabular-nums">
                        <Star className="size-3.5 fill-saffron-400 text-saffron-500" aria-hidden /> {s.stars_count}
                      </span>
                      <Link to={`/solutions/${s.id}`} target="_blank" className="font-semibold text-sand-800 hover:text-navy-800">
                        {s.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </aside>
      </div>
    </Page>
  )
}
