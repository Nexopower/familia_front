<script setup lang="ts">
/**
 * HOME — Dashboard principal.
 *
 * Sin negocio: muestra overview general (negocios del usuario).
 * Con negocio: muestra resumen del negocio (totales, alertas).
 */
import { computed, onMounted, ref, watch } from 'vue'
import { apiFetch } from '@/utils/api'
import { useSession } from '@/utils/session'
import LoadingSpinner from '@/components/shared/LoadingSpinner.vue'
import ErrorAlert from '@/components/shared/ErrorAlert.vue'

const { user, negocios } = useSession()
const codneg = computed(() => { const v = Number(user.value?.codneg); return Number.isFinite(v) && v > 0 ? v : null })

const loading = ref(false)
const error = ref<string | null>(null)

/* ── Overview (sin negocio) ── */
type OverviewItem = { codneg: number; nombre: string; tipo?: string; esdueno?: boolean; rol?: string }
const overview = ref<OverviewItem[]>([])

/* ── Resumen (con negocio) ── */
type Resumen = {
  totalProductos?: number; totalInventario?: number; totalFacturas?: number; totalReservas?: number
  ingresosHoy?: number; egresosHoy?: number; balance?: number
}
type Alerta = { tipo: string; mensaje: string; nivel?: 'info' | 'warning' | 'danger' }
const resumen = ref<Resumen | null>(null)
const alertas = ref<Alerta[]>([])

async function loadOverview() {
  loading.value = true; error.value = null
  try {
    const data = await apiFetch<any>('dashboard/overview')
    overview.value = data?.negocios ?? data ?? []
  } catch (e: any) {
    // fallback to local
    overview.value = negocios.value.map(n => ({ codneg: Number(n.codneg), nombre: n.nombre, esdueno: n.esdueno }))
  }
  finally { loading.value = false }
}

async function loadResumen() {
  if (!codneg.value) return
  loading.value = true; error.value = null
  try {
    const data = await apiFetch<any>(`dashboard/resumen?codneg=${codneg.value}`)
    resumen.value = data?.resumen ?? data ?? null
    alertas.value = data?.alertas ?? []
  } catch (e: any) { error.value = e?.message ?? 'Error cargando dashboard' }
  finally { loading.value = false }
}

function fmtMoney(v: number) { return new Intl.NumberFormat('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v ?? 0) }

function loadData() { codneg.value ? loadResumen() : loadOverview() }

onMounted(loadData)
watch(codneg, loadData)
</script>

<template>
  <div class="space-y-4">
    <div class="card p-4">
      <h2 class="text-lg font-semibold text-main">Inicio</h2>
      <p class="text-sm text-muted">{{ codneg ? 'Resumen general del negocio.' : 'Bienvenido. Selecciona un negocio para ver el detalle.' }}</p>
    </div>

    <ErrorAlert v-if="error" :message="error" @dismiss="error = null" />
    <LoadingSpinner v-if="loading" />

    <!-- ═══ Vista sin negocio: Overview ═══ -->
    <div v-if="!loading && !codneg" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <div v-for="n in overview" :key="n.codneg" class="card p-4 hover:shadow-md transition-shadow cursor-default">
        <div class="flex items-center gap-2">
          <span class="inline-flex items-center justify-center w-9 h-9 rounded-full text-sm font-bold" style="background-color: var(--color-accent); color: white">
            {{ (n.nombre ?? '')[0]?.toUpperCase() ?? '?' }}
          </span>
          <div>
            <p class="font-medium text-main text-sm">{{ n.nombre }}</p>
            <p class="text-xs text-muted">{{ n.tipo ?? 'Negocio' }} <span v-if="n.esdueno" class="ml-1">👑 Dueño</span></p>
          </div>
        </div>
        <p v-if="n.rol" class="mt-2 text-xs text-muted">Rol: {{ n.rol }}</p>
      </div>
      <div v-if="overview.length === 0" class="col-span-full text-center py-12 text-muted text-sm">No tienes negocios asignados.</div>
    </div>

    <!-- ═══ Vista con negocio: Resumen ═══ -->
    <template v-if="!loading && codneg && resumen">
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div class="card p-4 text-center">
          <p class="text-2xl font-bold text-main">{{ resumen.totalProductos ?? 0 }}</p>
          <p class="text-xs text-muted">Productos</p>
        </div>
        <div class="card p-4 text-center">
          <p class="text-2xl font-bold text-main">{{ resumen.totalInventario ?? 0 }}</p>
          <p class="text-xs text-muted">Artículos en stock</p>
        </div>
        <div class="card p-4 text-center">
          <p class="text-2xl font-bold text-main">{{ resumen.totalFacturas ?? 0 }}</p>
          <p class="text-xs text-muted">Facturas</p>
        </div>
        <div class="card p-4 text-center">
          <p class="text-2xl font-bold text-main">{{ resumen.totalReservas ?? 0 }}</p>
          <p class="text-xs text-muted">Reservas</p>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div class="card p-4">
          <p class="text-xs text-muted mb-1">Ingresos hoy</p>
          <p class="text-lg font-semibold" style="color: var(--color-success, #22c55e)">{{ fmtMoney(resumen.ingresosHoy ?? 0) }}</p>
        </div>
        <div class="card p-4">
          <p class="text-xs text-muted mb-1">Egresos hoy</p>
          <p class="text-lg font-semibold" style="color: var(--color-danger, #ef4444)">{{ fmtMoney(resumen.egresosHoy ?? 0) }}</p>
        </div>
        <div class="card p-4">
          <p class="text-xs text-muted mb-1">Balance</p>
          <p class="text-lg font-semibold text-main">{{ fmtMoney(resumen.balance ?? 0) }}</p>
        </div>
      </div>

      <!-- Alertas -->
      <div v-if="alertas.length > 0" class="card p-4 space-y-2">
        <h3 class="text-sm font-semibold text-main mb-2">Alertas</h3>
        <div v-for="(a, i) in alertas" :key="i"
          class="flex items-start gap-2 px-3 py-2 rounded text-sm"
          :class="{
            'bg-red-50 text-red-700': a.nivel === 'danger',
            'bg-yellow-50 text-yellow-700': a.nivel === 'warning',
            'bg-blue-50 text-blue-700': a.nivel === 'info' || !a.nivel
          }">
          <span class="font-medium">{{ a.tipo }}:</span>
          <span>{{ a.mensaje }}</span>
        </div>
      </div>
    </template>
  </div>
</template>
