<script setup lang="ts">
/**
 * Módulo USUARIOS — Vista principal reestructurada.
 *
 * Campos auto-generados (no editables):
 *   codusr (PK varchar(8)), usercrea/usermod/fechcrea/fechmod, estado_usr
 *
 * FK vía modal/dropdown (el usuario NO escribe códigos):
 *   codper_usr → persona (modal PersonaSearchModal)
 *   codrol_usr → rol (dropdown)
 *   codneg → de sesión automática
 *
 * Campos que llena el admin:
 *   nombre_usr, password, esdueno, loginmulti, negocios adicionales
 *
 * El código de usuario (codusr) se GENERA automáticamente en el backend con
 * formato LLLNNNNN (3 letras = árbol del dueño, 5 dígitos = consecutivo del
 * árbol). Aquí solo se muestra en modo lectura tras la creación.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { apiFetch } from '@/utils/api'
import { useSession } from '@/utils/session'
import type { AuthzCheckResponse, UsuarioRow, RolOption, PersonaRef } from '@/types'

import BaseTable, { type Column } from '@/components/shared/BaseTable.vue'
import BaseModal from '@/components/shared/BaseModal.vue'
import FormField from '@/components/shared/FormField.vue'
import StatusBadge from '@/components/shared/StatusBadge.vue'
import LoadingSpinner from '@/components/shared/LoadingSpinner.vue'
import ErrorAlert from '@/components/shared/ErrorAlert.vue'
import EmptyState from '@/components/shared/EmptyState.vue'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'
import PersonaSearchModal from '@/components/personas/PersonaSearchModal.vue'
import PersonaCreateModal from '@/components/personas/PersonaCreateModal.vue'

// types moved to src/types

const { user, negocios } = useSession()
const codneg = computed(() => {
  const v = Number(user.value?.codneg)
  return Number.isFinite(v) && v > 0 ? v : null
})
// Negocios disponibles para acceso adicional (excluye el negocio actual).
const otrosNegocios = computed(() => negocios.value.filter(n => Number(n.codneg) !== Number(codneg.value)))
const isAdmin = computed(() => Boolean(user.value?.isAdmin || user.value?.codusr === 'admin'))

/* ── Permisos ── */
const perms = ref({ ver: false, crear: false, rolCambiar: false, estadoCambiar: false, rolesCreables: false })

async function loadPermisos() {
  if (isAdmin.value) {
    perms.value = { ver: true, crear: true, rolCambiar: true, estadoCambiar: true, rolesCreables: true }
    return
  }
  if (!codneg.value) return
  try {
    const keys = ['USUARIOS.VER', 'USUARIOS.CREAR', 'USUARIOS.ROL.CAMBIAR', 'USUARIOS.ESTADO.CAMBIAR', 'USUARIOS.ROLES_CREABLES.CONFIGURAR']
    const res = await apiFetch<AuthzCheckResponse>('authz/check', {
      method: 'POST',
      body: JSON.stringify({ codneg: codneg.value, permisos: keys }),
    })
    const m = res?.permisos ?? {}
    perms.value = {
      ver: Boolean(m['USUARIOS.VER']),
      crear: Boolean(m['USUARIOS.CREAR']),
      rolCambiar: Boolean(m['USUARIOS.ROL.CAMBIAR']),
      estadoCambiar: Boolean(m['USUARIOS.ESTADO.CAMBIAR']),
      rolesCreables: Boolean(m['USUARIOS.ROLES_CREABLES.CONFIGURAR']),
    }
  } catch {
    perms.value = { ver: false, crear: false, rolCambiar: false, estadoCambiar: false, rolesCreables: false }
  }
}

/* ── Datos ── */
const loading = ref(false)
const error = ref<string | null>(null)
const usuarios = ref<UsuarioRow[]>([])
const roles = ref<RolOption[]>([])

