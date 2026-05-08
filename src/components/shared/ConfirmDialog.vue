<script setup lang="ts">
import BaseModal from './BaseModal.vue'

const props = withDefaults(defineProps<{
  open: boolean
  title?: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning' | 'primary'
  loading?: boolean
}>(), {
  title: 'Confirmar acción',
  message: '¿Estás seguro de continuar?',
  confirmLabel: 'Confirmar',
  cancelLabel: 'Cancelar',
  variant: 'primary',
  loading: false,
})

const emit = defineEmits<{
  (e: 'confirm'): void
  (e: 'cancel'): void
}>()

function variantClass() {
  if (props.variant === 'danger')
    return 'bg-red-600 hover:bg-red-700 text-white'
  if (props.variant === 'warning')
    return 'bg-yellow-500 hover:bg-yellow-600 text-black'
  return 'btn-primary'
}
</script>

<template>
  <BaseModal :open="open" :title="title" size="sm" @close="emit('cancel')">
    <p class="text-sm text-main">{{ message }}</p>

    <template #footer>
      <button
        type="button"
        class="px-4 py-2 btn btn-secondary text-sm"
        :disabled="loading"
        @click="emit('cancel')"
      >
        {{ cancelLabel }}
      </button>
      <button
        type="button"
        :class="['px-4 py-2 btn text-sm disabled:opacity-60', variantClass()]"
        :disabled="loading"
        @click="emit('confirm')"
      >
        {{ loading ? 'Procesando…' : confirmLabel }}
      </button>
    </template>
  </BaseModal>
</template>
