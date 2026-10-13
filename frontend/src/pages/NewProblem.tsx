import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { CopyCheck, HandHeart, ImagePlus, Landmark, Lightbulb, Loader2, LogIn, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Page } from '../components/Layout'
import { Button, CategoryBadge, CategoryIcon, EmptyState, Field, Modal, btn } from '../components/ui'
import { useAuth } from '../hooks/auth'
import { useDebounced, useDocumentTitle, useMeta, useToast } from '../hooks/misc'
import { ApiError, api, errorMessage } from '../lib/api'
import type { ProblemDetail, SimilarProblem } from '../lib/types'

const DUPLICATE_THRESHOLD = 0.5

function SimilarItem({ p, onSupport, supporting }: { p: SimilarProblem; onSupport: () => void; supporting?: boolean }) {
  return (
    <div className="rounded-xl border border-sand-200 bg-white p-3.5">
      <CategoryBadge category={p.category} />
      <Link to={`/problems/${p.id}`} target="_blank" className="mt-1.5 block leading-snug font-bold text-sand-900 hover:text-navy-800">
        {p.title}
      </Link>
      <p className="mt-1 text-xs text-sand-500">
        {p.solutions_count} solution{p.solutions_count === 1 ? '' : 's'} · {p.supporters_count} supporter{p.supporters_count === 1 ? '' : 's'}
      </p>
      <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={onSupport} loading={supporting}>
        <HandHeart className="size-3.5" aria-hidden /> Support this one instead
      </Button>
    </div>
  )
}

