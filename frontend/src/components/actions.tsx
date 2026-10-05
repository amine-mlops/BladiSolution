import { useMutation, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { Bell, BellRing, Flag, HandHeart, Link2, Share2, Star } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/auth'
import { useToast } from '../hooks/misc'
import { api, errorMessage } from '../lib/api'
import { compact } from '../lib/format'
import { Button, Field, Modal } from './ui'

// ------------------------------------------------------------------ Star
export function StarButton({
  solutionId,
  starred,
  count,
  size = 'md',
  className,
}: {
  solutionId: number
  starred: boolean
  count: number
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const { requireAuth } = useAuth()
  const toast = useToast()
  const qc = useQueryClient()
  const [state, setState] = useState({ starred, count })
  const [pop, setPop] = useState(0)
  useEffect(() => setState({ starred, count }), [starred, count])

  const m = useMutation({
    mutationFn: (next: boolean) =>
      next ? api.post<{ starred: boolean; stars_count: number }>(`/solutions/${solutionId}/star`) : api.del<{ starred: boolean; stars_count: number }>(`/solutions/${solutionId}/star`),
    onSuccess: (r) => {
      setState({ starred: r.starred, count: r.stars_count })
      qc.invalidateQueries({ queryKey: ['solution', solutionId] })
      qc.invalidateQueries({ queryKey: ['solutions'] })
    },
    onError: (e, next) => {
      setState((s) => ({ starred: !next, count: s.count + (next ? -1 : 1) }))
      toast(errorMessage(e), 'error')
    },
  })

  const toggle = () => {
    if (!requireAuth()) return
    const next = !state.starred
    setState((s) => ({ starred: next, count: s.count + (next ? 1 : -1) })) // optimistic
    if (next) setPop((p) => p + 1)
    m.mutate(next)
  }

  const big = size === 'lg'
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={state.starred}
      aria-label={`${state.starred ? 'Unstar' : 'Star'} this solution (${state.count} stars)`}
      className={clsx(
        'inline-flex shrink-0 items-center font-bold tabular-nums transition-colors',
        size === 'sm' && 'gap-1 rounded-lg px-2 py-1 text-xs',
        size === 'md' && 'gap-1.5 rounded-xl px-3 py-1.5 text-sm',
        big && 'gap-2 rounded-xl px-4 py-2.5 text-[15px]',
        state.starred
          ? 'bg-saffron-50 text-saffron-700 ring-1 ring-saffron-400/60 hover:bg-saffron-100'
          : 'bg-white text-sand-700 ring-1 ring-sand-300 hover:bg-sand-50 hover:ring-sand-400',
        className,
      )}
    >
      <Star
        key={pop}
        className={clsx(size === 'sm' ? 'size-3.5' : big ? 'size-5' : 'size-4', state.starred ? 'star-pop fill-saffron-500 text-saffron-500' : 'text-sand-500')}
        aria-hidden
      />
      {big && <span>{state.starred ? 'Starred' : 'Star'}</span>}
      <span className={clsx(big && 'ml-1 rounded-md bg-sand-900/5 px-1.5')}>{compact(state.count)}</span>
    </button>
  )
}

// ------------------------------------------------------------------ Support / Follow
export function SupportButton({ problemId, supported, count, onChange }: { problemId: number; supported: boolean; count: number; onChange?: () => void }) {
  const { requireAuth } = useAuth()
  const toast = useToast()
  const qc = useQueryClient()
  const [state, setState] = useState({ supported, count })
  useEffect(() => setState({ supported, count }), [supported, count])
  const m = useMutation({
    mutationFn: (next: boolean) => (next ? api.post<{ supporters_count: number }>(`/problems/${problemId}/support`) : api.del<{ supporters_count: number }>(`/problems/${problemId}/support`)),
    onSuccess: (r, next) => {
      setState({ supported: next, count: r.supporters_count })
      if (next) toast("Thanks for your support — you'll get updates on this problem.")
      qc.invalidateQueries({ queryKey: ['problem', problemId] })
      onChange?.()
    },
    onError: (e, next) => {
      setState((s) => ({ supported: !next, count: s.count + (next ? -1 : 1) }))
      toast(errorMessage(e), 'error')
    },
  })
  const toggle = () => {
    if (!requireAuth()) return
    const next = !state.supported
    setState((s) => ({ supported: next, count: s.count + (next ? 1 : -1) }))
    m.mutate(next)
  }
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={state.supported}
      className={clsx(
        'btn btn-md',
        state.supported ? 'bg-clay-50 text-clay-700 ring-1 ring-clay-200 hover:bg-clay-100' : 'bg-clay-500 text-white hover:bg-clay-600',
      )}
    >
      <HandHeart className="size-4" aria-hidden />
      {state.supported ? 'Supported' : 'Support Problem'}
      <span className={clsx('rounded-md px-1.5 tabular-nums', state.supported ? 'bg-clay-100' : 'bg-white/20')}>{compact(state.count)}</span>
    </button>
  )
}

