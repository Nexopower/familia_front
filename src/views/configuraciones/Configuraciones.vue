<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { apiFetch } from '@/utils/api'
import { switchNegocio } from '@/utils/auth'
import { setCachedVisibleModuleKeys } from '@/utils/rbac'
import { useSession } from '@/utils/session'
import type { MiNegocio, AdminNegocio, NegocioTabla, PermisoItem, DuenoNegocio, DuenoCandidate, NegocioMeta } from '@/types'

import ErrorAlert from '@/components/shared/ErrorAlert.vue'
import LoadingSpinner from '@/components/shared/LoadingSpinner.vue'
import BaseModal from '@/components/shared/BaseModal.vue'
import FormField from '@/components/shared/FormField.vue'
import DireccionSearchModal from '@/components/direcciones/DireccionSearchModal.vue'
import DireccionCreateModal from '@/components/direcciones/DireccionCreateModal.vue'

// types moved to src/types

const router = useRouter()
const { user } = useSession()

const codnegActivo = computed(() => {
  const value = Number(user.value?.codneg)
  return Number.isFinite(value) && value > 0 ? value : null
})
const isAdmin = computed(() => Boolean(user.value?.isAdmin || user.value?.codusr === 'admin'))

const pageLoading = ref(false)
const negociosLoading = ref(false)
const permisosLoading = ref(false)
const syncLoading = ref(false)
const switching = ref<number | null>(null)
const savingRow = ref<number | 'new' | null>(null)

const error = ref<string | null>(null)
const success = ref<string | null>(null)

const misNegocios = ref<MiNegocio[]>([])
const adminNegocios = ref<AdminNegocio[]>([])
const permisos = ref<PermisoItem[]>([])
const duenosByNegocio = ref<Record<number, DuenoNegocio[]>>({})

const filtroNegocios = ref('')
const filtroEstado = ref<'todos' | 'A' | 'I'>('todos')
const permisosSearch = ref('')
const ownerManagerCodneg = ref<number | null>(null)
const ownerLoading = ref(false)
const ownerSearchLoading = ref(false)
const ownerSearch = ref('')
const ownerCandidates = ref<DuenoCandidate[]>([])
const ownerPrincipalForNew = ref(false)
const assigningOwner = ref<string | null>(null)
const showCreateModal = ref(false)
const negocioMeta = ref<NegocioMeta>({
  fields: {
    nombre: true,
    estado: true,
    direccion: true,
    telefono: false,
    stock_min_default: true,
  },
})

const creating = ref({
  nombre: '',
  direccion: '',
  coddir: null as number | null,
  telefono: '',
  stock_min_default: 0,
  estado: 'A' as 'A' | 'I',
})

// null = modal en modo CREAR; con valor = editando ese negocio.
const modalEditCodneg = ref<number | null>(null)

/* ── Selector de dirección (buscar existente / crear nueva) ── */
const showDirSearch = ref(false)
const showDirCreate = ref(false)

function onDireccionSelected(dir: { coddir: number; direccion: string; sector?: string | null; ciudad?: string | null }) {
  creating.value.coddir = dir.coddir
  creating.value.direccion = [dir.direccion, dir.sector, dir.ciudad].filter(Boolean).join(', ')
  showDirSearch.value = false
  showDirCreate.value = false
}

function quitarDireccion() {
  creating.value.coddir = null
  creating.value.direccion = ''
}

const negociosTabla = computed<NegocioTabla[]>(() => {
  const accessMap = new Map<number, MiNegocio>()
  for (const item of misNegocios.value)
    accessMap.set(Number(item.codneg), item)

  const rows = isAdmin.value
    ? adminNegocios.value.map((row) => {
        const access = accessMap.get(Number(row.codneg))
        return {
          codneg: Number(row.codneg),
          nombre: row.nombre,
          estado: (row.estado === 'I' ? 'I' : 'A') as 'A' | 'I',
          direccion: row.direccion ?? null,
          coddir: row.coddir ?? null,
          telefono: row.telefono ?? null,
          stock_min_default: row.stock_min_default ?? null,
          accesoUsuario: Boolean(access),
          esdueno: Boolean(access?.esdueno),
          esprincipal: Boolean(access?.esprincipal),
          codrol: access?.codrol ?? null,
          nombre_rol: access?.nombre_rol ?? null,
        }
      })
    : misNegocios.value.map(row => ({
        codneg: Number(row.codneg),
        nombre: row.nombre,
        estado: 'A' as const,
        direccion: null,
        stock_min_default: null,
        accesoUsuario: true,
        esdueno: Boolean(row.esdueno),
        esprincipal: Boolean(row.esprincipal),
        codrol: row.codrol ?? null,
        nombre_rol: row.nombre_rol ?? null,
      }))

  const search = filtroNegocios.value.trim().toLowerCase()
  return rows.filter((row) => {
    const matchesState = filtroEstado.value === 'todos' || row.estado === filtroEstado.value
    if (!matchesState)
      return false

    if (!search)
      return true

    return [
      String(row.codneg),
      row.nombre,
      row.direccion ?? '',
      row.nombre_rol ?? '',
      row.esdueno ? 'dueno' : '',
      row.esprincipal ? 'principal' : '',
    ].some(value => value.toLowerCase().includes(search))
  })
})

