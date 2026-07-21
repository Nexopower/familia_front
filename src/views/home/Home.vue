<script setup lang="ts">
/**
 * HOME — Dashboard principal.
 *
 * Sin negocio: overview de los negocios del usuario.
 * Con negocio: resumen del negocio (KPIs, finanzas 30d, alertas) + accesos rápidos.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { apiFetch } from '@/utils/api'
import { useSession } from '@/utils/session'
import LoadingSpinner from '@/components/shared/LoadingSpinner.vue'
import ErrorAlert from '@/components/shared/ErrorAlert.vue'
import type { OverviewItem, Resumen, Alerta } from '@/types'

const router = useRouter()
const { user, negocios } = useSession()
const codneg = computed(() => { const v = Number(user.value?.codneg); return Number.isFinite(v) && v > 0 ? v : null })
const negocioNombre = computed(() => negocios.value.find(n => Number(n.codneg) === Number(codneg.value))?.nombre ?? '')

const loading = ref(false)
const error = ref<string | null>(null)

const overview = ref<OverviewItem[]>([])
const resumen = ref<Resumen | null>(null)
const alertas = ref<Alerta[]>([])

async function loadOverview() {
  loading.value = true; error.value = null
  try {
    const data = await apiFetch<any>('dashboard/overview')
    overview.value = data?.negocios ?? data ?? []
  } catch {
    overview.value = negocios.value.map(n => ({ codneg: Number(n.codneg), nombre: n.nombre, esdueno: n.esdueno }))
  } finally { loading.value = false }
}

async function loadResumen() {
  if (!codneg.value) return
  loading.value = true; error.value = null
  try {
    const data = await apiFetch<any>(`dashboard/resumen?codneg=${codneg.value}`)
    resumen.value = data?.resumen ?? null
    alertas.value = data?.alertas ?? []
  } catch (e: any) { error.value = e?.message ?? 'Error cargando dashboard' }
  finally { loading.value = false }
}

function fmtMoney(v: number) { return new Intl.NumberFormat('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0) }
function fmtDate(v: string) { if (!v) return '—'; const d = new Date(v); return Number.isNaN(d.getTime()) ? v : d.toLocaleString() }

const balance30d = computed(() => Number(resumen.value?.ingresos_30d ?? 0) - Number(resumen.value?.egresos_30d ?? 0))

function nivelDe(key?: string): 'info' | 'warning' | 'danger' {
  if (key === 'SALDO_NEGATIVO_30D') return 'danger'
  if (key === 'STOCK_BAJO' || key === 'FACTURAS_ABIERTAS') return 'warning'
  return 'info'
}

const accesos = [
  { label: 'Facturar', to: '/facturaciones', icon: '🧾' },
  { label: 'Caja', to: '/caja', icon: '💵' },
  { label: 'Inventario', to: '/inventario', icon: '📦' },
  { label: 'Productos', to: '/productos', icon: '🏷️' },
  { label: 'Contabilidad', to: '/contabilidad', icon: '📊' },
  { label: 'Reservas', to: '/reservas', icon: '📅' },
]

function loadData() { codneg.value ? loadResumen() : loadOverview() }
onMounted(loadData)
watch(codneg, loadData)
</script>

<template>
  <div class="space-y-4">
    <div class="card p-4 flex items-center justify-between gap-3 flex-wrap">
      <div>
        <h2 class="text-lg font-semibold text-main">Inicio</h2>
        <p class="text-sm text-muted">{{ codneg ? `Resumen de ${negocioNombre || 'tu negocio'}.` : 'Bienvenido. Selecciona un negocio para ver el detalle.' }}</p>
      </div>
      <button v-if="codneg" type="button" class="px-3 py-2 btn btn-secondary text-sm" :disabled="loading" @click="loadData">Recargar</button>
    </div>

    <ErrorAlert v-if="error" :message="error" @dismiss="error = null" />
    <LoadingSpinner v-if="loading" />

    <!-- ═══ Sin negocio: Overview ═══ -->
    <div v-if="!loading && !codneg" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <div v-for="n in overview" :key="n.codneg" class="card p-4">
        <div class="flex items-center gap-2">
          <span class="inline-flex items-center justify-center w-9 h-9 rounded-full text-sm font-bold" style="background-color: var(--color-accent); color: white">
            {{ (n.nombre ?? '')[0]?.toUpperCase() ?? '?' }}
          </span>
          <div>
            <p class="font-medium text-main text-sm">{{ n.nombre }}</p>
            <p class="text-xs text-muted">{{ n.tipo ?? 'Negocio' }}<span v-if="n.esdueno" class="ml-1">👑 Dueño</span></p>
          </div>
        </div>
        <div v-if="n.productos_activos !== undefined" class="grid grid-cols-3 gap-2 mt-3 text-center">
          <div><p class="text-sm font-bold text-main">{{ n.productos_activos ?? 0 }}</p><p class="text-[10px] text-muted">Productos</p></div>
          <div><p class="text-sm font-bold text-main">{{ n.facturas_30d ?? 0 }}</p><p class="text-[10px] text-muted">Fact. 30d</p></div>
          <div><p class="text-sm font-bold text-main">{{ n.reservas_7d ?? 0 }}</p><p class="text-[10px] text-muted">Res. 7d</p></div>
        </div>
      </div>
      <div v-if="overview.length === 0" class="col-span-full text-center py-12 text-muted text-sm">No tienes negocios asignados.</div>
    </div>

    <!-- ═══ Con negocio: Resumen ═══ -->
    <template v-if="!loading && codneg && resumen">
      <!-- KPIs -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div class="card p-4 text-center">
          <p class="text-2xl font-bold text-main">{{ resumen.productos_activos ?? 0 }}</p>
          <p class="text-xs text-muted">Productos activos</p>
        </div>
        <div class="card p-4 text-center">
          <p class="text-2xl font-bold text-main">{{ resumen.stock_total ?? 0 }}</p>
          <p class="text-xs text-muted">Artículos en stock</p>
        </div>
        <div class="card p-4 text-center">
          <p class="text-2xl font-bold text-main">{{ resumen.facturas_30d ?? 0 }}</p>
          <p class="text-xs text-muted">Facturas (30 días)</p>
          <p v-if="(resumen.facturas_abiertas ?? 0) > 0" class="text-[11px] text-amber-600 mt-0.5">{{ resumen.facturas_abiertas }} abierta(s)</p>
        </div>
        <div class="card p-4 text-center">
          <p class="text-2xl font-bold text-main">{{ resumen.reservas_7d ?? 0 }}</p>
          <p class="text-xs text-muted">Reservas (7 días)</p>
        </div>
      </div>

      <!-- Finanzas 30 días -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div class="card p-4">
          <p class="text-xs text-muted mb-1">Ingresos (30 días)</p>
          <p class="text-lg font-semibold text-green-600">{{ fmtMoney(resumen.ingresos_30d ?? 0) }}</p>
        </div>
        <div class="card p-4">
          <p class="text-xs text-muted mb-1">Egresos (30 días)</p>
          <p class="text-lg font-semibold text-red-600">{{ fmtMoney(resumen.egresos_30d ?? 0) }}</p>
        </div>
        <div class="card p-4">
          <p class="text-xs text-muted mb-1">Balance (30 días)</p>
          <p class="text-lg font-semibold" :class="balance30d >= 0 ? 'text-green-600' : 'text-red-600'">{{ fmtMoney(balance30d) }}</p>
        </div>
      </div>

      <!-- Accesos rápidos -->
      <div class="card p-4">
        <h3 class="text-sm font-semibold text-main mb-3">Accesos rápidos</h3>
        <div class="grid grid-cols-3 sm:grid-cols-6 gap-2">
          <button v-for="a in accesos" :key="a.to" type="button"
            class="flex flex-col items-center gap-1 px-2 py-3 rounded-lg border border-base hover:bg-[var(--menu-hover)] transition-colors"
            @click="router.push(a.to)">
            <span class="text-xl">{{ a.icon }}</span>
            <span class="text-xs text-main">{{ a.label }}</span>
          </button>
        </div>
      </div>

      <!-- Alertas -->
      <div class="card p-4">
        <h3 class="text-sm font-semibold text-main mb-2">Alertas</h3>
        <div v-if="alertas.length === 0" class="text-sm text-muted py-2">Todo en orden. No hay alertas. ✓</div>
        <div v-else class="space-y-2">
          <div v-for="(a, i) in alertas" :key="a.key ?? i"
            class="px-3 py-2 rounded text-sm border"
            :class="{
              'bg-red-50 border-red-200 text-red-700': nivelDe(a.key) === 'danger',
              'bg-amber-50 border-amber-200 text-amber-700': nivelDe(a.key) === 'warning',
              'bg-blue-50 border-blue-200 text-blue-700': nivelDe(a.key) === 'info',
            }">
            <p class="font-medium">{{ a.titulo }}</p>
            <p class="text-xs opacity-90">{{ a.detalle }}</p>
            <!-- Items: stock bajo -->
            <ul v-if="a.key === 'STOCK_BAJO' && a.items?.length" class="mt-1 text-xs space-y-0.5">
              <li v-for="it in a.items" :key="it.codprd" class="flex justify-between gap-2">
                <span>{{ it.nombre }}{{ it.codigo ? ` (${it.codigo})` : '' }}</span>
                <span class="font-medium">stock {{ it.stock }} / mín {{ it.stockmin }}</span>
              </li>
            </ul>
            <!-- Items: reservas próximas -->
            <ul v-else-if="a.key === 'RESERVAS_PROXIMAS' && a.items?.length" class="mt-1 text-xs space-y-0.5">
              <li v-for="it in a.items" :key="it.codres">{{ fmtDate(it.fecini) }}<span v-if="it.detalle"> — {{ it.detalle }}</span></li>
            </ul>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
