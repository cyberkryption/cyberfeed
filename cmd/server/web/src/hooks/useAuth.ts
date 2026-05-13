import { useState, useEffect, useCallback } from 'react'

interface AuthState {
  authenticated: boolean
  username: string | null
  loading: boolean
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    authenticated: false,
    username: null,
    loading: true,
  })

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((data) =>
        setState({
          authenticated: !!data?.authenticated,
          username: data?.username ?? null,
          loading: false,
        })
      )
      .catch(() => setState({ authenticated: false, username: null, loading: false }))
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    if (!r.ok) {
      const data = await r.json().catch(() => ({}))
      throw new Error((data as { error?: string }).error ?? 'Login failed')
    }
    const data = await r.json()
    setState({ authenticated: true, username: data.username, loading: false })
  }, [])

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
    setState({ authenticated: false, username: null, loading: false })
  }, [])

  return { ...state, login, logout }
}
