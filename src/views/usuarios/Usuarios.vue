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
 *   codusr, nombre_usr, password, esdueno, loginmulti
 */
import { computed, onMounted, ref, watch } from 'vue'
import { apiFetch } from '@/utils/api'
import { useSession } from '@/utils/session'
import type { AuthzCheckResponse } from '@/types'

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

type UsuarioRow = {
  codusr: string
  nombre_usr: string
  codper?: number | null
  codrol?: number | null
  esdueno?: boolean
  loginmulti?: boolean
  estado?: string | null
  persona_nombre?: string | null
  persona_apellido?: string | null
  rol_nombre?: string | null
}
type RolOption = { codrol: number; nombre: string }
type PersonaRef = { codper: number; nombre: string; apellidos: string; email?: string | null }

const { user } = useSession()
const codneg = computed(() => {
  const v = Number(user.value?.codneg)
  return Number.isFinite(v) && v > 0 ? v : null
})
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

const newCodusr = ref('')
const newNombreUsr = ref('')
const newPassword = ref('')
const newCodrol = ref<number | null>(null)
const newEsdueno = ref(false)
const newLoginmulti = ref(false)
const selectedPersona = ref<PersonaRef | null>(null)

function resetCreateForm() {
  newCodusr.value = ''
  newNombreUsr.value = ''
  newPassword.value = ''
  newCodrol.value = null
  newEsdueno.value = false
  newLoginmulti.value = false
  selectedPersona.value = null
  error.value = null
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
  if (!newCodusr.value.trim()) { error.value = 'Código de usuario requerido'; return }
  if (!newNombreUsr.value.trim()) { error.value = 'Nombre de login requerido'; return }
  if (!newPassword.value) { error.value = 'Contraseña requerida'; return }
  if (!selectedPersona.value) { error.value = 'Debes seleccionar una persona'; return }

  createLoading.value = true
  try {
    await apiFetch(`negocios/${codneg.value}/usuarios`, {
      method: 'POST',
      body: JSON.stringify({
        codusr: newCodusr.value.trim(),
        nombre: newNombreUsr.value.trim(),
        password: newPassword.value,
        codper: selectedPersona.value.codper,
        codrol: newCodrol.value,
      }),
    })
    showCreate.value = false
    resetCreateForm()
    await loadUsuarios()
  } catch (e: any) {
    error.value = e?.message ?? 'Error creando usuario'
  } finally {
    createLoading.value = false
  }
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
          <button type="button" class="px-4 py-2 btn btn-secondary text-sm" :disabled="loading" @click="loadUsuarios">
            Recargar
          </button>
        </div>
      </div>
    </div>

    <ErrorAlert v-if="error" :message="error" @dismiss="error = null" />
    <LoadingSpinner v-if="loading" />

    <!-- Tabla -->
    <div v-if="!loading" class="card p-4">
      <BaseTable :columns="columns" :rows="usuarios" row-key="codusr" striped>
        <template #cell-persona_nombre="{ row }">
          {{ row.persona_nombre ?? '—' }} {{ row.persona_apellido ?? '' }}
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
          <FormField label="Código de usuario" required hint="Máximo 8 caracteres, identificador único">
            <input v-model="newCodusr" type="text" maxlength="8" class="w-full px-3 py-2 input" placeholder="usr001" />
          </FormField>
          <FormField label="Nombre de login" required hint="Nombre con el que iniciará sesión">
            <input v-model="newNombreUsr" type="text" class="w-full px-3 py-2 input" placeholder="juan.perez" />
          </FormField>
          <FormField label="Contraseña" required>
            <input v-model="newPassword" type="password" class="w-full px-3 py-2 input" placeholder="••••••••" />
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

    <!-- Modales de persona -->
    <PersonaSearchModal :open="showPersonaSearch" @select="onPersonaSelected" @close="showPersonaSearch = false" />
    <PersonaCreateModal :open="showPersonaCreate" @created="onPersonaCreated" @close="showPersonaCreate = false" />
  </div>
</template>
