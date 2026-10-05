import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { Bell, BellOff, CheckCheck, Gavel, Handshake, Lightbulb, LogIn, Mail, MessageSquare, Reply, Rocket, Star, Trophy, UserPlus } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Page } from '../components/Layout'
import { Button, CardSkeleton, EmptyState, ErrorState, btn } from '../components/ui'
import { useAuth } from '../hooks/auth'
import { useDocumentTitle } from '../hooks/misc'
import { api } from '../lib/api'
import { timeAgo } from '../lib/format'
import type { Notification } from '../lib/types'

const ICONS: Record<string, { icon: typeof Bell; tone: string }> = {
  new_solution: { icon: Lightbulb, tone: 'bg-saffron-50 text-saffron-700' },
  followed_user_solution: { icon: Lightbulb, tone: 'bg-saffron-50 text-saffron-700' },
  star_milestone: { icon: Star, tone: 'bg-saffron-50 text-saffron-600' },
  comment: { icon: MessageSquare, tone: 'bg-sky-50 text-sky-700' },
  reply: { icon: Reply, tone: 'bg-sky-50 text-sky-700' },
  collaboration_request: { icon: Handshake, tone: 'bg-clay-50 text-clay-600' },
  collaboration_accepted: { icon: Handshake, tone: 'bg-atlas-50 text-atlas-700' },
  status_selected: { icon: Trophy, tone: 'bg-saffron-50 text-saffron-700' },
  status_implemented: { icon: Rocket, tone: 'bg-atlas-50 text-atlas-700' },
  status_evaluation: { icon: Gavel, tone: 'bg-violet-50 text-violet-700' },
  contact: { icon: Mail, tone: 'bg-clay-50 text-clay-600' },
  new_follower: { icon: UserPlus, tone: 'bg-atlas-50 text-atlas-700' },
}

export default function Notifications() {
  useDocumentTitle('Notifications')
  const { user, loading } = useAuth()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const q = useQuery({ queryKey: ['notifications', 'list'], queryFn: () => api.get<Notification[]>('/notifications', { limit: 60 }), enabled: !!user })
  const invalidate = () => qc.invalidateQueries({ queryKey: ['notifications'] })
  const readAll = useMutation({ mutationFn: () => api.post('/notifications/read-all'), onSuccess: invalidate })
  const readOne = useMutation({ mutationFn: (id: number) => api.post(`/notifications/${id}/read`), onSuccess: invalidate })

  if (loading) return null
  if (!user)
    return (
      <Page>
        <EmptyState icon={LogIn} title="Sign in to see your notifications" action={<Link to="/login?next=/notifications" className={btn('primary', 'md')}>Sign in</Link>} />
      </Page>
    )
  const unread = q.data?.filter((n) => !n.read).length ?? 0

  return (
    <Page className="max-w-3xl">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Notifications</h1>
          <p className="text-sm text-sand-600">{unread ? `${unread} unread` : 'You’re all caught up.'}</p>
        </div>
        {unread > 0 && (
          <Button variant="secondary" size="sm" loading={readAll.isPending} onClick={() => readAll.mutate()}>
            <CheckCheck className="size-4" aria-hidden /> Mark all as read
          </Button>
        )}
      </div>
      {q.isLoading ? (
        <CardSkeleton rows={6} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data?.length ? (
        <EmptyState icon={BellOff} title="No notifications yet" body="Follow problems and contributors to hear about new solutions, stars and decisions." />
      ) : (
        <ul className="card divide-y divide-sand-100 overflow-hidden">
          {q.data.map((n) => {
            const meta = ICONS[n.type] ?? { icon: Bell, tone: 'bg-sand-100 text-sand-600' }
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (!n.read) readOne.mutate(n.id)
                    if (n.link) navigate(n.link)
                  }}
                  className={clsx('flex w-full items-start gap-3 px-4 py-4 text-left hover:bg-sand-50 sm:px-5', !n.read && 'bg-atlas-50/40')}
                >
                  <span className={clsx('grid size-9 shrink-0 place-items-center rounded-xl', meta.tone)}>
                    <meta.icon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={clsx('block text-sm', n.read ? 'text-sand-700' : 'font-semibold text-sand-900')}>{n.message}</span>
                    <span className="mt-0.5 block text-xs text-sand-500">{timeAgo(n.created_at)}</span>
                  </span>
                  {!n.read && <span className="mt-2 size-2 shrink-0 rounded-full bg-clay-500" aria-label="Unread" />}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Page>
  )
}