const columns: Column[] = [
  { key: 'codusr', label: 'Código', width: '90px' },
  { key: 'nombre_usr', label: 'Login' },
  { key: 'persona_nombre', label: 'Persona' },
  { key: 'rol_nombre', label: 'Rol' },
  { key: 'estado', label: 'Estado', width: '90px', align: 'center' },
  { key: 'actions', label: 'Acciones', width: '180px', align: 'center' },
]

async function loadUsuarios() {
  if (!codneg.value) return
  error.value = null
  loading.value = true
  try {
    usuarios.value = await apiFetch<UsuarioRow[]>(`negocios/${codneg.value}/usuarios/descendientes`)
  } catch (e: any) {
    error.value = e?.message ?? 'Error cargando usuarios'
  } finally {
    loading.value = false
  }
}

async function loadRoles() {
  try {
    if (!codneg.value) return
    roles.value = await apiFetch<RolOption[]>(`negocios/${codneg.value}/usuarios/roles`)
  } catch { roles.value = [] }
}

/* ── Crear usuario ── */
const showCreate = ref(false)
const showPersonaSearch = ref(false)
const showPersonaCreate = ref(false)
const createLoading = ref(false)

const newNombreUsr = ref('')
const newPassword = ref('')
const newCodrol = ref<number | null>(null)
const newEsdueno = ref(false)
const newLoginmulti = ref(false)
const newCodnegs = ref<Set<number>>(new Set())
const selectedPersona = ref<PersonaRef | null>(null)
const okMsg = ref<string | null>(null)

function resetCreateForm() {
  newNombreUsr.value = ''
  newPassword.value = ''
  newCodrol.value = null
  newEsdueno.value = false
  newLoginmulti.value = false
  newCodnegs.value = new Set()
  selectedPersona.value = null
  error.value = null
}

function toggleNegocioExtra(cn: number) {
  const s = new Set(newCodnegs.value)
  s.has(cn) ? s.delete(cn) : s.add(cn)
  newCodnegs.value = s
}

function onPersonaSelected(persona: any) {
  selectedPersona.value = persona
  showPersonaSearch.value = false
}

function onPersonaCreated(persona: any) {
  selectedPersona.value = persona
  showPersonaCreate.value = false
}

async function createUsuario() {
  error.value = null
  if (!newNombreUsr.value.trim()) { error.value = 'Nombre de login requerido'; return }
  if (!newPassword.value) { error.value = 'Contraseña requerida'; return }
  if (!selectedPersona.value) { error.value = 'Debes seleccionar una persona'; return }

  createLoading.value = true
  try {
    // El código NO se envía: lo genera el backend (formato LLLNNNNN).
    const creado = await apiFetch<{ codusr?: string }>(`negocios/${codneg.value}/usuarios`, {
      method: 'POST',
      body: JSON.stringify({
        nombre: newNombreUsr.value.trim(),
        password: newPassword.value,
        codper: selectedPersona.value.codper,
        codrol: newCodrol.value,
        esdueno: newEsdueno.value,
        loginmulti: newLoginmulti.value,
        codnegs: newLoginmulti.value ? Array.from(newCodnegs.value) : [],
      }),
    })
    showCreate.value = false
    resetCreateForm()
    okMsg.value = creado?.codusr
      ? `Usuario creado con código ${creado.codusr}.`
      : 'Usuario creado correctamente.'
    await loadUsuarios()
  } catch (e: any) {
    error.value = e?.message ?? 'Error creando usuario'
  } finally {
    createLoading.value = false
  }
}

/* ── Asignar usuario existente a este negocio ── */
const showAsignar = ref(false)
const asignarQ = ref('')
const asignarResultados = ref<any[]>([])
const asignarSel = ref<any | null>(null)
const asignarCodrol = ref<number | null>(null)
const asignarLoading = ref(false)
const asignarBuscando = ref(false)

