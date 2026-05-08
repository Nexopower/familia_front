<script setup lang="ts">
const props = defineProps({
  to: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  label: {
    type: String,
    required: true
  },
  imagen: {
    type: String,
    required: true
  },
  hasimagen: {
    type: Boolean,
    default: false
  }
})
</script>

<template>
  <router-link
    :to="to"
    class="flex items-center px-3 py-2 text-sm font-medium text-white rounded-md hover:bg-gray-600 transition-colors"
  >
    <img v-if="hasimagen" :src="`/img/${imagen}.png`" alt="" class="w-6 h-6 mr-3" />
    <span :class="`${hasimagen ? '' : 'pl-9'}`">{{ label }}</span>
  </router-link>
</template>
