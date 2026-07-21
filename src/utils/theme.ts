import { getUser } from './auth'
import type { ThemeName, ThemeOption } from '@/types'

export const THEME_OPTIONS: ThemeOption[] = [
  { name: 'corporativo-claro', label: 'Corporativo (Claro)', group: 'Corporativo' },
  { name: 'corporativo-oscuro', label: 'Corporativo (Oscuro)', group: 'Corporativo' },
  { name: 'natural-claro', label: 'Natural (Claro)', group: 'Natural' },
  { name: 'natural-oscuro', label: 'Natural (Oscuro)', group: 'Natural' },
  { name: 'premium-claro', label: 'Premium (Claro)', group: 'Premium' },
  { name: 'premium-oscuro', label: 'Premium (Oscuro)', group: 'Premium' },

  { name: 'rojo-claro', label: 'Rojo (Claro)', group: 'Rojo' },
  { name: 'rojo-oscuro', label: 'Rojo (Oscuro)', group: 'Rojo' },

  { name: 'rojo-neon-claro', label: 'Rojo Neón (Claro)', group: 'Neón' },
  { name: 'rojo-neon-oscuro', label: 'Rojo Neón (Oscuro)', group: 'Neón' },
]

export const DEFAULT_THEME: ThemeName = 'corporativo-claro'

function isThemeName(value: unknown): value is ThemeName {
  return THEME_OPTIONS.some(t => t.name === value)
}

function storageKeyForUser(codusr?: string | null): string {
  return codusr ? `theme:${codusr}` : 'theme'
}

export function getSavedTheme(codusr?: string | null): ThemeName | null {
  const raw = localStorage.getItem(storageKeyForUser(codusr))
  if (!raw)
    return null

  return isThemeName(raw) ? raw : null
}

export function saveTheme(theme: ThemeName, codusr?: string | null) {
  localStorage.setItem(storageKeyForUser(codusr), theme)
}

export function applyTheme(theme: ThemeName) {
  document.documentElement.dataset.theme = theme
}

export function getActiveTheme(): ThemeName {
  const current = document.documentElement.dataset.theme
  return isThemeName(current) ? current : DEFAULT_THEME
}

/**
 * Inicializa el tema para el usuario actual.
 *
 * Prioridad:
 * 1) Tema guardado para el usuario (theme:<codusr>)
 * 2) Tema global (theme)
 * 3) DEFAULT_THEME
 */
export function initThemeForCurrentUser(): ThemeName {
  const user = getUser()
  const theme = getSavedTheme(user?.codusr) ?? getSavedTheme(null) ?? DEFAULT_THEME
  applyTheme(theme)
  return theme
}

export function setThemeForCurrentUser(theme: ThemeName) {
  const user = getUser()
  if (user?.codusr)
    saveTheme(theme, user.codusr)
  else
    saveTheme(theme, null)

  applyTheme(theme)
}
