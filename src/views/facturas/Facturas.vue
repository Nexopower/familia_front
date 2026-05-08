<script setup lang="ts">
/**
 * Módulo FACTURAS — Vista reestructurada.
 *
 * Auto: codfac (PK), fecha_fac (GETDATE), estado ('abierta'→'cerrada'), total (calculado)
 * FK sesión: codneg
 * FK dropdown: codcli/codpro (cliente/proveedor), codprd (producto en líneas)
 * Usuario: tipo (venta/compra), detalle; en líneas: cantidad, precio
 */
import { computed, onMounted, ref, watch } from 'vue'
import { apiFetch } from '@/utils/api'
import { useSession } from '@/utils/session'
import type { AuthzCheckResponse } from '@/types'

import BaseTable, { type Column } from '@/components/shared/BaseTable.vue'
import BaseModal from '@/components/shared/BaseModal.vue'
import FormField from '@/components/shared/FormField.vue'
import StatusBadge from '@/components/shared/StatusBadge.vue'
import LoadingSpinner from '@/components/shared/LoadingSpinner.vue'
import ErrorAlert from '@/components/shared/ErrorAlert.vue'
import EmptyState from '@/components/shared/EmptyState.vue'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'

type Factura = { codfac: number; codneg: number; tipo: string; estado: string; fecha: string; total?: number; detalle?: string; cliente_nombre?: string; proveedor_nombre?: string }
type FacturaLinea = { codfdt: number; codprd: number; cantidad: number; precio: number; subtotal: number; producto_nombre?: string }
type ProductoOpt = { codprd: number; nombre: string; codigo?: string; precio?: number }

const { user } = useSession()
const codneg = computed(() => { const v = Number(user.value?.codneg); return Number.isFinite(v) && v > 0 ? v : null })
const isAdmin = computed(() => Boolean(user.value?.isAdmin || user.value?.codusr === 'admin'))

const perms = ref({ ver: false, crear: false, cerrar: false })
async function loadPermisos() {
  if (isAdmin.value) { perms.value = { ver: true, crear: true, cerrar: true }; return }
  if (!codneg.value) return
  try {
    const res = await apiFetch<AuthzCheckResponse>('authz/check', {
      method: 'POST', body: JSON.stringify({ codneg: codneg.value, permisos: ['FACTURAS.VER', 'FACTURAS.CREAR', 'FACTURAS.CERRAR'] }),
    })
    const m = res?.permisos ?? {}
    perms.value = { ver: Boolean(m['FACTURAS.VER']), crear: Boolean(m['FACTURAS.CREAR']), cerrar: Boolean(m['FACTURAS.CERRAR']) }
  } catch { perms.value = { ver: false, crear: false, cerrar: false } }
}

const loading = ref(false)
const error = ref<string | null>(null)
const facturas = ref<Factura[]>([])
const productos = ref<ProductoOpt[]>([])

const facCols: Column[] = [
  { key: 'codfac', label: '#', width: '60px' },
  { key: 'tipo', label: 'Tipo', width: '100px' },
  { key: 'estado', label: 'Estado', width: '100px', align: 'center' },
  { key: 'fecha', label: 'Fecha', width: '180px' },
  { key: 'total', label: 'Total', width: '120px', align: 'right' },
  { key: 'detalle', label: 'Detalle' },
  { key: 'actions', label: '', width: '140px', align: 'center' },
]

