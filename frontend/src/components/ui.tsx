import clsx from 'clsx'
import {
  AlertTriangle,
  BadgeCheck,
  Briefcase,
  Building2,
  Bus,
  Circle,
  GraduationCap,
  HandHeart,
  HeartPulse,
  Landmark,
  Castle,
  Leaf,
  Loader2,
  Recycle,
  Shield,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { LEVEL, PROBLEM_STATUS, SOLUTION_STATUS, roleLabel } from '../lib/format'
import type { CategoryBrief, Level, ProblemStatus, SolutionStatus, UserBrief } from '../lib/types'

// ------------------------------------------------------------------ Button
type Variant = 'primary' | 'secondary' | 'ghost' | 'accent'
type Size = 'sm' | 'md' | 'lg'
const VARIANT: Record<Variant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  accent: 'btn-accent',
}
const SIZE: Record<Size, string> = { sm: 'btn-sm', md: 'btn-md', lg: 'btn-lg' }

export function btn(variant: Variant = 'primary', size: Size = 'md', extra?: string) {
  return clsx(VARIANT[variant], SIZE[size], extra)
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button className={btn(variant, size, className)} disabled={disabled || loading} {...rest}>
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
}

// ------------------------------------------------------------------ Icons
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  bus: Bus,
  landmark: Landmark,
  'graduation-cap': GraduationCap,
  'hand-heart': HandHeart,
  'landmark-dome': Castle,
  briefcase: Briefcase,
  leaf: Leaf,
  zap: Zap,
  'building-2': Building2,
  recycle: Recycle,
  'heart-pulse': HeartPulse,
  shield: Shield,
}

export function CategoryIcon({ icon, className }: { icon: string; className?: string }) {
  const Icon = CATEGORY_ICONS[icon] ?? Circle
  return <Icon className={className} aria-hidden />
}

export function CategoryBadge({ category, size = 'sm', link = false }: { category: CategoryBrief; size?: 'sm' | 'md'; link?: boolean }) {
  const content = (
    <>
      <span
        className={clsx('grid place-items-center rounded-md', size === 'sm' ? 'size-5' : 'size-6')}
        style={{ backgroundColor: `${category.color}1a`, color: category.color }}
      >
        <CategoryIcon icon={category.icon} className={size === 'sm' ? 'size-3' : 'size-3.5'} />
      </span>
      <span className="truncate">{category.name}</span>
    </>
  )
  const cls = clsx('inline-flex min-w-0 items-center gap-1.5 font-semibold text-sand-700', size === 'sm' ? 'text-xs' : 'text-sm')
  return link ? (
    <Link to={`/problems?category=${category.slug}`} className={clsx(cls, 'hover:text-sand-900')}>
      {content}
    </Link>
  ) : (
    <span className={cls}>{content}</span>
  )
}

export function SolutionStatusBadge({ status, className }: { status: SolutionStatus; className?: string }) {
  const s = SOLUTION_STATUS[status]
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset', s.tone, className)}>
      <span className={clsx('size-1.5 rounded-full', s.dot)} aria-hidden />
      {s.label}
    </span>
  )
}

export function ProblemStatusBadge({ status }: { status: ProblemStatus }) {
  const s = PROBLEM_STATUS[status]
  return <span className={clsx('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset', s.tone)}>{s.label}</span>
}

export function LevelMeter({ level, label }: { level: Level; label?: string }) {
  const l = LEVEL[level]
  return (
    <span className="inline-flex items-center gap-2" title={`${label ?? ''} ${l.label}`.trim()}>
      <span className="flex items-end gap-0.5" aria-hidden>
        {[1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={clsx('w-1 rounded-sm', i <= l.bar ? (l.bar >= 4 ? 'bg-red-600' : l.bar >= 3 ? 'bg-clay-500' : l.bar >= 2 ? 'bg-saffron-500' : 'bg-sand-400') : 'bg-sand-200')}
            style={{ height: 4 + i * 3 }}
          />
        ))}
      </span>
      <span className={clsx('text-sm font-semibold', l.tone)}>{l.label}</span>
    </span>
  )
}

