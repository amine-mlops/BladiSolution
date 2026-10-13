import clsx from 'clsx'

// Brand assets live in /public. BladiSolution_logo.png is the full "BladiSolution Campus"
// wordmark (675×160, transparent); BladiSolution_icon.png is the square mark.
export const LOGO_SRC = '/BladiSolution_logo.png'
export const ICON_SRC = '/BladiSolution_icon.png'
const LOGO_RATIO = 675 / 160

/** The square brand mark. Sized by height; keeps its aspect ratio. */
export function LogoMark({ className }: { className?: string }) {
  return <img src={ICON_SRC} alt="" aria-hidden className={clsx('aspect-square object-contain', className)} />
}

/**
 * The full wordmark. `height` is in CSS pixels; width follows the image's aspect ratio.
 * On dark backgrounds pass `onDark`: the navy lettering sits on a white tile so it stays legible.
 */
export function Logo({ height = 36, onDark = false, className }: { height?: number; onDark?: boolean; className?: string }) {
  const img = (
    <img
      src={LOGO_SRC}
      alt="BladiSolution Campus"
      width={Math.round(height * LOGO_RATIO)}
      height={height}
      className="block h-auto max-w-full object-contain"
      style={{ height, width: 'auto' }}
    />
  )
  if (!onDark) return <span className={clsx('inline-flex items-center', className)}>{img}</span>
  return <span className={clsx('inline-flex items-center rounded-xl bg-white px-3 py-2 shadow-sm', className)}>{img}</span>
}