function openAsignar() {
  asignarQ.value = ''; asignarResultados.value = []; asignarSel.value = null; asignarCodrol.value = null
  showAsignar.value = true
}

async function buscarAsignables() {
  if (asignarQ.value.trim().length < 2) { asignarResultados.value = []; return }
  asignarBuscando.value = true
  try {
    asignarResultados.value = await apiFetch<any[]>(`negocios/${codneg.value}/usuarios/buscar?q=${encodeURIComponent(asignarQ.value.trim())}`)
  } catch { asignarResultados.value = [] }
  finally { asignarBuscando.value = false }
}

async function doAsignar() {
  if (!asignarSel.value || !codneg.value) return
  asignarLoading.value = true; error.value = null
  try {
    // El endpoint de rol hace MERGE: crea el vínculo usuario-negocio si no existe.
    await apiFetch(`negocios/${codneg.value}/usuarios/${asignarSel.value.codusr}/rol`, {
      method: 'PATCH',
      body: JSON.stringify({ codrol: asignarCodrol.value }),
    })
    showAsignar.value = false
    okMsg.value = `Usuario ${asignarSel.value.codusr} asignado a este negocio.`
    await loadUsuarios()
  } catch (e: any) { error.value = e?.message ?? 'Error asignando usuario' }
  finally { asignarLoading.value = false }
}

/* ── Cambiar rol ── */
const showChangeRole = ref(false)
const changeRoleTarget = ref<UsuarioRow | null>(null)
const changeRolValue = ref<number | null>(null)
const changeRoleLoading = ref(false)

function openChangeRole(usr: UsuarioRow) {
  changeRoleTarget.value = usr
  changeRolValue.value = usr.codrol ?? null
  showChangeRole.value = true
}

async function doChangeRole() {
  if (!changeRoleTarget.value || !codneg.value) return
  changeRoleLoading.value = true
  try {
    await apiFetch(`negocios/${codneg.value}/usuarios/${changeRoleTarget.value.codusr}/rol`, {
      method: 'PATCH',
      body: JSON.stringify({ codrol: changeRolValue.value }),
    })
    showChangeRole.value = false
    await loadUsuarios()
  } catch (e: any) {
    error.value = e?.message ?? 'Error cambiando rol'
  } finally {
    changeRoleLoading.value = false
  }
}

/* ── Cambiar estado ── */
const showConfirmEstado = ref(false)
const estadoTarget = ref<UsuarioRow | null>(null)
const estadoLoading = ref(false)

function openToggleEstado(usr: UsuarioRow) {
  estadoTarget.value = usr
  showConfirmEstado.value = true
}

async function doToggleEstado() {
  if (!estadoTarget.value || !codneg.value) return
  estadoLoading.value = true
  try {
    const nuevoEstado = estadoTarget.value.estado === 'A' ? 'I' : 'A'
    await apiFetch(`negocios/${codneg.value}/usuarios/${estadoTarget.value.codusr}/estado`, {
      method: 'PATCH',
      body: JSON.stringify({ estado: nuevoEstado }),
    })
    showConfirmEstado.value = false
    await loadUsuarios()
  } catch (e: any) {
    error.value = e?.message ?? 'Error cambiando estado'
  } finally {
    estadoLoading.value = false
  }
}

/* ── Lifecycle ── */
onMounted(async () => {
  await loadPermisos()
  if (perms.value.ver || isAdmin.value) {
    await Promise.all([loadUsuarios(), loadRoles()])
  }
})

