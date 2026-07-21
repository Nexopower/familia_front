<script setup lang="ts">
/**
 * DefaultLayout — Barra superior con navegación + selector de negocio + logout.
 * Envuelve <router-view> debajo.
 *
 * Selector de negocio:
 *  - Dropdown propio con vista general, check del activo y corona de dueño.
 *  - Al cambiar de negocio se PERMANECE en la pantalla actual si el módulo
 *    sigue visible en el nuevo negocio; si no, se navega al inicio.
 *  - Deseleccionar (vista general) emite un token sin negocio y lleva al inicio.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Menu from '@/components/Menu/Menu.vue'
import { useSession } from '@/utils/session'
import type { NegocioUI } from '@/types'
import { logout, setNegocios, switchNegocio } from '@/utils/auth'
import { apiFetch } from '@/utils/api'
import { fetchVisibleModuleKeys, setCachedVisibleModuleKeys } from '@/utils/rbac'

const router = useRouter()
const route = useRoute()
const { user, negocios, refresh } = useSession()

const codneg = computed(() => user.value?.codneg)
const isAdmin = computed(() => Boolean(user.value?.isAdmin || user.value?.codusr === 'admin'))
const canSwitchNegocio = computed(() => {
  const u = user.value
  return Boolean(u?.isAdmin || u?.esdueno || u?.loginmulti)
})
const hasSelectedNegocio = computed(() => {
  const n = Number(user.value?.codneg)
  return Number.isFinite(n) && n > 0
})
const shouldShowNegocioSelector = computed(() => {
  if (!canSwitchNegocio.value) return false
  return negociosVisible.value.length > 0 || !hasSelectedNegocio.value || loadingNegocios.value
})

const negociosVisible = ref<NegocioUI[]>([])
const loadingNegocios = ref(false)
const switchLoading = ref(false)
const switchError = ref<string | null>(null)

const negocioActual = computed(() =>
  negociosVisible.value.find(n => Number(n.codneg) === Number(codneg.value)) ?? null,
)
const selectorLabel = computed(() => {
  if (switchLoading.value) return 'Cambiando…'
  return negocioActual.value?.nombre ?? 'Vista general'
})

/* ── Dropdown ── */
const ddOpen = ref(false)
const ddRef = ref<HTMLElement | null>(null)

function onDocClick(ev: MouseEvent) {
  if (ddOpen.value && ddRef.value && !ddRef.value.contains(ev.target as Node))
    ddOpen.value = false
}

async function loadNegociosIfNeeded() {
  if (!canSwitchNegocio.value) {
    negociosVisible.value = []
    return
  }

  // Mostrar de inmediato lo que haya en sesión (sin parpadeo)…
  if (negocios.value.length > 0)
    negociosVisible.value = negocios.value as NegocioUI[]

  // …pero SIEMPRE refrescar del servidor: la BD puede haber cambiado
  // después del login (negocios creados, eliminados o recreados).
  loadingNegocios.value = negociosVisible.value.length === 0
  try {
    const rows = await apiFetch<NegocioUI[]>('auth/mis-negocios')
    const frescos = Array.isArray(rows) ? rows : []
    negociosVisible.value = frescos
    setNegocios(frescos as any) // sincroniza la sesión (no notifica si no cambió)

    // Si el negocio seleccionado ya no existe, volver a la vista general.
    const cur = Number(codneg.value)
    if (Number.isFinite(cur) && cur > 0 && !frescos.some(n => Number(n.codneg) === cur))
      await selectNegocio(null)
  } catch {
    // Sin conexión: se mantiene lo que haya en sesión.
  } finally {
    loadingNegocios.value = false
  }
}

function clearRbacCache() {
  Object.keys(localStorage)
    .filter(k => k.startsWith('rbac:'))
    .forEach(k => localStorage.removeItem(k))
}

