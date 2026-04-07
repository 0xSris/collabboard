const BASE = '/api'

function getToken(): string | null {
  try {
    const raw = localStorage.getItem('collabboard-auth')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.state?.token ?? null
  } catch {
    return null
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, { ...options, headers })
  const data = await res.json()

  if (!res.ok) {
    throw new Error(data.error || `Request failed: ${res.status}`)
  }
  return data as T
}

export const api = {
  auth: {
    register: (email: string, username: string, password: string) =>
      request<{ user: any; token: string }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, username, password }),
      }),
    login: (email: string, password: string) =>
      request<{ user: any; token: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    me: () => request<any>('/auth/me'),
  },
  rooms: {
    list: () => request<any[]>('/rooms'),
    create: (name: string) => request<any>('/rooms', { method: 'POST', body: JSON.stringify({ name }) }),
    get: (id: string) => request<any>(`/rooms/${id}`),
    delete: (id: string) => request<any>(`/rooms/${id}`, { method: 'DELETE' }),
  },
  export: {
    me: () => {
      const token = getToken()
      const headers: Record<string, string> = {}
      if (token) headers['Authorization'] = `Bearer ${token}`
      return fetch(`${BASE}/export/me`, { headers })
    },
  },
}
