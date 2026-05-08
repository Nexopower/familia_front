<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { apiFetch } from '@/utils/api'
import { switchNegocio } from '@/utils/auth'
import { setCachedVisibleModuleKeys } from '@/utils/rbac'
import { useSession } from '@/utils/session'

import ErrorAlert from '@/components/shared/ErrorAlert.vue'
import LoadingSpinner from '@/components/shared/LoadingSpinner.vue'
import BaseModal from '@/components/shared/BaseModal.vue'
import FormField from '@/components/shared/FormField.vue'

type MiNegocio = {
  codneg: number
  nombre: string
  esdueno?: boolean
  esprincipal?: boolean
  codrol?: number | null
  nombre_rol?: string | null
}

type AdminNegocio = {
  codneg: number
  nombre: string
  telefono?: string | null
  estado: 'A' | 'I'
  direccion?: string | null
  stock_min_default?: number | null
}

type NegocioTabla = {
  codneg: number
  nombre: string
  estado: 'A' | 'I'
  direccion?: string | null
  stock_min_default?: number | null
  accesoUsuario: boolean
  esdueno?: boolean
  esprincipal?: boolean
  codrol?: number | null
  nombre_rol?: string | null
}

type PermisoItem = {
  codprm: number
  clave: string
  nombre: string
  modulo?: string | null
}

type DuenoNegocio = {
  codneg: number
  codusr: string
  esprincipal?: boolean
  nombre_usr?: string | null
  nombre_per?: string | null
  apellido_per?: string | null
  email_per?: string | null
}

type DuenoCandidate = {
  codusr: string
  nombre_usr?: string | null
  nombre_per?: string | null
  apellido_per?: string | null
  email_per?: string | null
}

type NegocioMeta = {
  fields: {
    nombre: boolean
    estado: boolean
    direccion: boolean
    telefono: boolean
    stock_min_default: boolean
  }
}

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
  telefono: '',
  stock_min_default: 0,
  estado: 'A' as 'A' | 'I',
})

const editingCodneg = ref<number | null>(null)
const editing = ref({
  nombre: '',
  direccion: '',
  stock_min_default: 0,
  estado: 'A' as 'A' | 'I',
})

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

function resetMessages() {
  error.value = null
  success.value = null
}

function resetCreateRow() {
  creating.value = {
    nombre: '',
    direccion: '',
    telefono: '',
    stock_min_default: 0,
    estado: 'A',
  }
}

function openCreateModal() {
  resetCreateRow()
  showCreateModal.value = true
}

function startEdit(row: NegocioTabla) {
  editingCodneg.value = row.codneg
  editing.value = {
    nombre: row.nombre,
    direccion: row.direccion ?? '',
    stock_min_default: row.stock_min_default ?? 0,
    estado: row.estado === 'I' ? 'I' : 'A',
  }
}

