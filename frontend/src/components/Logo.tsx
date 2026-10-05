import clsx from 'clsx'

export function LogoMark({ className, light = false }: { className?: string; light?: boolean }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <rect width="40" height="40" rx="11" fill={light ? '#ffffff' : '#0b5c42'} />
      <g transform="translate(20 20)" fill="none" stroke={light ? '#0b5c42' : '#faf8f4'} strokeWidth="2.6" strokeLinejoin="round">
        <rect x="-8.2" y="-8.2" width="16.4" height="16.4" />
        <rect x="-8.2" y="-8.2" width="16.4" height="16.4" transform="rotate(45)" />
      </g>
      <circle cx="20" cy="20" r="3.2" fill="#e3a008" />
    </svg>
  )
}

export function Logo({ light = false, className }: { light?: boolean; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-2', className)}>
      <LogoMark className="size-8 shrink-0" light={light} />
      <span className={clsx('text-[17px] font-extrabold tracking-tight', light ? 'text-white' : 'text-sand-900')}>
        Bladi<span className={light ? 'text-atlas-200' : 'text-atlas-700'}>Solution</span>
      </span>
    </span>
  )
}