const permisosFiltrados = computed(() => {
  const search = permisosSearch.value.trim().toLowerCase()
  if (!search)
    return permisos.value

  return permisos.value.filter(item =>
    item.clave.toLowerCase().includes(search)
    || item.nombre.toLowerCase().includes(search)
    || (item.modulo ?? '').toLowerCase().includes(search),
  )
})

/* ── Catálogo de permisos agrupado por módulo ── */
const modulosColapsados = ref<Set<string>>(new Set())

// Etiqueta legible de la acción a partir de la clave (sin el prefijo del módulo).
const VERBOS: Record<string, string> = {
  VER: 'Ver', CREAR: 'Crear', EDITAR: 'Editar', ELIMINAR: 'Eliminar',
  GESTIONAR: 'Gestionar', CERRAR: 'Cerrar', CAMBIAR: 'Cambiar',
  CONFIGURAR: 'Configurar', REPROGRAMAR: 'Reprogramar', INGRESO: 'Ingreso',
  EGRESO: 'Egreso', MOVIMIENTO: 'Movimiento', UNIDADES: 'Unidades',
  CONVERSIONES: 'Conversiones', TRANSFORMACIONES: 'Transformaciones',
  CATEGORIAS: 'Categorías', MARCAS: 'Marcas', RECETAS: 'Recetas', ROL: 'Rol',
  ESTADO: 'Estado', ROLES_CREABLES: 'Roles creables', MODIFICAR_PRECIO: 'Modificar precio',
}
function accionLabel(clave: string, modulo?: string | null): string {
  const prefijo = (modulo ?? '').toUpperCase() + '.'
  let resto = clave.toUpperCase().startsWith(prefijo) ? clave.slice(prefijo.length) : clave
  return resto.split('.').map(p => VERBOS[p] ?? (p.charAt(0) + p.slice(1).toLowerCase())).join(' · ')
}

const ICONOS_MODULO: Record<string, string> = {
  DASHBOARD: '📊', PRODUCTOS: '🏷️', INVENTARIO: '📦', FACTURAS: '🧾',
  RESERVAS: '📅', CONTABILIDAD: '💰', USUARIOS: '👥', CONFIGURACIONES: '⚙️',
}

const permisosPorModulo = computed(() => {
  const grupos = new Map<string, PermisoItem[]>()
  for (const p of permisosFiltrados.value) {
    const mod = p.modulo || 'OTROS'
    if (!grupos.has(mod)) grupos.set(mod, [])
    grupos.get(mod)!.push(p)
  }
  return Array.from(grupos.entries())
    .map(([modulo, items]) => ({ modulo, items, icono: ICONOS_MODULO[modulo] ?? '🔑' }))
    .sort((a, b) => a.modulo.localeCompare(b.modulo))
})

const buscandoPermiso = computed(() => permisosSearch.value.trim().length > 0)
function moduloAbierto(mod: string) { return buscandoPermiso.value || !modulosColapsados.value.has(mod) }
function toggleModulo(mod: string) {
  const s = new Set(modulosColapsados.value)
  s.has(mod) ? s.delete(mod) : s.add(mod)
  modulosColapsados.value = s
}
function expandirTodos() { modulosColapsados.value = new Set() }
function colapsarTodos() { modulosColapsados.value = new Set(permisosPorModulo.value.map(g => g.modulo)) }

function resetMessages() {
  error.value = null
  success.value = null
}

function resetCreateRow() {
  creating.value = {
    nombre: '',
    direccion: '',
    coddir: null,
    telefono: '',
    stock_min_default: 0,
    estado: 'A',
  }
}

function openCreateModal() {
  resetCreateRow()
  modalEditCodneg.value = null
  showCreateModal.value = true
}

