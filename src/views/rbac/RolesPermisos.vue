<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { apiFetch } from '@/utils/api'
import { useSession } from '@/utils/session'
import type { RolRow, RolPermisoRow, CatalogPayload } from '@/types'

import BaseTable, { type Column } from '@/components/shared/BaseTable.vue'
import BaseModal from '@/components/shared/BaseModal.vue'
import FormField from '@/components/shared/FormField.vue'
import LoadingSpinner from '@/components/shared/LoadingSpinner.vue'
import ErrorAlert from '@/components/shared/ErrorAlert.vue'
import EmptyState from '@/components/shared/EmptyState.vue'
import { moduloDe, iconoModulo, accionLabel } from '@/utils/rbacLabels'

const { user } = useSession()
const isAdmin = computed(() => Boolean(user.value?.isAdmin || user.value?.codusr === 'admin'))
// Dueños también gestionan roles (solo los de sus negocios; el backend lo valida).
const puedeGestionar = computed(() => isAdmin.value || Boolean(user.value?.esdueno))

// Negocios FRESCOS del servidor (la lista de la sesión puede quedar obsoleta
// si se crean/eliminan negocios después del login → codneg inválidos).
const negociosDisponibles = ref<Array<{ codneg: number; nombre: string; esdueno?: boolean }>>([])
async function loadNegociosDisponibles() {
  try {
    const rows = await apiFetch<any[]>('auth/mis-negocios')
    negociosDisponibles.value = (Array.isArray(rows) ? rows : []).map(n => ({
      codneg: Number(n.codneg), nombre: String(n.nombre ?? ''), esdueno: Boolean(n.esdueno),
    }))
  } catch { negociosDisponibles.value = [] }
}

// Negocios donde el actor puede crear roles: admin → todos; dueño → solo los que posee.
const negociosCreacion = computed(() => isAdmin.value ? negociosDisponibles.value : negociosDisponibles.value.filter(n => n.esdueno))

const loading = ref(false)
const error = ref<string | null>(null)

const catalog = ref<CatalogPayload | null>(null)
const roles = ref<RolRow[]>([])

const selectedRol = ref<RolRow | null>(null)
const rolPermisos = ref<RolPermisoRow[]>([])
const permisosLoading = ref(false)

const filter = ref('')
const filteredPermisos = computed(() => {
  const q = filter.value.trim().toLowerCase()
  if (!q) return rolPermisos.value
  return rolPermisos.value.filter(p =>
    String(p.clave).toLowerCase().includes(q)
    || String(p.nombre).toLowerCase().includes(q)
    || accionLabel(String(p.clave), moduloDe(String(p.clave))).toLowerCase().includes(q),
  )
})

const totalActivos = computed(() => rolPermisos.value.filter(p => p.estado === 'A').length)

/* ── Agrupación por módulo ── */
const modulosColapsados = ref<Set<string>>(new Set())
const buscando = computed(() => filter.value.trim().length > 0)

const permisosPorModulo = computed(() => {
  const grupos = new Map<string, RolPermisoRow[]>()
  for (const p of filteredPermisos.value) {
    const mod = moduloDe(String(p.clave))
    if (!grupos.has(mod)) grupos.set(mod, [])
    grupos.get(mod)!.push(p)
  }
  return Array.from(grupos.entries())
    .map(([modulo, items]) => ({
      modulo,
      items,
      icono: iconoModulo(modulo),
      activos: items.filter(i => i.estado === 'A').length,
    }))
    .sort((a, b) => (a.modulo === 'GLOBAL' ? -1 : b.modulo === 'GLOBAL' ? 1 : a.modulo.localeCompare(b.modulo)))
})

function moduloAbierto(mod: string) { return buscando.value || !modulosColapsados.value.has(mod) }
function toggleModulo(mod: string) {
  const s = new Set(modulosColapsados.value)
  s.has(mod) ? s.delete(mod) : s.add(mod)
  modulosColapsados.value = s
}
function expandirTodos() { modulosColapsados.value = new Set() }
function colapsarTodos() { modulosColapsados.value = new Set(permisosPorModulo.value.map(g => g.modulo)) }

const roleCols: Column[] = [
  { key: 'codrol', label: '#', width: '70px' },
  { key: 'nombre', label: 'Rol' },
  { key: 'negocio_nombre', label: 'Negocio', width: '160px' },
  { key: 'detalle', label: 'Detalle' },
  { key: 'actions', label: '', width: '140px', align: 'center' },
]