watch(codneg, async () => {
  await loadPermisos()
  if (perms.value.ver || isAdmin.value) {
    await Promise.all([loadUsuarios(), loadRoles()])
  }
})
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="card p-4">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 class="text-lg font-semibold text-main">Usuarios</h2>
          <p class="text-sm text-muted">Gestión de usuarios del negocio actual.</p>
        </div>
        <div class="flex gap-2">
          <button v-if="perms.crear || isAdmin" type="button" class="px-4 py-2 btn btn-primary text-sm" @click="showCreate = true; resetCreateForm()">
            + Nuevo usuario
          </button>
          <button v-if="perms.rolCambiar || isAdmin" type="button" class="px-4 py-2 btn btn-secondary text-sm" @click="openAsignar">
            Asignar existente
          </button>
          <button type="button" class="px-4 py-2 btn btn-secondary text-sm" :disabled="loading" @click="loadUsuarios">
            Recargar
          </button>
        </div>
      </div>
    </div>

    <ErrorAlert v-if="error" :message="error" @dismiss="error = null" />
    <div v-if="okMsg" class="card p-3 text-sm text-green-700 bg-green-50 border border-green-200 flex items-center justify-between">
      <span>{{ okMsg }}</span>
      <button type="button" class="text-green-700 hover:underline text-xs" @click="okMsg = null">×</button>
    </div>
    <LoadingSpinner v-if="loading" />

    <!-- Tabla -->
    <div v-if="!loading" class="card p-4">
      <BaseTable :columns="columns" :rows="usuarios" row-key="codusr" striped>
        <template #cell-persona_nombre="{ row }">
          {{ row.persona_nombre ?? '—' }} {{ row.persona_apellido ?? '' }}
          <span v-if="row.esdueno_negocio" class="ml-1 text-xs" title="Dueño de este negocio">👑</span>
        </template>
        <template #cell-estado="{ row }">
          <StatusBadge :estado="row.estado" />
        </template>
        <template #cell-actions="{ row }">
          <div class="flex gap-1 justify-center">
            <button v-if="perms.rolCambiar || isAdmin" type="button" class="px-2 py-1 btn btn-secondary text-xs" @click="openChangeRole(row)">Rol</button>
            <button v-if="perms.estadoCambiar || isAdmin" type="button"
              :class="['px-2 py-1 btn text-xs', row.estado === 'A' ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-green-100 text-green-700 hover:bg-green-200']"
              @click="openToggleEstado(row)"
            >
              {{ row.estado === 'A' ? 'Desactivar' : 'Activar' }}
            </button>
          </div>
        </template>
        <template #empty>
          <EmptyState title="Sin usuarios" message="No se encontraron usuarios asignados a este negocio." />
        </template>
      </BaseTable>
    </div>

    <!-- ═══ MODAL: Crear usuario ═══ -->
    <BaseModal :open="showCreate" title="Crear usuario" size="lg" @close="showCreate = false">
      <div class="space-y-4">
        <ErrorAlert v-if="error" :message="error" @dismiss="error = null" />

        <!-- Persona (FK vía modal, NO se escribe código) -->
        <div class="p-3 rounded-md border border-base space-y-2">
          <h4 class="text-sm font-semibold text-main">Persona asociada</h4>
          <p class="text-xs text-muted">Selecciona la persona que se vinculará. Si no existe, créala primero.</p>

          <div v-if="selectedPersona" class="flex items-center gap-3 p-2 rounded bg-[var(--app-bg-2)]">
            <div class="flex-1">
              <span class="font-medium text-main">{{ selectedPersona.nombre }} {{ selectedPersona.apellidos }}</span>
              <span v-if="selectedPersona.email" class="text-xs text-muted ml-2">{{ selectedPersona.email }}</span>
            </div>
            <button type="button" class="text-xs text-red-600 hover:underline" @click="selectedPersona = null">Quitar</button>
          </div>

          <div class="flex gap-2">
            <button type="button" class="px-3 py-1.5 btn btn-secondary text-xs" @click="showPersonaSearch = true">Buscar existente</button>
            <button type="button" class="px-3 py-1.5 btn btn-primary text-xs" @click="showPersonaCreate = true">Crear nueva</button>
          </div>
        </div>

        <!-- Datos del usuario -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Código de usuario" hint="Se genera automáticamente al crear (formato AAA00001)">
            <input value="Automático" type="text" disabled class="w-full px-3 py-2 input opacity-60 cursor-not-allowed" />
          </FormField>
          <FormField label="Nombre de login" required hint="Nombre con el que iniciará sesión">
            <input v-model="newNombreUsr" type="text" class="w-full px-3 py-2 input" placeholder="juan.perez" autocomplete="off" name="nuevo-login" />
          </FormField>
          <FormField label="Contraseña" required>
            <!-- new-password: impide que Chrome rellene aquí las credenciales guardadas -->
            <input v-model="newPassword" type="password" class="w-full px-3 py-2 input" placeholder="••••••••" autocomplete="new-password" name="nueva-contrasena" />
          </FormField>
          <FormField label="Rol" hint="Rol en este negocio">
            <select v-model="newCodrol" class="w-full px-3 py-2 input">
              <option :value="null">— Sin rol —</option>
              <option v-for="r in roles" :key="r.codrol" :value="r.codrol">{{ r.nombre }}</option>
            </select>
          </FormField>
        </div>

        <div class="flex gap-6">
          <label class="flex items-center gap-2 text-sm text-main">
            <input v-model="newEsdueno" type="checkbox" class="rounded" /> Es dueño
          </label>
          <label class="flex items-center gap-2 text-sm text-main">
            <input v-model="newLoginmulti" type="checkbox" class="rounded" /> Login multi-negocio
          </label>
        </div>

        <!-- Negocios adicionales (solo login multi-negocio) -->
        <div v-if="newLoginmulti" class="p-3 rounded-md border border-base space-y-2">
          <h4 class="text-sm font-semibold text-main">Acceso a negocios</h4>
          <p class="text-xs text-muted">
            Tendrá acceso a <strong>{{ negocios.find(n => Number(n.codneg) === Number(codneg))?.nombre ?? 'este negocio' }}</strong> (actual). Marca los negocios adicionales:
          </p>
          <div v-if="otrosNegocios.length" class="grid grid-cols-1 sm:grid-cols-2 gap-1">
            <label v-for="n in otrosNegocios" :key="n.codneg" class="flex items-center gap-2 text-sm text-main px-2 py-1 rounded hover:bg-[var(--menu-hover)]">
              <input type="checkbox" class="rounded" :checked="newCodnegs.has(Number(n.codneg))" @change="toggleNegocioExtra(Number(n.codneg))" />
              {{ n.nombre }}
            </label>
          </div>
          <p v-else class="text-xs text-muted">No tienes otros negocios disponibles.</p>
        </div>
      </div>

      <template #footer>
        <button type="button" class="px-4 py-2 btn btn-secondary text-sm" @click="showCreate = false">Cancelar</button>
        <button type="button" class="px-4 py-2 btn btn-primary text-sm disabled:opacity-60" :disabled="createLoading" @click="createUsuario">
          {{ createLoading ? 'Creando…' : 'Crear usuario' }}
        </button>
      </template>
    </BaseModal>

    <!-- ═══ MODAL: Cambiar rol ═══ -->
    <BaseModal :open="showChangeRole" title="Cambiar rol" size="sm" @close="showChangeRole = false">
      <div class="space-y-3">
        <p class="text-sm text-main">Usuario: <span class="font-semibold">{{ changeRoleTarget?.codusr }}</span> ({{ changeRoleTarget?.nombre_usr }})</p>
        <FormField label="Nuevo rol">
          <select v-model="changeRolValue" class="w-full px-3 py-2 input">
            <option :value="null">— Sin rol —</option>
            <option v-for="r in roles" :key="r.codrol" :value="r.codrol">{{ r.nombre }}</option>
          </select>
        </FormField>
      </div>
      <template #footer>
        <button type="button" class="px-4 py-2 btn btn-secondary text-sm" @click="showChangeRole = false">Cancelar</button>
        <button type="button" class="px-4 py-2 btn btn-primary text-sm disabled:opacity-60" :disabled="changeRoleLoading" @click="doChangeRole">
          {{ changeRoleLoading ? 'Guardando…' : 'Guardar' }}
        </button>
      </template>
    </BaseModal>

    <!-- ═══ CONFIRM: Estado ═══ -->
    <ConfirmDialog
      :open="showConfirmEstado"
      :title="estadoTarget?.estado === 'A' ? 'Desactivar usuario' : 'Activar usuario'"
      :message="`¿${estadoTarget?.estado === 'A' ? 'Desactivar' : 'Activar'} al usuario ${estadoTarget?.codusr}?`"
      :variant="estadoTarget?.estado === 'A' ? 'danger' : 'primary'"
      :confirm-label="estadoTarget?.estado === 'A' ? 'Desactivar' : 'Activar'"
      :loading="estadoLoading"
      @confirm="doToggleEstado"
      @cancel="showConfirmEstado = false"
    />

    <!-- ═══ MODAL: Asignar usuario existente ═══ -->
    <BaseModal :open="showAsignar" title="Asignar usuario a este negocio" size="md" @close="showAsignar = false">
      <div class="space-y-3">
        <p class="text-xs text-muted">Busca un usuario existente y asígnalo a este negocio con su rol. El mismo usuario puede tener roles distintos en cada negocio.</p>
        <div class="flex gap-2">
          <input v-model="asignarQ" type="text" class="flex-1 px-3 py-2 input" placeholder="Código, login o nombre de persona…" @keyup.enter="buscarAsignables" />
          <button type="button" class="px-3 py-2 btn btn-secondary text-sm" :disabled="asignarBuscando" @click="buscarAsignables">Buscar</button>
        </div>

        <div v-if="asignarResultados.length" class="space-y-1 max-h-52 overflow-y-auto">
          <label v-for="u in asignarResultados" :key="u.codusr"
            class="flex items-center gap-2 px-3 py-2 rounded border cursor-pointer"
            :class="asignarSel?.codusr === u.codusr ? 'border-[var(--color-accent)] bg-[var(--menu-hover)]' : 'border-base hover:bg-[var(--menu-hover)]'">
            <input type="radio" name="asignarSel" :checked="asignarSel?.codusr === u.codusr" @change="asignarSel = u" />
            <div class="min-w-0">
              <p class="text-sm text-main font-medium">{{ u.codusr }} · {{ u.nombre_usr }}</p>
              <p class="text-xs text-muted truncate">{{ u.persona_nombre ?? '' }} {{ u.persona_apellido ?? '' }}</p>
            </div>
          </label>
        </div>
        <p v-else-if="asignarQ.trim().length >= 2 && !asignarBuscando" class="text-xs text-muted">Sin resultados (o ya están vinculados a este negocio).</p>

        <FormField v-if="asignarSel" label="Rol en este negocio">
          <select v-model="asignarCodrol" class="w-full px-3 py-2 input">
            <option :value="null">— Sin rol —</option>
            <option v-for="r in roles" :key="r.codrol" :value="r.codrol">{{ r.nombre }}</option>
          </select>
        </FormField>
      </div>
      <template #footer>
        <button type="button" class="px-4 py-2 btn btn-secondary text-sm" @click="showAsignar = false">Cancelar</button>
        <button type="button" class="px-4 py-2 btn btn-primary text-sm disabled:opacity-60" :disabled="!asignarSel || asignarLoading" @click="doAsignar">
          {{ asignarLoading ? 'Asignando…' : 'Asignar' }}
        </button>
      </template>
    </BaseModal>

    <!-- Modales de persona -->
    <PersonaSearchModal :open="showPersonaSearch" @select="onPersonaSelected" @close="showPersonaSearch = false" />
    <PersonaCreateModal :open="showPersonaCreate" @created="onPersonaCreated" @close="showPersonaCreate = false" />
  </div>
</template>
