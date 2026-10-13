import { useMutation, useQueryClient } from '@tanstack/react-query'
import { BadgeCheck, Camera, Clock, Loader2, LogIn } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Page } from '../components/Layout'
import { Avatar, Button, ChipInput, EmptyState, Field, btn } from '../components/ui'
import { useAuth } from '../hooks/auth'
import { useDocumentTitle, useMeta, useToast } from '../hooks/misc'
import { ApiError, api, errorMessage } from '../lib/api'
import { ORG_KIND_LABEL, isOrganization, roleLabel } from '../lib/format'
import type { Me } from '../lib/types'

export default function Settings() {
  useDocumentTitle('Edit profile')
  const { user, loading, refresh } = useAuth()
  const meta = useMeta()
  const toast = useToast()
  const qc = useQueryClient()
  const [form, setForm] = useState({ name: '', headline: '', affiliation: '', city: '', bio: '', skills: [] as string[], avatar_url: '', website: '', org_kind: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [uploading, setUploading] = useState(false)
  useEffect(() => {
    if (user)
      setForm({
        name: user.name,
        headline: user.headline ?? '',
        affiliation: user.affiliation ?? '',
        city: user.city ?? '',
        bio: user.bio ?? '',
        skills: user.skills,
        avatar_url: user.avatar_url ?? '',
        website: user.website ?? '',
        org_kind: user.org_kind ?? '',
      })
  }, [user])
  const save = useMutation({
    mutationFn: () =>
      api.patch<Me>('/users/me', {
        ...form,
        affiliation: form.affiliation.trim() || null,
        avatar_url: form.avatar_url || null,
        website: form.website || null,
        org_kind: user?.role === 'organization' ? form.org_kind || null : null,
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
  const isOrg = isOrganization(user)

  return (
    <Page>
      <h1 className="text-2xl font-extrabold tracking-tight">Edit profile</h1>
      <p className="mt-1 text-sand-600">This is what other people see next to your problems and solutions.</p>
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
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
              <input id="s-head" className="input" maxLength={120} value={form.headline} onChange={(e) => set({ headline: e.target.value })} placeholder={isOrg ? 'What your organization does' : 'e.g. Computer engineering student'} />
            </Field>
            {!isOrg && (
              <Field label="University, school or organization" htmlFor="s-aff" optional error={errors.affiliation}>
                <input id="s-aff" className="input" maxLength={160} value={form.affiliation} onChange={(e) => set({ affiliation: e.target.value })} placeholder="e.g. ENSIAS, freelance" />
              </Field>
            )}
            {user.role === 'organization' && (
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
                <option value="">Not specified</option>
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
          <Field label="Skills" htmlFor="s-skills" optional hint="Helps solution authors find collaborators.">
            <ChipInput id="s-skills" value={form.skills} onChange={(skills) => set({ skills })} suggestions={meta.data?.skills ?? []} max={15} placeholder="Python, Urban Planning…" />
          </Field>
          <div className="flex justify-end border-t border-sand-100 pt-5">
            <Button type="submit" loading={save.isPending}>
              Save profile
            </Button>
          </div>
        </form>
        <aside className="card h-fit p-5">
          <h2 className="text-sm font-bold text-sand-900">Account</h2>
          <p className="mt-1 text-sm text-sand-600">{roleLabel(user)}</p>
          <p className="text-xs text-sand-500">{user.email}</p>
          {isOrg &&
            (user.verified ? (
              <p className="mt-3 flex items-start gap-2 rounded-xl bg-atlas-50 px-3 py-2 text-xs text-atlas-900">
                <BadgeCheck className="mt-px size-4 shrink-0" aria-hidden /> Verified organization. You can express interest in solutions and update their status.
              </p>
            ) : (
              <p className="mt-3 flex items-start gap-2 rounded-xl bg-navy-50 px-3 py-2 text-xs text-navy-900">
                <Clock className="mt-px size-4 shrink-0" aria-hidden /> Waiting for verification by a moderator. You can already publish problems and contact solution authors.
              </p>
            ))}
          <p className="mt-3 text-xs text-sand-500">
            Account type can't be changed here because it controls permissions. Contact the moderators if it needs to change.
          </p>
        </aside>
      </div>
    </Page>
  )
}
