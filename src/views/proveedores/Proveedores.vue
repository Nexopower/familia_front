<script setup lang="ts">
/**
 * Módulo PROVEEDORES — Gestión de proveedores del negocio actual.
 * Un proveedor puede ser una EMPRESA (nombre propio) o estar vinculado a una persona.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { apiFetch } from '@/utils/api'
import { useSession } from '@/utils/session'
import BaseTable, { type Column } from '@/components/shared/BaseTable.vue'
import BaseModal from '@/components/shared/BaseModal.vue'
import FormField from '@/components/shared/FormField.vue'
import LoadingSpinner from '@/components/shared/LoadingSpinner.vue'
import ErrorAlert from '@/components/shared/ErrorAlert.vue'
import EmptyState from '@/components/shared/EmptyState.vue'
import StatusBadge from '@/components/shared/StatusBadge.vue'
import PersonaSearchModal from '@/components/personas/PersonaSearchModal.vue'
import PersonaCreateModal from '@/components/personas/PersonaCreateModal.vue'
import { normalizarTexto, useProveedoresCache } from '@/composables/useCatalogosCache'

type ProveedorRow = {
  codpro: number
  codper?: number | null
  estado: 'A' | 'I'
  nombre: string
  apellidos?: string | null
  email?: string | null
  telefono?: string | null
  cedula?: string | null
  nota?: string | null
  tiene_persona?: boolean
}

const { user } = useSession()
const codneg = computed(() => { const v = Number(user.value?.codneg); return Number.isFinite(v) && v > 0 ? v : null })
const proveedoresCache = useProveedoresCache()

const loading = ref(false)
const error = ref<string | null>(null)
const okMsg = ref<string | null>(null)
const proveedores = ref<ProveedorRow[]>([])
const busqueda = ref('')

const cols: Column[] = [
  { key: 'codpro', label: '#', width: '60px' },
  { key: 'nombre', label: 'Proveedor' },
  { key: 'telefono', label: 'Teléfono', width: '120px' },
  { key: 'nota', label: 'Nota' },
  { key: 'tiene_persona', label: 'Tipo', width: '110px', align: 'center' },
  { key: 'estado', label: 'Estado', width: '90px', align: 'center' },
  { key: 'actions', label: '', width: '160px', align: 'center' },
]

const proveedoresFiltrados = computed(() => {
  const q = normalizarTexto(busqueda.value.trim())
  if (!q) return proveedores.value
  return proveedores.value.filter(p =>
    [p.nombre, p.apellidos, p.telefono, p.nota, p.cedula].some(v => normalizarTexto(v).includes(q)),
  )
})

async function loadProveedores() {
  if (!codneg.value) return
  loading.value = true; error.value = null
  try { proveedores.value = await apiFetch<ProveedorRow[]>(`proveedores/todos?codneg=${codneg.value}`) }
  catch (e: any) { error.value = e?.message ?? 'Error cargando proveedores' }
  finally { loading.value = false }
}

/* ── Crear / editar (modal dual) ── */
const showForm = ref(false)
const formLoading = ref(false)
const editTarget = ref<ProveedorRow | null>(null)
const fNombre = ref('')
const fTelefono = ref('')
const fNota = ref('')
const fPersona = ref<{ codper: number; nombre?: string; apellidos?: string } | null>(null)
const showPersonaSearch = ref(false)
const showPersonaCreate = ref(false)

function openCrear() {
  editTarget.value = null
  fNombre.value = ''; fTelefono.value = ''; fNota.value = ''; fPersona.value = null
  showForm.value = true
}

function openEditar(p: ProveedorRow) {
  editTarget.value = p
  fNombre.value = p.tiene_persona ? '' : (p.nombre ?? '')
  fTelefono.value = p.telefono ?? ''
  fNota.value = p.nota ?? ''
  fPersona.value = p.codper ? { codper: p.codper, nombre: p.nombre, apellidos: p.apellidos ?? undefined } : null
  showForm.value = true
}

function onPersonaElegida(persona: any) {
  showPersonaSearch.value = false
  showPersonaCreate.value = false
  if (persona?.codper) fPersona.value = persona
}

async function guardarProveedor() {
  if (!codneg.value) return
  if (!fPersona.value && !fNombre.value.trim()) {
    error.value = 'Indica el nombre de la empresa o vincula una persona.'
    return
  }
  formLoading.value = true; error.value = null
  try {
    const payload = {
      codneg: codneg.value,
      codper: fPersona.value?.codper ?? null,
      nombre: fNombre.value.trim() || null,
      telefono: fTelefono.value.trim() || null,
      nota: fNota.value.trim() || null,
    }
    if (editTarget.value) {
      await apiFetch(`proveedores/${editTarget.value.codpro}`, { method: 'PATCH', body: JSON.stringify(payload) })
      okMsg.value = 'Proveedor actualizado.'
    } else {
      await apiFetch('proveedores', { method: 'POST', body: JSON.stringify(payload) })
      okMsg.value = 'Proveedor registrado.'
    }
    showForm.value = false
    proveedoresCache.invalidar() // refleja en el buscador de la caja
    await loadProveedores()
  } catch (e: any) { error.value = e?.message ?? 'Error guardando proveedor' }
  finally { formLoading.value = false }
}

async function toggleEstado(p: ProveedorRow) {
  error.value = null
  const nuevo = p.estado === 'A' ? 'I' : 'A'
  try {
    await apiFetch(`proveedores/${p.codpro}`, {
      method: 'PATCH',
      body: JSON.stringify({ codneg: codneg.value, estado: nuevo }),
    })
    okMsg.value = nuevo === 'I' ? 'Proveedor inactivado.' : 'Proveedor reactivado.'
    proveedoresCache.invalidar()
    await loadProveedores()
  } catch (e: any) { error.value = e?.message ?? 'Error cambiando estado' }
}

