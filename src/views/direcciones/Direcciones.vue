<script setup lang="ts">
/**
 * Módulo DIRECCIONES — CRUD del catálogo de direcciones.
 * Los negocios (y a futuro otras entidades) se vinculan por coddir.
 */
import { computed, onMounted, ref } from 'vue'
import { apiFetch } from '@/utils/api'
import BaseTable, { type Column } from '@/components/shared/BaseTable.vue'
import BaseModal from '@/components/shared/BaseModal.vue'
import FormField from '@/components/shared/FormField.vue'
import LoadingSpinner from '@/components/shared/LoadingSpinner.vue'
import ErrorAlert from '@/components/shared/ErrorAlert.vue'
import EmptyState from '@/components/shared/EmptyState.vue'
import DireccionCreateModal from '@/components/direcciones/DireccionCreateModal.vue'
import type { DireccionRow } from '@/components/direcciones/DireccionSearchModal.vue'
import { normalizarTexto } from '@/composables/useCatalogosCache'

const loading = ref(false)
const error = ref<string | null>(null)
const okMsg = ref<string | null>(null)
const direcciones = ref<DireccionRow[]>([])
const busqueda = ref('')

const cols: Column[] = [
  { key: 'coddir', label: '#', width: '60px' },
  { key: 'direccion', label: 'Dirección' },
  { key: 'sector', label: 'Sector', width: '150px' },
  { key: 'ciudad', label: 'Ciudad', width: '150px' },
  { key: 'referencia', label: 'Referencia' },
  { key: 'actions', label: '', width: '90px', align: 'center' },
]

const direccionesFiltradas = computed(() => {
  const q = normalizarTexto(busqueda.value.trim())
  if (!q) return direcciones.value
  return direcciones.value.filter(d =>
    [d.direccion, d.sector, d.ciudad, d.referencia].some(v => normalizarTexto(v).includes(q)),
  )
})

async function loadDirecciones() {
  loading.value = true; error.value = null
  try { direcciones.value = await apiFetch<DireccionRow[]>('direcciones') }
  catch (e: any) { error.value = e?.message ?? 'Error cargando direcciones' }
  finally { loading.value = false }
}

/* ── Crear (reutiliza el modal del selector) ── */
const showCreate = ref(false)
function onCreated() {
  showCreate.value = false
  okMsg.value = 'Dirección registrada.'
  void loadDirecciones()
}

/* ── Editar ── */
const showEdit = ref(false)
const editLoading = ref(false)
const editTarget = ref<DireccionRow | null>(null)
const eDireccion = ref(''); const eSector = ref(''); const eCiudad = ref(''); const eReferencia = ref('')

function openEdit(d: DireccionRow) {
  editTarget.value = d
  eDireccion.value = d.direccion ?? ''
  eSector.value = d.sector ?? ''
  eCiudad.value = d.ciudad ?? ''
  eReferencia.value = d.referencia ?? ''
  showEdit.value = true
}

async function saveEdit() {
  if (!editTarget.value) return
  if (!eDireccion.value.trim()) { error.value = 'La dirección es requerida'; return }
  editLoading.value = true; error.value = null
  try {
    await apiFetch(`direcciones/${editTarget.value.coddir}`, {
      method: 'PATCH',
      body: JSON.stringify({
        direccion: eDireccion.value.trim(),
        sector: eSector.value.trim() || null,
        ciudad: eCiudad.value.trim() || null,
        referencia: eReferencia.value.trim() || null,
      }),
    })
    showEdit.value = false
    okMsg.value = 'Dirección actualizada.'
    await loadDirecciones()
  } catch (e: any) { error.value = e?.message ?? 'Error actualizando dirección' }
  finally { editLoading.value = false }
}

/* ── Inactivar ── */
async function inactivar(d: DireccionRow) {
  if (!window.confirm(`¿Inactivar la dirección "${d.direccion}"?`)) return
  error.value = null
  try {
    await apiFetch(`direcciones/${d.coddir}`, { method: 'PATCH', body: JSON.stringify({ estado: 'I' }) })
    okMsg.value = 'Dirección inactivada.'
    await loadDirecciones()
  } catch (e: any) { error.value = e?.message ?? 'Error inactivando dirección' }
}

onMounted(loadDirecciones)
</script>

<template>
  <div class="space-y-4">
    <div class="card p-4">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 class="text-lg font-semibold text-main">Direcciones</h2>
          <p class="text-sm text-muted">Catálogo de direcciones reutilizables (negocios y más).</p>
        </div>
        <div class="flex gap-2 items-center">
          <input v-model="busqueda" type="search" class="px-3 py-2 input text-sm w-56" placeholder="Buscar dirección, sector…" />
          <button type="button" class="px-4 py-2 btn btn-primary text-sm" @click="showCreate = true">+ Nueva dirección</button>
          <button type="button" class="px-4 py-2 btn btn-secondary text-sm" :disabled="loading" @click="loadDirecciones">Recargar</button>
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
      <BaseTable :columns="cols" :rows="direccionesFiltradas" row-key="coddir" striped>
        <template #cell-direccion="{ value }"><span class="font-medium text-main">{{ value }}</span></template>
        <template #cell-referencia="{ value }"><span class="text-muted">{{ value || '—' }}</span></template>
        <template #cell-actions="{ row }">
          <div class="flex gap-1 justify-center">
            <button type="button" class="px-2.5 py-1 btn btn-secondary text-xs" @click="openEdit(row)">Editar</button>
            <button type="button" class="px-2.5 py-1 btn text-xs bg-red-100 text-red-700 hover:bg-red-200" @click="inactivar(row)">✕</button>
          </div>
        </template>
        <template #empty><EmptyState title="Sin direcciones" message="Registra la primera dirección." /></template>
      </BaseTable>
    </div>

    <!-- Crear -->
    <DireccionCreateModal :open="showCreate" @created="onCreated" @close="showCreate = false" />

    <!-- Editar -->
    <BaseModal :open="showEdit" :title="`Editar dirección #${editTarget?.coddir ?? ''}`" size="md" @close="showEdit = false">
      <div class="space-y-3">
        <FormField label="Dirección (calle y número)" required>
          <input v-model="eDireccion" type="text" class="w-full px-3 py-2 input" />
        </FormField>
        <div class="grid grid-cols-2 gap-3">
          <FormField label="Sector">
            <input v-model="eSector" type="text" class="w-full px-3 py-2 input" />
          </FormField>
          <FormField label="Ciudad">
            <input v-model="eCiudad" type="text" class="w-full px-3 py-2 input" />
          </FormField>
        </div>
        <FormField label="Referencia">
          <input v-model="eReferencia" type="text" class="w-full px-3 py-2 input" />
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
