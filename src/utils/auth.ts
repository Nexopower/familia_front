export type { AuthUser, Negocio } from '@/types'
import type { Negocio, SwitchNegocioResponse } from '@/types'

export const SESSION_CHANGED_EVENT = 'session-changed'

function notifySessionChanged() {
  if (typeof window === 'undefined')
    return

  window.dispatchEvent(new Event(SESSION_CHANGED_EVENT))
}

const ACCESS_TOKEN_KEY = 'access_token'
const REFRESH_TOKEN_KEY = 'refresh_token'
const USER_KEY = 'user'
const NEGOCIOS_KEY = 'negocios'

function getApiBaseUrl(): string {
  const base = import.meta.env.VITE_API_BASE_URL as string | undefined
  if (!base)
    throw new Error('Falta VITE_API_BASE_URL en .env')

  return base.endsWith('/') ? base : `${base}/`
}

export function getToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY)
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY)
}

export function getUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY)
  if (!raw)
    return null

  try {
    return JSON.parse(raw) as AuthUser
  }
  catch {
    return null
  }
}

export function getNegocios(): Negocio[] {
  const raw = localStorage.getItem(NEGOCIOS_KEY)
  if (!raw)
    return []

  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as Negocio[]) : []
  }
  catch {
    return []
  }
}

export function setSession(
  accessToken: string,
  user: AuthUser,
  refreshToken?: string | null,
  negocios?: Negocio[] | null,
) {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
  if (refreshToken)
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
  else
    localStorage.removeItem(REFRESH_TOKEN_KEY)

  if (negocios && Array.isArray(negocios))
    localStorage.setItem(NEGOCIOS_KEY, JSON.stringify(negocios))
  else
    localStorage.removeItem(NEGOCIOS_KEY)

  notifySessionChanged()
}

export function setAccessToken(accessToken: string) {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken)
  notifySessionChanged()
}

export async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken()
  if (!refreshToken)
    return false

  try {
    const response = await fetch(`${getApiBaseUrl()}auth/refresh`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken }),
    })

    if (!response.ok)
      return false

    const data = await response.json() as { accessToken?: string }
    if (!data?.accessToken)
      return false

    setAccessToken(data.accessToken)
    return true
  }
  catch {
    return false
  }
}

/** Reemplaza la lista de negocios de la sesión (solo notifica si cambió). */
export function setNegocios(negocios: Negocio[]) {
  const next = JSON.stringify(negocios ?? [])
  const current = localStorage.getItem(NEGOCIOS_KEY)
  if (current === next)
    return

  localStorage.setItem(NEGOCIOS_KEY, next)
  notifySessionChanged()
}

export function patchUser(patch: Partial<AuthUser>) {
  const current = getUser() || ({} as AuthUser)
  const next = { ...current, ...patch }
  localStorage.setItem(USER_KEY, JSON.stringify(next))
  notifySessionChanged()
}

export function clearSession() {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
  localStorage.removeItem(NEGOCIOS_KEY)
  notifySessionChanged()
}

export async function isAuthenticated(): Promise<boolean> {
  const token = getToken()
  if (!token)
    return false

  try {
    const response = await fetch(`${getApiBaseUrl()}auth/validate`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    })

    if (response.ok)
      return true

    if (response.status === 401) {
      const refreshed = await refreshAccessToken()
      if (!refreshed) {
        clearSession()
        return false
      }

      const retryToken = getToken()
      if (!retryToken)
        return false

      const retry = await fetch(`${getApiBaseUrl()}auth/validate`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${retryToken}`,
          'Accept': 'application/json',
        },
      })

      if (retry.ok)
        return true

      clearSession()
      return false
    }

    return false
  }
  catch {
    return false
  }
}

export async function logout(redirect: boolean = true) {
  const token = getToken()

  try {
    if (token) {
      await fetch(`${getApiBaseUrl()}auth/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
      })
    }
  }
  catch {
    // Ignorar errores de logout
  }
  finally {
    clearSession()
    if (redirect)
      window.location.assign('/')
  }
}

export async function switchNegocio(codneg: string | number | null): Promise<SwitchNegocioResponse> {
  const token = getToken()
  if (!token)
    throw new Error('No hay token en sesión')

  const response = await fetch(`${getApiBaseUrl()}auth/switch-negocio`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    // codneg null = deseleccionar (vista general sin negocio)
    body: JSON.stringify({ codneg }),
  })

  if (response.status === 401) {
    clearSession()
    throw new Error('Sesión expirada. Vuelve a iniciar sesión.')
  }

  if (!response.ok) {
    let details: any = null
    try {
      details = await response.json()
    }
    catch {
      details = null
    }

    const message = details?.message ? String(details.message) : `Error HTTP ${response.status}`
    throw new Error(message)
  }

  const data = await response.json() as SwitchNegocioResponse
  setAccessToken(data.accessToken)
  patchUser({ codneg: data.codneg, codrol: data.codrol })
  return data
}
