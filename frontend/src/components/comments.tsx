import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MessageSquare, Reply, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/auth'
import { useToast } from '../hooks/misc'
import { api, errorMessage } from '../lib/api'
import { roleLabel, timeAgo } from '../lib/format'
import type { Comment } from '../lib/types'
import { ReportButton } from './actions'
import { Avatar, Button, ErrorState, Skeleton, UserLink } from './ui'

function CommentForm({
  target,
  id,
  parentId,
  onDone,
  autoFocus,
  placeholder,
}: {
  target: 'problems' | 'solutions'
  id: number
  parentId?: number
  onDone?: () => void
  autoFocus?: boolean
  placeholder: string
}) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const [body, setBody] = useState('')
  const m = useMutation({
    mutationFn: () => api.post<Comment>(`/${target}/${id}/comments`, { body, parent_id: parentId ?? null }),
    onSuccess: () => {
      setBody('')
      qc.invalidateQueries({ queryKey: ['comments', target, id] })
      qc.invalidateQueries({ queryKey: [target === 'problems' ? 'problem' : 'solution', id] })
      onDone?.()
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })
  if (!user) return null
  return (
    <form
      className="flex gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (body.trim().length >= 2) m.mutate()
      }}
    >
      <Avatar user={user} size={32} className="mt-0.5" />
      <div className="flex-1">
        <label htmlFor={`c-${target}-${id}-${parentId ?? 'root'}`} className="sr-only">
          {placeholder}
        </label>
        <textarea
          id={`c-${target}-${id}-${parentId ?? 'root'}`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={placeholder}
          maxLength={3000}
          autoFocus={autoFocus}
          rows={parentId ? 2 : 3}
          className="input resize-y"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && body.trim().length >= 2) m.mutate()
          }}
        />
        <div className="mt-2 flex items-center justify-end gap-2">
          {onDone && parentId && (
            <Button type="button" variant="ghost" size="sm" onClick={onDone}>
              Cancel
            </Button>
          )}
          <Button type="submit" size="sm" loading={m.isPending} disabled={body.trim().length < 2}>
            {parentId ? 'Reply' : 'Comment'}
          </Button>
        </div>
      </div>
    </form>
  )
}

function CommentItem({ c, target, id, replies }: { c: Comment; target: 'problems' | 'solutions'; id: number; replies: Comment[] }) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const [replying, setReplying] = useState(false)
  const del = useMutation({
    mutationFn: (cid: number) => api.del(`/comments/${cid}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['comments', target, id] })
      toast('Comment deleted.', 'info')
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })
  const renderBody = (cm: Comment, isReply = false) => (
    <div className="flex gap-3">
      <Avatar user={cm.author} size={isReply ? 28 : 34} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <UserLink user={cm.author} />
          <span className="text-xs text-sand-500">{roleLabel(cm.author)}</span>
          <span className="text-xs text-sand-400">· {timeAgo(cm.created_at)}</span>
        </div>
        <p className="mt-1 text-sm whitespace-pre-line text-sand-800">{cm.body}</p>
        <div className="mt-1.5 flex items-center gap-4">
          {!isReply && user && (
            <button type="button" onClick={() => setReplying((r) => !r)} className="inline-flex items-center gap-1 text-xs font-semibold text-sand-500 hover:text-atlas-700">
              <Reply className="size-3" aria-hidden /> Reply
            </button>
          )}
          {user && (user.id === cm.author.id || user.role === 'admin') ? (
            <button type="button" onClick={() => del.mutate(cm.id)} className="inline-flex items-center gap-1 text-xs font-semibold text-sand-500 hover:text-red-700">
              <Trash2 className="size-3" aria-hidden /> Delete
            </button>
          ) : (
            <ReportButton targetType="comment" targetId={cm.id} compact />
          )}
        </div>
      </div>
    </div>
  )
  return (
    <li className="py-4">
      {renderBody(c)}
      {(replies.length > 0 || replying) && (
        <ul className="mt-3 ml-4 space-y-4 border-l-2 border-sand-100 pl-4 sm:ml-[46px]">
          {replies.map((r) => (
            <li key={r.id}>
              {renderBody(r, true)}
            </li>
          ))}
          {replying && (
            <li>
              <CommentForm target={target} id={id} parentId={c.id} autoFocus placeholder={`Reply to ${c.author.name}…`} onDone={() => setReplying(false)} />
            </li>
          )}
        </ul>
      )}
    </li>
  )
}

export function CommentThread({ target, id, title = 'Community Discussion' }: { target: 'problems' | 'solutions'; id: number; title?: string }) {
  const { user } = useAuth()
  const location = useLocation()
  const q = useQuery({ queryKey: ['comments', target, id], queryFn: () => api.get<Comment[]>(`/${target}/${id}/comments`) })
  const roots = q.data?.filter((c) => !c.parent_id) ?? []
  const repliesOf = (cid: number) => q.data?.filter((c) => c.parent_id === cid) ?? []
  return (
    <section id="discussion" aria-labelledby={`discussion-${target}`} className="card p-5 sm:p-6">
      <h2 id={`discussion-${target}`} className="mb-4 flex items-center gap-2 text-lg font-bold text-sand-900">
        <MessageSquare className="size-5 text-atlas-700" aria-hidden /> {title}
        {q.data && <span className="text-sm font-semibold text-sand-400">{q.data.length}</span>}
      </h2>
      {user ? (
        <CommentForm target={target} id={id} placeholder="Share context, ask a question or suggest an improvement…" />
      ) : (
        <p className="rounded-xl bg-sand-50 px-4 py-3 text-sm text-sand-600">
          <Link to={`/login?next=${encodeURIComponent(location.pathname)}`} className="font-semibold text-atlas-700 hover:underline">
            Sign in
          </Link>{' '}
          to join the discussion.
        </p>
      )}
      {q.isLoading ? (
        <div className="mt-6 space-y-4">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : q.isError ? (
        <div className="mt-4">
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        </div>
      ) : roots.length === 0 ? (
        <p className="mt-6 text-center text-sm text-sand-500">No comments yet. Start a constructive discussion.</p>
      ) : (
        <ul className="mt-2 divide-y divide-sand-100">
          {roots.map((c) => (
            <CommentItem key={c.id} c={c} target={target} id={id} replies={repliesOf(c.id)} />
          ))}
        </ul>
      )}
    </section>
  )
}
