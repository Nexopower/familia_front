<script setup lang="ts">
/**
 * DireccionSearchModal — Buscar y seleccionar una dirección existente.
 */
import { ref, watch } from 'vue'
import { apiFetch } from '@/utils/api'
import BaseModal from '@/components/shared/BaseModal.vue'
import LoadingSpinner from '@/components/shared/LoadingSpinner.vue'
import ErrorAlert from '@/components/shared/ErrorAlert.vue'

export interface DireccionRow {
  coddir: number
  direccion: string
  sector?: string | null
  ciudad?: string | null
  referencia?: string | null
}

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  (e: 'select', dir: DireccionRow): void
  (e: 'close'): void
}>()

const searchTerm = ref('')
const results = ref<DireccionRow[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

async function search() {
  const term = searchTerm.value.trim()
  if (!term || term.length < 2) { results.value = []; return }
  error.value = null
  loading.value = true
  try {
    results.value = await apiFetch<DireccionRow[]>(`direcciones/buscar?q=${encodeURIComponent(term)}`)
  } catch (e: any) {
    error.value = e?.message ?? 'Error buscando direcciones'
    results.value = []
  } finally {
    loading.value = false
  }
}

let timeout: ReturnType<typeof setTimeout>
watch(searchTerm, () => {
  clearTimeout(timeout)
  timeout = setTimeout(search, 300)
})

watch(() => props.open, (val) => {
  if (val) { searchTerm.value = ''; results.value = []; error.value = null }
})
</script>

<template>
  <BaseModal :open="open" title="Buscar dirección" size="md" @close="emit('close')">
    <div class="space-y-3">
      <input
        v-model="searchTerm"
        type="search"
        class="w-full px-3 py-2 input"
        placeholder="Calle, sector, ciudad o referencia…"
        autocomplete="off"
      />

      <ErrorAlert v-if="error" :message="error" @dismiss="error = null" />
      <LoadingSpinner v-if="loading" size="sm" />

      <div v-if="!loading && results.length" class="space-y-1 max-h-64 overflow-y-auto">
        <button
          v-for="d in results"
          :key="d.coddir"
          type="button"
          class="w-full text-left px-3 py-2 rounded border border-base hover:bg-[var(--menu-hover)]"
          @click="emit('select', d)"
        >
          <p class="text-sm text-main font-medium">{{ d.direccion }}</p>
          <p class="text-xs text-muted">{{ [d.sector, d.ciudad].filter(Boolean).join(', ') || '—' }}<span v-if="d.referencia"> · {{ d.referencia }}</span></p>
        </button>
      </div>
      <p v-else-if="!loading && searchTerm.trim().length >= 2" class="text-xs text-muted">Sin resultados. Puedes crear una dirección nueva.</p>
    </div>
    <template #footer>
      <button type="button" class="px-4 py-2 btn btn-secondary text-sm" @click="emit('close')">Cerrar</button>
    </template>
  </BaseModal>
</template>
