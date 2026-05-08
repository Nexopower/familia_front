<script setup lang="ts">
withDefaults(defineProps<{
  message?: string
  dismissible?: boolean
}>(), {
  message: 'Ha ocurrido un error.',
  dismissible: true,
})

const emit = defineEmits<{ (e: 'dismiss'): void }>()
</script>

<template>
  <div
    v-if="message"
    class="flex items-start gap-3 px-4 py-3 text-sm rounded-md border bg-red-50 border-red-200 text-red-800"
  >
    <svg class="w-5 h-5 shrink-0 mt-0.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
    <span class="flex-1">{{ message }}</span>
    <button
      v-if="dismissible"
      type="button"
      class="shrink-0 text-red-500 hover:text-red-700"
      @click="emit('dismiss')"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  </div>
</template>
