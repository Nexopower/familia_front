<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import DefaultLayout from './layouts/DefaultLayout.vue'
import EmptyLayout from './layouts/EmptyLayout.vue'

const route = useRoute()

const layout = computed(() => {
  return route.meta.layout === 'empty' ? EmptyLayout : DefaultLayout
})
</script>

<template>
  <component :is="layout" />
</template>
