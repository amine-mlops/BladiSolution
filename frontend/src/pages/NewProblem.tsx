import { useMutation, useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { BrainCircuit, CopyCheck, HandHeart, ImagePlus, Landmark, Lightbulb, Loader2, LogIn, MapPin, Sparkles, Wand2, X } from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AnalysisCard } from '../components/ai'
import { Page } from '../components/Layout'
import { Button, CategoryBadge, CategoryIcon, ChipInput, EmptyState, Field, Modal, Segmented, btn } from '../components/ui'
import { useAuth } from '../hooks/auth'
import { useDebounced, useDocumentTitle, useMeta, useToast } from '../hooks/misc'
import { ApiError, api, errorMessage } from '../lib/api'
import { num } from '../lib/format'
import type { Level, ProblemAnalysis, ProblemDetail, SimilarProblem } from '../lib/types'

const LocationPicker = lazy(() => import('../components/MapView').then((m) => ({ default: m.LocationPicker })))
const LEVELS: { value: Level; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
]
const DUPLICATE_THRESHOLD = 0.5

function SimilarItem({ p, onSupport, supporting }: { p: SimilarProblem; onSupport: () => void; supporting?: boolean }) {
  const pct = Math.round(p.similarity * 100)
  return (
    <div className="rounded-xl border border-sand-200 bg-white p-3.5">
      <div className="flex items-start justify-between gap-3">
        <CategoryBadge category={p.category} />
        <span
          className={clsx('shrink-0 rounded-md px-1.5 text-xs font-bold tabular-nums', pct >= 70 ? 'bg-clay-50 text-clay-700' : 'bg-saffron-50 text-saffron-700')}
          title="Similarity confidence"
        >
          {pct}% match
        </span>
      </div>
      <Link to={`/problems/${p.id}`} target="_blank" className="mt-1.5 block leading-snug font-bold text-sand-900 hover:text-atlas-800">
        {p.title}
      </Link>
      <p className="mt-1 flex items-center gap-1 text-xs text-sand-500">
        <MapPin className="size-3" aria-hidden /> {p.city}
        {p.neighborhood && ` · ${p.neighborhood}`}
      </p>
      <div className="mt-2 flex items-center gap-3 text-xs font-semibold text-sand-600">
        <span className="inline-flex items-center gap-1">
          <HandHeart className="size-3.5 text-clay-500" aria-hidden /> {num(p.supporters_count)} supporters
        </span>
        <span className="inline-flex items-center gap-1">
          <Lightbulb className="size-3.5 text-saffron-600" aria-hidden /> {p.solutions_count} solutions
        </span>
      </div>
      <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={onSupport} loading={supporting}>
        <HandHeart className="size-3.5" aria-hidden /> Support this instead
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
  const [params] = useSearchParams()

  const [form, setForm] = useState({
    title: '',
    description: '',
    category: '',
    city: '',
    neighborhood: '',
    location: '',
    impact: 'medium' as Level,
    urgency: 'medium' as Level,
    tags: [] as string[],
    is_official: params.get('official') === '1',
  })
  const [coords, setCoords] = useState<[number, number] | null>(null)
  const [image, setImage] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [analysis, setAnalysis] = useState<ProblemAnalysis | null>(null)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [dupOpen, setDupOpen] = useState(false)
  const [dupAck, setDupAck] = useState(false)
  const update = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }))

  useEffect(() => {
    if (user?.city && !form.city) update({ city: user.city })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.city])

  // Live duplicate detection while typing.
  const text = useDebounced(`${form.title}|${form.description}|${form.city}|${form.neighborhood}`, 600)
  const similar = useQuery({
    queryKey: ['similar', text],
    queryFn: () =>
      api.post<SimilarProblem[]>('/ai/similar-problems', {
        title: form.title,
        description: form.description,
        city: form.city || null,
        neighborhood: form.neighborhood || null,
        category: form.category || null,
      }),
    enabled: form.title.length + form.description.length >= 15,
    staleTime: 60_000,
  })
  const topMatch = similar.data?.[0]
  useEffect(() => setDupAck(false), [topMatch?.id])

  const analyze = useMutation({
    mutationFn: () => api.post<ProblemAnalysis>('/ai/analyze-problem', { title: form.title, description: form.description, city: form.city || null }),
    onSuccess: (a) => {
      setAnalysis(a)
      setAnalysisError(null)
    },
    onError: () => setAnalysisError('AI analysis is temporarily unavailable. You can continue manually.'),
  })
  const canAnalyze = form.description.trim().length >= 20

  const applySuggestions = () => {
    if (!analysis) return
    update({
      category: analysis.category,
      urgency: analysis.urgency,
      impact: analysis.impact,
      tags: form.tags.length ? form.tags : analysis.keywords.slice(0, 4),
    })
    toast('AI suggestions applied — review them before publishing.', 'info')
  }

  const support = useMutation({
    mutationFn: (id: number) => api.post(`/problems/${id}/support`).then(() => id),
    onSuccess: (id) => {
      toast('You now support the existing problem — together your voices count more.')
      navigate(`/problems/${id}`)
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })

  const create = useMutation({
    mutationFn: () =>
      api.post<ProblemDetail>('/problems', {
        ...form,
        neighborhood: form.neighborhood || null,
        location: form.location || null,
        lat: coords?.[0] ?? null,
        lng: coords?.[1] ?? null,
        image_url: image,
      }),
    onSuccess: (p) => {
      toast('Your problem is now public. The community can start proposing solutions.')
      navigate(`/problems/${p.id}`)
    },
    onError: (e) => {
      if (e instanceof ApiError && e.fields) setErrors(e.fields)
      toast(errorMessage(e), 'error')
      setDupOpen(false)
    },
  })

  const validate = () => {
    const e: Record<string, string> = {}
    if (form.title.trim().length < 8) e.title = 'Give your problem a clear title (at least 8 characters).'
    if (form.description.trim().length < 20) e.description = 'Describe the problem in a bit more detail (at least 20 characters).'
    if (!form.category) e.category = 'Choose the category that fits best.'
    if (!form.city) e.city = 'Choose a city.'
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
    create.mutate()
  }

  const cityCenter = useMemo<[number, number]>(() => {
    const c = meta.data?.cities.find((x) => x.name === form.city)
    return c ? [c.lat, c.lng] : [33.9716, -6.8498]
  }, [meta.data, form.city])

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
          body="Problems are public, so we ask contributors to have an account. It takes 30 seconds."
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
        <p className="eyebrow">{form.is_official ? 'Official challenge' : 'Submit a problem'}</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">What's happening in your neighbourhood?</h1>
        <p className="mt-1 text-sand-600">Describe it in your own words. Our AI helps you categorise it and checks whether someone already reported it.</p>
      </div>

      <form onSubmit={submit} noValidate className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
        <div className="card space-y-6 p-5 sm:p-7">
          <Field label="Problem title" htmlFor="title" error={errors.title} hint="Short and specific, e.g. “Garbage bins near the market are always full”.">
            <input
              id="title"
              className="input"
              maxLength={160}
              value={form.title}
              aria-invalid={!!errors.title}
              onChange={(e) => update({ title: e.target.value })}
              placeholder="What is the problem?"
            />
          </Field>

          <Field label="Description" htmlFor="description" error={errors.description} hint="Where exactly, how often, who is affected, since when?">
            <textarea
              id="description"
              className="input min-h-36"
              maxLength={5000}
              value={form.description}
              aria-invalid={!!errors.description}
              onChange={(e) => update({ description: e.target.value })}
              onBlur={() => canAnalyze && !analysis && !analyze.isPending && analyze.mutate()}
              placeholder="The garbage containers around the market overflow every Friday and Saturday…"
            />
          </Field>

          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-violet-200 bg-violet-50/50 p-3">
            <BrainCircuit className="size-5 text-violet-600" aria-hidden />
            <p className="flex-1 text-sm text-sand-700">Let AI extract the category, urgency, frequency and keywords from your description.</p>
            <Button type="button" variant="secondary" size="sm" disabled={!canAnalyze} loading={analyze.isPending} onClick={() => analyze.mutate()}>
              <Sparkles className="size-3.5" aria-hidden /> {analysis ? 'Re-analyze' : 'Analyze with AI'}
            </Button>
          </div>

          <fieldset>
            <legend className="label">Category</legend>
            {errors.category && <p className="-mt-1 mb-2 text-xs font-medium text-red-700">{errors.category}</p>}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-invalid={!!errors.category}>
              {meta.data?.categories.map((c) => (
                <button
                  key={c.slug}
                  type="button"
                  role="radio"
                  aria-checked={form.category === c.slug}
                  onClick={() => update({ category: c.slug })}
                  className={clsx(
                    'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-[13px] leading-tight font-semibold transition-colors',
                    form.category === c.slug ? 'border-atlas-600 bg-atlas-50 text-atlas-900 ring-2 ring-atlas-100' : 'border-sand-200 text-sand-700 hover:border-sand-300',
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
            <Field label="City" htmlFor="city" error={errors.city}>
              <select id="city" className="input" value={form.city} aria-invalid={!!errors.city} onChange={(e) => update({ city: e.target.value })}>
                <option value="">Choose a city…</option>
                {meta.data?.cities.map((c) => (
                  <option key={c.name}>{c.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Neighbourhood" htmlFor="neighborhood" optional>
              <input id="neighborhood" className="input" maxLength={120} value={form.neighborhood} onChange={(e) => update({ neighborhood: e.target.value })} placeholder="e.g. Akkari" />
            </Field>
          </div>
          <Field label="Location" htmlFor="location" optional hint="A landmark or street helps others find it. Click the map to drop a pin.">
            <input id="location" className="input" maxLength={200} value={form.location} onChange={(e) => update({ location: e.target.value })} placeholder="e.g. Eastern entrance of the market" />
          </Field>
          <div>
            <Suspense fallback={<div className="h-56 animate-pulse rounded-xl bg-sand-100" />}>
              <LocationPicker center={cityCenter} value={coords} onPick={(lat, lng) => setCoords([lat, lng])} />
            </Suspense>
            <p className="hint flex items-center gap-2">
              {coords ? (
                <>
                  Pin set at {coords[0]}, {coords[1]}
                  <button type="button" className="font-semibold text-clay-600 hover:underline" onClick={() => setCoords(null)}>
                    Remove
                  </button>
                </>
              ) : (
                'No pin yet — the city centre will be used on the map.'
              )}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Urgency" hint="How quickly does this need attention?">
              <Segmented label="Urgency" value={form.urgency} onChange={(v) => update({ urgency: v })} options={LEVELS} />
            </Field>
            <Field label="Estimated impact" hint="How many people does it affect, how badly?">
              <Segmented label="Impact" value={form.impact} onChange={(v) => update({ impact: v })} options={LEVELS} />
            </Field>
          </div>

          <Field label="Tags" htmlFor="tags" optional hint="Press Enter to add. Up to 8.">
            <ChipInput id="tags" value={form.tags} onChange={(tags) => update({ tags })} max={8} suggestions={analysis?.keywords ?? []} placeholder="waste, market, weekend…" />
          </Field>

          <Field label="Photo" optional hint="JPG, PNG or WebP up to 5 MB.">
            {image ? (
              <div className="relative w-fit">
                <img src={image} alt="Uploaded problem" className="h-36 rounded-xl object-cover" />
                <button type="button" onClick={() => setImage(null)} className="absolute top-2 right-2 rounded-lg bg-white/90 p-1 text-sand-700 shadow hover:bg-white" aria-label="Remove photo">
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-sand-300 px-4 py-5 text-sm text-sand-600 hover:border-atlas-400 hover:bg-atlas-50/40">
                {uploading ? <Loader2 className="size-5 animate-spin text-atlas-600" aria-hidden /> : <ImagePlus className="size-5 text-sand-400" aria-hidden />}
                {uploading ? 'Uploading…' : 'Add a photo of the problem'}
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => onImage(e.target.files?.[0])} />
              </label>
            )}
          </Field>

          {isDecisionMaker && (
            <label className="flex items-start gap-3 rounded-xl border border-atlas-200 bg-atlas-50/60 p-4">
              <input type="checkbox" className="mt-0.5 size-4 accent-atlas-700" checked={form.is_official} onChange={(e) => update({ is_official: e.target.checked })} />
              <span className="text-sm">
                <span className="flex items-center gap-1.5 font-bold text-atlas-900">
                  <Landmark className="size-4" aria-hidden /> Publish as an official challenge
                </span>
                <span className="text-sand-600">Marks this as a challenge from {user.name}, inviting the community to propose solutions.</span>
              </span>
            </label>
          )}

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-sand-100 pt-5">
            <Link to="/problems" className={btn('ghost', 'md')}>
              Cancel
            </Link>
            <Button type="submit" variant="accent" size="lg" loading={create.isPending}>
              Publish problem
            </Button>
          </div>
        </div>

        {/* --------------------------------------------- AI assistant */}
        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <section className="card p-4" aria-live="polite" aria-labelledby="similar-title">
            <h2 id="similar-title" className="flex items-center gap-2 text-sm font-bold text-sand-900">
              <CopyCheck className="size-4 text-clay-500" aria-hidden /> Similar problems
              {similar.isFetching && <Loader2 className="size-3.5 animate-spin text-sand-400" aria-label="Checking" />}
            </h2>
            {form.title.length + form.description.length < 15 ? (
              <p className="mt-2 text-sm text-sand-500">Start typing — we'll check whether this problem was already reported.</p>
            ) : similar.isError ? (
              <p className="mt-2 text-sm text-sand-500">Duplicate check is temporarily unavailable. You can continue.</p>
            ) : similar.data && similar.data.length > 0 ? (
              <>
                <p className="mt-1 mb-3 text-sm text-sand-600">
                  {similar.data[0].similarity >= DUPLICATE_THRESHOLD ? 'We found a potentially similar problem.' : 'Possibly related problems:'}
                </p>
                <div className="space-y-2.5">
                  {similar.data.slice(0, 3).map((p) => (
                    <SimilarItem key={p.id} p={p} onSupport={() => support.mutate(p.id)} supporting={support.isPending && support.variables === p.id} />
                  ))}
                </div>
              </>
            ) : similar.data ? (
              <p className="mt-2 text-sm text-sand-500">No similar problem found. You may be the first to report this.</p>
            ) : null}
          </section>

          {analyze.isPending && !analysis && (
            <div className="card flex items-center gap-3 p-4 text-sm text-sand-600">
              <Loader2 className="size-4 animate-spin text-violet-600" aria-hidden /> Analyzing your description…
            </div>
          )}
          {analysisError && <p className="card p-4 text-sm text-sand-600">{analysisError}</p>}
          {analysis && (
            <div className="space-y-2">
              <AnalysisCard analysis={analysis} compactView />
              <Button type="button" variant="secondary" className="w-full" onClick={applySuggestions}>
                <Wand2 className="size-4" aria-hidden /> Apply suggestions to the form
              </Button>
            </div>
          )}
        </aside>
      </form>

      <Modal
        open={dupOpen}
        onClose={() => setDupOpen(false)}
        title="We found a potentially similar problem"
        footer={
          <>
            <Button
              variant="secondary"
              loading={create.isPending}
              onClick={() => {
                setDupAck(true)
                create.mutate()
              }}
            >
              Create New Problem
            </Button>
            {topMatch && (
              <Button variant="accent" loading={support.isPending} onClick={() => support.mutate(topMatch.id)}>
                <HandHeart className="size-4" aria-hidden /> Support Existing Problem
              </Button>
            )}
          </>
        }
      >
        <p className="mb-4 text-sm text-sand-600">
          Supporting an existing problem gives it more weight and keeps all solutions in one place. If yours is genuinely different, you can still create it.
        </p>
        {topMatch && (
          <div className="rounded-xl border border-sand-200 bg-sand-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <CategoryBadge category={topMatch.category} />
              <span className="rounded-md bg-clay-50 px-2 py-0.5 text-sm font-extrabold text-clay-700 tabular-nums">{Math.round(topMatch.similarity * 100)}% similar</span>
            </div>
            <p className="mt-2 font-bold text-sand-900">{topMatch.title}</p>
            <p className="mt-1 flex items-center gap-1 text-sm text-sand-500">
              <MapPin className="size-3.5" aria-hidden /> {topMatch.city}
              {topMatch.neighborhood && ` · ${topMatch.neighborhood}`}
            </p>
            <div className="mt-3 flex gap-4 text-sm font-semibold text-sand-700">
              <span className="inline-flex items-center gap-1">
                <HandHeart className="size-4 text-clay-500" aria-hidden /> {num(topMatch.supporters_count)} supporters
              </span>
              <span className="inline-flex items-center gap-1">
                <Lightbulb className="size-4 text-saffron-600" aria-hidden /> {topMatch.solutions_count} solutions
              </span>
            </div>
            {topMatch.shared_terms.length > 0 && <p className="mt-2 text-xs text-sand-500">Shared concepts: {topMatch.shared_terms.join(', ')}</p>}
          </div>
        )}
      </Modal>
    </Page>
  )
}
