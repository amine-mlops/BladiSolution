import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { BellRing, Camera, Loader2, LogIn } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Page } from '../components/Layout'
import { Avatar, Button, CategoryIcon, ChipInput, EmptyState, Field, btn } from '../components/ui'
import { useAuth } from '../hooks/auth'
import { useDocumentTitle, useMeta, useToast } from '../hooks/misc'
import { ApiError, api, errorMessage } from '../lib/api'
import { ORG_KIND_LABEL, ROLE_LABEL } from '../lib/format'
import type { Me, Role } from '../lib/types'

export default function Settings() {
  useDocumentTitle('Edit profile')
  const { user, loading, refresh } = useAuth()
  const meta = useMeta()
  const toast = useToast()
  const qc = useQueryClient()
  const [form, setForm] = useState({ name: '', headline: '', city: '', bio: '', skills: [] as string[], avatar_url: '', website: '', role: 'citizen' as Role, org_kind: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [uploading, setUploading] = useState(false)
  useEffect(() => {
    if (user)
      setForm({
        name: user.name,
        headline: user.headline ?? '',
        city: user.city ?? '',
        bio: user.bio ?? '',
        skills: user.skills,
        avatar_url: user.avatar_url ?? '',
        website: user.website ?? '',
        role: user.role,
        org_kind: user.org_kind ?? '',
      })
  }, [user])
  const cats = useQuery({ queryKey: ['category-follows'], queryFn: () => api.get<string[]>('/me/category-follows'), enabled: !!user })
  const toggleCat = useMutation({
    mutationFn: ({ slug, on }: { slug: string; on: boolean }) => (on ? api.post(`/categories/${slug}/follow`) : api.del(`/categories/${slug}/follow`)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['category-follows'] }),
    onError: (e) => toast(errorMessage(e), 'error'),
  })
  const save = useMutation({
    mutationFn: () =>
      api.patch<Me>('/users/me', {
        ...form,
        avatar_url: form.avatar_url || null,
        website: form.website || null,
        org_kind: form.role === 'organization' ? form.org_kind || null : null,
        role: user?.role === 'admin' ? undefined : form.role,
      }),
    onSuccess: (me) => {
      qc.setQueryData(['me'], me)
      qc.invalidateQueries({ queryKey: ['profile', me.username] })
      refresh()
      setErrors({})
      toast('Profile saved.')
    },
    onError: (e) => {
      if (e instanceof ApiError && e.fields) setErrors(e.fields)
      toast(errorMessage(e), 'error')
    },
  })

  if (loading) return null
  if (!user)
    return (
      <Page>
        <EmptyState icon={LogIn} title="Sign in to edit your profile" action={<Link to="/login?next=/settings" className={btn('primary', 'md')}>Sign in</Link>} />
      </Page>
    )
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }))
  const isOrg = form.role === 'organization' || form.role === 'municipality'

  return (
    <Page>
      <h1 className="text-2xl font-extrabold tracking-tight">Edit profile</h1>
      <p className="mt-1 text-sand-600">Your profile shows your civic contributions. Skills help the right problems find you.</p>
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <form
          className="card space-y-5 p-5 sm:p-7"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate()
          }}
        >
          <div className="flex items-center gap-4">
            <Avatar user={{ ...user, avatar_url: form.avatar_url || null, name: form.name || user.name }} size={72} />
            <div>
              <label className={btn('secondary', 'sm', 'cursor-pointer')}>
                {uploading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Camera className="size-4" aria-hidden />}
                Upload photo
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    setUploading(true)
                    try {
                      set({ avatar_url: (await api.upload(file)).url })
                    } catch (err) {
                      toast(errorMessage(err), 'error')
                    } finally {
                      setUploading(false)
                    }
                  }}
                />
              </label>
              {form.avatar_url && (
                <button type="button" className="ml-2 text-xs font-semibold text-sand-500 hover:text-red-700" onClick={() => set({ avatar_url: '' })}>
                  Remove
                </button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={isOrg ? 'Organization name' : 'Full name'} htmlFor="s-name" error={errors.name}>
              <input id="s-name" className="input" value={form.name} onChange={(e) => set({ name: e.target.value })} />
            </Field>
            <Field label="Headline" htmlFor="s-head" optional error={errors.headline}>
              <input id="s-head" className="input" maxLength={120} value={form.headline} onChange={(e) => set({ headline: e.target.value })} placeholder="AI / Data Engineer" />
            </Field>
            {user.role !== 'admin' && (
              <Field label="Role" htmlFor="s-role">
                <select id="s-role" className="input" value={form.role} onChange={(e) => set({ role: e.target.value as Role })}>
                  {(['citizen', 'talent', 'organization', 'municipality'] as Role[]).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {form.role === 'organization' && (
              <Field label="Organization type" htmlFor="s-kind">
                <select id="s-kind" className="input" value={form.org_kind} onChange={(e) => set({ org_kind: e.target.value })}>
                  <option value="">Choose…</option>
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
            <Field label="City" htmlFor="s-city">
              <select id="s-city" className="input" value={form.city} onChange={(e) => set({ city: e.target.value })}>
                <option value="">—</option>
                {meta.data?.cities.map((c) => (
                  <option key={c.name}>{c.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Website" htmlFor="s-web" optional error={errors.website}>
              <input id="s-web" className="input" value={form.website} onChange={(e) => set({ website: e.target.value })} placeholder="https://" />
            </Field>
          </div>
          <Field label="Bio" htmlFor="s-bio" optional>
            <textarea id="s-bio" rows={4} className="input" maxLength={2000} value={form.bio} onChange={(e) => set({ bio: e.target.value })} />
          </Field>
          <Field label="Skills" htmlFor="s-skills" hint="Used to match you with problems and teams.">
            <ChipInput id="s-skills" value={form.skills} onChange={(skills) => set({ skills })} suggestions={meta.data?.skills ?? []} max={15} placeholder="Python, Urban Planning…" />
          </Field>
          <div className="flex justify-end border-t border-sand-100 pt-5">
            <Button type="submit" loading={save.isPending}>
              Save profile
            </Button>
          </div>
        </form>
        <aside className="card h-fit p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-sand-900">
            <BellRing className="size-4 text-atlas-700" aria-hidden /> Follow categories
          </h2>
          <p className="mt-1 text-xs text-sand-500">Get notified when new problems are published in these areas.</p>
          <ul className="mt-3 space-y-1">
            {meta.data?.categories.map((c) => {
              const on = cats.data?.includes(c.slug) ?? false
              return (
                <li key={c.slug}>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    onClick={() => toggleCat.mutate({ slug: c.slug, on: !on })}
                    className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-sm font-semibold text-sand-700 hover:bg-sand-50"
                  >
                    <span className="grid size-7 place-items-center rounded-lg" style={{ backgroundColor: `${c.color}1a`, color: c.color }}>
                      <CategoryIcon icon={c.icon} className="size-4" />
                    </span>
                    <span className="flex-1">{c.name}</span>
                    <span className={clsx('relative h-5 w-9 rounded-full transition-colors', on ? 'bg-atlas-600' : 'bg-sand-300')} aria-hidden>
                      <span className={clsx('absolute top-0.5 size-4 rounded-full bg-white shadow transition-all', on ? 'left-[18px]' : 'left-0.5')} />
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </aside>
      </div>
    </Page>
  )
}