onMounted(loadProveedores)
watch(codneg, loadProveedores)
</script>

<template>
  <div class="space-y-4">
    <div class="card p-4">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 class="text-lg font-semibold text-main">Proveedores</h2>
          <p class="text-sm text-muted">Empresas o personas a las que compras. No es obligatorio vincular una persona.</p>
        </div>
        <div class="flex gap-2 items-center">
          <input v-model="busqueda" type="search" class="px-3 py-2 input text-sm w-56" placeholder="Buscar proveedor…" />
          <button type="button" class="px-4 py-2 btn btn-primary text-sm" @click="openCrear">+ Nuevo proveedor</button>
        </div>
      </div>
    </div>

    <ErrorAlert v-if="error" :message="error" @dismiss="error = null" />
    <div v-if="okMsg" class="card p-3 text-sm text-green-700 bg-green-50 border border-green-200 flex items-center justify-between">
      <span>{{ okMsg }}</span>
      <button type="button" class="text-green-700 hover:underline text-xs" @click="okMsg = null">×</button>
    </div>
    <LoadingSpinner v-if="loading" />

    <div v-if="!loading && codneg" class="card p-4">
      <BaseTable :columns="cols" :rows="proveedoresFiltrados" row-key="codpro" striped>
        <template #cell-nombre="{ row }">
          <span class="font-medium text-main">{{ row.nombre }} {{ row.apellidos ?? '' }}</span>
        </template>
        <template #cell-nota="{ value }"><span class="text-muted">{{ value || '—' }}</span></template>
        <template #cell-tiene_persona="{ value }">
          <span :class="['inline-flex px-2 py-0.5 rounded text-xs font-medium', value ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700']">
            {{ value ? 'Persona' : 'Empresa' }}
          </span>
        </template>
        <template #cell-estado="{ value }"><StatusBadge :estado="value" /></template>
        <template #cell-actions="{ row }">
          <div class="flex gap-1 justify-center">
            <button type="button" class="px-2.5 py-1 btn btn-secondary text-xs" @click="openEditar(row)">Editar</button>
            <button type="button"
              :class="['px-2.5 py-1 btn text-xs', row.estado === 'A' ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-green-100 text-green-700 hover:bg-green-200']"
              @click="toggleEstado(row)">
              {{ row.estado === 'A' ? 'Inactivar' : 'Reactivar' }}
            </button>
          </div>
        </template>
        <template #empty><EmptyState title="Sin proveedores" message="Registra el primer proveedor." /></template>
      </BaseTable>
    </div>

    <div v-if="!codneg" class="card p-8 text-center">
      <p class="text-lg font-semibold text-main">Selecciona un negocio</p>
      <p class="text-sm text-muted mt-1">Los proveedores se gestionan por negocio.</p>
    </div>

    <!-- ═══ Crear / Editar ═══ -->
    <BaseModal :open="showForm" :title="editTarget ? `Editar proveedor #${editTarget.codpro}` : 'Nuevo proveedor'" size="md" @close="showForm = false">
      <div class="space-y-3">
        <!-- Persona vinculada (opcional) -->
        <div class="p-3 rounded-md border border-base space-y-2">
          <h4 class="text-sm font-semibold text-main">Persona vinculada <span class="text-xs font-normal text-muted">(opcional)</span></h4>
          <div v-if="fPersona" class="flex items-center gap-3 p-2 rounded bg-[var(--card-bg-2)]">
            <span class="flex-1 text-sm text-main">{{ fPersona.nombre }} {{ fPersona.apellidos ?? '' }}</span>
            <button type="button" class="text-xs text-red-600 hover:underline" @click="fPersona = null">Quitar</button>
          </div>
          <div class="flex gap-2">
            <button type="button" class="px-3 py-1.5 btn btn-secondary text-xs" @click="showPersonaSearch = true">Buscar persona</button>
            <button type="button" class="px-3 py-1.5 btn btn-secondary text-xs" @click="showPersonaCreate = true">Crear persona</button>
          </div>
        </div>

        <FormField label="Nombre / Razón social" :hint="fPersona ? 'Opcional: si se deja vacío se usa el nombre de la persona' : 'Requerido para empresas sin persona'">
          <input v-model="fNombre" type="text" class="w-full px-3 py-2 input" placeholder="Distribuidora El Sol, SRL" />
        </FormField>
        <div class="grid grid-cols-2 gap-3">
          <FormField label="Teléfono" hint="Opcional">
            <input v-model="fTelefono" type="text" class="w-full px-3 py-2 input" placeholder="809-555-0000" />
          </FormField>
        </div>
        <FormField label="Nota" hint="Opcional (ej. días de entrega, contacto)">
          <textarea v-model="fNota" rows="2" class="w-full px-3 py-2 input" />
        </FormField>
      </div>
      <template #footer>
        <button type="button" class="px-4 py-2 btn btn-secondary text-sm" @click="showForm = false">Cancelar</button>
        <button type="button" class="px-4 py-2 btn btn-primary text-sm disabled:opacity-60" :disabled="formLoading" @click="guardarProveedor">
          {{ formLoading ? 'Guardando…' : (editTarget ? 'Guardar cambios' : 'Registrar') }}
        </button>
      </template>
    </BaseModal>

    <PersonaSearchModal :open="showPersonaSearch" @select="onPersonaElegida" @close="showPersonaSearch = false" />
    <PersonaCreateModal :open="showPersonaCreate" @created="onPersonaElegida" @close="showPersonaCreate = false" />
  </div>
</template>
