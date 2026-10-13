import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { Building2, ChevronRight, Coins, ExternalLink, Gavel, Handshake, History, Link2, Mail, MapPin, Package, Rocket, Star, StickyNote, Trophy, UserPlus, Users } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ReportButton, ShareButton, StarButton } from '../components/actions'
import { CommentThread } from '../components/comments'
import { Page } from '../components/Layout'
import { Avatar, Button, CategoryBadge, ErrorState, Field, Modal, PageLoader, SolutionStatusBadge, UserLink } from '../components/ui'
import { useAuth } from '../hooks/auth'
import { useDocumentTitle, useToast } from '../hooks/misc'
import { api, errorMessage } from '../lib/api'
import { INTEREST_KIND, SOLUTION_FLOW, SOLUTION_STATUS, compact, formatDate, num, roleLabel, timeAgo } from '../lib/format'
import type { InterestKind, SolutionDetail as TSolution, SolutionStatus, UserBrief } from '../lib/types'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-xs font-bold tracking-wider text-sand-500 uppercase">{title}</h3>
      <div className="prose-civic mt-1.5 text-[15px] leading-relaxed whitespace-pre-line text-sand-800">{children}</div>
    </section>
  )
}

function DecisionPanel({ s }: { s: TSolution }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [status, setStatus] = useState<SolutionStatus>(s.status)
  const [note, setNote] = useState('')
  const [impl, setImpl] = useState({ location: '', impact_summary: '', citizens_impacted: '', evidence_url: '' })
  const m = useMutation({
    mutationFn: () =>
      api.patch<TSolution>(`/solutions/${s.id}/status`, {
        status,
        note: note || null,
        ...(status === 'implemented'
          ? {
              location: impl.location || null,
              impact_summary: impl.impact_summary || null,
              citizens_impacted: impl.citizens_impacted ? Number(impl.citizens_impacted) : null,
              evidence_url: impl.evidence_url || null,
            }
          : {}),
      }),
    onSuccess: (data) => {
      qc.setQueryData(['solution', s.id], data)
      qc.invalidateQueries({ queryKey: ['solution-activity', s.id] })
      qc.invalidateQueries({ queryKey: ['solutions'] })
      qc.invalidateQueries({ queryKey: ['problem', s.problem.id] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      setNote('')
      toast(`Status changed to ${SOLUTION_STATUS[data.status].label}. The team has been notified.`)
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })
  const quick: { to: SolutionStatus; label: string; icon: typeof Gavel }[] = [
    { to: 'under_evaluation', label: 'Evaluate', icon: Gavel },
    { to: 'selected', label: 'Select', icon: Trophy },
    { to: 'implemented', label: 'Implemented', icon: Rocket },
  ]
  return (
    <section className="card overflow-hidden" aria-labelledby="decide-title">
      <div className="zellige-light bg-navy-900 px-5 py-3 text-white">
        <h2 id="decide-title" className="flex items-center gap-2 text-sm font-bold">
          <Gavel className="size-4" aria-hidden /> Organization actions
        </h2>
        <p className="text-xs text-navy-100">Only change the status when the decision has really been made. The author is notified.</p>
      </div>
      <div className="space-y-3 p-4">
        <div className="grid grid-cols-3 gap-1.5">
          {quick.map((q) => (
            <button
              key={q.to}
              type="button"
              aria-pressed={status === q.to}
              onClick={() => setStatus(q.to)}
              className={clsx(
                'flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-xs font-bold transition-colors',
                status === q.to ? 'border-atlas-600 bg-atlas-50 text-atlas-800' : 'border-sand-200 text-sand-600 hover:border-sand-300',
              )}
            >
              <q.icon className="size-4" aria-hidden /> {q.label}
            </button>
          ))}
        </div>
        <div>
          <label htmlFor="d-status" className="text-[11px] font-bold tracking-wide text-sand-500 uppercase">
            Status
          </label>
          <select id="d-status" className="input mt-1 !py-2" value={status} onChange={(e) => setStatus(e.target.value as SolutionStatus)}>
            {SOLUTION_FLOW.map((x) => (
              <option key={x} value={x}>
                {SOLUTION_STATUS[x].label}
              </option>
            ))}
          </select>
        </div>
        <Field label="Note to the team" htmlFor="d-note" optional>
          <textarea id="d-note" rows={2} className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Shortlisted for a 2-month pilot." />
        </Field>
        {status === 'implemented' && (
          <div className="space-y-3 rounded-xl bg-sand-50 p-3">
            <Field label="Where" htmlFor="i-loc" optional>
              <input id="i-loc" className="input" value={impl.location} onChange={(e) => setImpl({ ...impl, location: e.target.value })} placeholder={[s.problem.neighborhood, s.problem.city].filter(Boolean).join(', ')} />
            </Field>
            <Field label="Impact achieved" htmlFor="i-impact" optional>
              <textarea id="i-impact" rows={2} className="input" value={impl.impact_summary} onChange={(e) => setImpl({ ...impl, impact_summary: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="People impacted" htmlFor="i-cit" optional>
                <input id="i-cit" type="number" min={0} className="input" value={impl.citizens_impacted} onChange={(e) => setImpl({ ...impl, citizens_impacted: e.target.value })} />
              </Field>
              <Field label="Evidence link" htmlFor="i-ev" optional>
                <input id="i-ev" className="input" value={impl.evidence_url} onChange={(e) => setImpl({ ...impl, evidence_url: e.target.value })} placeholder="https://" />
              </Field>
            </div>
          </div>
        )}
        <Button className="w-full" loading={m.isPending} disabled={status === s.status} onClick={() => m.mutate()}>
          {status === s.status ? `Currently ${SOLUTION_STATUS[s.status].label}` : `Mark as ${SOLUTION_STATUS[status].label}`}
        </Button>
      </div>
    </section>
  )
}

function AuthorStatus({ s }: { s: TSolution }) {
  const qc = useQueryClient()
  const toast = useToast()
  const m = useMutation({
    mutationFn: (status: SolutionStatus) => api.patch<TSolution>(`/solutions/${s.id}/status`, { status }),
    onSuccess: (data) => {
      qc.setQueryData(['solution', s.id], data)
      toast(`Moved to ${SOLUTION_STATUS[data.status].label}.`)
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })
  if (!['proposed', 'developing'].includes(s.status)) return null
  const next: SolutionStatus = s.status === 'proposed' ? 'developing' : 'proposed'
  return (
    <Button variant="secondary" size="sm" loading={m.isPending} onClick={() => m.mutate(next)}>
      {s.status === 'proposed' ? 'Mark as Developing' : 'Back to Proposed'}
    </Button>
  )
}

function ContactModal({ s, open, onClose }: { s: TSolution; open: boolean; onClose: () => void }) {
  const toast = useToast()
  const [message, setMessage] = useState('')
  const m = useMutation({
    mutationFn: () => api.post(`/solutions/${s.id}/contact`, { message }),
    onSuccess: () => {
      toast(`Message sent to ${s.author.name}. They can reply to your email.`)
      setMessage('')
      onClose()
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Contact ${s.author.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={m.isPending} disabled={message.trim().length < 10} onClick={() => m.mutate()}>
            <Mail className="size-4" aria-hidden /> Send message
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-sand-600">Your name and email will be shared with the author so they can get back to you.</p>
      <Field label="Message" htmlFor="contact-msg" hint="At least 10 characters.">
        <textarea
          id="contact-msg"
          rows={5}
          className="input"
          maxLength={1500}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={`Hello ${s.author.name.split(' ')[0]}, we'd like to discuss a pilot of “${s.title}”…`}
        />
      </Field>
    </Modal>
  )
}

const INTEREST_KINDS = Object.keys(INTEREST_KIND) as InterestKind[]

function OrganizationsPanel({ s }: { s: TSolution }) {
  const { user, isDecisionMaker } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<InterestKind>(s.my_interest ?? 'implementation')
  const [message, setMessage] = useState('')
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['solution', s.id] })
    qc.invalidateQueries({ queryKey: ['solution-activity', s.id] })
  }
  const save = useMutation({
    mutationFn: () => api.post<{ kind: InterestKind; created: boolean }>(`/solutions/${s.id}/interest`, { kind, message: message.trim() || null }),
    onSuccess: (r) => {
      refresh()
      setOpen(false)
      toast(r.created ? `${s.author.name} has been notified and can reach you by email.` : 'Your interest was updated.')
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })
  const withdraw = useMutation({
    mutationFn: () => api.del(`/solutions/${s.id}/interest`),
    onSuccess: () => {
      refresh()
      toast('Interest withdrawn.', 'info')
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })
  const canAct = s.is_organization && isDecisionMaker && !s.can_edit
  return (
    <section id="organizations" className="card p-5" aria-labelledby="orgs-title">
      <h2 id="orgs-title" className="flex items-center gap-2 text-sm font-bold text-sand-900">
        <Handshake className="size-4 text-atlas-700" aria-hidden /> Interested organizations <span className="font-semibold text-sand-400">{s.interests.length}</span>
      </h2>
      {s.interests.length === 0 ? (
        <p className="mt-2 text-sm text-sand-600">No organization has expressed interest yet.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {s.interests.map((i) => (
            <li key={i.organization.id} className="flex gap-2.5">
              <Avatar user={i.organization} size={30} />
              <div className="min-w-0 text-sm">
                <UserLink user={i.organization} />
                <p className="text-xs text-sand-500">
                  {INTEREST_KIND[i.kind]?.verb ?? i.kind} · {timeAgo(i.created_at)}
                </p>
                {i.message && <p className="mt-1 rounded-lg bg-sand-50 px-2.5 py-1.5 text-xs text-sand-700">“{i.message}”</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-sand-500">Interest means an organization wants to talk with the author. It is not an approval, a contract or funding.</p>
      {canAct ? (
        <div className="mt-4 border-t border-sand-100 pt-4">
          {s.my_interest ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
                Update interest
              </Button>
              <Button size="sm" variant="ghost" loading={withdraw.isPending} onClick={() => withdraw.mutate()}>
                Withdraw
              </Button>
            </div>
          ) : (
            <Button size="sm" className="w-full" onClick={() => setOpen(true)}>
              <Building2 className="size-4" aria-hidden /> Express interest
            </Button>
          )}
        </div>
      ) : s.is_organization && !isDecisionMaker ? (
        <p className="mt-4 rounded-xl bg-navy-50 px-3 py-2 text-xs text-navy-900">
          Your organization account is waiting for verification. Until then you can contact the author directly.
        </p>
      ) : !user ? (
        <p className="mt-3 text-xs text-sand-500">
          Represent an organization?{' '}
          <Link to="/register" className="font-semibold text-atlas-700 hover:underline">
            Create an organization account
          </Link>
          .
        </p>
      ) : null}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Interest in “${s.title}”`}
        footer={
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            {s.my_interest ? 'Save' : 'Send to the author'}
          </Button>
        }
      >
        <fieldset>
          <legend className="label">What would you like to discuss?</legend>
          <div className="space-y-2">
            {INTEREST_KINDS.map((k) => (
              <label key={k} className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-sand-200 px-3 py-2.5 text-sm font-semibold text-sand-800 has-[:checked]:border-navy-700 has-[:checked]:bg-navy-50">
                <input type="radio" name="interest-kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="size-4 accent-navy-900" />
                {INTEREST_KIND[k].label}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="mt-4">
          <Field label="Message to the author" htmlFor="interest-msg" optional hint="Only the author sees this message.">
            <textarea id="interest-msg" rows={4} maxLength={1500} className="input" value={message} onChange={(e) => setMessage(e.target.value)} />
          </Field>
        </div>
        <p className="mt-3 text-xs text-sand-500">
          {s.author.name} is notified with your organization's name and email address. Other visitors only see that your organization is interested.
        </p>
      </Modal>
    </section>
  )
}

function Team({ s }: { s: TSolution }) {
  const { user, requireAuth } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const [joinOpen, setJoinOpen] = useState(false)
  const [msg, setMsg] = useState('')
  const join = useMutation({
    mutationFn: () => api.post<{ status: string }>(`/solutions/${s.id}/collaborate`, { message: msg || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['solution', s.id] })
      setJoinOpen(false)
      toast('Request sent — the author will be notified.')
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })
  const decide = useMutation({
    mutationFn: ({ uid, accept }: { uid: number; accept: boolean }) => api.post(`/solutions/${s.id}/collaborators/${uid}`, { accept }),
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['solution', s.id] })
      toast(v.accept ? 'New team member added.' : 'Request declined.', v.accept ? 'success' : 'info')
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })
  const accepted = s.contributors.filter((c) => c.status === 'accepted')
  const pending = s.contributors.filter((c) => c.status === 'pending')
  const isMember = !!user && accepted.some((c) => c.user.id === user.id)
  return (
    <section id="team" className="card p-5" aria-labelledby="team-title">
      <h2 id="team-title" className="flex items-center gap-2 text-sm font-bold text-sand-900">
        <Users className="size-4 text-atlas-700" aria-hidden /> Team <span className="font-semibold text-sand-400">{accepted.length}</span>
      </h2>
      <ul className="mt-3 space-y-2.5">
        {accepted.map((c) => (
          <li key={c.user.id} className="flex items-center gap-2.5">
            <Avatar user={c.user} size={32} />
            <div className="min-w-0">
              <UserLink user={c.user} className="text-sm" />
              <p className="truncate text-xs text-sand-500">{c.role === 'author' ? 'Author' : 'Contributor'} · {c.user.headline || roleLabel(c.user)}</p>
            </div>
          </li>
        ))}
      </ul>
      {s.can_edit && pending.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-sand-100 pt-4">
          <p className="text-xs font-bold tracking-wide text-clay-600 uppercase">Requests to join</p>
          {pending.map((c) => (
            <div key={c.user.id} className="rounded-xl bg-sand-50 p-3">
              <div className="flex items-center gap-2">
                <Avatar user={c.user} size={26} />
                <UserLink user={c.user} className="text-sm" />
              </div>
              {c.message && <p className="mt-1.5 text-xs text-sand-600">“{c.message}”</p>}
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={() => decide.mutate({ uid: c.user.id, accept: true })} loading={decide.isPending && decide.variables?.uid === c.user.id && decide.variables.accept}>
                  Accept
                </Button>
                <Button size="sm" variant="ghost" onClick={() => decide.mutate({ uid: c.user.id, accept: false })}>
                  Decline
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      {!s.can_edit && !isMember && (
        <div className="mt-4 border-t border-sand-100 pt-4">
          {s.my_collaboration === 'pending' ? (
            <p className="text-sm text-sand-500">Your request to join is pending.</p>
          ) : s.my_collaboration === 'declined' ? (
            <p className="text-sm text-sand-500">Your request was not accepted this time.</p>
          ) : (
            <Button variant="secondary" size="sm" className="w-full" onClick={() => requireAuth() && setJoinOpen(true)}>
              <UserPlus className="size-4" aria-hidden /> Ask to collaborate
            </Button>
          )}
        </div>
      )}
      <Modal
        open={joinOpen}
        onClose={() => setJoinOpen(false)}
        title="Ask to join the team"
        footer={
          <Button loading={join.isPending} onClick={() => join.mutate()}>
            Send request
          </Button>
        }
      >
        <Field label="How can you help?" htmlFor="join-msg" optional>
          <textarea id="join-msg" rows={3} className="input" maxLength={800} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="I can build the dashboard / I know the market vendors…" />
        </Field>
      </Modal>
    </section>
  )
}

const ACTIVITY_LABEL: Record<string, (a: { actor: UserBrief; meta: Record<string, string> | null }) => string> = {
  submitted_solution: () => 'submitted this solution',
  updated_solution: () => 'updated the proposal',
  joined_solution: () => 'joined the team',
  changed_solution_status: (a) => `moved it to ${SOLUTION_STATUS[(a.meta?.new as SolutionStatus) ?? 'proposed']?.label ?? a.meta?.new}`,
  expressed_interest: () => 'expressed interest',
}

export default function SolutionDetail() {
  const { id } = useParams()
  const sid = Number(id)
  const { requireAuth } = useAuth()
  const qc = useQueryClient()
  const [contact, setContact] = useState(false)
  const q = useQuery({ queryKey: ['solution', sid], queryFn: () => api.get<TSolution>(`/solutions/${sid}`) })
  const activity = useQuery({
    queryKey: ['solution-activity', sid],
    queryFn: () => api.get<{ id: number; verb: string; actor: UserBrief; meta: Record<string, string> | null; created_at: string }[]>(`/solutions/${sid}/activity`),
  })
  useDocumentTitle(q.data?.title)

  if (q.isLoading) return <PageLoader />
  if (q.isError || !q.data)
    return (
      <Page>
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      </Page>
    )
  const s = q.data

  return (
    <Page wide>
      <nav aria-label="Breadcrumb" className="mb-4 flex min-w-0 items-center gap-1 text-sm text-sand-500">
        <Link to="/solutions" className="shrink-0 hover:text-sand-800">
          Solutions
        </Link>
        <ChevronRight className="size-3.5 shrink-0" aria-hidden />
        <Link to={`/problems/${s.problem.id}`} className="truncate hover:text-sand-800">
          {s.problem.title}
        </Link>
      </nav>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          <article className="card overflow-hidden">
            {s.status === 'implemented' && s.implementation ? (
              <div className="zellige-light flex flex-wrap items-center gap-x-3 gap-y-1 bg-atlas-800 px-5 py-3 text-sm text-white sm:px-7">
                <Rocket className="size-4" aria-hidden />
                <span className="font-bold">Implemented</span>
                <span className="text-atlas-50">
                  by {s.implementation.organization.name} · {formatDate(s.implementation.implemented_at)}
                </span>
              </div>
            ) : s.status === 'selected' && s.decided_by ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-saffron-50 px-5 py-3 text-sm text-saffron-700 sm:px-7">
                <Trophy className="size-4" aria-hidden />
                <span className="font-bold">Selected by {s.decided_by.name}</span>
                {s.decided_at && <span>· {formatDate(s.decided_at)}</span>}
              </div>
            ) : s.status === 'under_evaluation' && s.decided_by ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-violet-50 px-5 py-3 text-sm text-violet-800 sm:px-7">
                <Gavel className="size-4" aria-hidden />
                <span className="font-bold">Under evaluation by {s.decided_by.name}</span>
              </div>
            ) : null}
            <div className="p-5 sm:p-7">
              <div className="flex flex-wrap items-center gap-2.5">
                <CategoryBadge category={s.problem.category} size="md" link />
                {s.status !== 'proposed' && <SolutionStatusBadge status={s.status} />}
              </div>
              <div className="mt-3 flex items-start justify-between gap-4">
                <h1 className="text-2xl leading-tight font-extrabold tracking-tight text-navy-900 sm:text-3xl">{s.title}</h1>
              </div>
              <div className="mt-3 flex items-center gap-2.5 text-sm">
                <Avatar user={s.author} size={32} />
                <span className="min-w-0 text-sand-600">
                  <UserLink user={s.author} /> <span className="text-sand-400">· {s.author.affiliation || s.author.headline || roleLabel(s.author)}</span>
                  <span className="block text-xs text-sand-400 sm:inline">
                    {' '}
                    · Posted {timeAgo(s.created_at)}
                  </span>
                </span>
              </div>

              <p className="mt-4 rounded-xl bg-sand-50 px-4 py-2.5 text-sm text-sand-700">
                Solves{' '}
                <Link to={`/problems/${s.problem.id}`} className="font-semibold text-navy-800 hover:underline">
                  {s.problem.title}
                </Link>
              </p>
              {s.status_note && (
                <p className="mt-3 flex gap-2 rounded-xl bg-sand-50 px-4 py-2.5 text-sm text-sand-700">
                  <StickyNote className="mt-0.5 size-4 shrink-0 text-sand-400" aria-hidden /> {s.status_note}
                </p>
              )}

              <div className="mt-6 flex flex-wrap items-center gap-2 border-y border-sand-100 py-4">
                {s.can_star ? (
                  <StarButton solutionId={s.id} starred={s.starred} count={s.stars_count} size="lg" />
                ) : (
                  <span className="inline-flex items-center gap-2 rounded-xl bg-sand-50 px-4 py-2.5 text-[15px] font-bold text-sand-700 ring-1 ring-sand-200" title="You can't star your own solution">
                    <Star className="size-5 fill-saffron-400 text-saffron-500" aria-hidden /> {compact(s.stars_count)} star{s.stars_count === 1 ? '' : 's'}
                  </span>
                )}
                <a href="#discussion" className="btn btn-md btn-secondary">
                  Comment <span className="text-sand-400">{s.comments_count}</span>
                </a>
                <ShareButton title={s.title} path={`/solutions/${s.id}`} />
                {!s.can_edit && (
                  <Button variant="secondary" onClick={() => requireAuth() && setContact(true)}>
                    <Mail className="size-4" aria-hidden /> Contact the author
                  </Button>
                )}
                <div className="ml-auto">{s.can_edit ? <AuthorStatus s={s} /> : <ReportButton targetType="solution" targetId={s.id} />}</div>
              </div>

              {s.status === 'implemented' && s.implementation && (
                <div className="mt-6 grid grid-cols-1 gap-4 rounded-2xl bg-atlas-50 p-5 sm:grid-cols-[auto_1fr]">
                  {s.implementation.citizens_impacted ? (
                    <div className="sm:border-r sm:border-atlas-200 sm:pr-6">
                      <div className="text-3xl font-extrabold text-atlas-800 tabular-nums">{num(s.implementation.citizens_impacted)}</div>
                      <div className="text-xs font-semibold text-atlas-700">people impacted (reported by {s.implementation.organization.name})</div>
                    </div>
                  ) : null}
                  <div className="text-sm text-atlas-900">
                    {s.implementation.location && (
                      <p className="flex items-center gap-1.5 font-semibold">
                        <MapPin className="size-4" aria-hidden /> {s.implementation.location}
                      </p>
                    )}
                    {s.implementation.impact_summary && <p className="mt-1">{s.implementation.impact_summary}</p>}
                    {s.implementation.evidence_url && (
                      <a href={s.implementation.evidence_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 font-semibold underline">
                        Evidence <ExternalLink className="size-3.5" aria-hidden />
                      </a>
                    )}
                  </div>
                </div>
              )}

              <div className="mt-6 space-y-6">
                <Section title="Proposed approach">{s.description}</Section>
                {s.approach && <Section title="How it works">{s.approach}</Section>}
                {s.impact && <Section title="Expected impact">{s.impact}</Section>}
                {s.implementation_plan && <Section title="Implementation plan">{s.implementation_plan}</Section>}
                {(s.resources || s.estimated_cost) && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {s.resources && (
                      <div className="rounded-xl bg-sand-50 p-4">
                        <p className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-sand-500 uppercase">
                          <Package className="size-3.5" aria-hidden /> Resources or budget
                        </p>
                        <p className="mt-1 text-sm text-sand-800">{s.resources}</p>
                      </div>
                    )}
                    {s.estimated_cost && (
                      <div className="rounded-xl bg-sand-50 p-4">
                        <p className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-sand-500 uppercase">
                          <Coins className="size-3.5" aria-hidden /> Estimated cost
                        </p>
                        <p className="mt-1 text-sm font-semibold text-sand-800">{s.estimated_cost}</p>
                      </div>
                    )}
                  </div>
                )}
                {s.links.length > 0 && (
                  <section>
                    <h3 className="text-xs font-bold tracking-wider text-sand-500 uppercase">Links</h3>
                    <ul className="mt-1.5 space-y-1">
                      {s.links.map((l) => (
                        <li key={l}>
                          <a href={l} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1.5 text-sm font-semibold text-atlas-700 hover:underline">
                            <Link2 className="size-3.5" aria-hidden /> {l.replace(/^https?:\/\//, '')}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            </div>
          </article>

          <CommentThread target="solutions" id={s.id} />
        </div>

        <aside className="space-y-5">
          {s.can_decide && <DecisionPanel key={s.status} s={s} />}

          <OrganizationsPanel key={s.my_interest ?? 'none'} s={s} />

          <section className="card p-5" aria-label="Problem addressed">
            <p className="text-[11px] font-bold tracking-wide text-sand-500 uppercase">Problem addressed</p>
            <Link to={`/problems/${s.problem.id}`} className="mt-1.5 block leading-snug font-bold text-sand-900 hover:text-atlas-800">
              {s.problem.title}
            </Link>
            {s.problem.city && (
              <p className="mt-1 flex items-center gap-1 text-xs text-sand-500">
                <MapPin className="size-3" aria-hidden /> {[s.problem.neighborhood, s.problem.city].filter(Boolean).join(', ')}
              </p>
            )}
            {s.problem.description && <p className="mt-2 line-clamp-4 text-sm text-sand-600">{s.problem.description}</p>}
            <Link
              to={`/problems/${s.problem.id}?tab=latest#solutions`}
              className="mt-3 inline-block text-sm font-semibold text-atlas-700 hover:underline"
              onClick={() => qc.invalidateQueries({ queryKey: ['solutions', 'problem', s.problem.id] })}
            >
              See all {s.problem.solutions_count} solutions →
            </Link>
          </section>

          {s.required_skills.length > 0 && (
            <section className="card p-5">
              <h2 className="text-sm font-bold text-sand-900">Required skills</h2>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {s.required_skills.map((k) => (
                  <Link key={k} to={`/search?q=${encodeURIComponent(k)}`} className="chip hover:border-atlas-300">
                    {k}
                  </Link>
                ))}
              </div>
            </section>
          )}

          <Team s={s} />

          {activity.data && activity.data.length > 0 && (
            <section className="card p-5" aria-labelledby="act-title">
              <h2 id="act-title" className="flex items-center gap-2 text-sm font-bold text-sand-900">
                <History className="size-4 text-sand-500" aria-hidden /> Activity
              </h2>
              <ol className="mt-3 space-y-3 border-l-2 border-sand-100 pl-4">
                {activity.data.map((a) => (
                  <li key={a.id} className="relative text-sm">
                    <span className="absolute top-1.5 -left-[21px] size-2 rounded-full bg-atlas-500 ring-4 ring-white" aria-hidden />
                    <span className="font-semibold text-sand-800">{a.actor.name}</span> <span className="text-sand-600">{(ACTIVITY_LABEL[a.verb] ?? (() => a.verb))(a)}</span>
                    <div className="text-xs text-sand-400">{timeAgo(a.created_at)}</div>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </aside>
      </div>
      {!s.can_edit && <ContactModal s={s} open={contact} onClose={() => setContact(false)} />}
    </Page>
  )
}
