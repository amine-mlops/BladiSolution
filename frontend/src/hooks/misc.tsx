import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { CheckCircle2, Info, XCircle } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { api } from '../lib/api'
import type { Category, Meta } from '../lib/types'

export function useMeta() {
  return useQuery({ queryKey: ['meta'], queryFn: () => api.get<Meta>('/meta'), staleTime: 10 * 60_000 })
}

export function useCategory(slug: string | null | undefined): Category | undefined {
  const { data } = useMeta()
  return data?.categories.find((c) => c.slug === slug)
}

export function useDocumentTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} · BladiSolution` : 'BladiSolution — Turn Local Problems Into Real Solutions'
  }, [title])
}

export function useDebounced<T>(value: T, ms = 500): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

// ------------------------------------------------------------------ Toasts
type Tone = 'success' | 'error' | 'info'
interface Toast {
  id: number
  tone: Tone
  message: string
}
const ToastCtx = createContext<(message: string, tone?: Tone) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)
  const push = useCallback((message: string, tone: Tone = 'success') => {
    const id = nextId.current++
    setToasts((t) => [...t.slice(-2), { id, tone, message }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200)
  }, [])
  const icons = { success: CheckCircle2, error: XCircle, info: Info }
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6" aria-live="polite">
        {toasts.map((t) => {
          const Icon = icons[t.tone]
          return (
            <div
              key={t.id}
              className={clsx(
                'fade-up pointer-events-auto flex max-w-md items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium shadow-lg',
                t.tone === 'error' ? 'bg-red-700 text-white' : 'bg-sand-900 text-white',
              )}
            >
              <Icon className={clsx('size-4 shrink-0', t.tone === 'success' && 'text-atlas-300')} aria-hidden />
              {t.message}
            </div>
          )
        })}
      </div>
    </ToastCtx.Provider>
  )
}

export const useToast = () => useContext(ToastCtx)
