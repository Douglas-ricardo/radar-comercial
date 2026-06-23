'use client'

// ===========================================
// Radar Comercial — AuthContext
// Correções aplicadas:
//  1. Removido todo uso de localStorage — auth via cookie httpOnly
//  2. UnauthorizedError tratada aqui: router.push('/login') sem window.location
//  3. Sessão expirada durante uso é capturada globalmente
//  4. Estado inicial isLoading: true evita flash de conteúdo não autenticado
// ===========================================

import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react'
import { useRouter } from 'next/navigation'
import type { User, Company, AuthState, LoginCredentials, SignupData } from '@/types'
import { api, UnauthorizedError } from '@/lib/api/client'
import { setActiveCurrency } from '@/lib/utils'

interface AuthContextType extends AuthState {
  login: (credentials: LoginCredentials) => Promise<{ mfaRequired: true; mfaToken: string } | void>
  verifyMfa: (mfaToken: string, code: string) => Promise<void>
  signup: (data: SignupData) => Promise<void>
  logout: () => Promise<void>
  handleUnauthorized: () => void
  updateUser: (user: Partial<User>) => void
  updateCompany: (company: Partial<Company>) => void
}

type AuthAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_USER'; payload: { user: User; company: Company } }
  | { type: 'UPDATE_USER'; payload: Partial<User> }
  | { type: 'UPDATE_COMPANY'; payload: Partial<Company> }
  | { type: 'LOGOUT' }

const initialState: AuthState = {
  user: null,
  company: null,
  isAuthenticated: false,
  isLoading: true, // começa como true para evitar flash de redirect
}

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload }
    case 'SET_USER':
      setActiveCurrency(action.payload.company?.currency)
      return {
        ...state,
        user: action.payload.user,
        company: action.payload.company,
        isAuthenticated: true,
        isLoading: false,
      }
    case 'UPDATE_USER':
      return {
        ...state,
        user: state.user ? { ...state.user, ...action.payload } : null,
      }
    case 'UPDATE_COMPANY':
      if (action.payload.currency) setActiveCurrency(action.payload.currency)
      return {
        ...state,
        company: state.company ? { ...state.company, ...action.payload } : null,
      }
    case 'LOGOUT':
      return { ...initialState, isLoading: false }
    default:
      return state
  }
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, initialState)
  const router = useRouter()

  // Redireciona para login sem window.location (preserva o router do Next.js)
  const handleUnauthorized = useCallback(() => {
    dispatch({ type: 'LOGOUT' })
    router.push('/login')
  }, [router])

  // Verifica sessão via cookie ao carregar (F5 / primeira visita)
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await api.auth.getCurrentUser()
        if (response.success && response.data) {
          dispatch({
            type: 'SET_USER',
            payload: { user: response.data.user, company: response.data.company },
          })
        } else {
          dispatch({ type: 'SET_LOADING', payload: false })
        }
      } catch (err) {
        // Cookie inválido ou expirado — apenas desautentica, não redireciona
        // O ProtectedRoute cuida do redirect quando necessário
        if (err instanceof UnauthorizedError) {
          dispatch({ type: 'LOGOUT' })
        } else {
          dispatch({ type: 'SET_LOADING', payload: false })
        }
      }
    }
    checkAuth()
  }, [])

  const login = useCallback(async (credentials: LoginCredentials) => {
    dispatch({ type: 'SET_LOADING', payload: true })
    try {
      const response = await api.auth.login(credentials)
      if (response.success && response.data) {
        // MFA: o backend não autenticou ainda — sinaliza 2º passo para a UI.
        if ('mfaRequired' in response.data) {
          dispatch({ type: 'SET_LOADING', payload: false })
          return { mfaRequired: true as const, mfaToken: response.data.mfaToken }
        }
        dispatch({
          type: 'SET_USER',
          payload: { user: response.data.user, company: response.data.company },
        })
        // Usuário convidado com senha temporária → forçar troca antes de entrar
        if ((response.data as { requiresPasswordChange?: boolean }).requiresPasswordChange) {
          router.push('/set-password')
          return
        }
      } else {
        dispatch({ type: 'SET_LOADING', payload: false })
        throw new Error(response.error ?? 'Credenciais inválidas')
      }
    } catch (error) {
      dispatch({ type: 'SET_LOADING', payload: false })
      throw error
    }
  }, [router])

  const verifyMfa = useCallback(async (mfaToken: string, code: string) => {
    dispatch({ type: 'SET_LOADING', payload: true })
    try {
      const response = await api.auth.verifyMfa(mfaToken, code)
      if (response.success && response.data) {
        dispatch({
          type: 'SET_USER',
          payload: { user: response.data.user, company: response.data.company },
        })
        if (response.data.requiresPasswordChange) {
          router.push('/set-password')
        }
      } else {
        dispatch({ type: 'SET_LOADING', payload: false })
        throw new Error(response.error ?? 'Código inválido')
      }
    } catch (error) {
      dispatch({ type: 'SET_LOADING', payload: false })
      throw error
    }
  }, [router])

  const signup = useCallback(async (data: SignupData) => {
    dispatch({ type: 'SET_LOADING', payload: true })
    try {
      const response = await api.auth.signup(data)
      if (response.success && response.data) {
        dispatch({
          type: 'SET_USER',
          payload: { user: response.data.user, company: response.data.company },
        })
      } else {
        dispatch({ type: 'SET_LOADING', payload: false })
        throw new Error(response.error ?? 'Erro ao criar conta')
      }
    } catch (error) {
      dispatch({ type: 'SET_LOADING', payload: false })
      throw error
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.auth.logout()
    } catch {
      // logout local mesmo se o servidor falhar
    } finally {
      dispatch({ type: 'LOGOUT' })
      router.push('/login')
    }
  }, [router])

  const updateUser = useCallback((userData: Partial<User>) => {
    dispatch({ type: 'UPDATE_USER', payload: userData })
  }, [])

  const updateCompany = useCallback((companyData: Partial<Company>) => {
    dispatch({ type: 'UPDATE_COMPANY', payload: companyData })
  }, [])

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        verifyMfa,
        signup,
        logout,
        handleUnauthorized,
        updateUser,
        updateCompany,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