/* ── Filtro de roles por negocio ── */
const fNegocioRol = ref<'todos' | 'global' | number>('todos')
const rolesFiltrados = computed(() => {
  if (fNegocioRol.value === 'todos') return roles.value
  if (fNegocioRol.value === 'global') return roles.value.filter(r => r.codneg == null)
  return roles.value.filter(r => Number(r.codneg) === Number(fNegocioRol.value))
})
// Un dueño no puede administrar roles globales (solo el admin).
function puedeAdministrarRol(r: RolRow) {
  return isAdmin.value || r.codneg != null
}

async function loadAll() {
  if (!puedeGestionar.value) return
  loading.value = true
  error.value = null
  try {
    const [cat, rol] = await Promise.all([
      apiFetch<CatalogPayload>('rbac/catalog'),
      apiFetch<RolRow[]>('rbac/roles'),
      loadNegociosDisponibles(),
    ])
    catalog.value = cat
    roles.value = rol ?? []
  } catch (e: any) {
    error.value = e?.message ?? 'Error cargando RBAC'
  } finally {
    loading.value = false
  }
}

async function selectRole(r: RolRow) {
  selectedRol.value = r
  await loadRolePermisos()
}

async function loadRolePermisos() {
  if (!selectedRol.value) return
  permisosLoading.value = true
  error.value = null
  try {
    const res = await apiFetch<{ codrol: number; permisos: RolPermisoRow[] }>(`rbac/roles/${selectedRol.value.codrol}/permisos`)
    rolPermisos.value = res?.permisos ?? []
  } catch (e: any) {
    rolPermisos.value = []
    error.value = e?.message ?? 'Error cargando permisos del rol'
  } finally {
    permisosLoading.value = false
  }
}

async function setPermiso(p: RolPermisoRow, estado: 'A' | 'I') {
  if (!selectedRol.value || p.estado === estado) return
  const prev = p.estado
  p.estado = estado // optimista
  try {
    await apiFetch('rbac/roles/permisos/set', {
      method: 'POST',
      body: JSON.stringify({ codrol: selectedRol.value.codrol, clavePermiso: p.clave, estado }),
    })
  } catch (e: any) {
    p.estado = prev
    error.value = e?.message ?? 'Error actualizando permiso'
  }
}

function togglePermiso(p: RolPermisoRow) {
  return setPermiso(p, p.estado === 'A' ? 'I' : 'A')
}

// Activa/desactiva todos los permisos de un módulo de una vez.
const moduloSaving = ref<string | null>(null)
async function toggleModuloTodos(mod: string, activar: boolean) {
  if (!selectedRol.value) return
  const grupo = permisosPorModulo.value.find(g => g.modulo === mod)
  if (!grupo) return
  const estado: 'A' | 'I' = activar ? 'A' : 'I'
  moduloSaving.value = mod
  try {
    await Promise.all(grupo.items.filter(p => p.estado !== estado).map(p => setPermiso(p, estado)))
  } finally {
    moduloSaving.value = null
  }
}

/* ── Crear rol ── */
const showCreate = ref(false)
const newNombre = ref('')
const newDetalle = ref('')
const newCodnegs = ref<Set<number>>(new Set())
const createLoading = ref(false)

function openCreate() {
  newNombre.value = ''; newDetalle.value = ''
  // Preselecciona el negocio activo si aplica.
  const actual = Number(user.value?.codneg)
  newCodnegs.value = new Set(
    negociosCreacion.value.some(n => Number(n.codneg) === actual) ? [actual] : [],
  )
  showCreate.value = true
}

function toggleNegocioRol(cn: number) {
  const s = new Set(newCodnegs.value)
  s.has(cn) ? s.delete(cn) : s.add(cn)
  newCodnegs.value = s
}

async function createRole() {
  const nombre = newNombre.value.trim()
  if (!nombre) { error.value = 'Nombre de rol es requerido'; return }
  if (!isAdmin.value && newCodnegs.value.size === 0) {
    error.value = 'Selecciona al menos un negocio para crear el rol'
    return
  }
  createLoading.value = true
  error.value = null
  try {
    const res = await apiFetch<{ creados?: RolRow[] }>('rbac/roles', {
      method: 'POST',
      body: JSON.stringify({
        nombre,
        detalle: newDetalle.value.trim() || null,
        codnegs: Array.from(newCodnegs.value),
      }),
    })
    showCreate.value = false
    newDetalle.value = ''
    newNombre.value = ''
    await loadAll()
    // Auto-selecciona el primer rol creado para asignar permisos enseguida.
    const primero = res?.creados?.[0]
    const creado = primero
      ? roles.value.find(r => Number(r.codrol) === Number(primero.codrol))
      : roles.value.find(r => String(r.nombre).toLowerCase() === nombre.toLowerCase())
    if (creado) await selectRole(creado)
  } catch (e: any) {
    error.value = e?.message ?? 'Error creando rol'
  } finally {
    createLoading.value = false
  }
}

