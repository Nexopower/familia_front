<script setup lang="ts">
/**
 * DefaultLayout — Barra superior con navegación + selector de negocio + logout.
 * Envuelve <router-view> debajo.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Menu from '@/components/Menu/Menu.vue'
import { useSession } from '@/utils/session'
import { logout, switchNegocio, patchUser } from '@/utils/auth'
import { apiFetch } from '@/utils/api'

const router = useRouter()
const { user, negocios, refresh } = useSession()

const codneg = computed(() => user.value?.codneg)
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

type NegocioUI = { codneg: string | number; nombre: string; esdueno?: boolean; esprincipal?: boolean }
const negociosVisible = ref<NegocioUI[]>([])
const loadingNegocios = ref(false)
const switchLoading = ref(false)
const switchError = ref<string | null>(null)

async function loadNegociosIfNeeded() {
  if (!canSwitchNegocio.value) {
    negociosVisible.value = []
    return
  }

  if (negocios.value.length > 0) {
    negociosVisible.value = negocios.value as NegocioUI[]
    return
  }

  loadingNegocios.value = true
  try {
    const rows = await apiFetch<NegocioUI[]>('auth/mis-negocios')
    negociosVisible.value = Array.isArray(rows) ? rows : []
  } catch {
    negociosVisible.value = []
  } finally {
    loadingNegocios.value = false
  }
}

async function onSwitchNegocio(ev: Event) {
  const target = ev.target as HTMLSelectElement
  const value = target.value
  if (!value || value === String(codneg.value)) return
  switchLoading.value = true; switchError.value = null
  try {
    await switchNegocio(value)
    // Limpiar cache RBAC
    const keys = Object.keys(localStorage).filter(k => k.startsWith('rbac:'))
    keys.forEach(k => localStorage.removeItem(k))
    refresh()
    router.push('/')
  } catch (e: any) { switchError.value = e?.message ?? 'Error al cambiar negocio' }
  finally { switchLoading.value = false }
}

async function onLogout() { await logout() }

onMounted(loadNegociosIfNeeded)
watch([canSwitchNegocio, negocios], loadNegociosIfNeeded, { deep: true })
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
          <!-- Selector de negocio -->
          <select
            v-if="shouldShowNegocioSelector"
            :value="String(codneg ?? '')"
            class="px-2 py-1 text-xs bg-gray-700 text-white border border-gray-600 rounded max-w-[180px] focus:outline-none focus:ring-1 focus:ring-blue-400"
            :disabled="switchLoading || loadingNegocios"
            @change="onSwitchNegocio"
          >
            <option value="">— Negocio —</option>
            <option v-for="n in negociosVisible" :key="n.codneg" :value="String(n.codneg)">
              {{ n.nombre }}{{ n.esdueno ? ' 👑' : '' }}
            </option>
          </select>

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