function cancelEdit() {
  editingCodneg.value = null
  editing.value = {
    nombre: '',
    direccion: '',
    stock_min_default: 0,
    estado: 'A',
  }
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

async function createNegocio() {
  const nombre = creating.value.nombre.trim()
  if (!nombre) {
    error.value = 'El nombre del negocio es obligatorio.'
    return
  }

  savingRow.value = 'new'
  resetMessages()
  try {
    const payload: Record<string, any> = {
      nombre,
      estado: creating.value.estado,
    }
    if (negocioMeta.value.fields.direccion)
      payload.direccion = creating.value.direccion.trim() || undefined
    if (negocioMeta.value.fields.telefono)
      payload.telefono = creating.value.telefono.trim() || undefined
    if (negocioMeta.value.fields.stock_min_default)
      payload.stock_min_default = creating.value.stock_min_default

    await apiFetch('configuraciones/negocios', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    success.value = 'Negocio creado correctamente.'
    resetCreateRow()
    showCreateModal.value = false
    await Promise.all([loadAdminNegocios(), loadMisNegocios()])
  } catch (e: any) {
    error.value = e?.message ?? 'Error creando negocio'
  } finally {
    savingRow.value = null
  }
}

async function saveEdit() {
  if (!editingCodneg.value)
    return

  const nombre = editing.value.nombre.trim()
  if (!nombre) {
    error.value = 'El nombre del negocio es obligatorio.'
    return
  }

  savingRow.value = editingCodneg.value
  resetMessages()
  try {
    await apiFetch(`configuraciones/negocios/${editingCodneg.value}`, {
      method: 'PATCH',
      body: JSON.stringify({
        nombre,
        direccion: editing.value.direccion.trim() || null,
        stock_min_default: editing.value.stock_min_default,
        estado: editing.value.estado,
      }),
    })
    success.value = 'Negocio actualizado correctamente.'
    cancelEdit()
    await Promise.all([loadAdminNegocios(), loadMisNegocios()])
  } catch (e: any) {
    error.value = e?.message ?? 'Error actualizando negocio'
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
    if (editingCodneg.value === row.codneg)
      cancelEdit()
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
          <table class="w-full min-w-[1180px] text-sm">
            <thead>
              <tr class="border-b text-left" style="border-color: var(--color-border); background: var(--color-bg-subtle, #f9fafb)">
                <th class="px-4 py-3 text-muted font-medium w-20">Código</th>
                <th class="px-4 py-3 text-muted font-medium min-w-[220px]">Nombre</th>
                <th class="px-4 py-3 text-muted font-medium min-w-[220px]">Dirección</th>
                <th class="px-4 py-3 text-muted font-medium w-36">Stock mín.</th>
                <th class="px-4 py-3 text-muted font-medium w-28">Estado</th>
                <th class="px-4 py-3 text-muted font-medium min-w-[220px]">Dueños</th>
                <th class="px-4 py-3 text-muted font-medium w-40">Acceso usuario</th>
                <th class="px-4 py-3 text-muted font-medium w-40">Rol</th>
                <th class="px-4 py-3 text-muted font-medium w-28">Sesión</th>
                <th class="px-4 py-3 text-muted font-medium min-w-[320px]">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="row in negociosTabla" :key="row.codneg">
              <tr
                class="border-b align-top"
                style="border-color: var(--color-border)"
              >
                <td class="px-4 py-3 text-muted">{{ row.codneg }}</td>

                <template v-if="editingCodneg === row.codneg && isAdmin">
                  <td class="px-4 py-3">
                    <input v-model="editing.nombre" type="text" class="input w-full px-3 py-2" />
                  </td>
                  <td class="px-4 py-3">
                    <input v-model="editing.direccion" type="text" class="input w-full px-3 py-2" />
                  </td>
                  <td class="px-4 py-3">
                    <input v-model.number="editing.stock_min_default" type="number" min="0" class="input w-full px-3 py-2" />
                  </td>
                  <td class="px-4 py-3">
                    <select v-model="editing.estado" class="input w-full px-3 py-2">
                      <option value="A">Activo</option>
                      <option value="I">Inactivo</option>
                    </select>
                  </td>
                </template>

                <template v-else>
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
                </template>

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
                        v-if="editingCodneg !== row.codneg"
                        type="button"
                        class="btn btn-secondary px-3 py-2 text-xs"
                        @click="startEdit(row)"
                      >
                        Editar
                      </button>
                      <template v-else>
                        <button
                          type="button"
                          class="btn btn-primary px-3 py-2 text-xs disabled:opacity-60"
                          :disabled="savingRow === row.codneg"
                          @click="saveEdit"
                        >
                          {{ savingRow === row.codneg ? 'Guardando…' : 'Guardar' }}
                        </button>
                        <button type="button" class="btn btn-secondary px-3 py-2 text-xs" @click="cancelEdit">
                          Cancelar
                        </button>
                      </template>

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

    <BaseModal :open="showCreateModal" title="Crear negocio" size="md" @close="showCreateModal = false">
      <div class="space-y-4">
        <p class="text-sm text-muted">
          Completa todos los campos requeridos por tu esquema de base de datos para crear el negocio.
        </p>

        <FormField label="Nombre" required>
          <input
            v-model="creating.nombre"
            type="text"
            class="input w-full px-3 py-2"
            placeholder="Nombre del negocio"
          />
        </FormField>

        <FormField v-if="negocioMeta.fields.direccion" label="Dirección" hint="Opcional">
          <input
            v-model="creating.direccion"
            type="text"
            class="input w-full px-3 py-2"
            placeholder="Dirección del negocio"
          />
        </FormField>

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
            :disabled="savingRow === 'new'"
            @click="createNegocio"
          >
            {{ savingRow === 'new' ? 'Guardando…' : 'Crear negocio' }}
          </button>
        </div>
      </div>
    </BaseModal>

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

      <div class="card p-0 overflow-hidden">
        <LoadingSpinner v-if="permisosLoading" />

        <div v-else-if="permisosFiltrados.length === 0" class="px-4 py-10 text-center text-sm text-muted">
          No hay permisos RBAC para mostrar.
        </div>

        <div v-else class="overflow-x-auto">
          <table class="w-full min-w-[760px] text-sm">
            <thead>
              <tr class="border-b text-left" style="border-color: var(--color-border); background: var(--color-bg-subtle, #f9fafb)">
                <th class="px-4 py-3 text-muted font-medium w-20">#</th>
                <th class="px-4 py-3 text-muted font-medium min-w-[260px]">Clave</th>
                <th class="px-4 py-3 text-muted font-medium min-w-[260px]">Nombre</th>
                <th class="px-4 py-3 text-muted font-medium min-w-[180px]">Módulo</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="permiso in permisosFiltrados"
                :key="permiso.codprm"
                class="border-b"
                style="border-color: var(--color-border)"
              >
                <td class="px-4 py-3 text-muted">{{ permiso.codprm }}</td>
                <td class="px-4 py-3 font-mono text-xs">{{ permiso.clave }}</td>
                <td class="px-4 py-3">{{ permiso.nombre }}</td>
                <td class="px-4 py-3 text-muted">{{ permiso.modulo || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  </div>
</template>
