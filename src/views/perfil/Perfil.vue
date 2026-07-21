<script setup lang="ts">
/**
 * Módulo PERFIL — Vista reestructurada.
 *
 * Muestra información del usuario autenticado + selector de tema.
 * No requiere permisos especiales.
 */
import { computed, onMounted, ref } from 'vue'
import { apiFetch } from '@/utils/api'
import { useSession } from '@/utils/session'
import type { PerfilData } from '@/types'
import ThemeSelector from '@/components/Elements/ThemeSelector.vue'
import LoadingSpinner from '@/components/shared/LoadingSpinner.vue'
import ErrorAlert from '@/components/shared/ErrorAlert.vue'

const { user, negocios } = useSession()
const codneg = computed(() => { const v = Number(user.value?.codneg); return Number.isFinite(v) && v > 0 ? v : null })

const perfil = ref<PerfilData | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

async function loadPerfil() {
  loading.value = true; error.value = null
  try {
    const url = codneg.value ? `perfil?codneg=${codneg.value}` : 'perfil'
    perfil.value = await apiFetch<PerfilData>(url)
  } catch (e: any) {
    // fallback local
    perfil.value = { codusr: user.value?.codusr ?? '', nombre: user.value?.nombre }
  }
  finally { loading.value = false }
}

onMounted(loadPerfil)
</script>

<template>
  <div class="space-y-4 max-w-2xl">
    <div class="card p-4">
      <h2 class="text-lg font-semibold text-main">Mi perfil</h2>
      <p class="text-sm text-muted">Información de tu cuenta y preferencias.</p>
    </div>

    <ErrorAlert v-if="error" :message="error" @dismiss="error = null" />
    <LoadingSpinner v-if="loading" />

    <!-- Info del usuario -->
    <div v-if="!loading" class="card p-6 space-y-3">
      <h3 class="text-sm font-semibold text-main mb-2">Datos del usuario</h3>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
        <div>
          <span class="text-muted">Código usuario:</span>
          <p class="font-medium text-main">{{ perfil?.codusr ?? user?.codusr ?? '—' }}</p>
        </div>
        <div>
          <span class="text-muted">Login:</span>
          <p class="font-medium text-main">{{ perfil?.login ?? user?.nombre ?? '—' }}</p>
        </div>
        <div>
          <span class="text-muted">Nombre:</span>
          <p class="font-medium text-main">{{ perfil?.nombre ?? '—' }} {{ perfil?.apellido ?? '' }}</p>
        </div>
        <div>
          <span class="text-muted">Email:</span>
          <p class="font-medium text-main">{{ perfil?.email ?? '—' }}</p>
        </div>
        <div>
          <span class="text-muted">Teléfono:</span>
          <p class="font-medium text-main">{{ perfil?.telefono ?? '—' }}</p>
        </div>
        <div>
          <span class="text-muted">Rol actual:</span>
          <p class="font-medium text-main">{{ perfil?.rol ?? (user?.isAdmin ? 'SUPERADMIN' : '—') }}</p>
        </div>
        <div>
          <span class="text-muted">Estado:</span>
          <p class="font-medium text-main">{{ perfil?.estado === 'A' ? 'Activo' : perfil?.estado ?? '—' }}</p>
        </div>
      </div>

      <div v-if="negocios.length" class="pt-2">
        <span class="text-muted text-sm">Negocios asociados:</span>
        <div class="flex flex-wrap gap-2 mt-1">
          <span v-for="n in negocios" :key="n.codneg" class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium"
            :class="String(n.codneg) === String(user?.codneg) ? 'bg-[var(--color-accent)] text-white' : 'bg-[var(--color-bg-secondary)] text-main'">
            {{ n.nombre }}
            <span v-if="n.esdueno" class="text-[10px]">👑</span>
          </span>
        </div>
      </div>
    </div>

    <!-- Selector de tema -->
    <div class="card p-6">
      <h3 class="text-sm font-semibold text-main mb-3">Tema visual</h3>
      <ThemeSelector />
    </div>
  </div>
</template>
