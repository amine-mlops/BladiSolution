import clsx from 'clsx'
import { ArrowLeft, Building2, GraduationCap, Landmark, Shield, User, Users } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { Button, ChipInput, Field } from '../components/ui'
import { useAuth } from '../hooks/auth'
import { useDocumentTitle, useMeta } from '../hooks/misc'
import { ApiError, errorMessage } from '../lib/api'
import { ORG_KIND_LABEL } from '../lib/format'

const DEMO = [
  { label: 'Citizen', who: 'Salma Benali', email: 'citizen@bladisolution.ma', icon: User },
  { label: 'Talent', who: 'Youssef Amrani', email: 'talent@bladisolution.ma', icon: GraduationCap },
  { label: 'Organization', who: 'GreenRabat Association', email: 'org@bladisolution.ma', icon: Building2 },
  { label: 'Municipality', who: 'Rabat Municipal Innovation Office', email: 'city@bladisolution.ma', icon: Landmark },
  { label: 'Moderator', who: 'Moderation team', email: 'admin@bladisolution.ma', icon: Shield },
]
const DEMO_PASSWORD = 'demo1234'

function safeNext(next: string | null) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/'
}

function AuthShell({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="grid grid-cols-1 min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <div className="zellige-light relative hidden flex-col justify-between overflow-hidden bg-atlas-800 p-10 text-white lg:flex">
        <Link to="/" aria-label="BladiSolution home">
          <Logo light />
        </Link>
        <div>
          <p className="max-w-md text-3xl leading-tight font-extrabold">Every city has problems. BladiSolution turns them into opportunities to build solutions.</p>
          <ul className="mt-8 space-y-3 text-atlas-100">
            {['Report local problems and rally support', 'Propose solutions and earn civic reputation', 'Help institutions find and implement what works'].map((t) => (
              <li key={t} className="flex items-center gap-3">
                <span className="size-1.5 rounded-full bg-saffron-400" aria-hidden /> {t}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-atlas-200">ASCIC Hackathon 2026 · Where communities meet solutions.</p>
      </div>
      <div className="flex flex-col px-4 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-sand-600 hover:text-sand-900">
            <ArrowLeft className="size-4" aria-hidden /> Back
          </Link>
          <Link to="/" className="lg:hidden" aria-label="BladiSolution home">
            <Logo />
          </Link>
        </div>
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h1>
          <p className="mt-1 text-sand-600">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </main>
      </div>
    </div>
  )
}

export function LoginPage() {
  useDocumentTitle('Sign in')
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  if (user && !busy) return <Navigate to={next} replace />

  const doLogin = async (e: string, p: string, key: string) => {
    setBusy(key)
    setError(null)
    try {
      await login(e, p)
      navigate(next, { replace: true })
    } catch (err) {
      setError(errorMessage(err))
      setBusy(null)
    }
  }

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to support problems, star solutions and contribute.">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          doLogin(email, password, 'form')
        }}
      >
        <Field label="Email" htmlFor="email">
          <input id="email" type="email" autoComplete="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password" htmlFor="password">
          <input id="password" type="password" autoComplete="current-password" required className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" loading={busy === 'form'}>
          Sign in
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-sand-600">
        New to BladiSolution?{' '}
        <Link to={`/register${params.get('next') ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-semibold text-atlas-700 hover:underline">
          Create an account
        </Link>
      </p>

      <section className="mt-10 rounded-2xl border border-dashed border-saffron-400/60 bg-saffron-50/60 p-4" aria-labelledby="demo-title">
        <h2 id="demo-title" className="text-sm font-bold text-sand-900">
          Demo accounts
        </h2>
        <p className="text-xs text-sand-600">
          For judges and testers. Password for all: <code className="rounded bg-white px-1 font-mono font-bold">{DEMO_PASSWORD}</code>
        </p>
        <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {DEMO.map((d) => (
            <li key={d.email}>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => doLogin(d.email, DEMO_PASSWORD, d.email)}
                className="flex w-full items-center gap-2.5 rounded-xl border border-sand-200 bg-white px-3 py-2 text-left hover:border-atlas-400 disabled:opacity-60"
              >
                <d.icon className="size-4 shrink-0 text-atlas-700" aria-hidden />
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-sand-900">{busy === d.email ? 'Signing in…' : `${d.label} Demo`}</span>
                  <span className="block truncate text-[11px] text-sand-500">{d.email}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </AuthShell>
  )
}

const ROLES = [
  { value: 'citizen', label: 'Citizen', text: 'Report problems and support your community.', icon: User },
  { value: 'talent', label: 'Talent / Innovator', text: 'Student, engineer, designer, researcher…', icon: GraduationCap },
  { value: 'organization', label: 'Organization', text: 'Startup, NGO, association, lab, club.', icon: Users },
  { value: 'municipality', label: 'Municipality / Institution', text: 'Publish challenges and implement solutions.', icon: Landmark },
] as const

export function RegisterPage() {
  useDocumentTitle('Create an account')
  const { user, register } = useAuth()
  const meta = useMeta()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'citizen', org_kind: 'startup', city: '', skills: [] as string[] })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (user && !busy) return <Navigate to={next} replace />
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }))
  const isOrg = form.role === 'organization' || form.role === 'municipality'

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (form.name.trim().length < 2) errs.name = 'Please enter your name.'
    if (!/^\S+@\S+\.\S+$/.test(form.email)) errs.email = 'Please enter a valid email.'
    if (form.password.length < 8) errs.password = 'Use at least 8 characters.'
    setErrors(errs)
    if (Object.keys(errs).length) return
    setBusy(true)
    setError(null)
    try {
      await register({ ...form, city: form.city || null, org_kind: form.role === 'organization' ? form.org_kind : null })
      navigate(next === '/' ? '/settings' : next, { replace: true })
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields)
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <AuthShell title="Join BladiSolution" subtitle="Turn what you see — and what you know — into solutions for your city.">
      <form className="space-y-5" onSubmit={submit} noValidate>
        <fieldset>
          <legend className="label">I'm joining as</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {ROLES.map((r) => (
              <label
                key={r.value}
                className={clsx(
                  'flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors',
                  form.role === r.value ? 'border-atlas-600 bg-atlas-50 ring-2 ring-atlas-100' : 'border-sand-200 hover:border-sand-300',
                )}
              >
                <input type="radio" name="role" value={r.value} checked={form.role === r.value} onChange={() => set({ role: r.value })} className="sr-only" />
                <r.icon className="mt-0.5 size-5 shrink-0 text-atlas-700" aria-hidden />
                <span>
                  <span className="block text-sm font-bold text-sand-900">{r.label}</span>
                  <span className="block text-xs text-sand-500">{r.text}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <Field label={isOrg ? 'Organization name' : 'Full name'} htmlFor="r-name" error={errors.name}>
          <input id="r-name" autoComplete={isOrg ? 'organization' : 'name'} className="input" value={form.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        {form.role === 'organization' && (
          <Field label="Organization type" htmlFor="r-kind">
            <select id="r-kind" className="input" value={form.org_kind} onChange={(e) => set({ org_kind: e.target.value })}>
              {Object.entries(ORG_KIND_LABEL)
                .filter(([k]) => k !== 'municipality')
                .map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
            </select>
          </Field>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Email" htmlFor="r-email" error={errors.email}>
            <input id="r-email" type="email" autoComplete="email" className="input" value={form.email} onChange={(e) => set({ email: e.target.value })} />
          </Field>
          <Field label="Password" htmlFor="r-pass" error={errors.password} hint="At least 8 characters.">
            <input id="r-pass" type="password" autoComplete="new-password" className="input" value={form.password} onChange={(e) => set({ password: e.target.value })} />
          </Field>
        </div>
        <Field label="City" htmlFor="r-city" optional>
          <select id="r-city" className="input" value={form.city} onChange={(e) => set({ city: e.target.value })}>
            <option value="">Choose your city…</option>
            {meta.data?.cities.map((c) => (
              <option key={c.name}>{c.name}</option>
            ))}
          </select>
        </Field>
        {form.role !== 'citizen' && (
          <Field label="Skills" htmlFor="r-skills" optional hint="Helps us match you with problems.">
            <ChipInput id="r-skills" value={form.skills} onChange={(skills) => set({ skills })} suggestions={meta.data?.skills.slice(0, 20) ?? []} placeholder="Python, GIS, Community Organizing…" />
          </Field>
        )}
        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" loading={busy}>
          Create account
        </Button>
        <p className="text-center text-sm text-sand-600">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-atlas-700 hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  )
}
