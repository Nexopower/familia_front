import { clearSession, getToken, refreshAccessToken } from './auth'

export class ApiError extends Error {
  status: number
  details?: unknown

  constructor(message: string, status: number, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
  }
}

function getApiBaseUrl(): string {
  const base = import.meta.env.VITE_API_BASE_URL as string | undefined
  if (!base)
    throw new Error('Falta VITE_API_BASE_URL en .env')

  return base.endsWith('/') ? base : `${base}/`
}

function joinUrl(base: string, path: string): string {
  if (!path)
    return base

  if (path.startsWith('http://') || path.startsWith('https://'))
    return path

  const cleanBase = base.endsWith('/') ? base : `${base}/`
  const cleanPath = path.startsWith('/') ? path.slice(1) : path
  return `${cleanBase}${cleanPath}`
}

async function parseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    try {
      return await response.json()
    }
    catch {
      return null
    }
  }

  try {
    return await response.text()
  }
  catch {
    return null
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = joinUrl(getApiBaseUrl(), path)
  const token = getToken()

  const headers = new Headers(options.headers || {})
  headers.set('Accept', 'application/json')

  const hasBody = options.body !== undefined && options.body !== null
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData

  if (hasBody && !isFormData && !headers.has('Content-Type'))
    headers.set('Content-Type', 'application/json')

  if (token && !headers.has('Authorization'))
    headers.set('Authorization', `Bearer ${token}`)

  let response = await fetch(url, { ...options, headers })

  if (response.status === 401) {
    const isRefreshRequest = path === 'auth/refresh' || path.endsWith('/auth/refresh')
    if (!isRefreshRequest) {
      const refreshed = await refreshAccessToken()
      if (refreshed) {
        const retryHeaders = new Headers(options.headers || {})
        retryHeaders.set('Accept', 'application/json')

        const retryHasBody = options.body !== undefined && options.body !== null
        const retryIsFormData = typeof FormData !== 'undefined' && options.body instanceof FormData
        if (retryHasBody && !retryIsFormData && !retryHeaders.has('Content-Type'))
          retryHeaders.set('Content-Type', 'application/json')

        const newToken = getToken()
        if (newToken)
          retryHeaders.set('Authorization', `Bearer ${newToken}`)

        response = await fetch(url, { ...options, headers: retryHeaders })
      }
    }

    if (response.status === 401) {
      clearSession()
      window.location.assign('/')
      throw new ApiError('Sesión expirada. Vuelve a iniciar sesión.', 401)
    }
  }

  if (!response.ok) {
    const details = await parseBody(response)
    const message =
      (details && typeof details === 'object' && 'message' in details && (details as any).message)
        ? String((details as any).message)
        : `Error HTTP ${response.status}`

    throw new ApiError(message, response.status, details)
  }

  if (response.status === 204)
    return undefined as T

  const data = await parseBody(response)
  return data as T
}
