<script setup lang="ts">
/**
 * PersonaSearchModal — Modal para buscar y seleccionar una persona existente.
 *
 * El usuario busca por nombre/apellido/email, el componente muestra resultados
 * y al seleccionar emite el objeto completo. El código (codper) se usa internamente
 * como FK pero NO se muestra al usuario como campo editable.
 */
import { ref, watch } from 'vue'
import BaseModal from '../shared/BaseModal.vue'
import BaseTable from '../shared/BaseTable.vue'
import LoadingSpinner from '../shared/LoadingSpinner.vue'
import ErrorAlert from '../shared/ErrorAlert.vue'
import { apiFetch } from '@/utils/api'
import type { Persona } from '@/types'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  (e: 'select', persona: Persona): void
  (e: 'close'): void
}>()

const searchTerm = ref('')
const results = ref<Persona[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

const columns = [
  { key: 'nombre', label: 'Nombre' },
  { key: 'apellidos', label: 'Apellido' },
  { key: 'email', label: 'Email' },
  { key: 'telefono', label: 'Teléfono' },
  { key: 'actions', label: '', width: '80px', align: 'center' as const },
]

async function search() {
  const term = searchTerm.value.trim()
  if (!term || term.length < 2) {
    results.value = []
    return
  }

  error.value = null
  loading.value = true
  try {
    results.value = await apiFetch<Persona[]>(
      `personas/buscar?q=${encodeURIComponent(term)}`,
    )
  }
  catch (e: any) {
    error.value = e?.message ?? 'Error buscando personas'
    results.value = []
  }
  finally {
    loading.value = false
  }
}
let timeout: ReturnType<typeof setTimeout>

watch(searchTerm, () => {
  clearTimeout(timeout)

  timeout = setTimeout(() => {
    search()
  }, 300)
})

function selectPersona(persona: Persona) {
  emit('select', persona)
  emit('close')
}

watch(() => props.open, (val) => {
  if (val) {
    searchTerm.value = ''
    results.value = []
    error.value = null
  }
})
</script>

<template>
  <BaseModal :open="open" title="Buscar persona" size="lg" @close="emit('close')">
    <div class="space-y-4">
      <!-- Barra de búsqueda -->
      <div class="flex gap-2">
        <input
          v-model="searchTerm"
          type="text"
          class="flex-1 px-3 py-2 input"
          placeholder="Buscar por nombre, apellido o email…"
          @keydown.enter="search"
        />
        <button
          type="button"
          class="px-4 py-2 btn btn-primary text-sm"
          :disabled="loading || searchTerm.trim().length < 2"
          @click="search"
        >
          Buscar
        </button>
      </div>

      <ErrorAlert v-if="error" :message="error" @dismiss="error = null" />

      <LoadingSpinner v-if="loading" size="sm" text="Buscando…" />

      <!-- Resultados -->
      <BaseTable
        v-if="!loading && results.length > 0"
        :columns="columns"
        :rows="results"
        row-key="codper"
        striped
      >
        <template #cell-actions="{ row }">
          <button
            type="button"
            class="px-3 py-1 btn btn-primary text-xs"
            @click="selectPersona(row)"
          >
            Elegir
          </button>
        </template>
      </BaseTable>

      <p
        v-if="!loading && results.length === 0 && searchTerm.trim().length >= 2"
        class="text-sm text-muted text-center py-4"
      >
        No se encontraron personas. Intenta con otro término.
      </p>
    </div>
  </BaseModal>
</template>
