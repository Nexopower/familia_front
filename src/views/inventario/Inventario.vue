<script setup lang="ts">
/**
 * Módulo INVENTARIO — Vista reestructurada.
 *
 * Auto: codinv (PK), codusr_min (JWT), fecha_min (GETDATE)
 * FK dropdown: codprd → producto (búsqueda/dropdown)
 * FK sesión:   codneg → negocio activo
 * Usuario:     tipo (entrada/salida/ajuste), cantidad, detalle
 *
 * Tabs: Stock actual | Movimientos | Crear movimiento
 */
import { computed, onMounted, ref, watch } from 'vue'
import { apiFetch } from '@/utils/api'
import { useSession } from '@/utils/session'
import type { AuthzCheckResponse } from '@/types'

import BaseTable, { type Column } from '@/components/shared/BaseTable.vue'
import BaseModal from '@/components/shared/BaseModal.vue'
import FormField from '@/components/shared/FormField.vue'
import LoadingSpinner from '@/components/shared/LoadingSpinner.vue'
import ErrorAlert from '@/components/shared/ErrorAlert.vue'
import EmptyState from '@/components/shared/EmptyState.vue'

type StockItem = { codinv: number; codprd: number; nombre?: string; codigo?: string; stock: number; stockmin?: number | null }
type Movimiento = { codmin: number; tipo: string; cantidad: number; fecha: string; detalle?: string; producto?: string }
type ProductoOption = { codprd: number; nombre: string; codigo?: string }

const { user } = useSession()
const codneg = computed(() => { const v = Number(user.value?.codneg); return Number.isFinite(v) && v > 0 ? v : null })
const isAdmin = computed(() => Boolean(user.value?.isAdmin || user.value?.codusr === 'admin'))

const perms = ref({ ver: false, movVer: false, movCrear: false })

async function loadPermisos() {
  if (isAdmin.value) { perms.value = { ver: true, movVer: true, movCrear: true }; return }
  if (!codneg.value) return
  try {
    const keys = ['INVENTARIO.VER', 'INVENTARIO.MOVIMIENTO.VER', 'INVENTARIO.MOVIMIENTO.CREAR']
    const res = await apiFetch<AuthzCheckResponse>('authz/check', { method: 'POST', body: JSON.stringify({ codneg: codneg.value, permisos: keys }) })
    const m = res?.permisos ?? {}
    perms.value = { ver: Boolean(m['INVENTARIO.VER']), movVer: Boolean(m['INVENTARIO.MOVIMIENTO.VER']), movCrear: Boolean(m['INVENTARIO.MOVIMIENTO.CREAR']) }
  } catch { perms.value = { ver: false, movVer: false, movCrear: false } }
}

const loading = ref(false)
const error = ref<string | null>(null)
const stockList = ref<StockItem[]>([])
const movimientos = ref<Movimiento[]>([])
const productos = ref<ProductoOption[]>([])
const activeTab = ref<'stock' | 'movimientos'>('stock')

const stockCols: Column[] = [
  { key: 'nombre', label: 'Producto' },
  { key: 'codigo', label: 'Código', width: '120px' },
  { key: 'stock', label: 'Stock actual', width: '110px', align: 'right' },
  { key: 'stockmin', label: 'Mínimo', width: '90px', align: 'right' },
  { key: 'alerta', label: 'Alerta', width: '80px', align: 'center' },
]

const movCols: Column[] = [
  { key: 'producto', label: 'Producto' },
  { key: 'tipo', label: 'Tipo', width: '100px' },
  { key: 'cantidad', label: 'Cantidad', width: '100px', align: 'right' },
  { key: 'fecha', label: 'Fecha', width: '180px' },
  { key: 'detalle', label: 'Detalle' },
]

async function loadStock() {
  if (!codneg.value) return
  loading.value = true; error.value = null
  try {
    stockList.value = await apiFetch<StockItem[]>(`inventario?codneg=${codneg.value}`)
  } catch (e: any) { error.value = e?.message ?? 'Error' }
  finally { loading.value = false }
}

async function loadMovimientos() {
  if (!codneg.value) return
  loading.value = true; error.value = null
  try {
    movimientos.value = await apiFetch<Movimiento[]>(`inventario/movimientos?codneg=${codneg.value}`)
  } catch (e: any) { error.value = e?.message ?? 'Error' }
  finally { loading.value = false }
}

async function loadProductos() {
  if (!codneg.value) return
  try { productos.value = await apiFetch<ProductoOption[]>(`productos?codneg=${codneg.value}`) }
  catch { productos.value = [] }
}

function fmtDate(v: string) {
  if (!v) return '—'
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString()
}

/* ── Crear movimiento  ── */
const showCreateMov = ref(false)
const movCodprd = ref<number | null>(null)
const movTipo = ref<'entrada' | 'salida' | 'ajuste'>('entrada')
const movCantidad = ref<number | null>(null)
const movDetalle = ref('')
const movLoading = ref(false)

function resetMovForm() { movCodprd.value = null; movTipo.value = 'entrada'; movCantidad.value = null; movDetalle.value = '' }