/** Editar abre el MISMO modal de crear, precargado con los datos de la fila. */
function startEdit(row: NegocioTabla) {
  modalEditCodneg.value = row.codneg
  creating.value = {
    nombre: row.nombre,
    direccion: row.direccion ?? '',
    coddir: (row as any).coddir ?? null,
    telefono: (row as any).telefono ?? '',
    stock_min_default: row.stock_min_default ?? 0,
    estado: row.estado === 'I' ? 'I' : 'A',
  }
  showCreateModal.value = true
}

function ownerDisplayName(owner: DuenoNegocio | DuenoCandidate) {
  const fullName = [owner.nombre_per, owner.apellido_per].filter(Boolean).join(' ').trim()
  return fullName || owner.nombre_usr || owner.codusr
}

function ownerSummary(codneg: number) {
  const rows = duenosByNegocio.value[codneg] ?? []
  if (!rows.length)
    return 'Sin dueños'

  return rows
    .map(row => `${ownerDisplayName(row)}${row.esprincipal ? ' (principal)' : ''}`)
    .join(', ')
}

async function loadMisNegocios() {
  try {
    const rows = await apiFetch<MiNegocio[]>('auth/mis-negocios')
    misNegocios.value = Array.isArray(rows) ? rows : []
  } catch {
    misNegocios.value = []
  }
}

async function loadAdminNegocios() {
  if (!isAdmin.value) {
    adminNegocios.value = []
    return
  }

  const rows = await apiFetch<AdminNegocio[]>('configuraciones/negocios')
  adminNegocios.value = Array.isArray(rows) ? rows : []
}

async function loadPermisos() {
  permisosLoading.value = true
  try {
    const rows = await apiFetch<PermisoItem[]>('rbac/permisos')
    permisos.value = Array.isArray(rows) ? rows : []
  } catch {
    permisos.value = []
  } finally {
    permisosLoading.value = false
  }
}

async function loadNegocioMeta() {
  if (!isAdmin.value)
    return
  try {
    const meta = await apiFetch<NegocioMeta>('configuraciones/negocios/meta')
    if (meta?.fields)
      negocioMeta.value = meta
  } catch {
    // fallback al esquema por defecto definido arriba
  }
}

async function loadOwners(codneg: number) {
  ownerLoading.value = true
  try {
    const rows = await apiFetch<DuenoNegocio[]>(`configuraciones/negocios/${codneg}/duenos`)
    duenosByNegocio.value = {
      ...duenosByNegocio.value,
      [codneg]: Array.isArray(rows) ? rows : [],
    }
  } finally {
    ownerLoading.value = false
  }
}

async function toggleOwnerManager(codneg: number) {
  if (ownerManagerCodneg.value === codneg) {
    ownerManagerCodneg.value = null
    ownerSearch.value = ''
    ownerCandidates.value = []
    ownerPrincipalForNew.value = false
    return
  }

  ownerManagerCodneg.value = codneg
  ownerSearch.value = ''
  ownerCandidates.value = []
  ownerPrincipalForNew.value = false
  await loadOwners(codneg)
}

async function searchOwnerCandidates() {
  const q = ownerSearch.value.trim()
  if (q.length < 2) {
    ownerCandidates.value = []
    return
  }

  ownerSearchLoading.value = true
  try {
    const rows = await apiFetch<DuenoCandidate[]>(`configuraciones/usuarios-duenos?q=${encodeURIComponent(q)}`)
    ownerCandidates.value = Array.isArray(rows) ? rows : []
  } catch (e: any) {
    error.value = e?.message ?? 'Error buscando dueños'
    ownerCandidates.value = []
  } finally {
    ownerSearchLoading.value = false
  }
}

async function assignOwner(codneg: number, codusr: string, esprincipal = false) {
  assigningOwner.value = codusr
  resetMessages()
  try {
    const rows = await apiFetch<DuenoNegocio[]>(`configuraciones/negocios/${codneg}/duenos`, {
      method: 'POST',
      body: JSON.stringify({ codusr, esprincipal }),
    })
    duenosByNegocio.value = {
      ...duenosByNegocio.value,
      [codneg]: Array.isArray(rows) ? rows : [],
    }
    success.value = esprincipal ? 'Dueño principal actualizado.' : 'Dueño asignado correctamente.'
  } catch (e: any) {
    error.value = e?.message ?? 'Error asignando dueño'
  } finally {
    assigningOwner.value = null
  }
}

