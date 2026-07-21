<script setup lang="ts">
/**
 * Módulo PERSONAS — Gestión central de personas (y sus direcciones).
 * Las personas alimentan usuarios, clientes, proveedores y dueños.
 */
import { computed, onMounted, ref } from 'vue'
import { apiFetch } from '@/utils/api'
import BaseTable, { type Column } from '@/components/shared/BaseTable.vue'
import BaseModal from '@/components/shared/BaseModal.vue'
import FormField from '@/components/shared/FormField.vue'
import LoadingSpinner from '@/components/shared/LoadingSpinner.vue'
import ErrorAlert from '@/components/shared/ErrorAlert.vue'
import EmptyState from '@/components/shared/EmptyState.vue'
import PersonaCreateModal from '@/components/personas/PersonaCreateModal.vue'
import { normalizarTexto } from '@/composables/useCatalogosCache'

type PersonaRow = {
  codper: number
  nombre: string
  apellidos?: string | null
  cedula?: string | null
  email?: string | null
  telefono?: string | null
  direccion?: string | null
  codsex?: string | null
  fecnac?: string | null
}

const loading = ref(false)
const error = ref<string | null>(null)
const okMsg = ref<string | null>(null)
const personas = ref<PersonaRow[]>([])
const busqueda = ref('')

const cols: Column[] = [
  { key: 'codper', label: '#', width: '60px' },
  { key: 'nombre', label: 'Nombre' },
  { key: 'cedula', label: 'Cédula', width: '130px' },
  { key: 'email', label: 'Email' },
  { key: 'telefono', label: 'Teléfono', width: '120px' },
  { key: 'direccion', label: 'Dirección' },
  { key: 'actions', label: '', width: '90px', align: 'center' },
]

const personasFiltradas = computed(() => {
  const q = normalizarTexto(busqueda.value.trim())
  if (!q) return personas.value
  return personas.value.filter(p =>
    [p.nombre, p.apellidos, p.cedula, p.email, p.telefono, p.direccion]
      .some(v => normalizarTexto(v).includes(q)),
  )
})

async function loadPersonas() {
  loading.value = true; error.value = null
  try { personas.value = await apiFetch<PersonaRow[]>('personas') }
  catch (e: any) { error.value = e?.message ?? 'Error cargando personas' }
  finally { loading.value = false }
}

/* ── Crear (reutiliza el modal existente) ── */
const showCreate = ref(false)
function onCreated() {
  showCreate.value = false
  okMsg.value = 'Persona registrada.'
  void loadPersonas()
}

/* ── Editar ── */
const showEdit = ref(false)
const editLoading = ref(false)
const editTarget = ref<PersonaRow | null>(null)
const eNombre = ref(''); const eApellido = ref(''); const eCedula = ref('')
const eEmail = ref(''); const eTelefono = ref(''); const eDireccion = ref('')

function openEdit(p: PersonaRow) {
  editTarget.value = p
  eNombre.value = p.nombre ?? ''
  eApellido.value = p.apellidos ?? ''
  eCedula.value = p.cedula ?? ''
  eEmail.value = p.email ?? ''
  eTelefono.value = p.telefono ?? ''
  eDireccion.value = p.direccion ?? ''
  showEdit.value = true
}

async function saveEdit() {
  if (!editTarget.value) return
  if (!eNombre.value.trim()) { error.value = 'El nombre es requerido'; return }
  editLoading.value = true; error.value = null
  try {
    await apiFetch(`personas/${editTarget.value.codper}`, {
      method: 'PATCH',
      body: JSON.stringify({
        nombre: eNombre.value.trim(),
        apellido: eApellido.value.trim() || null,
        cedula: eCedula.value.trim() || null,
        email: eEmail.value.trim() || null,
        telefono: eTelefono.value.trim() || null,
        direccion: eDireccion.value.trim() || null,
      }),
    })
    showEdit.value = false
    okMsg.value = 'Persona actualizada.'
    await loadPersonas()
  } catch (e: any) { error.value = e?.message ?? 'Error actualizando persona' }
  finally { editLoading.value = false }
}

onMounted(loadPersonas)
</script>

<template>
  <div class="space-y-4">
    <div class="card p-4">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 class="text-lg font-semibold text-main">Personas</h2>
          <p class="text-sm text-muted">Gestión central de personas y sus direcciones (usuarios, clientes, proveedores y dueños se vinculan aquí).</p>
        </div>
        <div class="flex gap-2 items-center">
          <input v-model="busqueda" type="search" class="px-3 py-2 input text-sm w-56" placeholder="Buscar nombre, cédula, email…" />
          <button type="button" class="px-4 py-2 btn btn-primary text-sm" @click="showCreate = true">+ Nueva persona</button>
          <button type="button" class="px-4 py-2 btn btn-secondary text-sm" :disabled="loading" @click="loadPersonas">Recargar</button>
        </div>
      </div>
    </div>

    <ErrorAlert v-if="error" :message="error" @dismiss="error = null" />
    <div v-if="okMsg" class="card p-3 text-sm text-green-700 bg-green-50 border border-green-200 flex items-center justify-between">
      <span>{{ okMsg }}</span>
      <button type="button" class="text-green-700 hover:underline text-xs" @click="okMsg = null">×</button>
    </div>
    <LoadingSpinner v-if="loading" />

    <div v-if="!loading" class="card p-4">
      <BaseTable :columns="cols" :rows="personasFiltradas" row-key="codper" striped>
        <template #cell-nombre="{ row }">
          <span class="font-medium text-main">{{ row.nombre }} {{ row.apellidos ?? '' }}</span>
        </template>
        <template #cell-direccion="{ value }"><span class="text-muted">{{ value || '—' }}</span></template>
        <template #cell-actions="{ row }">
          <button type="button" class="px-3 py-1 btn btn-secondary text-xs" @click="openEdit(row)">Editar</button>
        </template>
        <template #empty><EmptyState title="Sin personas" message="Registra la primera persona." /></template>
      </BaseTable>
    </div>

    <!-- Crear -->
    <PersonaCreateModal :open="showCreate" @created="onCreated" @close="showCreate = false" />

    <!-- Editar -->
    <BaseModal :open="showEdit" :title="`Editar persona #${editTarget?.codper ?? ''}`" size="md" @close="showEdit = false">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label="Nombre" required>
          <input v-model="eNombre" type="text" class="w-full px-3 py-2 input" />
        </FormField>
        <FormField label="Apellidos">
          <input v-model="eApellido" type="text" class="w-full px-3 py-2 input" />
        </FormField>
        <FormField label="Cédula">
          <input v-model="eCedula" type="text" class="w-full px-3 py-2 input" />
        </FormField>
        <FormField label="Email">
          <input v-model="eEmail" type="email" class="w-full px-3 py-2 input" />
        </FormField>
        <FormField label="Teléfono">
          <input v-model="eTelefono" type="text" class="w-full px-3 py-2 input" />
        </FormField>
        <FormField label="Dirección">
          <input v-model="eDireccion" type="text" class="w-full px-3 py-2 input" placeholder="Calle, número, sector…" />
        </FormField>
      </div>
      <template #footer>
        <button type="button" class="px-4 py-2 btn btn-secondary text-sm" @click="showEdit = false">Cancelar</button>
        <button type="button" class="px-4 py-2 btn btn-primary text-sm disabled:opacity-60" :disabled="editLoading" @click="saveEdit">
          {{ editLoading ? 'Guardando…' : 'Guardar' }}
        </button>
      </template>
    </BaseModal>
  </div>
</template>
