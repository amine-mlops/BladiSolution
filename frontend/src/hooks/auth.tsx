import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ApiError, api } from '../lib/api'
import { DECISION_ROLES } from '../lib/format'
import type { Me } from '../lib/types'

interface AuthCtx {
  user: Me | null
  loading: boolean
  isDecisionMaker: boolean
  login: (email: string, password: string) => Promise<Me>
  register: (data: Record<string, unknown>) => Promise<Me>
  logout: () => Promise<void>
  refresh: () => void
  requireAuth: () => boolean
}

const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const { data, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api.get<Me>('/auth/me')
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null
        throw e
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  })

  const afterAuth = useCallback(
    (user: Me) => {
      qc.setQueryData(['me'], user)
      // Everything viewer-specific (stars, supports, follows) must refetch.
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'me' })
      return user
    },
    [qc],
  )

  const value = useMemo<AuthCtx>(
    () => ({
      user: data ?? null,
      loading: isLoading,
      isDecisionMaker: !!data && DECISION_ROLES.includes(data.role),
      login: async (email, password) => afterAuth((await api.post<{ user: Me }>('/auth/login', { email, password })).user),
      register: async (body) => afterAuth((await api.post<{ user: Me }>('/auth/register', body)).user),
      logout: async () => {
        await api.post('/auth/logout')
        qc.setQueryData(['me'], null)
        qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' })
        navigate('/')
      },
      refresh: () => qc.invalidateQueries({ queryKey: ['me'] }),
      requireAuth: () => {
        if (data) return true
        navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`)
        return false
      },
    }),
    [data, isLoading, afterAuth, qc, navigate, location.pathname, location.search],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth outside AuthProvider')
  return ctx
}