function fmtDate(v: string) { if (!v) return '—'; const d = new Date(v); return Number.isNaN(d.getTime()) ? v : d.toLocaleString() }
function fmtMoney(v: number) { return new Intl.NumberFormat('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v ?? 0) }

async function loadFacturas() {
  if (!codneg.value) return
  loading.value = true; error.value = null
  try { facturas.value = await apiFetch<Factura[]>(`facturas?codneg=${codneg.value}`) }
  catch (e: any) { error.value = e?.message ?? 'Error' }
  finally { loading.value = false }
}

async function loadProductos() {
  if (!codneg.value) return
  try { productos.value = await apiFetch<ProductoOpt[]>(`productos?codneg=${codneg.value}`) } catch { productos.value = [] }
}

/* ── Crear factura ── */
const showCreate = ref(false)
const createLoading = ref(false)
const newTipo = ref<'venta' | 'compra'>('venta')
const newDetalle = ref('')

async function createFactura() {
  error.value = null; createLoading.value = true
  try {
    await apiFetch('facturas', { method: 'POST', body: JSON.stringify({ codneg: codneg.value, tipo: newTipo.value, detalle: newDetalle.value.trim() || undefined }) })
    showCreate.value = false; newDetalle.value = ''; await loadFacturas()
  } catch (e: any) { error.value = e?.message ?? 'Error creando factura' }
  finally { createLoading.value = false }
}

/* ── Detalle de factura ── */
const showDetalle = ref(false)
const detalleTarget = ref<Factura | null>(null)
const lineas = ref<FacturaLinea[]>([])
const detalleLoading = ref(false)

const lineaCols: Column[] = [
  { key: 'producto_nombre', label: 'Producto' },
  { key: 'cantidad', label: 'Cantidad', width: '100px', align: 'right' },
  { key: 'precio', label: 'Precio unit.', width: '120px', align: 'right' },
  { key: 'subtotal', label: 'Subtotal', width: '120px', align: 'right' },
]

async function openDetalle(fac: Factura) {
  detalleTarget.value = fac; showDetalle.value = true; detalleLoading.value = true; lineas.value = []
  try {
    const data = await apiFetch<any>(`facturas/${fac.codfac}?codneg=${codneg.value}`)
    lineas.value = data?.detalle ?? data?.lineas ?? []
  } catch (e: any) { error.value = e?.message ?? 'Error' }
  finally { detalleLoading.value = false }
}

/* ── Agregar línea ── */
const showAddLinea = ref(false)
const lineaCodprd = ref<number | null>(null)
const lineaCantidad = ref<number | null>(null)
const lineaPrecio = ref<number | null>(null)
const addLineaLoading = ref(false)

async function addLinea() {
  if (!detalleTarget.value || !lineaCodprd.value || !lineaCantidad.value) { error.value = 'Completa los campos'; return }
  addLineaLoading.value = true; error.value = null
  try {
    await apiFetch(`facturas/${detalleTarget.value.codfac}/detalle`, {
      method: 'POST',
      body: JSON.stringify({ codprd: lineaCodprd.value, cantidad: lineaCantidad.value, preuni: lineaPrecio.value }),
    })
    showAddLinea.value = false; lineaCodprd.value = null; lineaCantidad.value = null; lineaPrecio.value = null
    await openDetalle(detalleTarget.value)
  } catch (e: any) { error.value = e?.message ?? 'Error' }
  finally { addLineaLoading.value = false }
}

/* ── Cerrar factura ── */
const showConfirmCerrar = ref(false)
const cerrarLoading = ref(false)

async function doCerrar() {
  if (!detalleTarget.value) return
  cerrarLoading.value = true; error.value = null
  try {
    await apiFetch(`facturas/${detalleTarget.value.codfac}/cerrar`, { method: 'POST', body: JSON.stringify({ codneg: codneg.value }) })
    showConfirmCerrar.value = false; showDetalle.value = false; await loadFacturas()
  } catch (e: any) { error.value = e?.message ?? 'Error cerrando factura' }
  finally { cerrarLoading.value = false }
}

onMounted(async () => { await loadPermisos(); await Promise.all([loadFacturas(), loadProductos()]) })
watch(codneg, async () => { await loadPermisos(); await Promise.all([loadFacturas(), loadProductos()]) })
</script>

<template>
  <div class="space-y-4">
    <div class="card p-4">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 class="text-lg font-semibold text-main">Facturas</h2>
          <p class="text-sm text-muted">Facturación de ventas y compras.</p>
        </div>
        <div class="flex gap-2">
          <button v-if="perms.crear || isAdmin" type="button" class="px-4 py-2 btn btn-primary text-sm" @click="showCreate = true; newTipo = 'venta'; newDetalle = ''">+ Nueva factura</button>
          <button type="button" class="px-4 py-2 btn btn-secondary text-sm" :disabled="loading" @click="loadFacturas">Recargar</button>
        </div>
      </div>
    </div>

    <ErrorAlert v-if="error" :message="error" @dismiss="error = null" />
    <LoadingSpinner v-if="loading" />

    <div v-if="!loading" class="card p-4">
      <BaseTable :columns="facCols" :rows="facturas" row-key="codfac" striped>
        <template #cell-tipo="{ value }">
          <span :class="['inline-flex px-2 py-0.5 rounded text-xs font-medium', value === 'venta' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700']">{{ value }}</span>
        </template>
        <template #cell-estado="{ value }">
          <StatusBadge :estado="value === 'cerrada' ? 'I' : 'A'" :active-label="'Abierta'" :inactive-label="'Cerrada'" />
        </template>
        <template #cell-fecha="{ value }">{{ fmtDate(value) }}</template>
        <template #cell-total="{ value }">{{ fmtMoney(value ?? 0) }}</template>
        <template #cell-actions="{ row }">
          <button type="button" class="px-3 py-1 btn btn-secondary text-xs" @click="openDetalle(row)">Ver detalle</button>
        </template>
        <template #empty><EmptyState title="Sin facturas" message="No hay facturas registradas." /></template>
      </BaseTable>
    </div>

    <!-- ═══ Crear factura ═══ -->
    <BaseModal :open="showCreate" title="Nueva factura" size="sm" @close="showCreate = false">
      <div class="space-y-3">
        <FormField label="Tipo" required>
          <select v-model="newTipo" class="w-full px-3 py-2 input">
            <option value="venta">Venta</option>
            <option value="compra">Compra</option>
          </select>
        </FormField>
        <FormField label="Detalle" hint="Opcional">
          <textarea v-model="newDetalle" class="w-full px-3 py-2 input" rows="2" placeholder="Descripción general…" />
        </FormField>
      </div>
      <template #footer>
        <button type="button" class="px-4 py-2 btn btn-secondary text-sm" @click="showCreate = false">Cancelar</button>
        <button type="button" class="px-4 py-2 btn btn-primary text-sm disabled:opacity-60" :disabled="createLoading" @click="createFactura">
          {{ createLoading ? 'Creando…' : 'Crear' }}
        </button>
      </template>
    </BaseModal>

    <!-- ═══ Detalle factura ═══ -->
    <BaseModal :open="showDetalle" :title="`Factura #${detalleTarget?.codfac ?? ''}`" size="xl" @close="showDetalle = false">
      <div class="space-y-4">
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div><span class="text-muted">Tipo:</span> <span class="font-medium text-main">{{ detalleTarget?.tipo }}</span></div>
          <div><span class="text-muted">Estado:</span> <span class="font-medium text-main">{{ detalleTarget?.estado }}</span></div>
          <div><span class="text-muted">Fecha:</span> <span class="font-medium text-main">{{ fmtDate(detalleTarget?.fecha ?? '') }}</span></div>
          <div><span class="text-muted">Total:</span> <span class="font-medium text-main">{{ fmtMoney(detalleTarget?.total ?? 0) }}</span></div>
        </div>

        <LoadingSpinner v-if="detalleLoading" size="sm" />

        <BaseTable v-if="!detalleLoading" :columns="lineaCols" :rows="lineas" row-key="codfdt" striped>
          <template #cell-precio="{ value }">{{ fmtMoney(value ?? 0) }}</template>
          <template #cell-subtotal="{ value }">{{ fmtMoney(value ?? 0) }}</template>
        </BaseTable>

        <div v-if="detalleTarget?.estado !== 'cerrada'" class="flex gap-2">
          <button type="button" class="px-3 py-1.5 btn btn-primary text-sm" @click="showAddLinea = true; lineaCodprd = null; lineaCantidad = null; lineaPrecio = null">+ Agregar línea</button>
          <button v-if="perms.cerrar || isAdmin" type="button" class="px-3 py-1.5 btn text-sm bg-red-100 text-red-700 hover:bg-red-200" @click="showConfirmCerrar = true">Cerrar factura</button>
        </div>
      </div>
    </BaseModal>

    <!-- ═══ Agregar línea ═══ -->
    <BaseModal :open="showAddLinea" title="Agregar línea" size="md" @close="showAddLinea = false">
      <div class="space-y-3">
        <FormField label="Producto" required>
          <select v-model="lineaCodprd" class="w-full px-3 py-2 input">
            <option :value="null">— Seleccionar —</option>
            <option v-for="p in productos" :key="p.codprd" :value="p.codprd">{{ p.nombre }}</option>
          </select>
        </FormField>
        <div class="grid grid-cols-2 gap-3">
          <FormField label="Cantidad" required>
            <input v-model.number="lineaCantidad" type="number" min="1" class="w-full px-3 py-2 input" />
          </FormField>
          <FormField label="Precio unitario" hint="Dejar vacío para usar precio del producto">
            <input v-model.number="lineaPrecio" type="number" min="0" step="0.01" class="w-full px-3 py-2 input" />
          </FormField>
        </div>
      </div>
      <template #footer>
        <button type="button" class="px-4 py-2 btn btn-secondary text-sm" @click="showAddLinea = false">Cancelar</button>
        <button type="button" class="px-4 py-2 btn btn-primary text-sm disabled:opacity-60" :disabled="addLineaLoading" @click="addLinea">Agregar</button>
      </template>
    </BaseModal>

    <!-- ═══ Confirmar cierre ═══ -->
    <ConfirmDialog
      :open="showConfirmCerrar"
      title="Cerrar factura"
      :message="`¿Cerrar la factura #${detalleTarget?.codfac}? Esta acción impacta el inventario y no se puede revertir.`"
      variant="warning"
      confirm-label="Cerrar factura"
      :loading="cerrarLoading"
      @confirm="doCerrar"
      @cancel="showConfirmCerrar = false"
    />
  </div>
</template>