export function FollowProblemButton({ problemId, following }: { problemId: number; following: boolean }) {
  const { requireAuth } = useAuth()
  const toast = useToast()
  const qc = useQueryClient()
  const [on, setOn] = useState(following)
  useEffect(() => setOn(following), [following])
  const m = useMutation({
    mutationFn: (next: boolean) => (next ? api.post(`/problems/${problemId}/follow`) : api.del(`/problems/${problemId}/follow`)),
    onSuccess: (_, next) => {
      toast(next ? "Following — we'll notify you when new solutions arrive." : 'Unfollowed.', next ? 'success' : 'info')
      qc.invalidateQueries({ queryKey: ['problem', problemId] })
    },
    onError: (e, next) => {
      setOn(!next)
      toast(errorMessage(e), 'error')
    },
  })
  return (
    <Button
      variant="secondary"
      aria-pressed={on}
      onClick={() => {
        if (!requireAuth()) return
        setOn(!on)
        m.mutate(!on)
      }}
    >
      {on ? <BellRing className="size-4 text-atlas-700" aria-hidden /> : <Bell className="size-4" aria-hidden />}
      {on ? 'Following' : 'Follow'}
    </Button>
  )
}

export function FollowUserButton({ username, following }: { username: string; following: boolean }) {
  const { requireAuth } = useAuth()
  const toast = useToast()
  const qc = useQueryClient()
  const [on, setOn] = useState(following)
  useEffect(() => setOn(following), [following])
  const m = useMutation({
    mutationFn: (next: boolean) => (next ? api.post(`/users/${username}/follow`) : api.del(`/users/${username}/follow`)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile', username] }),
    onError: (e, next) => {
      setOn(!next)
      toast(errorMessage(e), 'error')
    },
  })
  return (
    <Button
      variant={on ? 'secondary' : 'primary'}
      onClick={() => {
        if (!requireAuth()) return
        setOn(!on)
        m.mutate(!on)
      }}
    >
      {on ? 'Following' : 'Follow'}
    </Button>
  )
}

// ------------------------------------------------------------------ Share
export function ShareButton({ title, path, size = 'md' }: { title: string; path: string; size?: 'sm' | 'md' }) {
  const toast = useToast()
  const share = async () => {
    const url = `${window.location.origin}${path}`
    if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
      try {
        await navigator.share({ title: `${title} · BladiSolution`, url })
        return
      } catch {
        /* cancelled → fall back to copy */
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      toast('Link copied to clipboard.')
    } catch {
      toast(url, 'info')
    }
  }
  return (
    <Button variant="secondary" size={size} onClick={share}>
      {size === 'sm' ? <Link2 className="size-4" aria-hidden /> : <Share2 className="size-4" aria-hidden />}
      Share
    </Button>
  )
}

// ------------------------------------------------------------------ Report
const REASONS = [
  ['spam', 'Spam'],
  ['harassment', 'Harassment'],
  ['inappropriate', 'Inappropriate content'],
  ['misinformation', 'Misinformation'],
  ['duplicate', 'Duplicate'],
  ['other', 'Other'],
] as const

export function ReportButton({ targetType, targetId, compact: small = false }: { targetType: 'problem' | 'solution' | 'comment' | 'user'; targetId: number; compact?: boolean }) {
  const { requireAuth } = useAuth()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<string>('spam')
  const [details, setDetails] = useState('')
  const m = useMutation({
    mutationFn: () => api.post('/reports', { target_type: targetType, target_id: targetId, reason, details: details || null }),
    onSuccess: () => {
      setOpen(false)
      setDetails('')
      toast('Thanks — our moderators will review this report.')
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })
  return (
    <>
      {small ? (
        <button type="button" onClick={() => requireAuth() && setOpen(true)} className="inline-flex items-center gap-1 text-xs font-semibold text-sand-500 hover:text-clay-600">
          <Flag className="size-3" aria-hidden /> Report
        </button>
      ) : (
        <Button variant="ghost" onClick={() => requireAuth() && setOpen(true)}>
          <Flag className="size-4" aria-hidden /> Report
        </Button>
      )}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Report this ${targetType}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button loading={m.isPending} onClick={() => m.mutate()}>
              Send report
            </Button>
          </>
        }
      >
        <fieldset>
          <legend className="label">Reason</legend>
          <div className="grid grid-cols-2 gap-2">
            {REASONS.map(([v, l]) => (
              <label
                key={v}
                className={clsx(
                  'flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium',
                  reason === v ? 'border-atlas-500 bg-atlas-50 text-atlas-800' : 'border-sand-200 hover:border-sand-300',
                )}
              >
                <input type="radio" name="reason" value={v} checked={reason === v} onChange={() => setReason(v)} className="accent-atlas-700" />
                {l}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="mt-4">
          <Field label="Details" optional htmlFor="report-details">
            <textarea id="report-details" className="input min-h-20" maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </>
  )
}
