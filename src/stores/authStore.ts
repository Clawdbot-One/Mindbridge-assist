import { create } from 'zustand'
import { api } from '@/lib/api'

interface User {
  id: string
  username: string
  email: string
  role: string
  displayName: string
  avatar?: string
}

interface RegisterData {
  username: string
  email: string
  password: string
  role: string
}

interface AuthResponse {
  token: string
  user: User
}

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  login: (username: string, password: string) => Promise<void>
  register: (data: RegisterData) => Promise<void>
  logout: () => void
  loadUser: () => Promise<void>
  clearError: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem('mindbridge_token'),
  isAuthenticated: !!localStorage.getItem('mindbridge_token'),
  isLoading: false,
  error: null,

  login: async (username: string, password: string) => {
    set({ isLoading: true, error: null })
    try {
      const res = await api.post<AuthResponse>('/auth/login', { username, password })
      localStorage.setItem('mindbridge_token', res.token)
      localStorage.setItem('mindbridge_userId', res.user.id)
      set({
        user: res.user,
        token: res.token,
        isAuthenticated: true,
        isLoading: false,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : '登录失败'
      set({ error: message, isLoading: false })
      throw err
    }
  },

  register: async (data: RegisterData) => {
    set({ isLoading: true, error: null })
    try {
      const res = await api.post<AuthResponse>('/auth/register', data)
      localStorage.setItem('mindbridge_token', res.token)
      localStorage.setItem('mindbridge_userId', res.user.id)
      set({
        user: res.user,
        token: res.token,
        isAuthenticated: true,
        isLoading: false,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : '注册失败'
      set({ error: message, isLoading: false })
      throw err
    }
  },

  logout: () => {
    localStorage.removeItem('mindbridge_token')
    localStorage.removeItem('mindbridge_userId')
    set({ user: null, token: null, isAuthenticated: false })
  },

  loadUser: async () => {
    const token = localStorage.getItem('mindbridge_token')
    if (!token) return
    set({ isLoading: true })
    try {
      const res = await api.get<User>('/auth/me')
      localStorage.setItem('mindbridge_userId', res.id)
      set({ user: res, isAuthenticated: true, isLoading: false })
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('401') || msg.includes('认证令牌')) {
        localStorage.removeItem('mindbridge_token')
        localStorage.removeItem('mindbridge_userId')
        set({ user: null, token: null, isAuthenticated: false, isLoading: false })
      } else {
        set({ isLoading: false })
      }
    }
  },

  clearError: () => set({ error: null }),
}))
