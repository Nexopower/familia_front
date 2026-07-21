<script setup lang="ts">
/**
 * DireccionCreateModal — Registrar una dirección nueva en el catálogo.
 * Emite 'created' con la dirección creada (para seleccionarla al instante).
 */
import { ref, watch } from 'vue'
import { apiFetch } from '@/utils/api'
import BaseModal from '@/components/shared/BaseModal.vue'
import FormField from '@/components/shared/FormField.vue'
import ErrorAlert from '@/components/shared/ErrorAlert.vue'
import type { DireccionRow } from './DireccionSearchModal.vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  (e: 'created', dir: DireccionRow): void
  (e: 'close'): void
}>()

const direccion = ref('')
const sector = ref('')
const ciudad = ref('')
const referencia = ref('')
const loading = ref(false)
const error = ref<string | null>(null)

watch(() => props.open, (val) => {
  if (val) {
    direccion.value = ''; sector.value = ''; ciudad.value = ''; referencia.value = ''
    error.value = null
  }
})

async function onSubmit() {
  error.value = null
  if (!direccion.value.trim()) {
    error.value = 'La dirección (calle y número) es requerida'
    return
  }
  loading.value = true
  try {
    const creada = await apiFetch<DireccionRow>('direcciones', {
      method: 'POST',
      body: JSON.stringify({
        direccion: direccion.value.trim(),
        sector: sector.value.trim() || null,
        ciudad: ciudad.value.trim() || null,
        referencia: referencia.value.trim() || null,
      }),
    })
    emit('created', creada)
    emit('close')
  } catch (e: any) {
    error.value = e?.message ?? 'Error creando dirección'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <BaseModal :open="open" title="Registrar dirección" size="md" @close="emit('close')">
    <div class="space-y-3">
      <ErrorAlert v-if="error" :message="error" @dismiss="error = null" />
      <FormField label="Dirección (calle y número)" required>
        <input v-model="direccion" type="text" class="w-full px-3 py-2 input" placeholder="Calle Principal #12" />
      </FormField>
      <div class="grid grid-cols-2 gap-3">
        <FormField label="Sector" hint="Opcional">
          <input v-model="sector" type="text" class="w-full px-3 py-2 input" placeholder="Los Jardines" />
        </FormField>
        <FormField label="Ciudad" hint="Opcional">
          <input v-model="ciudad" type="text" class="w-full px-3 py-2 input" placeholder="Santiago" />
        </FormField>
      </div>
      <FormField label="Referencia" hint="Opcional">
        <input v-model="referencia" type="text" class="w-full px-3 py-2 input" placeholder="Frente al parque…" />
      </FormField>
    </div>
    <template #footer>
      <button type="button" class="px-4 py-2 btn btn-secondary text-sm" :disabled="loading" @click="emit('close')">Cancelar</button>
      <button type="button" class="px-4 py-2 btn btn-primary text-sm disabled:opacity-60" :disabled="loading" @click="onSubmit">
        {{ loading ? 'Guardando…' : 'Registrar' }}
      </button>
    </template>
  </BaseModal>
</template>
