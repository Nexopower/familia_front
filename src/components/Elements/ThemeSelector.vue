<script setup lang="ts">
/**
 * ThemeSelector — Permite cambiar el tema de la aplicación.
 * Mantiene el funcionamiento del tema por usuario vía localStorage.
 */
import { ref, onMounted } from 'vue'
import {
  THEME_OPTIONS,
  getActiveTheme,
  setThemeForCurrentUser,
  type ThemeName,
  type ThemeOption,
} from '@/utils/theme'

const current = ref<ThemeName>(getActiveTheme())

// Agrupar opciones por grupo
const groups = (() => {
  const map = new Map<string, ThemeOption[]>()
  for (const t of THEME_OPTIONS) {
    const list = map.get(t.group) ?? []
    list.push(t)
    map.set(t.group, list)
  }
  return Array.from(map.entries())
})()

function apply(name: ThemeName) {
  current.value = name
  setThemeForCurrentUser(name)
}

onMounted(() => {
  current.value = getActiveTheme()
})
</script>

<template>
  <div class="space-y-3">
    <div v-for="[group, themes] in groups" :key="group">
      <h4 class="text-xs font-semibold text-muted uppercase tracking-wider mb-1">{{ group }}</h4>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="t in themes"
          :key="t.name"
          type="button"
          :class="[
            'px-3 py-1.5 rounded-md text-xs font-medium border transition',
            current === t.name
              ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]'
              : 'border-base text-muted hover:border-[var(--primary)] hover:text-main',
          ]"
          @click="apply(t.name)"
        >
          {{ t.label }}
        </button>
      </div>
    </div>
  </div>
</template>
