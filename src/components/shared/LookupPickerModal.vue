<script setup lang="ts">
import { ref, watch } from 'vue'

import BaseModal from '@/components/shared/BaseModal.vue'
import LoadingSpinner from '@/components/shared/LoadingSpinner.vue'
import { apiFetch } from '@/utils/api'
import type { LookupRow, LookupResponse } from '@/types'

const props = withDefaults(defineProps<{
  open: boolean
  title: string
  endpoint: string
  endpointBuild?: (query: string) => string
  searchParam?: string
  codeField?: string
  labelField?: string
  placeholder?: string
  emptyText?: string
  helpText?: string
  minChars?: number
  size?: 'sm' | 'md' | 'lg' | 'xl'
  autoSearchOnOpen?: boolean
}>(), {
  searchParam: 'q',
  codeField: 'codigo',
  labelField: 'nombre',
  placeholder: 'Buscar...',
  emptyText: 'Sin resultados.',
  helpText: 'Doble clic para seleccionar.',
  minChars: 0,
  size: 'lg',
  autoSearchOnOpen: true,
})

const emit = defineEmits<{
  close: []
  selected: [LookupRow]
}>()

const query = ref('')
const loading = ref(false)
const rows = ref<LookupRow[]>([])
const localError = ref<string | null>(null)

function normalizeRows(payload: LookupResponse): LookupRow[] {
  const source = Array.isArray(payload) ? payload : []
  return source
    .map((item) => {
      const codigo = item?.[props.codeField]
      const nombre = item?.[props.labelField]
      if (codigo == null || nombre == null)
        return null

      return {
        codigo,
        nombre: String(nombre),
        raw: item,
      }
    })
    .filter((item): item is LookupRow => item !== null)
}

function buildEndpoint(): string {
  if (props.endpointBuild)
    return props.endpointBuild(query.value.trim())

  const q = query.value.trim()
  const separator = props.endpoint.includes('?') ? '&' : '?'
  return `${props.endpoint}${separator}${props.searchParam}=${encodeURIComponent(q)}`
}

async function search() {
  const value = query.value.trim()
  localError.value = null

  if (value.length < props.minChars) {
    rows.value = []
    return
  }

  loading.value = true
  try {
    const payload = await apiFetch<LookupResponse>(buildEndpoint())
    rows.value = normalizeRows(payload)
  } catch (e: any) {
    rows.value = []
    localError.value = e?.message ?? 'Error buscando registros'
  } finally {
    loading.value = false
  }
}

function selectRow(row: LookupRow) {
  emit('selected', row)
}

watch(() => props.open, async (isOpen) => {
  if (!isOpen)
    return

  query.value = ''
  rows.value = []
  localError.value = null

  if (props.autoSearchOnOpen)
    await search()
})
</script>

<template>
  <BaseModal :open="open" :title="title" :size="size" @close="emit('close')">
    <div class="space-y-3">
      <div class="flex gap-2">
        <input
          v-model="query"
          type="search"
          class="input w-full px-3 py-2"
          :placeholder="placeholder"
          @keydown.enter.prevent="search"
        />
        <button
          type="button"
          class="btn btn-primary px-4 py-2 text-sm"
          :disabled="loading"
          @click="search"
        >
          {{ loading ? 'Buscando…' : 'Buscar' }}
        </button>
      </div>

      <div v-if="localError" class="text-sm text-red-600">
        {{ localError }}
      </div>

      <div v-if="loading" class="py-4">
        <LoadingSpinner size="sm" />
      </div>

      <div v-else class="max-h-80 overflow-auto border rounded" style="border-color: var(--color-border)">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b" style="border-color: var(--color-border)">
              <th class="text-left px-3 py-2 text-muted">Código</th>
              <th class="text-left px-3 py-2 text-muted">Nombre</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="item in rows"
              :key="String(item.codigo)"
              class="border-b cursor-pointer hover:bg-[var(--color-bg-hover)]"
              style="border-color: var(--color-border)"
              @dblclick="selectRow(item)"
            >
              <td class="px-3 py-2">{{ item.codigo }}</td>
              <td class="px-3 py-2">{{ item.nombre }}</td>
            </tr>
            <tr v-if="rows.length === 0">
              <td colspan="2" class="px-3 py-6 text-center text-muted">{{ emptyText }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p class="text-xs text-muted">{{ helpText }}</p>
    </div>
  </BaseModal>
</template>
