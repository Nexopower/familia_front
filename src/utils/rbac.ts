import { apiFetch } from './api'

export type ModuleKey =
  | 'PRODUCTOS'
  | 'INVENTARIO'
  | 'FACTURAS'
  | 'RESERVAS'
  | 'CONTABILIDAD'
  | 'USUARIOS'

export type VisibleModule = {
  key: ModuleKey | string
  visible?: boolean
  enabled?: boolean
}

function storageKey(codusr: string, codneg: string | number) {
  return `rbac:visible-modules:${codusr}:${codneg}`
}

function storageKeyAny(codusr: string, codneg?: string | number | null) {
  return storageKey(codusr, codneg ?? 'general')
}

function normalizeModuleKey(value: unknown): string | null {
  if (typeof value !== 'string')
    return null

  const key = value.trim().toUpperCase()
  return key ? key : null
}

function extractModuleKey(item: any): string | null {
  if (!item)
    return null

  if (typeof item === 'string')
    return normalizeModuleKey(item)

  return (
    normalizeModuleKey(item.key)
    ?? normalizeModuleKey(item.module)
    ?? normalizeModuleKey(item.modulo)
    ?? normalizeModuleKey(item.name)
    ?? normalizeModuleKey(item.codigo)
  )
}

function extractModuleList(payload: any): any[] {
  if (Array.isArray(payload))
    return payload

  if (payload && typeof payload === 'object') {
    const candidates = [payload.modules, payload.modulos, payload.data, payload.result]
    for (const c of candidates) {
      if (Array.isArray(c))
        return c
    }
  }

  return []
}

export function getCachedVisibleModuleKeys(codusr: string, codneg?: string | number | null): Set<string> | null {
  const raw = localStorage.getItem(storageKeyAny(codusr, codneg))
  if (!raw)
    return null

  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed))
      return null

    const set = new Set<string>()
    for (const it of parsed) {
      const k = normalizeModuleKey(it)
      if (k)
        set.add(k)
    }
    return set
  }
  catch {
    return null
  }
}

export function setCachedVisibleModuleKeys(codusr: string, codneg: string | number | null | undefined, keys: Set<string>) {
  localStorage.setItem(storageKeyAny(codusr, codneg), JSON.stringify(Array.from(keys)))
}

export async function fetchVisibleModuleKeys(codneg?: string | number | null): Promise<Set<string>> {
  const qs = codneg === null || codneg === undefined
    ? ''
    : `?codneg=${encodeURIComponent(String(codneg))}`

  const payload = await apiFetch<any>(`rbac/visible-modules${qs}`)

  const list = extractModuleList(payload)

  const keys = new Set<string>()
  for (const item of list) {
    const key = extractModuleKey(item)
    if (!key)
      continue

    // Si el endpoint devuelve objetos con visible/enabled, respetarlos.
    if (typeof item === 'object' && item !== null) {
      if (item.visible === false)
        continue
      if (item.enabled === false)
        continue
    }

    keys.add(key)
  }

  return keys
}
