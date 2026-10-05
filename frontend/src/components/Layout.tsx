import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import {
  Bell,
  ChevronDown,
  Compass,
  Gauge,
  Home,
  Landmark,
  LayoutGrid,
  Lightbulb,
  LogOut,
  Map,
  Menu,
  MessageSquareWarning,
  Plus,
  Search,
  Settings,
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
  { to: '/problems', label: 'Problems', icon: LayoutGrid },
  { to: '/solutions', label: 'Solutions', icon: Lightbulb },
  { to: '/discover', label: 'Discover', icon: Compass },
  { to: '/map', label: 'Map', icon: Map },
  { to: '/dashboard', label: 'Dashboard', icon: Gauge },
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

function CreateMenuItems({ close, isDecisionMaker }: { close: () => void; isDecisionMaker: boolean }) {
  return (
    <>
      <MenuItem to="/problems/new" icon={MessageSquareWarning} onClick={close} description="Describe a local issue in your city">
        Submit a Problem
      </MenuItem>
      <MenuItem to="/problems?sort=unsolved&intent=propose" icon={Lightbulb} onClick={close} description="Pick an open problem and propose a fix">
        Propose a Solution
      </MenuItem>
      {isDecisionMaker && (
        <MenuItem to="/problems/new?official=1" icon={Landmark} onClick={close} description="Invite the community to solve a challenge">
          Publish Official Challenge
        </MenuItem>
      )}
    </>
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
        Search problems, solutions, people and tags
      </label>
      <input
        id="global-search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search “waste Rabat”, “Python”…"
        className="w-full rounded-xl border border-sand-200 bg-sand-50 py-2 pr-3 pl-9 text-sm placeholder:text-sand-400 focus:border-atlas-500 focus:bg-white focus:ring-3 focus:ring-atlas-100 focus:outline-none"
      />
    </form>
  )
}

function Header() {
  const { user, isDecisionMaker, logout } = useAuth()
  const unread = useUnread()
  const count = unread.data?.count ?? 0
  return (
    <header className="sticky top-0 z-40 border-b border-sand-200/80 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link to="/" aria-label="BladiSolution home" className="shrink-0">
          <Logo />
        </Link>
        <nav aria-label="Main" className="ml-2 hidden items-center gap-0.5 lg:flex">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                clsx('rounded-lg px-3 py-2 text-sm font-semibold transition-colors', isActive ? 'bg-atlas-50 text-atlas-800' : 'text-sand-600 hover:bg-sand-100 hover:text-sand-900')
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
          <div className="hidden sm:block">
            <Dropdown label="Create" trigger={<span className={btn('primary', 'md')}><Plus className="size-4" aria-hidden /> New <ChevronDown className="size-3.5 opacity-70" aria-hidden /></span>}>
              {(close) => <CreateMenuItems close={close} isDecisionMaker={isDecisionMaker} />}
            </Dropdown>
          </div>
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
                        <div className="text-xs text-sand-500">{roleLabel(user)}</div>
                      </div>
                      <div className="pt-1.5">
                        <MenuItem to={`/u/${user.username}`} icon={UserIcon} onClick={close}>
                          My profile
                        </MenuItem>
                        <MenuItem to="/settings" icon={Settings} onClick={close}>
                          Edit profile
                        </MenuItem>
                        {isDecisionMaker && (
                          <MenuItem to="/dashboard" icon={Gauge} onClick={close}>
                            Civic dashboard
                          </MenuItem>
                        )}
                        {user.role === 'admin' && (
                          <MenuItem to="/moderation" icon={MessageSquareWarning} onClick={close}>
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
  const { user, isDecisionMaker, logout } = useAuth()
  const [sheet, setSheet] = useState<'create' | 'more' | null>(null)
  const location = useLocation()
  useEffect(() => setSheet(null), [location.pathname])
  useEffect(() => {
    if (!sheet) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSheet(null)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [sheet])
  const tab = 'flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold'
  const navCls = ({ isActive }: { isActive: boolean }) => clsx(tab, isActive ? 'text-atlas-700' : 'text-sand-500')
  return (
    <>
      <nav aria-label="Mobile" className="fixed inset-x-0 bottom-0 z-40 border-t border-sand-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
        <div className="mx-auto flex max-w-lg items-stretch">
          <NavLink to="/" end className={navCls}>
            <Home className="size-5" aria-hidden /> Home
          </NavLink>
          <NavLink to="/problems" className={navCls}>
            <LayoutGrid className="size-5" aria-hidden /> Problems
          </NavLink>
          <button type="button" className={tab} onClick={() => setSheet('create')} aria-label="Create" aria-expanded={sheet === 'create'}>
            <span className="-mt-5 grid size-12 place-items-center rounded-2xl bg-atlas-700 text-white shadow-lg shadow-atlas-900/25">
              <Plus className="size-6" aria-hidden />
            </span>
            <span className="text-sand-600">Create</span>
          </button>
          <NavLink to="/solutions" className={navCls}>
            <Lightbulb className="size-5" aria-hidden /> Solutions
          </NavLink>
          <button type="button" className={clsx(tab, 'text-sand-500')} onClick={() => setSheet('more')} aria-expanded={sheet === 'more'}>
            <Menu className="size-5" aria-hidden /> More
          </button>
        </div>
      </nav>
      {sheet && (
        <div className="fixed inset-0 z-50 bg-sand-900/40 lg:hidden" onClick={() => setSheet(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={sheet === 'create' ? 'Create' : 'Menu'}
            className="fade-up absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-3xl bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between px-2">
              <span className="text-sm font-bold text-sand-900">{sheet === 'create' ? 'Create' : 'Menu'}</span>
              <button type="button" onClick={() => setSheet(null)} className="rounded-lg p-1.5 text-sand-500 hover:bg-sand-100" aria-label="Close">
                <X className="size-5" />
              </button>
            </div>
            {sheet === 'create' ? (
              <CreateMenuItems close={() => setSheet(null)} isDecisionMaker={isDecisionMaker} />
            ) : (
              <>
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
                      Join BladiSolution
                    </Link>
                  </div>
                )}
                <MenuItem to="/discover" icon={Compass}>
                  Discover
                </MenuItem>
                <MenuItem to="/map" icon={Map}>
                  Problem map
                </MenuItem>
                <MenuItem to="/dashboard" icon={Gauge}>
                  Civic dashboard
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
                      <MenuItem to="/moderation" icon={MessageSquareWarning}>
                        Moderation
                      </MenuItem>
                    )}
                    <MenuItem icon={LogOut} onClick={() => logout()}>
                      Sign out
                    </MenuItem>
                  </>
                )}
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
      <div className="mx-auto grid grid-cols-1 max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-3 max-w-sm text-sm text-sand-600">
            Where communities meet solutions. An open civic innovation platform turning local problems into collaborative, implementable solutions.
          </p>
          <p className="mt-3 text-xs text-sand-400">Built for the African Smart City Innovation Conference (ASCIC) Hackathon 2026.</p>
        </div>
        {[
          ['Explore', [['/problems', 'Problems'], ['/solutions', 'Latest solutions'], ['/discover', 'Discover'], ['/map', 'Map']]],
          ['Participate', [['/problems/new', 'Submit a problem'], ['/problems?sort=unsolved&intent=propose', 'Propose a solution'], ['/register', 'Create an account']]],
          ['For cities', [['/dashboard', 'Civic dashboard'], ['/problems?official=true', 'Official challenges'], ['/solutions?sort=implemented', 'Implemented solutions']]],
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
      <a href="#main" className="sr-only z-50 rounded-lg bg-atlas-700 px-4 py-2 text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
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
