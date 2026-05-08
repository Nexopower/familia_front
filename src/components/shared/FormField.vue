<script setup lang="ts">
withDefaults(defineProps<{
  label?: string
  required?: boolean
  error?: string | null
  hint?: string | null
}>(), {
  label: '',
  required: false,
  error: null,
  hint: null,
})
</script>

<template>
  <div class="space-y-1">
    <label v-if="label" class="block text-sm font-medium text-main">
      {{ label }}
      <span v-if="required" class="text-red-500">*</span>
    </label>
    <slot />
    <p v-if="hint && !error" class="text-xs text-muted">{{ hint }}</p>
    <p v-if="error" class="text-xs text-red-600">{{ error }}</p>
  </div>
</template>
