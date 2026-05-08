<script setup lang="ts">
withDefaults(defineProps<{
  icon?: string
  title?: string
  message?: string
}>(), {
  icon: '📭',
  title: 'Sin datos',
  message: 'No hay registros para mostrar.',
})
</script>

<template>
  <div class="flex flex-col items-center justify-center py-12 gap-2 text-center">
    <span class="text-4xl">{{ icon }}</span>
    <h4 class="text-sm font-medium text-main">{{ title }}</h4>
    <p class="text-xs text-muted max-w-xs">{{ message }}</p>
    <slot />
  </div>
</template>
