import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BadgeCheck, Building2, EyeOff, ShieldCheck, ShieldOff } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Page } from '../components/Layout'
import { Avatar, Button, CardSkeleton, EmptyState, ErrorState, Tabs, UserLink } from '../components/ui'
import { useAuth } from '../hooks/auth'
import { useDocumentTitle, useToast } from '../hooks/misc'
import { api, errorMessage } from '../lib/api'
import { roleLabel, timeAgo } from '../lib/format'
import type { UserBrief } from '../lib/types'

interface Report {
  id: number
  target_type: string
  target_id: number
  target: { title: string; text: string; link: string; hidden: boolean } | null
  reason: string
  details: string | null
  status: string
  reporter: UserBrief
  created_at: string
  reports_on_target: number
}

interface OrgAccount extends UserBrief {
  email: string
  created_at: string
}

function OrganizationVerification() {
  const qc = useQueryClient()
  const toast = useToast()
  const [status, setStatus] = useState<'pending' | 'verified'>('pending')
  const q = useQuery({ queryKey: ['moderation-orgs', status], queryFn: () => api.get<OrgAccount[]>('/moderation/organizations', { status }) })
  const set = useMutation({
    mutationFn: ({ id, verified }: { id: number; verified: boolean }) => api.post<OrgAccount>(`/moderation/organizations/${id}`, { verified }),
    onSuccess: (o) => {
      qc.invalidateQueries({ queryKey: ['moderation-orgs'] })
      toast(o.verified ? `${o.name} is verified.` : `Verification removed for ${o.name}.`, o.verified ? 'success' : 'info')
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })
  return (
    <section aria-labelledby="orgs-title" className="mt-8">
      <h2 id="orgs-title" className="flex items-center gap-2 text-lg font-extrabold text-navy-900">
        <Building2 className="size-5" aria-hidden /> Organization accounts
      </h2>
      <p className="mt-1 text-sm text-sand-600">
        Verified organizations can express interest in solutions and update their status. Check that the account really represents the organization before
        verifying it, for example by its email domain or by contacting it.
      </p>
      <Tabs
        label="Organization status"
        value={status}
        onChange={setStatus}
        className="mt-4 w-fit"
        items={[
          { value: 'pending' as const, label: 'Waiting' },
          { value: 'verified' as const, label: 'Verified' },
        ]}
      />
      <div className="mt-4">
        {q.isLoading ? (
          <CardSkeleton />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : !q.data?.length ? (
          <p className="card p-5 text-sm text-sand-600">{status === 'pending' ? 'No organization is waiting for verification.' : 'No verified organizations yet.'}</p>
        ) : (
          <ul className="card divide-y divide-sand-100">
            {q.data.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-3 p-4">
                <Avatar user={o} size={36} />
                <div className="min-w-0 flex-1">
                  <UserLink user={o} />
                  <p className="truncate text-xs text-sand-500">
                    {roleLabel(o)} · {o.email} · joined {timeAgo(o.created_at)}
                  </p>
                </div>
                {status === 'pending' ? (
                  <Button size="sm" loading={set.isPending && set.variables?.id === o.id} onClick={() => set.mutate({ id: o.id, verified: true })}>
                    <BadgeCheck className="size-4" aria-hidden /> Verify
                  </Button>
                ) : (
                  <Button size="sm" variant="secondary" loading={set.isPending && set.variables?.id === o.id} onClick={() => set.mutate({ id: o.id, verified: false })}>
                    Remove verification
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

export default function Moderation() {
  useDocumentTitle('Moderation')
  const { user } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const [status, setStatus] = useState<'open' | 'actioned' | 'dismissed'>('open')
  const q = useQuery({ queryKey: ['reports', status], queryFn: () => api.get<Report[]>('/moderation/reports', { status }), enabled: user?.role === 'admin' })
  const act = useMutation({
    mutationFn: ({ id, action }: { id: number; action: 'hide' | 'dismiss' }) => api.post(`/moderation/reports/${id}`, { action }),
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['reports'] })
      toast(v.action === 'hide' ? 'Content hidden from the platform.' : 'Report dismissed.', v.action === 'hide' ? 'success' : 'info')
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })
  if (!user || user.role !== 'admin')
    return (
      <Page>
        <EmptyState icon={ShieldOff} title="Moderators only" body="This area is reserved for the BladiSolution Campus moderation team." />
      </Page>
    )
  return (
    <Page className="max-w-4xl">
      <h1 className="text-2xl font-extrabold tracking-tight text-navy-900">Moderation</h1>
      <OrganizationVerification />
      <h2 className="mt-10 text-lg font-extrabold text-navy-900">Reports</h2>
      <p className="mt-1 text-sand-600">Reports from the community about problems, solutions, comments and profiles.</p>
      <Tabs
        label="Report status"
        value={status}
        onChange={setStatus}
        className="mt-5 w-fit"
        items={[
          { value: 'open', label: 'Open' },
          { value: 'actioned', label: 'Actioned' },
          { value: 'dismissed', label: 'Dismissed' },
        ]}
      />
      <div className="mt-5">
        {q.isLoading ? (
          <CardSkeleton />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : !q.data?.length ? (
          <EmptyState icon={ShieldCheck} title={status === 'open' ? 'Nothing to review' : 'No reports here'} body="The community is behaving." />
        ) : (
          <ul className="space-y-3">
            {q.data.map((r) => (
              <li key={r.id} className="card p-5">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-clay-50 px-2 py-0.5 font-bold text-clay-700 capitalize">{r.reason}</span>
                  <span className="rounded-full bg-sand-100 px-2 py-0.5 font-semibold text-sand-600 capitalize">{r.target_type}</span>
                  {r.reports_on_target > 1 && <span className="font-semibold text-red-700">{r.reports_on_target} reports on this item</span>}
                  <span className="ml-auto text-sand-500">
                    by {r.reporter.name} · {timeAgo(r.created_at)}
                  </span>
                </div>
                {r.target ? (
                  <div className="mt-3 rounded-xl bg-sand-50 p-3">
                    <Link to={r.target.link} className="font-semibold text-sand-900 hover:text-atlas-800">
                      {r.target.title}
                    </Link>
                    <p className="mt-1 line-clamp-3 text-sm text-sand-600">{r.target.text}</p>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-sand-500">The reported content no longer exists.</p>
                )}
                {r.details && <p className="mt-2 text-sm text-sand-700">“{r.details}”</p>}
                {status === 'open' && (
                  <div className="mt-4 flex gap-2">
                    <Button size="sm" variant="accent" loading={act.isPending && act.variables?.id === r.id && act.variables.action === 'hide'} onClick={() => act.mutate({ id: r.id, action: 'hide' })}>
                      <EyeOff className="size-4" aria-hidden /> Hide content
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => act.mutate({ id: r.id, action: 'dismiss' })}>
                      Dismiss
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Page>
  )
}