// ------------------------------------------------------------------ Avatar
const AVATAR_TONES = ['bg-atlas-100 text-atlas-800', 'bg-clay-100 text-clay-700', 'bg-saffron-100 text-saffron-700', 'bg-sky-100 text-sky-800', 'bg-violet-100 text-violet-800', 'bg-rose-100 text-rose-800']

export function Avatar({ user, size = 36, className }: { user: Pick<UserBrief, 'name' | 'avatar_url' | 'id' | 'role'>; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false)
  const initials = user.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')
  const isOrg = user.role === 'organization' || user.role === 'municipality'
  const shape = isOrg ? 'rounded-xl' : 'rounded-full'
  if (user.avatar_url && !failed) {
    return (
      <img
        src={user.avatar_url}
        alt=""
        onError={() => setFailed(true)}
        className={clsx('shrink-0 object-cover', shape, className)}
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <span
      aria-hidden
      className={clsx('grid shrink-0 place-items-center font-bold', shape, AVATAR_TONES[user.id % AVATAR_TONES.length], className)}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.38) }}
    >
      {initials}
    </span>
  )
}

export function UserLink({ user, showRole = false, className }: { user: UserBrief; showRole?: boolean; className?: string }) {
  return (
    <Link to={`/u/${user.username}`} className={clsx('inline-flex min-w-0 items-center gap-1 font-semibold text-sand-800 hover:text-atlas-700', className)}>
      <span className="truncate">{user.name}</span>
      {user.verified && <BadgeCheck className="size-3.5 shrink-0 text-atlas-600" aria-label="Verified" />}
      {showRole && <span className="ml-1 shrink-0 text-xs font-medium text-sand-500">· {roleLabel(user)}</span>}
    </Link>
  )
}

// ------------------------------------------------------------------ States
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx('animate-spin text-atlas-600', className ?? 'size-5')} aria-label="Loading" />
}

export function PageLoader() {
  return (
    <div className="grid min-h-[40vh] place-items-center" role="status">
      <Spinner className="size-7" />
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded-lg bg-sand-200/70', className)} aria-hidden />
}

export function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="card space-y-3 p-5" aria-hidden>
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-5 w-4/5" />
      {Array.from({ length: rows - 1 }).map((_, i) => (
        <Skeleton key={i} className="h-3.5 w-full" />
      ))}
    </div>
  )
}

