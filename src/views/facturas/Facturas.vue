<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { apiFetch } from '@/utils/api'
import { useSession } from '@/utils/session'
import type { AuthzCheckResponse, Factura, FacturaLinea, ProductoOpt, FacturaPreviewProps } from '@/types'

import BaseTable, { type Column } from '@/components/shared/BaseTable.vue'
import BaseModal from '@/components/shared/BaseModal.vue'
import FormField from '@/components/shared/FormField.vue'
import StatusBadge from '@/components/shared/StatusBadge.vue'
import LoadingSpinner from '@/components/shared/LoadingSpinner.vue'
import ErrorAlert from '@/components/shared/ErrorAlert.vue'
import EmptyState from '@/components/shared/EmptyState.vue'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'
import FacturaPreview from '@/views/facturaciones/Factura.vue'

const router = useRouter()
const { user, negocios } = useSession()
const codneg = computed(() => { const v = Number(user.value?.codneg); return Number.isFinite(v) && v > 0 ? v : null })
const isAdmin = computed(() => Boolean(user.value?.isAdmin || user.value?.codusr === 'admin'))
const negocioActual = computed(() => negocios.value.find(n => Number(n.codneg) === Number(codneg.value)) ?? null)

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

// ── Filtros ──
function yyyyMmDd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const fTipo = ref<'todas' | 'venta' | 'compra'>('todas')
const fEstado = ref<'todas' | 'abierta' | 'cerrada'>('todas')
const fDesde = ref(yyyyMmDd(new Date()))
const fHasta = ref(yyyyMmDd(new Date()))
const fSearch = ref('')
const usarRango = ref(true)

const facCols: Column[] = [
  { key: 'sel', label: '', width: '36px', align: 'center' },
  { key: 'codfac', label: '#', width: '60px' },
  { key: 'tipo', label: 'Tipo', width: '90px' },
  { key: 'estado', label: 'Estado', width: '100px', align: 'center' },
  { key: 'fecha', label: 'Fecha', width: '160px' },
  { key: 'total', label: 'Total', width: '110px', align: 'right' },
  { key: 'contraparte', label: 'Cliente / Proveedor' },
  { key: 'actions', label: '', width: '110px', align: 'center' },
]

