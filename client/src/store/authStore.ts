import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface User {
  id: string
  email: string
  username: string
  cursorColor: string
  createdAt: string
}

interface AuthState {
  user: User | null
  token: string | null
  isLoading: boolean
  error: string | null
  setAuth: (user: User, token: string) => void
  clearAuth: () => void
  setError: (error: string | null) => void
  setLoading: (loading: boolean) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isLoading: false,
      error: null,
      setAuth: (user, token) => set({ user, token, error: null }),
      clearAuth: () => set({ user: null, token: null }),
      setError: (error) => set({ error }),
      setLoading: (isLoading) => set({ isLoading }),
    }),
    {
      name: 'collabboard-auth',
      partialize: (state) => ({ user: state.user, token: state.token }),
    }
  )
)
