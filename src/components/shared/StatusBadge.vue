<script setup lang="ts">
withDefaults(defineProps<{
  estado?: string | null
  activeLabel?: string
  inactiveLabel?: string
}>(), {
  estado: 'A',
  activeLabel: 'Activo',
  inactiveLabel: 'Inactivo',
})
</script>

<template>
  <span
    :class="[
      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
      estado === 'A'
        ? 'bg-green-100 text-green-800'
        : 'bg-red-100 text-red-800',
    ]"
  >
    {{ estado === 'A' ? activeLabel : inactiveLabel }}
  </span>
</template>