/* ── Sync permisos catálogo → BD ── */
const syncLoading = ref(false)
async function syncPermisos() {
  syncLoading.value = true
  error.value = null
  try {
    await apiFetch('rbac/permisos/sync', { method: 'POST' })
    // refresca permisos del rol seleccionado
    if (selectedRol.value) await loadRolePermisos()
  } catch (e: any) {
    error.value = e?.message ?? 'Error sincronizando permisos'
  } finally {
    syncLoading.value = false
  }
}

onMounted(loadAll)
watch(puedeGestionar, () => { void loadAll() })
</script>

<template>
  <div class="space-y-4">
    <div class="card p-4">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 class="text-lg font-semibold text-main">Roles y permisos</h2>
          <p class="text-sm text-muted">Cada negocio define sus propios roles; los globales son del sistema.</p>
        </div>
        <div class="flex gap-2 flex-wrap">
          <button type="button" class="px-4 py-2 btn btn-secondary text-sm" :disabled="loading" @click="loadAll">Recargar</button>
          <button v-if="isAdmin" type="button" class="px-4 py-2 btn btn-secondary text-sm disabled:opacity-60" :disabled="syncLoading" @click="syncPermisos">
            {{ syncLoading ? 'Sincronizando…' : 'Sync permisos' }}
          </button>
          <button type="button" class="px-4 py-2 btn btn-primary text-sm" @click="openCreate">+ Crear rol</button>
        </div>
      </div>
    </div>

    <ErrorAlert v-if="error" :message="error" @dismiss="error = null" />
    <LoadingSpinner v-if="loading" />

    <div v-if="!puedeGestionar" class="card p-4">
      <EmptyState title="Acceso restringido" message="Esta sección está disponible para SUPERADMIN y dueños de negocio." />
    </div>

    <div v-if="puedeGestionar && !loading" class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div class="card p-4">
        <div class="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <h3 class="font-semibold text-main">Roles</h3>
          <select v-model="fNegocioRol" class="px-2 py-1.5 input text-xs">
            <option value="todos">Todos los negocios</option>
            <option value="global">🌐 Globales</option>
            <option v-for="n in negociosDisponibles" :key="n.codneg" :value="Number(n.codneg)">🏪 {{ n.nombre }}</option>
          </select>
        </div>
        <BaseTable :columns="roleCols" :rows="rolesFiltrados" row-key="codrol" striped>
          <template #cell-negocio_nombre="{ row }">
            <span v-if="row.codneg == null" class="inline-flex px-2 py-0.5 rounded text-xs bg-gray-200 text-gray-600">🌐 Global</span>
            <span v-else class="text-sm">🏪 {{ row.negocio_nombre }}</span>
          </template>
          <template #cell-actions="{ row }">
            <button v-if="puedeAdministrarRol(row)" type="button" class="px-3 py-1 btn btn-secondary text-xs" @click="selectRole(row)">
              {{ selectedRol?.codrol === row.codrol ? 'Seleccionado' : 'Administrar' }}
            </button>
            <span v-else class="text-xs text-muted" title="Los roles globales los gestiona el administrador">—</span>
          </template>
          <template #empty>
            <EmptyState title="Sin roles" message="No hay roles para este filtro. Crea el primero." />
          </template>
        </BaseTable>
      </div>

      <div class="card p-4">
        <div class="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <div>
            <h3 class="font-semibold text-main">Permisos</h3>
            <p class="text-xs text-muted" v-if="selectedRol">
              Rol: <span class="font-medium text-main">{{ selectedRol.nombre }}</span>
              · <span class="text-green-600 font-medium">{{ totalActivos }}</span> de {{ rolPermisos.length }} activos
            </p>
          </div>
          <input v-model="filter" class="px-3 py-2 input text-sm w-44" placeholder="Filtrar permisos…" />
        </div>

        <div v-if="selectedRol && !permisosLoading && rolPermisos.length" class="flex gap-2 mb-3">
          <button type="button" class="btn btn-secondary px-3 py-1.5 text-xs" @click="expandirTodos">Expandir</button>
          <button type="button" class="btn btn-secondary px-3 py-1.5 text-xs" @click="colapsarTodos">Colapsar</button>
        </div>

        <LoadingSpinner v-if="permisosLoading" size="sm" />

        <div v-if="!selectedRol && !permisosLoading" class="py-8">
          <EmptyState title="Selecciona un rol" message="Elige un rol para ver y asignar permisos." />
        </div>

        <div v-else-if="selectedRol && !permisosLoading && permisosPorModulo.length === 0" class="py-8">
          <EmptyState title="Sin permisos" message="Sincroniza permisos o revisa el catálogo." />
        </div>

        <!-- Acordeón por módulo con switches -->
        <div v-else-if="selectedRol && !permisosLoading" class="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
          <div v-for="grupo in permisosPorModulo" :key="grupo.modulo" class="rounded-lg border border-base overflow-hidden">
            <div class="flex items-center justify-between gap-2 px-3 py-2 bg-[var(--app-bg-2)]">
              <button type="button" class="flex items-center gap-2 min-w-0 flex-1 text-left" @click="toggleModulo(grupo.modulo)">
                <span>{{ grupo.icono }}</span>
                <span class="font-semibold text-main text-sm truncate">{{ grupo.modulo }}</span>
                <span class="text-xs text-muted shrink-0">{{ grupo.activos }}/{{ grupo.items.length }}</span>
                <span class="text-muted text-xs shrink-0">{{ moduloAbierto(grupo.modulo) ? '▲' : '▼' }}</span>
              </button>
              <div class="flex gap-1 shrink-0">
                <button type="button" class="text-[11px] px-2 py-0.5 rounded bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50"
                  :disabled="moduloSaving === grupo.modulo || grupo.activos === grupo.items.length" @click="toggleModuloTodos(grupo.modulo, true)">Todos</button>
                <button type="button" class="text-[11px] px-2 py-0.5 rounded bg-gray-200 text-gray-600 hover:bg-gray-300 disabled:opacity-50"
                  :disabled="moduloSaving === grupo.modulo || grupo.activos === 0" @click="toggleModuloTodos(grupo.modulo, false)">Ninguno</button>
              </div>
            </div>

            <div v-if="moduloAbierto(grupo.modulo)" class="divide-y" style="border-color: var(--color-border)">
              <div v-for="p in grupo.items" :key="p.clave"
                class="flex items-center gap-3 px-3 py-2 hover:bg-[var(--menu-hover)] cursor-pointer"
                @click="togglePermiso(p)">
                <button type="button" role="switch" :aria-checked="p.estado === 'A'"
                  class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0"
                  :class="p.estado === 'A' ? 'bg-green-500' : 'bg-gray-300'"
                  @click.stop="togglePermiso(p)">
                  <span class="inline-block h-4 w-4 rounded-full bg-white transition-transform"
                    :class="p.estado === 'A' ? 'translate-x-4' : 'translate-x-0.5'" />
                </button>
                <div class="min-w-0">
                  <p class="text-sm text-main truncate">{{ accionLabel(String(p.clave), grupo.modulo) }}</p>
                  <p class="text-[11px] text-muted font-mono truncate">{{ p.clave }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <BaseModal :open="showCreate" title="Crear rol" size="md" @close="showCreate = false">
      <div class="space-y-3">
        <FormField label="Nombre" required>
          <input v-model="newNombre" class="w-full px-3 py-2 input" placeholder="Ej: CAJERO" />
        </FormField>
        <FormField label="Detalle" hint="Opcional">
          <textarea v-model="newDetalle" class="w-full px-3 py-2 input" rows="2" placeholder="Descripción del rol…" />
        </FormField>

        <!-- Negocios destino -->
        <div class="p-3 rounded-md border border-base space-y-2">
          <h4 class="text-sm font-semibold text-main">¿En qué negocios se creará?</h4>
          <p class="text-xs text-muted">
            Se crea una copia independiente del rol en cada negocio marcado (mismo nombre, permisos propios).
            <template v-if="isAdmin"> Si no marcas ninguno, será un <strong>rol global</strong> del sistema.</template>
          </p>
          <div v-if="negociosCreacion.length" class="grid grid-cols-1 sm:grid-cols-2 gap-1">
            <label v-for="n in negociosCreacion" :key="n.codneg" class="flex items-center gap-2 text-sm text-main px-2 py-1 rounded hover:bg-[var(--menu-hover)]">
              <input type="checkbox" class="rounded" :checked="newCodnegs.has(Number(n.codneg))" @change="toggleNegocioRol(Number(n.codneg))" />
              🏪 {{ n.nombre }}<span v-if="n.esdueno"> 👑</span>
            </label>
          </div>
          <p v-else class="text-xs text-muted">No tienes negocios disponibles.</p>
        </div>

        <p class="text-xs text-muted">Al crear el rol se seleccionará automáticamente para que le asignes sus permisos.</p>
      </div>
      <template #footer>
        <button type="button" class="px-4 py-2 btn btn-secondary text-sm" @click="showCreate = false">Cancelar</button>
        <button type="button" class="px-4 py-2 btn btn-primary text-sm disabled:opacity-60" :disabled="createLoading" @click="createRole">
          {{ createLoading ? 'Creando…' : 'Crear' }}
        </button>
      </template>
    </BaseModal>
  </div>
</template>