async function createMovimiento() {
  error.value = null
  if (!movCodprd.value) { error.value = 'Selecciona un producto'; return }
  if (!movCantidad.value || movCantidad.value <= 0) { error.value = 'Cantidad debe ser > 0'; return }

  movLoading.value = true
  try {
    await apiFetch('inventario/movimientos', {
      method: 'POST',
      body: JSON.stringify({
        codneg: codneg.value,
        codprd: movCodprd.value,
        tipo: movTipo.value,
        cantidad: movCantidad.value,
        detalle: movDetalle.value.trim() || undefined,
      }),
    })
    showCreateMov.value = false; resetMovForm()
    await Promise.all([loadStock(), loadMovimientos()])
  } catch (e: any) { error.value = e?.message ?? 'Error registrando movimiento' }
  finally { movLoading.value = false }
}

/* ── Lifecycle ── */
onMounted(async () => {
  await loadPermisos()
  await Promise.all([loadStock(), loadMovimientos(), loadProductos()])
})
watch(codneg, async () => {
  await loadPermisos()
  await Promise.all([loadStock(), loadMovimientos(), loadProductos()])
})
</script>

<template>
  <div class="space-y-4">
    <div class="card p-4">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 class="text-lg font-semibold text-main">Inventario</h2>
          <p class="text-sm text-muted">Stock actual y movimientos del negocio.</p>
        </div>
        <div class="flex gap-2">
          <button
            v-if="perms.movCrear || isAdmin"
            type="button" class="px-4 py-2 btn btn-primary text-sm"
            @click="showCreateMov = true; resetMovForm(); loadProductos()"
          >
            + Nuevo movimiento
          </button>
          <button type="button" class="px-4 py-2 btn btn-secondary text-sm" :disabled="loading" @click="loadStock(); loadMovimientos()">Recargar</button>
        </div>
      </div>
    </div>

    <ErrorAlert v-if="error" :message="error" @dismiss="error = null" />

    <!-- Tabs -->
    <div class="card p-0">
      <div class="flex border-b border-base">
        <button
          v-for="tab in (['stock', 'movimientos'] as const)" :key="tab" type="button"
          :class="['px-5 py-2.5 text-sm font-medium transition', activeTab === tab ? 'border-b-2 border-[var(--primary)] text-[var(--primary)]' : 'text-muted hover:text-main']"
          @click="activeTab = tab"
        >
          {{ tab === 'stock' ? 'Stock actual' : 'Movimientos' }}
        </button>
      </div>
      <div class="p-4">
        <LoadingSpinner v-if="loading" />

        <!-- Stock -->
        <div v-if="!loading && activeTab === 'stock'">
          <BaseTable :columns="stockCols" :rows="stockList" row-key="codinv" striped>
            <template #cell-alerta="{ row }">
              <span v-if="row.stockmin != null && row.stock <= row.stockmin" class="inline-block w-3 h-3 rounded-full bg-red-500" title="Stock bajo" />
              <span v-else class="inline-block w-3 h-3 rounded-full bg-green-500" title="OK" />
            </template>
            <template #empty><EmptyState title="Sin stock" message="No hay registros de inventario." /></template>
          </BaseTable>
        </div>

        <!-- Movimientos -->
        <div v-if="!loading && activeTab === 'movimientos'">
          <BaseTable :columns="movCols" :rows="movimientos" row-key="codmin" striped>
            <template #cell-tipo="{ value }">
              <span :class="[
                'inline-flex px-2 py-0.5 rounded text-xs font-medium',
                value === 'entrada' ? 'bg-green-100 text-green-700' : value === 'salida' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700',
              ]">{{ value }}</span>
            </template>
            <template #cell-fecha="{ value }">{{ fmtDate(value) }}</template>
            <template #empty><EmptyState title="Sin movimientos" message="No se han registrado movimientos." /></template>
          </BaseTable>
        </div>
      </div>
    </div>

    <!-- ═══ Modal: Crear movimiento ═══ -->
    <BaseModal :open="showCreateMov" title="Registrar movimiento" size="md" @close="showCreateMov = false">
      <div class="space-y-3">
        <ErrorAlert v-if="error" :message="error" @dismiss="error = null" />

        <FormField label="Producto" required hint="Selecciona el producto a afectar">
          <select v-model="movCodprd" class="w-full px-3 py-2 input">
            <option :value="null">— Seleccionar —</option>
            <option v-for="p in productos" :key="p.codprd" :value="p.codprd">{{ p.nombre }} {{ p.codigo ? `(${p.codigo})` : '' }}</option>
          </select>
        </FormField>

        <div class="grid grid-cols-2 gap-3">
          <FormField label="Tipo" required>
            <select v-model="movTipo" class="w-full px-3 py-2 input">
              <option value="entrada">Entrada</option>
              <option value="salida">Salida</option>
              <option value="ajuste">Ajuste</option>
            </select>
          </FormField>
          <FormField label="Cantidad" required hint="Debe ser mayor a 0">
            <input v-model.number="movCantidad" type="number" min="1" class="w-full px-3 py-2 input" placeholder="Ej: 50" />
          </FormField>
        </div>

        <FormField label="Detalle" hint="Opcional, motivo del movimiento">
          <textarea v-model="movDetalle" class="w-full px-3 py-2 input" rows="2" placeholder="Compra de proveedor, ajuste por conteo, etc." />
        </FormField>
      </div>

      <template #footer>
        <button type="button" class="px-4 py-2 btn btn-secondary text-sm" @click="showCreateMov = false">Cancelar</button>
        <button type="button" class="px-4 py-2 btn btn-primary text-sm disabled:opacity-60" :disabled="movLoading" @click="createMovimiento">
          {{ movLoading ? 'Registrando…' : 'Registrar' }}
        </button>
      </template>
    </BaseModal>
  </div>
</template>
