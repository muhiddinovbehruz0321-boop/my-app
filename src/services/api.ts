const API_URL = import.meta.env.VITE_API_URL ?? ''

export type PlayerProfile = {
  id: string
  username: string
  email: string
  rating: number
  wins: number
  losses: number
  kills: number
  deaths: number
}

export type MatchRecord = {
  id: string
  mode: string
  result: string
  kills: number
  durationSeconds: number
  verified: boolean
  createdAt: string
}

export async function apiRequest<T>(path: string, options: RequestInit = {}, token?: string | null): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)
  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, { ...options, headers })
  } catch {
    throw new Error('Breachline server is unreachable. Start the API server and try again.')
  }
  const payload = await response.json().catch(() => ({})) as { error?: string; message?: string }
  if (!response.ok) throw new Error(payload.error ?? payload.message ?? `Request failed (${response.status})`)
  return payload as T
}