function fmtDate(v: string) { if (!v) return '—'; const d = new Date(v); return Number.isNaN(d.getTime()) ? v : d.toLocaleString() }
function fmtMoney(v: number) { return new Intl.NumberFormat('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v ?? 0) }

const facturasFiltered = computed(() => {
  const q = fSearch.value.trim().toLowerCase()
  if (!q) return facturas.value
  return facturas.value.filter(f =>
    String(f.codfac).includes(q) ||
    (f.cliente_nombre ?? '').toLowerCase().includes(q) ||
    (f.proveedor_nombre ?? '').toLowerCase().includes(q),
  )
})

async function loadFacturas() {
  if (!codneg.value) return
  loading.value = true; error.value = null
  try {
    const qs = new URLSearchParams({ codneg: String(codneg.value) })
    if (fTipo.value !== 'todas') qs.set('tipo', fTipo.value)
    if (fEstado.value !== 'todas') qs.set('estado', fEstado.value)
    if (usarRango.value) {
      if (fDesde.value) qs.set('desde', fDesde.value)
      if (fHasta.value) qs.set('hasta', fHasta.value)
    }
    const rows = await apiFetch<Factura[]>(`facturas?${qs}`)
    facturas.value = (Array.isArray(rows) ? rows : []).map(r => ({ ...r, rowKey: `${r.tipo}-${r.codfac}` }))
    seleccion.value = new Set()
  } catch (e: any) { error.value = e?.message ?? 'Error' }
  finally { loading.value = false }
}

async function loadProductos() {
  if (!codneg.value) return
  try { productos.value = await apiFetch<ProductoOpt[]>(`productos?codneg=${codneg.value}`) } catch { productos.value = [] }
}

// ── Detalle / preview ──
const showDetalle = ref(false)
const detalleTarget = ref<Factura | null>(null)
const lineas = ref<FacturaLinea[]>([])
const detalleLoading = ref(false)

const previewProps = computed<FacturaPreviewProps | null>(() => {
  if (!detalleTarget.value || !lineas.value.length) return null
  const subtotal = lineas.value.reduce((s, l) => s + Number(l.subtotal ?? 0), 0)
  const total = Number(detalleTarget.value.total ?? subtotal)
  return {
    numero: detalleTarget.value.codfac,
    fecha: detalleTarget.value.fecha,
    tipo: detalleTarget.value.tipo as 'venta' | 'compra',
    cliente: detalleTarget.value.cliente_nombre ? { nombre: detalleTarget.value.cliente_nombre } : undefined,
    proveedor: detalleTarget.value.proveedor_nombre ? { nombre: detalleTarget.value.proveedor_nombre } : undefined,
    items: lineas.value.map((l: any) => ({ nombre: l.producto_nombre ?? String(l.codprd), codigo: l.codigo, cantidad: l.cantidad, preuni: l.precio })),
    subtotal,
    impuestos: Math.max(0, total - subtotal),
    total,
    negocio: negocioActual.value ? { nombre: String(negocioActual.value.nombre) } : undefined,
  }
})

const estaAbierta = computed(() => detalleTarget.value?.estado !== 'cerrada')

async function openDetalle(fac: Factura) {
  detalleTarget.value = fac; showDetalle.value = true; detalleLoading.value = true; lineas.value = []
  try {
    const data = await apiFetch<any>(`facturas/${fac.codfac}?codneg=${codneg.value}&tipo=${encodeURIComponent(fac.tipo)}`)
    const raw = data?.detalle ?? data?.lineas ?? []
    lineas.value = Array.isArray(raw)
      ? raw.map((it: any) => ({
          codfdt: Number(it?.codfdt ?? 0),
          codprd: Number(it?.codprd ?? 0),
          cantidad: Number(it?.cantidad ?? 0),
          precio: Number(it?.preuni ?? it?.precio ?? 0),
          subtotal: Number(it?.subtotal ?? 0),
          producto_nombre: String(it?.producto_nombre ?? '').trim() || undefined,
          codigo: it?.codigo ?? undefined,
        }))
      : []
  } catch (e: any) { error.value = e?.message ?? 'Error' }
  finally { detalleLoading.value = false }
}

// ── Agregar línea ──
const showAddLinea = ref(false)
const lineaCodprd = ref<number | null>(null)
const lineaCantidad = ref<number | null>(null)
const lineaPrecio = ref<number | null>(null)
const addLineaLoading = ref(false)

watch(lineaCodprd, (v) => {
  if (!v) return
  const p = productos.value.find(x => x.codprd === v)
  if (p?.precio != null && (lineaPrecio.value === null || Number.isNaN(Number(lineaPrecio.value)))) {
    lineaPrecio.value = Number(p.precio)
  }
})

async function addLinea() {
  if (!detalleTarget.value || !lineaCodprd.value || !lineaCantidad.value) { error.value = 'Completa los campos'; return }
  addLineaLoading.value = true; error.value = null
  try {
    await apiFetch(`facturas/${detalleTarget.value.codfac}/detalle`, {
      method: 'POST',
      body: JSON.stringify({ tipo: detalleTarget.value.tipo, codprd: lineaCodprd.value, cantidad: lineaCantidad.value, preuni: lineaPrecio.value ?? null }),
    })
    showAddLinea.value = false; lineaCodprd.value = null; lineaCantidad.value = null; lineaPrecio.value = null
    await openDetalle(detalleTarget.value)
  } catch (e: any) { error.value = e?.message ?? 'Error' }
  finally { addLineaLoading.value = false }
}

// ── Cerrar factura ──
const showConfirmCerrar = ref(false)
const cerrarLoading = ref(false)
async function doCerrar() {
  if (!detalleTarget.value) return
  cerrarLoading.value = true; error.value = null
  try {
    await apiFetch(`facturas/${detalleTarget.value.codfac}/cerrar?tipo=${encodeURIComponent(detalleTarget.value.tipo)}`, { method: 'POST' })
    showConfirmCerrar.value = false; showDetalle.value = false; await loadFacturas()
  } catch (e: any) { error.value = e?.message ?? 'Error cerrando factura' }
  finally { cerrarLoading.value = false }
}

// ── Eliminar factura ──
const showConfirmEliminar = ref(false)
const eliminarLoading = ref(false)
async function doEliminar() {
  if (!detalleTarget.value) return
  eliminarLoading.value = true; error.value = null
  try {
    await apiFetch(`facturas/${detalleTarget.value.codfac}?tipo=${encodeURIComponent(detalleTarget.value.tipo)}`, { method: 'DELETE' })
    showConfirmEliminar.value = false; showDetalle.value = false; await loadFacturas()
  } catch (e: any) { error.value = e?.message ?? 'Error eliminando factura' }
  finally { eliminarLoading.value = false }
}

// ── Cierre en lote (cerrar varias / todas / X facturas) ──
const seleccion = ref<Set<string>>(new Set())
const cerrarLoteLoading = ref(false)
const showConfirmLote = ref(false)
const loteModo = ref<'seleccionadas' | 'todas'>('seleccionadas')

const abiertasEnLista = computed(() => facturasFiltered.value.filter((f: any) => f.estado !== 'cerrada'))
const seleccionadasAbiertas = computed(() => abiertasEnLista.value.filter((f: any) => seleccion.value.has((f as any).rowKey)))
const todasSeleccionadas = computed(() => abiertasEnLista.value.length > 0 && abiertasEnLista.value.every((f: any) => seleccion.value.has((f as any).rowKey)))

function toggleSel(row: any) {
  const k = row.rowKey
  if (seleccion.value.has(k)) seleccion.value.delete(k)
  else seleccion.value.add(k)
  seleccion.value = new Set(seleccion.value)
}
function toggleAll() {
  seleccion.value = todasSeleccionadas.value ? new Set() : new Set(abiertasEnLista.value.map((f: any) => f.rowKey))
}
function pedirCerrarLote(modo: 'seleccionadas' | 'todas') {
  loteModo.value = modo
  showConfirmLote.value = true
}
const loteObjetivo = computed(() => loteModo.value === 'todas' ? abiertasEnLista.value : seleccionadasAbiertas.value)

async function doCerrarLote() {
  const objetivo = loteObjetivo.value
  if (!objetivo.length) { showConfirmLote.value = false; return }
  cerrarLoteLoading.value = true; error.value = null
  try {
    const res = await apiFetch<{ cerradas: number; intentadas: number; errores: any[] }>('facturas/cerrar-lote', {
      method: 'POST',
      body: JSON.stringify({ codneg: codneg.value, codfacs: objetivo.map((f: any) => ({ codfac: f.codfac, tipo: f.tipo })) }),
    })
    seleccion.value = new Set()
    showConfirmLote.value = false
    if (res.errores?.length) error.value = `Cerradas ${res.cerradas}/${res.intentadas}. ${res.errores.length} con error.`
    await loadFacturas()
  } catch (e: any) { error.value = e?.message ?? 'Error cerrando facturas' }
  finally { cerrarLoteLoading.value = false }
}

// ── Editar (ir a Facturaciones) ──
function irAEditar() {
  if (!detalleTarget.value) return
  showDetalle.value = false
  router.push({ path: '/facturaciones', query: { codfac: String(detalleTarget.value.codfac), tipo: detalleTarget.value.tipo } })
}

onMounted(async () => { await loadPermisos(); await Promise.all([loadFacturas(), loadProductos()]) })
watch([codneg, fTipo, fEstado, fDesde, fHasta, usarRango], loadFacturas)
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="card p-4">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 class="text-lg font-semibold text-main">Facturas</h2>
          <p class="text-sm text-muted">Gestión, consulta y filtros de facturas.</p>
        </div>
        <button type="button" class="px-4 py-2 btn btn-secondary text-sm" :disabled="loading" @click="loadFacturas">Recargar</button>
      </div>
    </div>

    <!-- Filtros -->
    <div class="card p-4">
      <div class="flex flex-wrap gap-3 items-end">
        <FormField label="Tipo">
          <select v-model="fTipo" class="px-3 py-2 input text-sm">
            <option value="todas">Todas</option>
            <option value="venta">Ventas</option>
            <option value="compra">Compras</option>
          </select>
        </FormField>
        <FormField label="Estado">
          <select v-model="fEstado" class="px-3 py-2 input text-sm">
            <option value="todas">Todos</option>
            <option value="abierta">Abiertas</option>
            <option value="cerrada">Cerradas</option>
          </select>
        </FormField>
        <div class="flex items-center gap-2 mt-5">
          <input id="usarRango" v-model="usarRango" type="checkbox" />
          <label for="usarRango" class="text-sm text-main">Filtrar por fecha</label>
        </div>
        <template v-if="usarRango">
          <FormField label="Desde">
            <input v-model="fDesde" type="date" class="px-3 py-2 input text-sm" />
          </FormField>
          <FormField label="Hasta">
            <input v-model="fHasta" type="date" class="px-3 py-2 input text-sm" />
          </FormField>
        </template>
        <FormField label="Buscar cliente/proveedor">
          <input v-model="fSearch" type="text" class="px-3 py-2 input text-sm w-52" placeholder="Nombre o # factura…" />
        </FormField>
      </div>
    </div>

    <ErrorAlert v-if="error" :message="error" @dismiss="error = null" />
    <LoadingSpinner v-if="loading" />

    <div v-if="!loading" class="card p-4">
      <!-- Barra de cierre en lote -->
      <div v-if="(perms.cerrar || isAdmin) && abiertasEnLista.length" class="flex items-center gap-3 flex-wrap mb-3 pb-3 border-b" style="border-color: var(--color-border)">
        <label class="flex items-center gap-2 text-sm text-main">
          <input type="checkbox" :checked="todasSeleccionadas" @change="toggleAll" />
          Seleccionar abiertas ({{ abiertasEnLista.length }})
        </label>
        <button type="button" class="px-3 py-1.5 btn btn-primary text-xs disabled:opacity-50"
          :disabled="!seleccionadasAbiertas.length" @click="pedirCerrarLote('seleccionadas')">
          Cerrar seleccionadas ({{ seleccionadasAbiertas.length }})
        </button>
        <button type="button" class="px-3 py-1.5 btn btn-secondary text-xs"
          @click="pedirCerrarLote('todas')">
          Cerrar todas las abiertas ({{ abiertasEnLista.length }})
        </button>
        <span class="text-xs text-muted">Tip: filtra por fecha de hoy para cerrar el día.</span>
      </div>

      <BaseTable :columns="facCols" :rows="facturasFiltered" row-key="rowKey" striped>
        <template #cell-sel="{ row }">
          <input v-if="row.estado !== 'cerrada' && (perms.cerrar || isAdmin)" type="checkbox"
            :checked="seleccion.has(row.rowKey)" @change="toggleSel(row)" />
        </template>
        <template #cell-tipo="{ value }">
          <span :class="['inline-flex px-2 py-0.5 rounded text-xs font-medium', value === 'venta' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700']">{{ value }}</span>
        </template>
        <template #cell-estado="{ value }">
          <StatusBadge :estado="value === 'cerrada' ? 'I' : 'A'" active-label="Abierta" inactive-label="Cerrada" />
        </template>
        <template #cell-fecha="{ value }">{{ fmtDate(value) }}</template>
        <template #cell-total="{ value }">{{ fmtMoney(value ?? 0) }}</template>
        <template #cell-contraparte="{ row }">
          {{ row.tipo === 'compra' ? (row.proveedor_nombre || 'Proveedor general') : (row.cliente_nombre || 'Consumidor final') }}
        </template>
        <template #cell-actions="{ row }">
          <button type="button" class="px-3 py-1 btn btn-secondary text-xs" @click="openDetalle(row)">Ver</button>
        </template>
        <template #empty><EmptyState title="Sin facturas" message="No hay facturas que coincidan con los filtros." /></template>
      </BaseTable>
    </div>

    <!-- ═══ Modal detalle / preview ═══ -->
    <BaseModal
      :open="showDetalle"
      :title="`Factura ${detalleTarget?.tipo?.toUpperCase() ?? ''} #${detalleTarget?.codfac ?? ''}`"
      size="xl"
      @close="showDetalle = false"
    >
      <div class="space-y-4">
        <!-- Estado badge + acciones factura abierta -->
        <div class="flex items-center gap-3 flex-wrap">
          <span v-if="estaAbierta" class="px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">Abierta</span>
          <span v-else class="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">Cerrada</span>
          <template v-if="estaAbierta">
            <button type="button" class="px-3 py-1 btn btn-secondary text-xs" @click="irAEditar">Editar en facturaciones</button>
            <button type="button" class="px-3 py-1 btn text-xs bg-amber-100 text-amber-700 hover:bg-amber-200" @click="showAddLinea = true; lineaCodprd = null; lineaCantidad = null; lineaPrecio = null">+ Línea</button>
            <button v-if="perms.cerrar || isAdmin" type="button" class="px-3 py-1 btn text-xs bg-blue-100 text-blue-700 hover:bg-blue-200" @click="showConfirmCerrar = true">Cerrar factura</button>
            <button type="button" class="px-3 py-1 btn text-xs bg-red-100 text-red-700 hover:bg-red-200" @click="showConfirmEliminar = true">Eliminar</button>
          </template>
        </div>

        <LoadingSpinner v-if="detalleLoading" size="sm" />

        <!-- Receipt preview -->
        <div v-if="!detalleLoading && previewProps" class="flex justify-center">
          <FacturaPreview v-bind="previewProps" />
        </div>
        <div v-else-if="!detalleLoading && !previewProps" class="text-sm text-muted text-center py-4">Sin líneas registradas.</div>
      </div>

      <template #footer>
        <button type="button" class="px-4 py-2 btn btn-secondary" @click="showDetalle = false">Cerrar</button>
      </template>
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
          <FormField label="Precio unitario" hint="Vacío = toma precio del producto">
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

    <!-- ═══ Confirmar eliminación ═══ -->
    <ConfirmDialog
      :open="showConfirmEliminar"
      title="Eliminar factura"
      :message="`¿Eliminar la factura #${detalleTarget?.codfac}? Solo se pueden eliminar facturas abiertas.`"
      variant="danger"
      confirm-label="Eliminar"
      :loading="eliminarLoading"
      @confirm="doEliminar"
      @cancel="showConfirmEliminar = false"
    />

    <!-- ═══ Confirmar cierre en lote ═══ -->
    <ConfirmDialog
      :open="showConfirmLote"
      title="Cerrar facturas en lote"
      :message="`Se cerrarán ${loteObjetivo.length} factura(s) abiertas y se generarán sus asientos contables (ingresos/egresos) automáticamente. Esta acción impacta el inventario y no se puede revertir.`"
      variant="warning"
      confirm-label="Cerrar facturas"
      :loading="cerrarLoteLoading"
      @confirm="doCerrarLote"
      @cancel="showConfirmLote = false"
    />
  </div>
</template>