async function removeOwner(codneg: number, codusr: string) {
  if (!window.confirm(`¿Quitar el dueño ${codusr} de este negocio?`))
    return

  assigningOwner.value = codusr
  resetMessages()
  try {
    const rows = await apiFetch<DuenoNegocio[]>(`configuraciones/negocios/${codneg}/duenos/${encodeURIComponent(codusr)}`, {
      method: 'DELETE',
    })
    duenosByNegocio.value = {
      ...duenosByNegocio.value,
      [codneg]: Array.isArray(rows) ? rows : [],
    }
    success.value = 'Dueño removido correctamente.'
  } catch (e: any) {
    error.value = e?.message ?? 'Error quitando dueño'
  } finally {
    assigningOwner.value = null
  }
}

async function loadAll() {
  pageLoading.value = true
  negociosLoading.value = true
  resetMessages()
  try {
    await Promise.all([loadMisNegocios(), loadAdminNegocios(), loadPermisos(), loadNegocioMeta()])
  } catch (e: any) {
    error.value = e?.message ?? 'Error cargando configuraciones'
  } finally {
    negociosLoading.value = false
    pageLoading.value = false
  }
}

/** Crea o actualiza según el modo del modal (modalEditCodneg). */
async function createNegocio() {
  const nombre = creating.value.nombre.trim()
  if (!nombre) {
    error.value = 'El nombre del negocio es obligatorio.'
    return
  }

  const esEdicion = modalEditCodneg.value !== null
  savingRow.value = esEdicion ? modalEditCodneg.value : 'new'
  resetMessages()
  try {
    const payload: Record<string, any> = {
      nombre,
      estado: creating.value.estado,
      coddir: creating.value.coddir,
    }
    if (negocioMeta.value.fields.direccion)
      payload.direccion = creating.value.direccion.trim() || null
    if (negocioMeta.value.fields.telefono)
      payload.telefono = creating.value.telefono.trim() || null
    if (negocioMeta.value.fields.stock_min_default)
      payload.stock_min_default = creating.value.stock_min_default

    if (esEdicion) {
      await apiFetch(`configuraciones/negocios/${modalEditCodneg.value}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      })
      success.value = 'Negocio actualizado correctamente.'
    } else {
      await apiFetch('configuraciones/negocios', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      success.value = 'Negocio creado correctamente.'
    }
    resetCreateRow()
    modalEditCodneg.value = null
    showCreateModal.value = false
    await Promise.all([loadAdminNegocios(), loadMisNegocios()])
  } catch (e: any) {
    error.value = e?.message ?? (esEdicion ? 'Error actualizando negocio' : 'Error creando negocio')
  } finally {
    savingRow.value = null
  }
}

async function inactivarNegocio(row: NegocioTabla) {
  if (!window.confirm(`¿Inactivar el negocio "${row.nombre}"?`))
    return

  savingRow.value = row.codneg
  resetMessages()
  try {
    await apiFetch(`configuraciones/negocios/${row.codneg}`, { method: 'DELETE' })
    success.value = `Negocio "${row.nombre}" inactivado.`
    await loadAdminNegocios()
  } catch (e: any) {
    error.value = e?.message ?? 'Error inactivando negocio'
  } finally {
    savingRow.value = null
  }
}

async function reactivarNegocio(row: NegocioTabla) {
  savingRow.value = row.codneg
  resetMessages()
  try {
    await apiFetch(`configuraciones/negocios/${row.codneg}/reactivar`, { method: 'PATCH' })
    success.value = `Negocio "${row.nombre}" reactivado.`
    await loadAdminNegocios()
  } catch (e: any) {
    error.value = e?.message ?? 'Error reactivando negocio'
  } finally {
    savingRow.value = null
  }
}

async function doSwitchNegocio(targetCodneg: number) {
  if (switching.value)
    return

  switching.value = targetCodneg
  resetMessages()
  try {
    await switchNegocio(targetCodneg)
    const codusr = user.value?.codusr
    if (codusr) {
      const previousCodneg = codnegActivo.value
      if (previousCodneg)
        setCachedVisibleModuleKeys(codusr, previousCodneg, new Set())
      setCachedVisibleModuleKeys(codusr, null, new Set())
    }
    success.value = 'Negocio cambiado. Redirigiendo…'
    setTimeout(() => router.push('/'), 500)
  } catch (e: any) {
    error.value = e?.message ?? 'Error al cambiar de negocio'
  } finally {
    switching.value = null
  }
}

async function syncRbac() {
  syncLoading.value = true
  resetMessages()
  try {
    await apiFetch('rbac/sync-manifest', { method: 'POST' })
    success.value = 'Manifiesto RBAC sincronizado.'
    await loadPermisos()
  } catch (e: any) {
    error.value = e?.message ?? 'Error al sincronizar el manifiesto'
  } finally {
    syncLoading.value = false
  }
}

onMounted(async () => {
  await loadAll()
})

watch(codnegActivo, async () => {
  await Promise.all([loadMisNegocios(), loadAdminNegocios()])
})
</script>

<template>
  <div class="space-y-6">
    <div class="card p-5">
      <div class="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 class="text-lg font-semibold text-main">Configuraciones</h2>
          <p class="text-sm text-muted">
            Gestión de negocios y consulta del catálogo RBAC desde una sola pantalla.
          </p>
        </div>
        <div class="text-sm rounded-lg px-3 py-2" style="background: var(--color-bg-subtle, #f3f4f6)">
          <span class="text-muted">Negocio activo:</span>
          <span class="font-semibold text-main ml-1">
            {{ codnegActivo ? `#${codnegActivo}` : 'Sin seleccionar' }}
          </span>
        </div>
      </div>
    </div>

    <ErrorAlert v-if="error" :message="error" @dismiss="error = null" />
    <div
      v-if="success"
      class="flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium"
      style="background: var(--color-success, #22c55e); color: white"
    >
      <span>{{ success }}</span>
      <button type="button" class="ml-auto hover:opacity-75 leading-none" @click="success = null">&times;</button>
    </div>

    <section class="space-y-3">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 class="text-base font-semibold text-main">Negocios</h3>
          <p class="text-sm text-muted">
            {{ isAdmin ? 'Administra y consulta todos los negocios desde la tabla.' : 'Consulta los negocios a los que tienes acceso y cambia el negocio activo.' }}
          </p>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <button v-if="isAdmin" type="button" class="btn btn-primary px-3 py-2 text-sm" @click="openCreateModal">
            + Crear negocio
          </button>
          <input
            v-model="filtroNegocios"
            type="search"
            placeholder="Buscar negocio..."
            class="input px-3 py-2 text-sm w-56"
          />
          <select v-model="filtroEstado" class="input px-3 py-2 text-sm">
            <option value="todos">Todos</option>
            <option value="A">Activos</option>
            <option value="I">Inactivos</option>
          </select>
          <button type="button" class="btn btn-secondary px-3 py-2 text-sm" :disabled="pageLoading" @click="loadAll">
            Recargar
          </button>
        </div>
      </div>

      <div class="card p-0 overflow-hidden">
        <LoadingSpinner v-if="pageLoading || negociosLoading" />

        <div v-else-if="negociosTabla.length === 0 && !isAdmin" class="px-4 py-10 text-center text-sm text-muted">
          No hay negocios para mostrar.
        </div>

        <div v-else class="overflow-x-auto">
          <table class="w-full min-w-[1080px] text-sm">
            <thead>
              <tr class="border-b text-left" style="border-color: var(--color-border); background: var(--card-bg-2)">
                <th class="px-3 py-3 text-muted font-medium text-xs uppercase tracking-wider w-16">Código</th>
                <th class="px-3 py-3 text-muted font-medium text-xs uppercase tracking-wider min-w-[180px]">Nombre</th>
                <th class="px-3 py-3 text-muted font-medium text-xs uppercase tracking-wider min-w-[160px]">Dirección</th>
                <th class="px-3 py-3 text-muted font-medium text-xs uppercase tracking-wider w-24">Stock mín.</th>
                <th class="px-3 py-3 text-muted font-medium text-xs uppercase tracking-wider w-24">Estado</th>
                <th class="px-3 py-3 text-muted font-medium text-xs uppercase tracking-wider min-w-[170px]">Dueños</th>
                <th class="px-3 py-3 text-muted font-medium text-xs uppercase tracking-wider w-32">Acceso</th>
                <th class="px-3 py-3 text-muted font-medium text-xs uppercase tracking-wider w-28">Rol</th>
                <th class="px-3 py-3 text-muted font-medium text-xs uppercase tracking-wider w-20">Sesión</th>
                <th class="px-3 py-3 text-muted font-medium text-xs uppercase tracking-wider min-w-[240px]">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="row in negociosTabla" :key="row.codneg">
              <tr
                class="border-b align-top"
                style="border-color: var(--color-border)"
              >
                <td class="px-4 py-3 text-muted">{{ row.codneg }}</td>

                <td class="px-4 py-3 font-medium text-main">{{ row.nombre }}</td>
                <td class="px-4 py-3 text-muted">{{ row.direccion || '—' }}</td>
                <td class="px-4 py-3 text-muted">{{ row.stock_min_default ?? '—' }}</td>
                <td class="px-4 py-3">
                  <span
                    class="text-xs px-2 py-0.5 rounded-full font-medium"
                    :class="row.estado === 'A' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'"
                  >
                    {{ row.estado === 'A' ? 'Activo' : 'Inactivo' }}
                  </span>
                </td>

                <td class="px-4 py-3 text-muted">
                  <div v-if="isAdmin" class="space-y-2">
                    <p class="text-xs leading-5">{{ ownerSummary(row.codneg) }}</p>
                    <button type="button" class="btn btn-secondary px-3 py-1.5 text-xs" @click="toggleOwnerManager(row.codneg)">
                      {{ ownerManagerCodneg === row.codneg ? 'Cerrar dueños' : 'Gestionar dueños' }}
                    </button>
                  </div>
                  <span v-else>{{ row.esdueno ? 'Sí' : '—' }}</span>
                </td>

                <td class="px-4 py-3">
                  <div class="flex flex-wrap gap-1.5">
                    <span
                      v-if="row.accesoUsuario"
                      class="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700"
                    >
                      Con acceso
                    </span>
                    <span
                      v-else
                      class="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500"
                    >
                      Sin acceso
                    </span>
                    <span
                      v-if="row.esdueno"
                      class="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700"
                    >
                      Dueño
                    </span>
                    <span
                      v-if="row.esprincipal"
                      class="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700"
                    >
                      Principal
                    </span>
                  </div>
                </td>

                <td class="px-4 py-3 text-muted">{{ row.nombre_rol || '—' }}</td>

                <td class="px-4 py-3">
                  <span
                    v-if="codnegActivo === row.codneg"
                    class="text-xs px-2 py-0.5 rounded-full"
                    style="background: var(--color-accent); color: white"
                  >
                    Activo
                  </span>
                  <span v-else class="text-muted">—</span>
                </td>

                <td class="px-4 py-3">
                  <div class="flex flex-wrap gap-2">
                    <button
                      v-if="codnegActivo !== row.codneg && row.estado === 'A'"
                      type="button"
                      class="btn btn-primary px-3 py-2 text-xs disabled:opacity-60"
                      :disabled="switching === row.codneg"
                      @click="doSwitchNegocio(row.codneg)"
                    >
                      {{ switching === row.codneg ? 'Cambiando…' : 'Cambiar' }}
                    </button>

                    <template v-if="isAdmin">
                      <button
                        type="button"
                        class="btn btn-secondary px-3 py-2 text-xs"
                        @click="startEdit(row)"
                      >
                        Editar
                      </button>

                      <button
                        v-if="row.estado === 'A'"
                        type="button"
                        class="px-3 py-2 text-xs rounded border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
                        :disabled="savingRow === row.codneg"
                        @click="inactivarNegocio(row)"
                      >
                        Inactivar
                      </button>
                      <button
                        v-else
                        type="button"
                        class="px-3 py-2 text-xs rounded border border-green-200 text-green-700 hover:bg-green-50 disabled:opacity-50"
                        :disabled="savingRow === row.codneg"
                        @click="reactivarNegocio(row)"
                      >
                        Reactivar
                      </button>
                    </template>
                  </div>
                </td>
              </tr>

              <tr v-if="isAdmin && ownerManagerCodneg === row.codneg" class="border-b" style="border-color: var(--color-border); background: rgba(59, 130, 246, 0.04)">
                <td colspan="10" class="px-4 py-4">
                  <div class="space-y-4">
                    <div class="flex items-center gap-3 flex-wrap">
                      <div>
                        <h4 class="text-sm font-semibold text-main">Dueños del negocio {{ row.nombre }}</h4>
                        <p class="text-xs text-muted">Solo usuarios marcados como dueños pueden asignarse aquí.</p>
                      </div>
                      <button type="button" class="btn btn-secondary px-3 py-1.5 text-xs ml-auto" :disabled="ownerLoading" @click="loadOwners(row.codneg)">
                        {{ ownerLoading ? 'Cargando…' : 'Recargar dueños' }}
                      </button>
                    </div>

                    <div class="flex gap-2 flex-wrap items-center">
                      <input v-model="ownerSearch" type="search" class="input px-3 py-2 text-sm w-72" placeholder="Buscar dueño por usuario, nombre o email" @keydown.enter.prevent="searchOwnerCandidates" />
                      <label class="flex items-center gap-2 text-xs text-muted">
                        <input v-model="ownerPrincipalForNew" type="checkbox" />
                        Asignar como principal
                      </label>
                      <button type="button" class="btn btn-primary px-3 py-2 text-xs" :disabled="ownerSearchLoading" @click="searchOwnerCandidates">
                        {{ ownerSearchLoading ? 'Buscando…' : 'Buscar dueño' }}
                      </button>
                    </div>

                    <div v-if="ownerLoading" class="py-2">
                      <LoadingSpinner size="sm" />
                    </div>

                    <div v-else class="flex flex-wrap gap-2">
                      <div v-for="owner in (duenosByNegocio[row.codneg] ?? [])" :key="owner.codusr" class="rounded-lg border px-3 py-2 text-sm" style="border-color: var(--color-border)">
                        <div class="font-medium text-main">{{ ownerDisplayName(owner) }}</div>
                        <div class="text-xs text-muted">{{ owner.codusr }}<span v-if="owner.email_per"> · {{ owner.email_per }}</span></div>
                        <div class="flex gap-2 pt-2">
                          <button v-if="!owner.esprincipal" type="button" class="btn btn-secondary px-2 py-1 text-xs" :disabled="assigningOwner === owner.codusr" @click="assignOwner(row.codneg, owner.codusr, true)">
                            Principal
                          </button>
                          <span v-else class="text-xs px-2 py-1 rounded bg-amber-100 text-amber-700">Principal</span>
                          <button type="button" class="px-2 py-1 text-xs rounded border border-red-200 text-red-600 hover:bg-red-50" :disabled="assigningOwner === owner.codusr" @click="removeOwner(row.codneg, owner.codusr)">
                            Quitar
                          </button>
                        </div>
                      </div>
                      <div v-if="(duenosByNegocio[row.codneg] ?? []).length === 0" class="text-sm text-muted py-2">
                        Este negocio no tiene dueños asignados.
                      </div>
                    </div>

                    <div v-if="ownerCandidates.length > 0" class="space-y-2">
                      <p class="text-xs font-medium text-muted uppercase tracking-wide">Resultados</p>
                      <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <div v-for="candidate in ownerCandidates" :key="candidate.codusr" class="rounded-lg border px-3 py-2" style="border-color: var(--color-border)">
                          <div class="font-medium text-main">{{ ownerDisplayName(candidate) }}</div>
                          <div class="text-xs text-muted">{{ candidate.codusr }}<span v-if="candidate.email_per"> · {{ candidate.email_per }}</span></div>
                          <div class="pt-2">
                            <button type="button" class="btn btn-primary px-3 py-1.5 text-xs" :disabled="assigningOwner === candidate.codusr" @click="assignOwner(row.codneg, candidate.codusr, ownerPrincipalForNew)">
                              {{ assigningOwner === candidate.codusr ? 'Asignando…' : 'Asignar dueño' }}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
              </template>
            </tbody>
          </table>

          <div v-if="negociosTabla.length === 0 && isAdmin" class="px-4 py-6 text-sm text-muted border-t" style="border-color: var(--color-border)">
            Aún no hay negocios registrados. Usa el botón "Crear negocio" para registrar el primero.
          </div>
        </div>
      </div>
    </section>

    <BaseModal :open="showCreateModal" :title="modalEditCodneg ? `Editar negocio #${modalEditCodneg}` : 'Crear negocio'" size="md" @close="showCreateModal = false">
      <div class="space-y-4">
        <p class="text-sm text-muted">
          {{ modalEditCodneg ? 'Modifica los datos del negocio.' : 'Completa los campos para crear el negocio.' }}
        </p>

        <FormField label="Nombre" required>
          <input
            v-model="creating.nombre"
            type="text"
            class="input w-full px-3 py-2"
            placeholder="Nombre del negocio"
          />
        </FormField>

        <!-- Dirección: seleccionar del catálogo o crear una nueva -->
        <div class="p-3 rounded-md border border-base space-y-2">
          <h4 class="text-sm font-semibold text-main">Dirección</h4>
          <div v-if="creating.coddir || creating.direccion" class="flex items-center gap-3 p-2 rounded bg-[var(--card-bg-2)]">
            <span class="flex-1 text-sm text-main">{{ creating.direccion || `Dirección #${creating.coddir}` }}</span>
            <button type="button" class="text-xs text-red-600 hover:underline" @click="quitarDireccion">Quitar</button>
          </div>
          <div class="flex gap-2">
            <button type="button" class="px-3 py-1.5 btn btn-secondary text-xs" @click="showDirSearch = true">Buscar existente</button>
            <button type="button" class="px-3 py-1.5 btn btn-primary text-xs" @click="showDirCreate = true">Crear nueva</button>
          </div>
        </div>

        <FormField v-if="negocioMeta.fields.telefono" label="Teléfono" hint="Opcional">
          <input
            v-model="creating.telefono"
            type="text"
            class="input w-full px-3 py-2"
            placeholder="Teléfono"
          />
        </FormField>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FormField v-if="negocioMeta.fields.stock_min_default" label="Stock mínimo por defecto">
            <input
              v-model.number="creating.stock_min_default"
              type="number"
              min="0"
              class="input w-full px-3 py-2"
            />
          </FormField>

          <FormField label="Estado inicial">
            <select v-model="creating.estado" class="input w-full px-3 py-2">
              <option value="A">Activo</option>
              <option value="I">Inactivo</option>
            </select>
          </FormField>
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="btn btn-secondary px-4 py-2 text-sm" @click="showCreateModal = false">
            Cancelar
          </button>
          <button
            type="button"
            class="btn btn-primary px-4 py-2 text-sm disabled:opacity-60"
            :disabled="savingRow !== null"
            @click="createNegocio"
          >
            {{ savingRow !== null ? 'Guardando…' : (modalEditCodneg ? 'Guardar cambios' : 'Crear negocio') }}
          </button>
        </div>
      </div>
    </BaseModal>

    <!-- Modales de dirección (buscar / crear) -->
    <DireccionSearchModal :open="showDirSearch" @select="onDireccionSelected" @close="showDirSearch = false" />
    <DireccionCreateModal :open="showDirCreate" @created="onDireccionSelected" @close="showDirCreate = false" />

    <section class="space-y-3">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 class="text-base font-semibold text-main">Permisos RBAC</h3>
          <p class="text-sm text-muted">
            Catálogo actual de permisos y sincronización del manifiesto.
          </p>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <input
            v-model="permisosSearch"
            type="search"
            placeholder="Buscar permiso..."
            class="input px-3 py-2 text-sm w-56"
          />
          <button type="button" class="btn btn-secondary px-3 py-2 text-xs" @click="expandirTodos">Expandir</button>
          <button type="button" class="btn btn-secondary px-3 py-2 text-xs" @click="colapsarTodos">Colapsar</button>
          <button
            type="button"
            class="btn btn-secondary px-4 py-2 text-sm disabled:opacity-60"
            :disabled="syncLoading"
            @click="syncRbac"
          >
            {{ syncLoading ? 'Sincronizando…' : 'Sincronizar manifest' }}
          </button>
        </div>
      </div>

      <LoadingSpinner v-if="permisosLoading" />

      <div v-else-if="permisosPorModulo.length === 0" class="card px-4 py-10 text-center text-sm text-muted">
        No hay permisos RBAC para mostrar.
      </div>

      <!-- Acordeón por módulo -->
      <div v-else class="space-y-2">
        <div v-for="grupo in permisosPorModulo" :key="grupo.modulo" class="card p-0 overflow-hidden">
          <button
            type="button"
            class="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-[var(--menu-hover)] transition-colors"
            @click="toggleModulo(grupo.modulo)"
          >
            <span class="flex items-center gap-2 font-semibold text-main">
              <span class="text-lg">{{ grupo.icono }}</span>
              {{ grupo.modulo }}
              <span class="text-xs font-normal text-muted">({{ grupo.items.length }})</span>
            </span>
            <span class="text-muted text-xs">{{ moduloAbierto(grupo.modulo) ? '▲' : '▼' }}</span>
          </button>

          <div v-if="moduloAbierto(grupo.modulo)" class="border-t" style="border-color: var(--color-border)">
            <div
              v-for="permiso in grupo.items"
              :key="permiso.codprm"
              class="flex items-center justify-between gap-3 px-4 py-2.5 border-b last:border-b-0"
              style="border-color: var(--color-border)"
            >
              <div class="min-w-0">
                <p class="text-sm text-main font-medium truncate">{{ accionLabel(permiso.clave, permiso.modulo) }}</p>
                <p class="text-[11px] text-muted font-mono truncate">{{ permiso.clave }}</p>
              </div>
              <span class="shrink-0 inline-flex px-2 py-0.5 rounded text-[10px] font-medium bg-[var(--app-bg-2)] text-muted border border-base">
                {{ grupo.modulo }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
