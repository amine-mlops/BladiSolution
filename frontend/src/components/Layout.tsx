import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import {
  Activity,
  Bell,
  Home,
  LayoutGrid,
  Lightbulb,
  LogOut,
  Menu,
  MessageSquareWarning,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  User as UserIcon,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/auth'
import { api } from '../lib/api'
import { roleLabel } from '../lib/format'
import { Logo } from './Logo'
import { Avatar, btn } from './ui'

const NAV = [
  { to: '/', label: 'Discover', end: true },
  { to: '/problems', label: 'Problems' },
  { to: '/solutions', label: 'Solutions' },
]

function useUnread() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => api.get<{ count: number }>('/notifications/unread-count'),
    enabled: !!user,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  })
}

function Dropdown({ trigger, children, label, align = 'right' }: { trigger: ReactNode; children: (close: () => void) => ReactNode; label: string; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <div className="relative" ref={ref}>
      <button type="button" aria-expanded={open} aria-label={label} onClick={() => setOpen((o) => !o)} className="flex items-center">
        {trigger}
      </button>
      {open && (
        <div className={clsx('fade-up absolute top-full z-50 mt-2 w-64 rounded-2xl border border-sand-200 bg-white p-1.5 shadow-xl shadow-sand-900/10', align === 'right' ? 'right-0' : 'left-0')}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

function MenuItem({ to, icon: Icon, children, onClick, description }: { to?: string; icon: typeof Plus; children: ReactNode; onClick?: () => void; description?: string }) {
  const cls = 'flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-sand-800 hover:bg-sand-50'
  const inner = (
    <>
      <Icon className="mt-0.5 size-4 shrink-0 text-sand-500" aria-hidden />
      <span>
        {children}
        {description && <span className="block text-xs font-normal text-sand-500">{description}</span>}
      </span>
    </>
  )
  return to ? (
    <Link to={to} className={cls} onClick={onClick}>
      {inner}
    </Link>
  ) : (
    <button type="button" className={cls} onClick={onClick}>
      {inner}
    </button>
  )
}

function HeaderSearch({ className }: { className?: string }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [q, setQ] = useState('')
  useEffect(() => {
    if (location.pathname === '/search') setQ(new URLSearchParams(location.search).get('q') ?? '')
  }, [location])
  return (
    <form
      role="search"
      className={clsx('relative', className)}
      onSubmit={(e) => {
        e.preventDefault()
        if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`)
      }}
    >
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-sand-400" aria-hidden />
      <label htmlFor="global-search" className="sr-only">
        Search problems and solutions
      </label>
      <input
        id="global-search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search problems and solutions…"
        className="w-full rounded-xl border border-sand-200 bg-sand-50 py-2 pr-3 pl-9 text-sm placeholder:text-sand-400 focus:border-atlas-500 focus:bg-white focus:ring-3 focus:ring-atlas-100 focus:outline-none"
      />
    </form>
  )
}

function Header() {
  const { user, logout } = useAuth()
  const unread = useUnread()
  const count = unread.data?.count ?? 0
  return (
    <header className="sticky top-0 z-40 border-b border-sand-200/80 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link to="/" aria-label="BladiSolution Campus home" className="shrink-0">
          <Logo height={34} />
        </Link>
        <nav aria-label="Main" className="ml-2 hidden items-center gap-0.5 lg:flex">
          {[...NAV, ...(user ? [{ to: '/activity', label: 'My Activity', end: false }] : [])].map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                clsx('rounded-lg px-3 py-2 text-sm font-semibold transition-colors', isActive ? 'bg-navy-50 text-navy-900' : 'text-sand-600 hover:bg-sand-100 hover:text-sand-900')
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <HeaderSearch className="ml-auto hidden w-full max-w-xs md:block" />
        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <Link to="/search" className="rounded-lg p-2 text-sand-600 hover:bg-sand-100 md:hidden" aria-label="Search">
            <Search className="size-5" />
          </Link>
          <Link to="/problems/new" className={btn('primary', 'md', 'hidden sm:inline-flex')}>
            <Plus className="size-4" aria-hidden /> Submit a Problem
          </Link>
          {user ? (
            <>
              <Link to="/notifications" className="relative rounded-lg p-2 text-sand-600 hover:bg-sand-100" aria-label={`Notifications${count ? `, ${count} unread` : ''}`}>
                <Bell className="size-5" />
                {count > 0 && (
                  <span className="absolute top-1 right-1 grid min-w-4 place-items-center rounded-full bg-clay-500 px-1 text-[10px] leading-4 font-bold text-white">{count > 99 ? '99+' : count}</span>
                )}
              </Link>
              <div className="hidden lg:block">
                <Dropdown label="Account menu" trigger={<Avatar user={user} size={34} className="ring-2 ring-white" />}>
                  {(close) => (
                    <>
                      <div className="border-b border-sand-100 px-3 pt-2 pb-3">
                        <div className="truncate font-bold text-sand-900">{user.name}</div>
                        <div className="text-xs text-sand-500">
                          {roleLabel(user)}
                          {(user.role === 'organization' || user.role === 'municipality') && !user.verified && ' · pending verification'}
                        </div>
                      </div>
                      <div className="pt-1.5">
                        <MenuItem to={`/u/${user.username}`} icon={UserIcon} onClick={close}>
                          Profile
                        </MenuItem>
                        <MenuItem to="/activity" icon={Activity} onClick={close}>
                          My Activity
                        </MenuItem>
                        <MenuItem to="/settings" icon={Settings} onClick={close}>
                          Edit profile
                        </MenuItem>
                        {user.role === 'admin' && (
                          <MenuItem to="/moderation" icon={ShieldCheck} onClick={close}>
                            Moderation
                          </MenuItem>
                        )}
                        <MenuItem
                          icon={LogOut}
                          onClick={() => {
                            close()
                            logout()
                          }}
                        >
                          Sign out
                        </MenuItem>
                      </div>
                    </>
                  )}
                </Dropdown>
              </div>
            </>
          ) : (
            <div className="hidden items-center gap-1 sm:flex">
              <Link to="/login" className={btn('ghost', 'md')}>
                Sign in
              </Link>
              <Link to="/register" className={btn('secondary', 'md', 'hidden lg:inline-flex')}>
                Join
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

function MobileNav() {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const location = useLocation()
  useEffect(() => setOpen(false), [location.pathname])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])
  const tab = 'flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold'
  const navCls = ({ isActive }: { isActive: boolean }) => clsx(tab, isActive ? 'text-navy-900' : 'text-sand-500')
  return (
    <>
      <nav aria-label="Mobile" className="fixed inset-x-0 bottom-0 z-40 border-t border-sand-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
        <div className="mx-auto flex max-w-lg items-stretch">
          <NavLink to="/" end className={navCls}>
            <Home className="size-5" aria-hidden /> Discover
          </NavLink>
          <NavLink to="/problems" end className={navCls}>
            <LayoutGrid className="size-5" aria-hidden /> Problems
          </NavLink>
          <Link to="/problems/new" className={tab} aria-label="Submit a problem">
            <span className="-mt-5 grid size-12 place-items-center rounded-2xl bg-navy-900 text-white shadow-lg shadow-navy-900/25">
              <Plus className="size-6" aria-hidden />
            </span>
            <span className="text-sand-600">Submit</span>
          </Link>
          <NavLink to="/solutions" className={navCls}>
            <Lightbulb className="size-5" aria-hidden /> Solutions
          </NavLink>
          <button type="button" className={clsx(tab, 'text-sand-500')} onClick={() => setOpen(true)} aria-expanded={open}>
            <Menu className="size-5" aria-hidden /> Me
          </button>
        </div>
      </nav>
      {open && (
        <div className="fixed inset-0 z-50 bg-sand-900/40 lg:hidden" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="fade-up absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-3xl bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between px-2">
              <span className="text-sm font-bold text-sand-900">Menu</span>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-sand-500 hover:bg-sand-100" aria-label="Close">
                <X className="size-5" />
              </button>
            </div>
            {user ? (
              <Link to={`/u/${user.username}`} className="mb-2 flex items-center gap-3 rounded-2xl bg-sand-50 p-3">
                <Avatar user={user} size={40} />
                <span className="min-w-0">
                  <span className="block truncate font-bold text-sand-900">{user.name}</span>
                  <span className="text-xs text-sand-500">{roleLabel(user)} · View profile</span>
                </span>
              </Link>
            ) : (
              <div className="mb-3 grid grid-cols-2 gap-2">
                <Link to="/login" className={btn('secondary', 'md')}>
                  Sign in
                </Link>
                <Link to="/register" className={btn('primary', 'md')}>
                  Join
                </Link>
              </div>
            )}
            {user && (
              <MenuItem to="/activity" icon={Activity}>
                My Activity
              </MenuItem>
            )}
            <MenuItem to="/problems/new" icon={MessageSquareWarning}>
              Submit a Problem
            </MenuItem>
            <MenuItem to="/search" icon={Search}>
              Search
            </MenuItem>
            {user && (
              <>
                <MenuItem to="/notifications" icon={Bell}>
                  Notifications
                </MenuItem>
                <MenuItem to="/settings" icon={Settings}>
                  Edit profile
                </MenuItem>
                {user.role === 'admin' && (
                  <MenuItem to="/moderation" icon={ShieldCheck}>
                    Moderation
                  </MenuItem>
                )}
                <MenuItem icon={LogOut} onClick={() => logout()}>
                  Sign out
                </MenuItem>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function Footer() {
  return (
    <footer className="mt-16 border-t border-sand-200 bg-white pb-20 lg:pb-0">
      <div className="mx-auto grid grid-cols-1 max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.6fr_1fr_1fr]">
        <div>
          <Logo height={40} />
          <p className="mt-3 max-w-md text-sm text-sand-600">
            BladiSolution Campus is the first version of BladiSolution, a platform connecting real problems with the people who can solve them. It starts with
            students and university communities across Morocco and is open to every developer, researcher, startup and organization who wants to help.
          </p>
        </div>
        {[
          ['Explore', [['/problems', 'Problems'], ['/solutions?sort=top', 'Most supported solutions'], ['/solutions?sort=latest', 'Newest solutions']]],
          ['Participate', [['/problems/new', 'Submit a problem'], ['/problems?sort=unsolved', 'Propose a solution'], ['/register', 'Create an account']]],
        ].map(([title, links]) => (
          <div key={title as string}>
            <h2 className="text-xs font-bold tracking-wider text-sand-500 uppercase">{title as string}</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {(links as string[][]).map(([to, l]) => (
                <li key={to}>
                  <Link to={to} className="text-sand-700 hover:text-atlas-700">
                    {l}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </footer>
  )
}

export function Layout() {
  const location = useLocation()
  useEffect(() => {
    if (!location.hash) window.scrollTo(0, 0)
  }, [location.pathname, location.hash])
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only z-50 rounded-lg bg-navy-900 px-4 py-2 text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        Skip to content
      </a>
      <Header />
      <main id="main" className="flex-1 pb-24 lg:pb-0">
        <Outlet />
      </main>
      <Footer />
      <MobileNav />
    </div>
  )
}

export function Page({ children, className, wide = false }: { children: ReactNode; className?: string; wide?: boolean }) {
  return <div className={clsx('mx-auto px-4 py-6 sm:px-6 sm:py-8', wide ? 'max-w-7xl' : 'max-w-6xl', className)}>{children}</div>
}
