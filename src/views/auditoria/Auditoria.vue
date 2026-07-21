<script setup lang="ts">
/**
 * Módulo AUDITORÍA — Bitácora central: "Actividad reciente del negocio".
 * Quién hizo qué, cuándo y en qué módulo. Requiere AUDITORIA.VER.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { apiFetch } from '@/utils/api'
import { useSession } from '@/utils/session'
import BaseTable, { type Column } from '@/components/shared/BaseTable.vue'
import LoadingSpinner from '@/components/shared/LoadingSpinner.vue'
import ErrorAlert from '@/components/shared/ErrorAlert.vue'
import EmptyState from '@/components/shared/EmptyState.vue'

type Actividad = {
  modulo: string
  accion: string
  detalle: string
  codusr?: string | null
  fecha: string
}

const { user } = useSession()
const codneg = computed(() => { const v = Number(user.value?.codneg); return Number.isFinite(v) && v > 0 ? v : null })

const loading = ref(false)
const error = ref<string | null>(null)
const actividad = ref<Actividad[]>([])

/* ── Filtros ── */
function yyyyMmDd(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const fUsuario = ref('')
const fModulo = ref('')
const usarRango = ref(false)
const fDesde = ref(yyyyMmDd(new Date()))
const fHasta = ref(yyyyMmDd(new Date()))

const modulos = ['FACTURAS', 'INVENTARIO', 'CAJA', 'CONTABILIDAD', 'FIAOS', 'FONDOS']

const cols: Column[] = [
  { key: 'fecha', label: 'Fecha', width: '160px' },
  { key: 'codusr', label: 'Usuario', width: '110px' },
  { key: 'modulo', label: 'Módulo', width: '130px' },
  { key: 'accion', label: 'Acción', width: '170px' },
  { key: 'detalle', label: 'Detalle' },
]

const moduloColor: Record<string, string> = {
  FACTURAS: 'bg-blue-100 text-blue-700',
  INVENTARIO: 'bg-purple-100 text-purple-700',
  CAJA: 'bg-green-100 text-green-700',
  CONTABILIDAD: 'bg-amber-100 text-amber-700',
  FIAOS: 'bg-red-100 text-red-700',
  FONDOS: 'bg-indigo-100 text-indigo-700',
}

function fmtDate(v: string) { if (!v) return '—'; const d = new Date(v); return Number.isNaN(d.getTime()) ? v : d.toLocaleString() }

async function loadActividad() {
  if (!codneg.value) return
  loading.value = true; error.value = null
  try {
    const qs = new URLSearchParams({ codneg: String(codneg.value), limit: '300' })
    if (fUsuario.value.trim()) qs.set('codusr', fUsuario.value.trim())
    if (fModulo.value) qs.set('modulo', fModulo.value)
    if (usarRango.value) {
      if (fDesde.value) qs.set('desde', fDesde.value)
      if (fHasta.value) qs.set('hasta', fHasta.value)
    }
    actividad.value = await apiFetch<Actividad[]>(`auditoria/actividad?${qs}`)
  } catch (e: any) { error.value = e?.message ?? 'Error cargando actividad' }
  finally { loading.value = false }
}

onMounted(loadActividad)
watch([codneg, fModulo, usarRango, fDesde, fHasta], loadActividad)
</script>

<template>
  <div class="space-y-4">
    <div class="card p-4">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 class="text-lg font-semibold text-main">Actividad reciente</h2>
          <p class="text-sm text-muted">Bitácora del negocio: quién hizo qué y cuándo.</p>
        </div>
        <button type="button" class="px-4 py-2 btn btn-secondary text-sm" :disabled="loading" @click="loadActividad">Recargar</button>
      </div>

      <!-- Filtros -->
      <div class="flex items-end gap-3 flex-wrap mt-4">
        <div>
          <label class="block text-xs text-muted mb-1">Usuario</label>
          <input v-model="fUsuario" type="text" class="px-3 py-2 input text-sm w-36" placeholder="ej. AAA00001" @keyup.enter="loadActividad" />
        </div>
        <div>
          <label class="block text-xs text-muted mb-1">Módulo</label>
          <select v-model="fModulo" class="px-3 py-2 input text-sm">
            <option value="">Todos</option>
            <option v-for="m in modulos" :key="m" :value="m">{{ m }}</option>
          </select>
        </div>
        <label class="flex items-center gap-2 text-sm text-muted mb-2">
          <input type="checkbox" v-model="usarRango" /> Filtrar por fecha
        </label>
        <template v-if="usarRango">
          <div>
            <label class="block text-xs text-muted mb-1">Desde</label>
            <input v-model="fDesde" type="date" class="px-3 py-2 input text-sm" />
          </div>
          <div>
            <label class="block text-xs text-muted mb-1">Hasta</label>
            <input v-model="fHasta" type="date" class="px-3 py-2 input text-sm" />
          </div>
        </template>
        <button type="button" class="px-3 py-2 btn btn-primary text-sm mb-0" @click="loadActividad">Aplicar</button>
      </div>
    </div>

    <ErrorAlert v-if="error" :message="error" @dismiss="error = null" />
    <LoadingSpinner v-if="loading" />

    <div v-if="!loading && codneg" class="card p-4">
      <BaseTable :columns="cols" :rows="actividad" striped>
        <template #cell-fecha="{ value }">{{ fmtDate(value) }}</template>
        <template #cell-codusr="{ value }"><span class="font-mono text-xs">{{ value || '—' }}</span></template>
        <template #cell-modulo="{ value }">
          <span :class="['inline-flex px-2 py-0.5 rounded text-xs font-medium', moduloColor[value] ?? 'bg-gray-200 text-gray-600']">{{ value }}</span>
        </template>
        <template #cell-detalle="{ value }"><span class="text-muted text-sm">{{ value }}</span></template>
        <template #empty><EmptyState title="Sin actividad" message="No hay registros con estos filtros." /></template>
      </BaseTable>
    </div>

    <div v-if="!codneg" class="card p-8 text-center">
      <p class="text-lg font-semibold text-main">Selecciona un negocio</p>
      <p class="text-sm text-muted mt-1">La bitácora es por negocio.</p>
    </div>
  </div>
</template>
