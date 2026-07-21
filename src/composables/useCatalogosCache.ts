/**
 * Cachés de catálogos en memoria (por negocio) para los buscadores.
 *
 * Objetivo: UNA petición por catálogo/negocio en lugar de una por tecla.
 * El filtrado ocurre en memoria (ver `filtrarCatalogo`), sin red.
 *
 * - Estado a nivel de módulo: todos los componentes comparten la misma lista
 *   (no se duplican peticiones entre pantallas).
 * - `asegurar(codneg)` carga la lista solo la primera vez (o si venció el TTL
 *   o cambió el negocio). Deduplica llamadas concurrentes.
 * - `refrescar()` fuerza recarga manual (botón "actualizar lista").
 * - `upsert(item)` / `eliminar(id)` actualizan el caché al instante cuando el
 *   propio usuario crea/edita registros, sin esperar el refresco automático.
 * - Refresco automático por TTL (configurable por catálogo).
 *
 * IMPORTANTE (fuente de verdad): estos cachés son SOLO para la experiencia de
 * búsqueda/autocompletado. El precio/stock definitivos los resuelve el backend
 * contra la BD al facturar (facturas/completa) — eso nunca pasa por aquí.
 */
import { ref, type Ref } from 'vue'
import { apiFetch } from '@/utils/api'
import type { ProductoOpt, ClienteOptFull, ProveedorOpt } from '@/types'

/** minúsculas + sin acentos, para comparar como espera el usuario */
export function normalizarTexto(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

/** Filtra una lista en memoria: q sin acentos, sobre los campos dados. */
export function filtrarCatalogo<T>(items: T[], q: string, campos: (keyof T)[], limite = 20): T[] {
  const nq = normalizarTexto(q).trim()
  if (!nq) return []
  const out: T[] = []
  for (const it of items) {
    for (const campo of campos) {
      if (normalizarTexto(it[campo]).includes(nq)) {
        out.push(it)
        break
      }
    }
    if (out.length >= limite) break
  }
  return out
}

interface CatalogoCache<T> {
  items: Ref<T[]>
  cargando: Ref<boolean>
  asegurar: (codneg: number | null | undefined) => Promise<void>
  refrescar: () => Promise<void>
  upsert: (item: T) => void
  eliminar: (id: unknown) => void
  invalidar: () => void
}

function crearCatalogo<T>(opts: {
  endpoint: (codneg: number) => string
  idDe: (item: T) => unknown
  ttlMs: number
}): CatalogoCache<T> {
  const items = ref<T[]>([]) as Ref<T[]>
  const cargando = ref(false)

  let codnegActual: number | null = null
  let cargadoEn = 0
  let enVuelo: Promise<void> | null = null
  let enVueloCodneg: number | null = null
  let timer: ReturnType<typeof setInterval> | null = null

  async function cargar(codneg: number): Promise<void> {
    cargando.value = true
    try {
      const rows = await apiFetch<T[]>(opts.endpoint(codneg))
      items.value = Array.isArray(rows) ? rows : []
      codnegActual = codneg
      cargadoEn = Date.now()
    } finally {
      cargando.value = false
    }
  }

  function programarRefresco() {
    if (timer) return
    timer = setInterval(() => {
      // Refresco automático silencioso del negocio activo.
      if (codnegActual !== null) void cargar(codnegActual).catch(() => undefined)
    }, opts.ttlMs)
  }

  async function asegurar(codneg: number | null | undefined): Promise<void> {
    const cn = Number(codneg)
    if (!Number.isFinite(cn) || cn <= 0) return

    const vigente = codnegActual === cn && Date.now() - cargadoEn < opts.ttlMs && items.value.length > 0
    if (vigente) return

    // Deduplicar: si ya hay una carga EN CURSO para este negocio, esperarla
    // (se compara contra el codneg en vuelo, no contra el ya cargado).
    if (enVuelo && enVueloCodneg === cn) return enVuelo

    enVueloCodneg = cn
    enVuelo = cargar(cn).finally(() => { enVuelo = null; enVueloCodneg = null })
    programarRefresco()
    return enVuelo
  }

  async function refrescar(): Promise<void> {
    if (codnegActual === null) return
    await cargar(codnegActual)
  }

  function upsert(item: T) {
    const id = opts.idDe(item)
    const idx = items.value.findIndex(x => opts.idDe(x) === id)
    if (idx >= 0) items.value.splice(idx, 1, item)
    else items.value.push(item)
  }

  function eliminar(id: unknown) {
    const idx = items.value.findIndex(x => opts.idDe(x) === id)
    if (idx >= 0) items.value.splice(idx, 1)
  }

  function invalidar() {
    cargadoEn = 0
    // La próxima llamada a asegurar() recarga; si hay negocio activo, recarga ya.
    if (codnegActual !== null) void cargar(codnegActual).catch(() => undefined)
  }

  return { items, cargando, asegurar, refrescar, upsert, eliminar, invalidar }
}

/* ── Instancias compartidas (singleton por catálogo) ── */

// Productos: cambia más seguido (precios, altas) → TTL más corto.
const productosCache = crearCatalogo<ProductoOpt>({
  endpoint: cn => `productos?codneg=${cn}`,
  idDe: p => p.codprd,
  ttlMs: 10 * 60 * 1000,
})

const clientesCache = crearCatalogo<ClienteOptFull>({
  endpoint: cn => `clientes?codneg=${cn}`,
  idDe: c => c.codcli,
  ttlMs: 15 * 60 * 1000,
})

const proveedoresCache = crearCatalogo<ProveedorOpt>({
  endpoint: cn => `proveedores?codneg=${cn}`,
  idDe: p => p.codpro,
  ttlMs: 15 * 60 * 1000,
})

export function useProductosCache() { return productosCache }
export function useClientesCache() { return clientesCache }
export function useProveedoresCache() { return proveedoresCache }