export function EmptyState({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-12 text-center">
      <span className="mb-4 grid size-12 place-items-center rounded-2xl bg-sand-100 text-sand-500">
        <Icon className="size-6" aria-hidden />
      </span>
      <h3 className="font-bold text-sand-900">{title}</h3>
      {body && <p className="mt-1 max-w-md text-sm text-sand-600">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Something went wrong.'
  return (
    <div className="card flex flex-col items-center px-6 py-10 text-center" role="alert">
      <span className="mb-3 grid size-11 place-items-center rounded-2xl bg-clay-50 text-clay-600">
        <AlertTriangle className="size-5" aria-hidden />
      </span>
      <p className="font-semibold text-sand-900">We couldn't load this.</p>
      <p className="mt-1 text-sm text-sand-600">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ Tabs
export function Tabs<T extends string>({
  value,
  onChange,
  items,
  label,
  className,
}: {
  value: T
  onChange: (v: T) => void
  items: { value: T; label: ReactNode; count?: number }[]
  label: string
  className?: string
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const next = (i + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length
    refs.current[next]?.focus()
    onChange(items[next].value)
  }
  return (
    <div role="tablist" aria-label={label} className={clsx('scrollbar-none -mx-1 flex gap-1 overflow-x-auto rounded-xl bg-sand-100 p-1', className)}>
      {items.map((it, i) => (
        <button
          key={it.value}
          ref={(el) => {
            refs.current[i] = el
          }}
          role="tab"
          type="button"
          aria-selected={value === it.value}
          tabIndex={value === it.value ? 0 : -1}
          onKeyDown={(e) => onKey(e, i)}
          onClick={() => onChange(it.value)}
          className="tab"
        >
          {it.label}
          {it.count !== undefined && <span className="rounded-full bg-sand-200/80 px-1.5 text-[11px] font-bold text-sand-600">{it.count}</span>}
        </button>
      ))}
    </div>
  )
}

// ------------------------------------------------------------------ Modal
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'md' | 'lg'
}) {
  const titleId = useId()
  const panel = useRef<HTMLDivElement>(null)
  // Parents usually pass an inline onClose; keep the latest without re-running the open effect
  // (re-running it on every render would steal focus while the user types).
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current()
      if (e.key === 'Tab' && panel.current) {
        const f = panel.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
        if (!f.length) return
        const first = f[0]
        const last = f[f.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    setTimeout(() => panel.current?.querySelector<HTMLElement>('input, textarea, select, button:not([data-close])')?.focus(), 30)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      prev?.focus()
    }
  }, [open])
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-sand-900/40 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
        className={clsx(
          'fade-up flex max-h-[92vh] w-full flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-2xl',
          size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-lg',
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-sand-100 px-5 py-4">
          <h2 id={titleId} className="text-base font-bold text-sand-900">
            {title}
          </h2>
          <button data-close onClick={onClose} className="-m-1 rounded-lg p-1 text-sand-500 hover:bg-sand-100 hover:text-sand-800" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-sand-100 px-5 py-3.5">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

// ------------------------------------------------------------------ Forms
export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
  optional,
}: {
  label: string
  hint?: ReactNode
  error?: string
  children: ReactNode
  htmlFor?: string
  optional?: boolean
}) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>
        {label}
        {optional && <span className="ml-1.5 text-xs font-medium text-sand-400">Optional</span>}
      </label>
      {children}
      {error ? <p className="mt-1 text-xs font-medium text-red-700">{error}</p> : hint ? <p className="hint">{hint}</p> : null}
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-flow-col gap-1 rounded-xl bg-sand-100 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'rounded-lg px-2 py-1.5 text-sm font-semibold transition-colors',
            value === o.value ? 'bg-white text-sand-900 shadow-sm ring-1 ring-sand-200' : 'text-sand-600 hover:text-sand-900',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function ChipInput({
  value,
  onChange,
  suggestions = [],
  placeholder,
  id,
  max = 12,
}: {
  value: string[]
  onChange: (v: string[]) => void
  suggestions?: string[]
  placeholder?: string
  id?: string
  max?: number
}) {
  const [draft, setDraft] = useState('')
  const add = (raw: string) => {
    const v = raw.trim().replace(/,$/, '')
    if (!v || value.length >= max || value.some((x) => x.toLowerCase() === v.toLowerCase())) return
    onChange([...value, v])
    setDraft('')
  }
  const filtered = draft
    ? suggestions.filter((s) => s.toLowerCase().includes(draft.toLowerCase()) && !value.includes(s)).slice(0, 6)
    : suggestions.filter((s) => !value.includes(s)).slice(0, 8)
  return (
    <div>
      <div className="input flex min-h-11 flex-wrap items-center gap-1.5 py-1.5">
        {value.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-lg bg-atlas-50 py-0.5 pr-1 pl-2 text-xs font-semibold text-atlas-800">
            {v}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== v))} className="rounded p-0.5 hover:bg-atlas-100" aria-label={`Remove ${v}`}>
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              add(draft)
            } else if (e.key === 'Backspace' && !draft && value.length) {
              onChange(value.slice(0, -1))
            }
          }}
          onBlur={() => draft && add(draft)}
          placeholder={value.length ? '' : placeholder}
          className="min-w-24 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-sand-400"
        />
      </div>
      {filtered.length > 0 && value.length < max && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {filtered.map((s) => (
            <button key={s} type="button" onClick={() => add(s)} className="chip hover:border-atlas-300 hover:bg-atlas-50 hover:text-atlas-800">
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function SectionHeader({ title, subtitle, action, id }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 id={id} className="text-lg font-bold tracking-tight text-sand-900 sm:text-xl">
          {title}
        </h2>
        {subtitle && <p className="mt-0.5 text-sm text-sand-600">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}