export default function NewProblem() {
  useDocumentTitle('Submit a problem')
  const { user, loading, isDecisionMaker } = useAuth()
  const meta = useMeta()
  const navigate = useNavigate()
  const toast = useToast()
  const qc = useQueryClient()

  const [form, setForm] = useState({ title: '', description: '', category: '', city: '', location: '', is_official: false })
  const [image, setImage] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [dupOpen, setDupOpen] = useState(false)
  const [dupAck, setDupAck] = useState(false)
  // Guards against a double click firing two requests before React re-renders the disabled button.
  const submitting = useRef(false)
  const update = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }))

  // Duplicate check while typing (keyword similarity, runs locally on the server).
  const text = useDebounced(`${form.title}|${form.description}`, 600)
  const similar = useQuery({
    queryKey: ['similar', text, form.category],
    queryFn: () => api.post<SimilarProblem[]>('/ai/similar-problems', { title: form.title, description: form.description, category: form.category || null }),
    enabled: form.title.length + form.description.length >= 15,
    staleTime: 60_000,
  })
  const topMatch = similar.data?.[0]

  const support = useMutation({
    mutationFn: (id: number) => api.post(`/problems/${id}/support`).then(() => id),
    onSuccess: (id) => {
      toast('You now support the existing problem. Its author and followers will see it.')
      navigate(`/problems/${id}`)
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })

  const create = useMutation({
    mutationFn: () =>
      api.post<ProblemDetail>('/problems', {
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category,
        city: form.city || null,
        location: form.location.trim() || null,
        image_url: image,
        is_official: isDecisionMaker && form.is_official,
      }),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['problems'] })
      toast('Your problem is published. Anyone can now propose a solution.')
      navigate(`/problems/${p.id}`)
    },
    onError: (e) => {
      submitting.current = false
      if (e instanceof ApiError && e.fields) setErrors(e.fields)
      toast(errorMessage(e), 'error')
      setDupOpen(false)
    },
  })

  const publish = () => {
    if (submitting.current) return
    submitting.current = true
    create.mutate()
  }

  const validate = () => {
    const e: Record<string, string> = {}
    if (form.title.trim().length < 8) e.title = 'Give your problem a clear title (at least 8 characters).'
    if (form.description.trim().length < 20) e.description = 'Describe the problem in a bit more detail (at least 20 characters).'
    if (!form.category) e.category = 'Choose the domain that fits best. Use “Other” if none does.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault()
    if (!validate()) {
      document.querySelector('[aria-invalid="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    if (topMatch && topMatch.similarity >= DUPLICATE_THRESHOLD && !dupAck) {
      setDupOpen(true)
      return
    }
    publish()
  }

  const onImage = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    try {
      setImage((await api.upload(file)).url)
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setUploading(false)
    }
  }

  if (loading) return null
  if (!user)
    return (
      <Page>
        <EmptyState
          icon={LogIn}
          title="Sign in to submit a problem"
          body="Browsing is open to everyone. Posting needs a free account so people know who to talk to."
          action={
            <div className="flex gap-2">
              <Link to="/login?next=/problems/new" className={btn('primary', 'md')}>
                Sign in
              </Link>
              <Link to="/register?next=/problems/new" className={btn('secondary', 'md')}>
                Create account
              </Link>
            </div>
          }
        />
      </Page>
    )

  return (
    <Page wide>
      <div className="mb-6 max-w-2xl">
        <p className="eyebrow">Submit a problem</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-navy-900 sm:text-3xl">What problem should people work on?</h1>
        <p className="mt-1 text-sand-600">On campus, in your city or across the country, in any field. Describe it in your own words.</p>
      </div>

      <form onSubmit={submit} noValidate className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <div className="card space-y-6 p-5 sm:p-7">
          <Field label="Problem title" htmlFor="title" error={errors.title} hint="Short and specific, e.g. “No safe bike parking at the engineering faculty”.">
            <input id="title" className="input" maxLength={160} value={form.title} aria-invalid={!!errors.title} onChange={(e) => update({ title: e.target.value })} />
          </Field>

          <Field label="Description" htmlFor="description" error={errors.description} hint="What happens, who is affected, how often, and what you've already seen tried.">
            <textarea
              id="description"
              className="input min-h-40"
              maxLength={5000}
              value={form.description}
              aria-invalid={!!errors.description}
              onChange={(e) => update({ description: e.target.value })}
            />
          </Field>

          <fieldset>
            <legend className="label">Domain</legend>
            {errors.category && <p className="-mt-1 mb-2 text-xs font-medium text-red-700">{errors.category}</p>}
            <div role="radiogroup" aria-invalid={!!errors.category} className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {meta.data?.categories.map((c) => (
                <button
                  key={c.slug}
                  type="button"
                  role="radio"
                  aria-checked={form.category === c.slug}
                  onClick={() => update({ category: c.slug })}
                  className={clsx(
                    'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-[13px] leading-tight font-semibold transition-colors',
                    form.category === c.slug ? 'border-navy-700 bg-navy-50 text-navy-900 ring-2 ring-navy-100' : 'border-sand-200 text-sand-700 hover:border-sand-300',
                  )}
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg" style={{ backgroundColor: `${c.color}1a`, color: c.color }}>
                    <CategoryIcon icon={c.icon} className="size-4" />
                  </span>
                  {c.name}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="City" htmlFor="city" optional hint="Leave empty for national, online or multi-city problems.">
              <select id="city" className="input" value={form.city} onChange={(e) => update({ city: e.target.value })}>
                <option value="">Not specific to one city</option>
                {meta.data?.cities.map((c) => (
                  <option key={c.name}>{c.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Place or affected community" htmlFor="location" optional>
              <input
                id="location"
                className="input"
                maxLength={200}
                value={form.location}
                onChange={(e) => update({ location: e.target.value })}
                placeholder="e.g. Campus residence halls, small farmers in the Souss"
              />
            </Field>
          </div>

          <Field label="Photo" optional hint="JPG, PNG or WebP up to 5 MB.">
            {image ? (
              <div className="relative w-fit">
                <img src={image} alt="Uploaded for this problem" className="h-36 rounded-xl object-cover" />
                <button type="button" onClick={() => setImage(null)} className="absolute top-2 right-2 rounded-lg bg-white/90 p-1 text-sand-700 shadow hover:bg-white" aria-label="Remove photo">
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-sand-300 px-4 py-5 text-sm text-sand-600 hover:border-atlas-400 hover:bg-atlas-50/40 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-atlas-400">
                {uploading ? <Loader2 className="size-5 animate-spin text-atlas-600" aria-hidden /> : <ImagePlus className="size-5 text-sand-400" aria-hidden />}
                {uploading ? 'Uploading…' : 'Add a photo'}
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => onImage(e.target.files?.[0])} />
              </label>
            )}
          </Field>

          {isDecisionMaker && (
            <label className="flex items-start gap-3 rounded-xl border border-navy-100 bg-navy-50/60 p-4">
              <input type="checkbox" className="mt-0.5 size-4 accent-navy-900" checked={form.is_official} onChange={(e) => update({ is_official: e.target.checked })} />
              <span className="text-sm">
                <span className="flex items-center gap-1.5 font-bold text-navy-900">
                  <Landmark className="size-4" aria-hidden /> Publish as a challenge from {user.name}
                </span>
                <span className="text-sand-600">Shows that your organization is looking for solutions to this problem.</span>
              </span>
            </label>
          )}

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-sand-100 pt-5">
            <Link to="/problems" className={btn('ghost', 'md')}>
              Cancel
            </Link>
            <Button type="submit" size="lg" loading={create.isPending || uploading}>
              Publish problem
            </Button>
          </div>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <section className="card p-4" aria-live="polite" aria-labelledby="similar-title">
            <h2 id="similar-title" className="flex items-center gap-2 text-sm font-bold text-sand-900">
              <CopyCheck className="size-4 text-atlas-700" aria-hidden /> Already shared?
              {similar.isFetching && <Loader2 className="size-3.5 animate-spin text-sand-400" aria-label="Checking" />}
            </h2>
            {form.title.length + form.description.length < 15 ? (
              <p className="mt-2 text-sm text-sand-500">As you type, we look for similar problems so support isn't split across duplicates.</p>
            ) : similar.isError ? (
              <p className="mt-2 text-sm text-sand-500">The similarity check is unavailable right now. You can still publish.</p>
            ) : similar.data && similar.data.length > 0 ? (
              <>
                <p className="mt-1 mb-3 text-sm text-sand-600">
                  {similar.data[0].similarity >= DUPLICATE_THRESHOLD ? 'This looks similar to an existing problem:' : 'Possibly related problems:'}
                </p>
                <div className="space-y-2.5">
                  {similar.data.slice(0, 3).map((p) => (
                    <SimilarItem key={p.id} p={p} onSupport={() => support.mutate(p.id)} supporting={support.isPending && support.variables === p.id} />
                  ))}
                </div>
              </>
            ) : similar.data ? (
              <p className="mt-2 text-sm text-sand-500">No similar problem found.</p>
            ) : null}
          </section>
          <section className="card p-4 text-sm text-sand-600">
            <h2 className="flex items-center gap-2 font-bold text-sand-900">
              <Lightbulb className="size-4 text-atlas-700" aria-hidden /> What happens next
            </h2>
            <p className="mt-1.5">Your problem is public. Anyone with an account can propose a solution, and the community stars the ones it supports. You'll be notified about new solutions.</p>
          </section>
        </aside>
      </form>

      <Modal
        open={dupOpen}
        onClose={() => setDupOpen(false)}
        title="This may already be on BladiSolution Campus"
        footer={
          <>
            <Button
              variant="secondary"
              loading={create.isPending}
              onClick={() => {
                setDupAck(true)
                publish()
              }}
            >
              Mine is different, publish it
            </Button>
            {topMatch && (
              <Button loading={support.isPending} onClick={() => support.mutate(topMatch.id)}>
                <HandHeart className="size-4" aria-hidden /> Support the existing one
              </Button>
            )}
          </>
        }
      >
        <p className="mb-4 text-sm text-sand-600">Supporting an existing problem keeps all solutions in one place. If yours is genuinely different, publish it.</p>
        {topMatch && (
          <div className="rounded-xl border border-sand-200 bg-sand-50 p-4">
            <CategoryBadge category={topMatch.category} />
            <p className="mt-2 font-bold text-sand-900">{topMatch.title}</p>
            <p className="mt-1 text-sm text-sand-500">
              {topMatch.solutions_count} solution{topMatch.solutions_count === 1 ? '' : 's'} · {topMatch.supporters_count} supporter
              {topMatch.supporters_count === 1 ? '' : 's'}
            </p>
          </div>
        )}
      </Modal>
    </Page>
  )
}