async function selectNegocio(target: number | null) {
  ddOpen.value = false
  const current = Number(codneg.value)
  const same = target === null
    ? !hasSelectedNegocio.value
    : Number.isFinite(current) && current === Number(target)
  if (same) return

  switchLoading.value = true; switchError.value = null
  try {
    await switchNegocio(target)
    clearRbacCache()
    refresh()

    if (target === null) {
      // Vista general: las pantallas de módulo requieren negocio → al inicio.
      router.push('/')
      return
    }

    // ¿Podemos quedarnos en la pantalla actual con el nuevo negocio?
    const moduleKey = route.meta.moduleKey as string | undefined
    if (!moduleKey || isAdmin.value) return // sin módulo o admin: la vista recarga sola

    try {
      const visible = await fetchVisibleModuleKeys(Number(target))
      const codusr = user.value?.codusr
      if (codusr) setCachedVisibleModuleKeys(codusr, Number(target), visible)
      if (!visible.has(moduleKey)) router.push('/')
    } catch {
      router.push('/')
    }
  } catch (e: any) {
    switchError.value = e?.message ?? 'Error al cambiar negocio'
  } finally {
    switchLoading.value = false
  }
}

async function onLogout() { await logout() }

function toggleDropdown() {
  ddOpen.value = !ddOpen.value
  // Al abrir, refresca la lista en segundo plano (siempre al día con la BD).
  if (ddOpen.value) void loadNegociosIfNeeded()
}

onMounted(() => {
  loadNegociosIfNeeded()
  document.addEventListener('click', onDocClick)
})
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
watch(canSwitchNegocio, () => { void loadNegociosIfNeeded() })
</script>

<template>
  <div class="min-h-screen bg-app">
    <!-- ═══ Barra superior con controles ═══ -->
    <header class="bg-gray-900 sticky top-0 z-40">
      <!-- Fila superior: logo + selector + logout -->
      <div class="max-w-screen-xl mx-auto px-4 flex items-center justify-between h-10">
        <!-- Logo / brand -->
        <router-link to="/" class="font-bold text-lg text-white shrink-0">Familia</router-link>

        <!-- Right side -->
        <div class="flex items-center gap-3 shrink-0">
          <!-- Selector de negocio (dropdown propio) -->
          <div v-if="shouldShowNegocioSelector" ref="ddRef" class="relative">
            <button
              type="button"
              class="flex items-center gap-2 px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-white border border-gray-600 rounded max-w-[220px] transition-colors disabled:opacity-60"
              :disabled="switchLoading || loadingNegocios"
              @click.stop="toggleDropdown"
            >
              <span class="text-sm leading-none">{{ hasSelectedNegocio ? '🏪' : '🌐' }}</span>
              <span class="truncate">{{ selectorLabel }}</span>
              <span class="text-gray-400 text-[10px]">{{ ddOpen ? '▲' : '▼' }}</span>
            </button>

            <div
              v-if="ddOpen"
              class="absolute right-0 mt-1 w-64 bg-gray-800 border border-gray-600 rounded-md shadow-xl z-50 py-1 max-h-80 overflow-y-auto"
            >
              <!-- Vista general -->
              <button
                type="button"
                class="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-white hover:bg-gray-700"
                @click="selectNegocio(null)"
              >
                <span>🌐</span>
                <span class="flex-1">Vista general <span class="text-gray-400">(sin negocio)</span></span>
                <span v-if="!hasSelectedNegocio" class="text-green-400">✓</span>
              </button>

              <div class="border-t border-gray-700 my-1" />
              <p class="px-3 py-1 text-[10px] uppercase tracking-wider text-gray-400">Mis negocios</p>

              <button
                v-for="n in negociosVisible"
                :key="n.codneg"
                type="button"
                class="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-white hover:bg-gray-700"
                @click="selectNegocio(Number(n.codneg))"
              >
                <span>🏪</span>
                <span class="flex-1 truncate">{{ n.nombre }}<span v-if="n.esdueno" title="Eres dueño"> 👑</span></span>
                <span v-if="Number(n.codneg) === Number(codneg)" class="text-green-400">✓</span>
              </button>
            </div>
          </div>

          <!-- User info -->
          <span class="text-xs text-gray-300 hidden sm:inline truncate max-w-[120px]">{{ user?.nombre ?? user?.codusr }}</span>

          <!-- Logout -->
          <button type="button" class="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded transition-colors" @click="onLogout">Salir</button>
        </div>
      </div>

      <!-- Barra de menú -->
      <Menu />

      <!-- Switch error -->
      <div v-if="switchError" class="bg-red-600 text-white text-xs text-center py-1 px-2">{{ switchError }}</div>
    </header>

    <!-- ═══ Content ═══ -->
    <main class="max-w-screen-xl mx-auto px-4 py-6">
      <router-view />
    </main>
  </div>
</template>

<style scoped>
.hide-scrollbar::-webkit-scrollbar { display: none; }
.hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
</style>
