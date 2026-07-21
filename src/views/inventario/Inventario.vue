<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { apiFetch } from '@/utils/api'
import { useSession } from '@/utils/session'
import type {
  AuthzCheckResponse,
  StockItem,
  Movimiento,
  ProductoOption,
  JerarquiaEmpaque,
  ConversionUM,
  UnidadMedida,
} from '@/types'

import BaseTable, { type Column } from '@/components/shared/BaseTable.vue'
import BaseModal from '@/components/shared/BaseModal.vue'
import FormField from '@/components/shared/FormField.vue'
import LoadingSpinner from '@/components/shared/LoadingSpinner.vue'
import ErrorAlert from '@/components/shared/ErrorAlert.vue'
import EmptyState from '@/components/shared/EmptyState.vue'

const { user } = useSession()
const codneg = computed(() => { const v = Number(user.value?.codneg); return Number.isFinite(v) && v > 0 ? v : null })
const isAdmin = computed(() => Boolean(user.value?.isAdmin || user.value?.codusr === 'admin'))

const perms = ref({
  ver: false, movVer: false, movCrear: false,
  gestionarUnidades: false, gestionarConversiones: false,
})

async function loadPermisos() {
  if (isAdmin.value) {
    perms.value = { ver: true, movVer: true, movCrear: true, gestionarUnidades: true, gestionarConversiones: true }
    return
  }
  if (!codneg.value) return
  try {
    const keys = [
      'INVENTARIO.VER', 'INVENTARIO.MOVIMIENTO.VER', 'INVENTARIO.MOVIMIENTO.CREAR',
      'INVENTARIO.UNIDADES.GESTIONAR', 'INVENTARIO.CONVERSIONES.GESTIONAR', 'INVENTARIO.TRANSFORMACIONES.GESTIONAR',
    ]
    const res = await apiFetch<AuthzCheckResponse>('authz/check', { method: 'POST', body: JSON.stringify({ codneg: codneg.value, permisos: keys }) })
    const m = res?.permisos ?? {}
    perms.value = {
      ver: Boolean(m['INVENTARIO.VER']),
      movVer: Boolean(m['INVENTARIO.MOVIMIENTO.VER']),
      movCrear: Boolean(m['INVENTARIO.MOVIMIENTO.CREAR']),
      gestionarUnidades: Boolean(m['INVENTARIO.UNIDADES.GESTIONAR']),
      gestionarConversiones: Boolean(m['INVENTARIO.CONVERSIONES.GESTIONAR']),
    }
  } catch {
    perms.value = { ver: false, movVer: false, movCrear: false, gestionarUnidades: false, gestionarConversiones: false }
  }
}

const loading = ref(false)
const error = ref<string | null>(null)
const activeTab = ref<'stock' | 'movimientos' | 'empaques' | 'unidades' | 'conversiones'>('stock')

// ── Stock & movimientos ──
const stockList = ref<StockItem[]>([])
const movimientos = ref<Movimiento[]>([])
const productos = ref<ProductoOption[]>([])
const jerarquia = ref<JerarquiaEmpaque[]>([])

const stockCols: Column[] = [
  { key: 'nombre', label: 'Producto' },
  { key: 'codigo', label: 'Código', width: '120px' },
  { key: 'tipo_prd', label: 'Tipo', width: '100px', align: 'center' },
  { key: 'stock', label: 'Stock', width: '100px', align: 'right' },
  { key: 'stockmin', label: 'Mínimo', width: '90px', align: 'right' },
  { key: 'alerta', label: '', width: '50px', align: 'center' },
  { key: 'acciones', label: '', width: '120px', align: 'center' },
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
  try { stockList.value = await apiFetch<StockItem[]>(`inventario?codneg=${codneg.value}`) }
  catch (e: any) { error.value = e?.message ?? 'Error' }
  finally { loading.value = false }
}

async function loadMovimientos() {
  if (!codneg.value) return
  loading.value = true; error.value = null
  try { movimientos.value = await apiFetch<Movimiento[]>(`inventario/movimientos?codneg=${codneg.value}`) }
  catch (e: any) { error.value = e?.message ?? 'Error' }
  finally { loading.value = false }
}

async function loadProductos() {
  if (!codneg.value) return
  try { productos.value = await apiFetch<ProductoOption[]>(`productos?codneg=${codneg.value}`) }
  catch { productos.value = [] }
}

async function loadJerarquia() {
  if (!codneg.value) return
  loading.value = true; error.value = null
  try { jerarquia.value = await apiFetch<JerarquiaEmpaque[]>(`inventario-avanzado/empaques/jerarquia?codneg=${codneg.value}`) }
  catch (e: any) { error.value = e?.message ?? 'Error'; jerarquia.value = [] }
  finally { loading.value = false }
}

function fmtDate(v: string) {
  if (!v) return '—'
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString()
}

function tipoLabel(tipo: string | null | undefined) {
  if (tipo === 'compuesto') return 'Compuesto'
  if (tipo === 'empaque') return 'Empaque'
  return 'Simple'
}

// ── Crear movimiento ──
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
      body: JSON.stringify({ codneg: codneg.value, codprd: movCodprd.value, tipo: movTipo.value, cantidad: movCantidad.value, detalle: movDetalle.value.trim() || undefined }),
    })
    showCreateMov.value = false; resetMovForm()
    await Promise.all([loadStock(), loadMovimientos()])
  } catch (e: any) { error.value = e?.message ?? 'Error registrando movimiento' }
  finally { movLoading.value = false }
}

// ── Destapar empaque ──
const showDestaparModal = ref(false)
const destaparTarget = ref<JerarquiaEmpaque | null>(null)
const destaparCantidad = ref<number | null>(null)
const destaparLoading = ref(false)

function openDestaparModal(row: JerarquiaEmpaque) {
  destaparTarget.value = row
  destaparCantidad.value = null
  showDestaparModal.value = true
}

async function doDestapar() {
  if (!codneg.value || !destaparTarget.value) return
  if (!destaparCantidad.value || destaparCantidad.value <= 0) { error.value = 'Cantidad debe ser > 0'; return }
  destaparLoading.value = true
  try {
    await apiFetch('inventario-avanzado/empaques/destapar', {
      method: 'POST',
      body: JSON.stringify({ codneg: codneg.value, codprd_empaque: destaparTarget.value.codprd_empaque, cantidad: destaparCantidad.value }),
    })
    showDestaparModal.value = false
    await Promise.all([loadStock(), loadJerarquia()])
  } catch (e: any) { error.value = e?.message ?? 'Error destapando empaque' }
  finally { destaparLoading.value = false }
}

// ── Ensamblar compuesto ──
const showEnsamblarModal = ref(false)
const ensamblarTarget = ref<StockItem | null>(null)
const ensamblarCantidad = ref<number | null>(null)
const ensamblarLoading = ref(false)

function openEnsamblarModal(row: StockItem) {
  ensamblarTarget.value = row
  ensamblarCantidad.value = null
  showEnsamblarModal.value = true
}

async function doEnsamblar() {
  if (!codneg.value || !ensamblarTarget.value) return
  if (!ensamblarCantidad.value || ensamblarCantidad.value <= 0) { error.value = 'Cantidad debe ser > 0'; return }
  ensamblarLoading.value = true
  try {
    await apiFetch('inventario-avanzado/empaques/ensamblar', {
      method: 'POST',
      body: JSON.stringify({ codneg: codneg.value, codprd_final: ensamblarTarget.value.codprd, cantidad: ensamblarCantidad.value }),
    })
    showEnsamblarModal.value = false
    await Promise.all([loadStock(), loadMovimientos()])
  } catch (e: any) { error.value = e?.message ?? 'Error ensamblando producto' }
  finally { ensamblarLoading.value = false }
}

// ── Unidades de medida ──
const unidades = ref<UnidadMedida[]>([])
const showCreateUnidad = ref(false)
const unidadLoading = ref(false)
const newUnidadNombre = ref('')
const newUnidadSimbolo = ref('')
const newUnidadTipo = ref('conteo')
const tiposUnidad = ['conteo', 'volumen', 'peso', 'longitud', 'otro']

const unidadCols: Column[] = [
  { key: 'codumd', label: '#', width: '60px' },
  { key: 'nombre', label: 'Nombre' },
  { key: 'simbolo', label: 'Símbolo', width: '80px' },
  { key: 'tipo', label: 'Tipo', width: '120px' },
  { key: 'decimales', label: 'Decimales', width: '100px', align: 'center' },
  { key: 'acciones', label: '', width: '80px', align: 'center' },
]

const showEditUnidad = ref(false)
const editUnidadTarget = ref<UnidadMedida | null>(null)
const editUnidadNombre = ref('')
const editUnidadSimbolo = ref('')
const editUnidadTipo = ref('conteo')
const editUnidadLoading = ref(false)

function openEditUnidad(u: UnidadMedida) {
  editUnidadTarget.value = u
  editUnidadNombre.value = u.nombre
  editUnidadSimbolo.value = u.simbolo ?? ''
  editUnidadTipo.value = u.tipo ?? 'conteo'
  showEditUnidad.value = true
}

async function updateUnidad() {
  if (!editUnidadTarget.value) return
  if (!editUnidadNombre.value.trim()) { error.value = 'Nombre requerido'; return }
  editUnidadLoading.value = true
  try {
    await apiFetch(`inventario-avanzado/unidades/${editUnidadTarget.value.codumd}`, {
      method: 'PATCH',
      body: JSON.stringify({ nombre: editUnidadNombre.value.trim(), simbolo: editUnidadSimbolo.value.trim() || undefined, tipo: editUnidadTipo.value }),
    })
    showEditUnidad.value = false
    await loadUnidades()
  } catch (e: any) { error.value = e?.message ?? 'Error actualizando unidad' }
  finally { editUnidadLoading.value = false }
}

async function loadUnidades() {
  loading.value = true
  try { unidades.value = await apiFetch<UnidadMedida[]>('inventario-avanzado/unidades') }
  catch (e: any) { error.value = e?.message ?? 'Error cargando unidades' }
  finally { loading.value = false }
}

function resetUnidadForm() { newUnidadNombre.value = ''; newUnidadSimbolo.value = ''; newUnidadTipo.value = 'conteo' }

async function createUnidad() {
  if (!newUnidadNombre.value.trim()) { error.value = 'Nombre requerido'; return }
  unidadLoading.value = true
  try {
    await apiFetch('inventario-avanzado/unidades', {
      method: 'POST',
      body: JSON.stringify({ nombre: newUnidadNombre.value.trim(), simbolo: newUnidadSimbolo.value.trim() || undefined, tipo: newUnidadTipo.value }),
    })
    showCreateUnidad.value = false; resetUnidadForm()
    await loadUnidades()
  } catch (e: any) { error.value = e?.message ?? 'Error creando unidad' }
  finally { unidadLoading.value = false }
}

// ── Conversiones ──
const conversiones = ref<ConversionUM[]>([])
const showCreateConversion = ref(false)
const conversionLoading = ref(false)
const newConvOrigen = ref<number | null>(null)
const newConvDestino = ref<number | null>(null)
const newConvFactor = ref<number | null>(null)

const conversionCols: Column[] = [
  { key: 'codcnv', label: '#', width: '60px' },
  { key: 'origen', label: 'Unidad Origen' },
  { key: 'destino', label: 'Unidad Destino' },
  { key: 'factor', label: 'Factor', width: '120px', align: 'right' },
]

async function loadConversiones() {
  if (!codneg.value) return
  loading.value = true
  try { conversiones.value = await apiFetch<ConversionUM[]>(`inventario-avanzado/conversiones?codneg=${codneg.value}`) }
  catch (e: any) { error.value = e?.message ?? 'Error cargando conversiones' }
  finally { loading.value = false }
}

function resetConversionForm() { newConvOrigen.value = null; newConvDestino.value = null; newConvFactor.value = null }

async function createConversion() {
  if (!newConvOrigen.value || !newConvDestino.value) { error.value = 'Selecciona las unidades origen y destino'; return }
  if (!newConvFactor.value || newConvFactor.value <= 0) { error.value = 'Factor debe ser mayor a 0'; return }
  conversionLoading.value = true
  try {
    await apiFetch('inventario-avanzado/conversiones', {
      method: 'POST',
      body: JSON.stringify({ codneg: codneg.value, codumd_origen: newConvOrigen.value, codumd_destino: newConvDestino.value, factor: newConvFactor.value }),
    })
    showCreateConversion.value = false; resetConversionForm()
    await loadConversiones()
  } catch (e: any) { error.value = e?.message ?? 'Error creando conversión' }
  finally { conversionLoading.value = false }
}



// ── Lifecycle ──
async function loadAll() {
  await loadPermisos()
  await Promise.all([loadStock(), loadMovimientos(), loadProductos(), loadJerarquia(), loadUnidades(), loadConversiones()])
}

onMounted(loadAll)
watch(codneg, loadAll)
</script>

<template>
  <div class="space-y-4">
    <div class="card p-4">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 class="text-lg font-semibold text-main">Inventario</h2>
          <p class="text-sm text-muted">Stock, movimientos, empaques, unidades y conversiones.</p>
        </div>
        <div class="flex gap-2 flex-wrap">
          <button v-if="perms.movCrear || isAdmin" type="button" class="px-4 py-2 btn btn-primary text-sm" @click="showCreateMov = true; resetMovForm(); loadProductos()">
            + Nuevo movimiento
          </button>
          <button type="button" class="px-4 py-2 btn btn-secondary text-sm" :disabled="loading" @click="loadAll">Recargar</button>
        </div>
      </div>
    </div>

    <ErrorAlert v-if="error" :message="error" @dismiss="error = null" />

    <div class="card p-0">
      <div class="flex border-b border-base overflow-x-auto">
        <button
          v-for="tab in (['stock', 'movimientos', 'empaques', 'unidades', 'conversiones'] as const)"
          :key="tab" type="button"
          :class="['px-5 py-2.5 text-sm font-medium transition whitespace-nowrap', activeTab === tab ? 'border-b-2 border-[var(--primary)] text-[var(--primary)]' : 'text-muted hover:text-main']"
          @click="activeTab = tab"
        >
          {{ tab === 'stock' ? 'Stock actual' : tab === 'movimientos' ? 'Movimientos' : tab === 'empaques' ? 'Jerarquía empaques' : tab === 'unidades' ? 'Unidades' : 'Conversiones' }}
        </button>
      </div>

      <div class="p-4">
        <LoadingSpinner v-if="loading" />

        <!-- Stock -->
        <div v-if="!loading && activeTab === 'stock'">
          <BaseTable :columns="stockCols" :rows="stockList" row-key="codinv" striped>
            <template #cell-tipo_prd="{ row }">
              <span class="px-1.5 py-0.5 rounded text-xs font-medium"
                :class="row.tipo_prd === 'compuesto' ? 'bg-blue-100 text-blue-700' : row.tipo_prd === 'empaque' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'"
              >{{ tipoLabel(row.tipo_prd) }}</span>
            </template>
            <template #cell-alerta="{ row }">
              <span v-if="row.stockmin != null && row.stock <= row.stockmin" class="inline-block w-3 h-3 rounded-full bg-red-500" title="Stock bajo" />
              <span v-else class="inline-block w-3 h-3 rounded-full bg-green-500" title="OK" />
            </template>
            <template #cell-acciones="{ row }">
              <button
                v-if="(perms.movCrear || isAdmin) && row.tipo_prd === 'compuesto'"
                class="px-2 py-1 btn btn-secondary text-xs"
                @click="openEnsamblarModal(row)"
              >Ensamblar</button>
            </template>
            <template #empty><EmptyState title="Sin stock" message="No hay registros de inventario." /></template>
          </BaseTable>
        </div>

        <!-- Movimientos -->
        <div v-if="!loading && activeTab === 'movimientos'">
          <BaseTable :columns="movCols" :rows="movimientos" row-key="codmin" striped>
            <template #cell-producto="{ row }">
              <span class="font-medium">{{ row.producto }}</span>
              <span v-if="row.simbolo_umd ?? row.nombre_umd" class="ml-1 text-xs text-muted">({{ row.simbolo_umd ?? row.nombre_umd }})</span>
            </template>
            <template #cell-tipo="{ value }">
              <span :class="['inline-flex px-2 py-0.5 rounded text-xs font-medium', value === 'entrada' ? 'bg-green-100 text-green-700' : value === 'salida' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700']">{{ value }}</span>
            </template>
            <template #cell-fecha="{ value }">{{ fmtDate(value) }}</template>
            <template #empty><EmptyState title="Sin movimientos" message="No se han registrado movimientos." /></template>
          </BaseTable>
        </div>

        <!-- Jerarquía empaques -->
        <div v-if="!loading && activeTab === 'empaques'">
          <div v-if="jerarquia.length === 0" class="text-sm text-muted italic py-4 text-center">
            No hay productos de tipo empaque configurados. Ve a Productos y configura productos con tipo "Empaque".
          </div>
          <div v-else class="space-y-4">
            <p class="text-sm text-muted">
              Cada fila muestra un empaque y el producto que contiene. <strong>Unid. teóricas</strong> = cuántas unidades del contenido aportarían los empaques si se abrieran.
            </p>
            <table class="w-full text-sm border-collapse">
              <thead>
                <tr class="border-b border-base bg-[var(--bg2)]">
                  <th class="text-left px-3 py-2">Empaque</th>
                  <th class="text-right px-3 py-2 w-24">Stock real</th>
                  <th class="text-center px-3 py-2 w-12">×</th>
                  <th class="text-left px-3 py-2">Contiene</th>
                  <th class="text-right px-3 py-2 w-28">Stock contenido</th>
                  <th class="text-right px-3 py-2 w-32">Unid. teóricas</th>
                  <th v-if="perms.movCrear || isAdmin" class="text-center px-3 py-2 w-24">Acción</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in jerarquia" :key="row.codprd_empaque" class="border-b border-base hover:bg-[var(--bg2)]">
                  <td class="px-3 py-2">
                    <span class="font-medium">{{ row.nombre_empaque }}</span>
                    <span v-if="row.codigo_empaque" class="text-muted text-xs ml-1">({{ row.codigo_empaque }})</span>
                  </td>
                  <td class="px-3 py-2 text-right font-mono">{{ row.stock_empaque }}</td>
                  <td class="px-3 py-2 text-center text-muted">{{ row.cantidad_por_contenido }}</td>
                  <td class="px-3 py-2">
                    {{ row.nombre_contenido }}
                    <span v-if="row.codigo_contenido" class="text-muted text-xs ml-1">({{ row.codigo_contenido }})</span>
                    <span v-if="row.tipo_contenido === 'empaque'" class="ml-1 px-1 py-0.5 rounded text-xs bg-amber-100 text-amber-700">empaque</span>
                  </td>
                  <td class="px-3 py-2 text-right font-mono">{{ row.stock_contenido }}</td>
                  <td class="px-3 py-2 text-right font-mono text-[var(--primary)]">
                    {{ row.unidades_teoricas_aportadas }}
                    <span class="text-muted text-xs ml-1">(+{{ row.stock_contenido }} sueltas = {{ row.unidades_teoricas_aportadas + row.stock_contenido }})</span>
                  </td>
                  <td v-if="perms.movCrear || isAdmin" class="px-3 py-2 text-center">
                    <button class="px-2 py-1 btn btn-secondary text-xs" @click="openDestaparModal(row)">Destapar</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Unidades de medida -->
        <div v-if="!loading && activeTab === 'unidades'">
          <div class="flex justify-between mb-3 flex-wrap gap-2">
            <p class="text-sm text-muted">Catálogo global de unidades para definir bases y equivalencias.</p>
            <button v-if="perms.gestionarUnidades || isAdmin" type="button" class="px-4 py-2 btn btn-primary text-sm" @click="showCreateUnidad = true; resetUnidadForm()">
              + Nueva unidad
            </button>
          </div>
          <BaseTable :columns="unidadCols" :rows="unidades" row-key="codumd" striped>
            <template #cell-decimales="{ row }">
              <span v-if="row.tipo !== 'conteo'" class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">Sí</span>
              <span v-else class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">No</span>
            </template>
            <template #cell-acciones="{ row }">
              <button v-if="perms.gestionarUnidades || isAdmin" class="px-2 py-0.5 btn btn-secondary text-xs" @click="openEditUnidad(row)">Editar</button>
            </template>
            <template #empty><EmptyState title="Sin unidades" message="No hay unidades de medida registradas." /></template>
          </BaseTable>
        </div>

        <!-- Conversiones -->
        <div v-if="!loading && activeTab === 'conversiones'">
          <div class="flex justify-between mb-3 flex-wrap gap-2">
            <p class="text-sm text-muted">
              Define equivalencias entre unidades. Se usan en recetas de productos compuestos para convertir cantidades automáticamente.<br>
              <span class="text-xs">Ejemplo: 1 galón = 128 oz → al vender un "Vaso de jugo" (8 oz), se descuentan 0.0625 galones automáticamente.</span>
            </p>
            <button v-if="perms.gestionarConversiones || isAdmin" type="button" class="px-4 py-2 btn btn-primary text-sm" @click="showCreateConversion = true; resetConversionForm()">
              + Nueva conversión
            </button>
          </div>
          <BaseTable :columns="conversionCols" :rows="conversiones" row-key="codcnv" striped>
            <template #cell-origen="{ row }">{{ row.nombre_origen }} ({{ row.simbolo_origen || '—' }})</template>
            <template #cell-destino="{ row }">{{ row.nombre_destino }} ({{ row.simbolo_destino || '—' }})</template>
            <template #empty><EmptyState title="Sin conversiones" message="No hay conversiones configuradas para este negocio." /></template>
          </BaseTable>
        </div>

      </div>
    </div>

    <!-- Modal: Crear movimiento -->
    <BaseModal :open="showCreateMov" title="Registrar movimiento" size="md" @close="showCreateMov = false">
      <div class="space-y-3">
        <ErrorAlert v-if="error" :message="error" @dismiss="error = null" />
        <FormField label="Producto" required>
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
              <option value="ajuste">Ajuste (fijar stock)</option>
            </select>
          </FormField>
          <FormField label="Cantidad" required>
            <input v-model.number="movCantidad" type="number" min="1" class="w-full px-3 py-2 input" placeholder="Ej: 50" />
          </FormField>
        </div>
        <FormField label="Detalle" hint="Opcional">
          <textarea v-model="movDetalle" class="w-full px-3 py-2 input" rows="2" placeholder="Motivo del movimiento..." />
        </FormField>
      </div>
      <template #footer>
        <button type="button" class="px-4 py-2 btn btn-secondary text-sm" @click="showCreateMov = false">Cancelar</button>
        <button type="button" class="px-4 py-2 btn btn-primary text-sm disabled:opacity-60" :disabled="movLoading" @click="createMovimiento">
          {{ movLoading ? 'Registrando…' : 'Registrar' }}
        </button>
      </template>
    </BaseModal>

    <!-- Modal: Destapar empaque -->
    <BaseModal :open="showDestaparModal" :title="`Destapar: ${destaparTarget?.nombre_empaque ?? ''}`" size="sm" @close="showDestaparModal = false">
      <div class="space-y-3">
        <div v-if="destaparTarget" class="bg-[var(--bg2)] border border-base rounded px-3 py-2 text-sm space-y-1">
          <p>Empaque: <strong>{{ destaparTarget.nombre_empaque }}</strong> — Stock actual: <strong>{{ destaparTarget.stock_empaque }}</strong></p>
          <p>Contenido: <strong>{{ destaparTarget.cantidad_por_contenido }} × {{ destaparTarget.nombre_contenido }}</strong> por cada uno</p>
        </div>
        <FormField label="Cantidad a destapar" required hint="Cuántas unidades del empaque abrir">
          <input v-model.number="destaparCantidad" type="number" min="1" :max="destaparTarget?.stock_empaque ?? undefined" class="w-full px-3 py-2 input" placeholder="Ej: 2" />
        </FormField>
        <div v-if="destaparTarget && destaparCantidad && destaparCantidad > 0" class="text-sm text-muted bg-[var(--bg2)] border border-base rounded px-3 py-2">
          Resultado: −{{ destaparCantidad }} {{ destaparTarget.nombre_empaque }},
          +{{ destaparCantidad * destaparTarget.cantidad_por_contenido }} {{ destaparTarget.nombre_contenido }}
        </div>
      </div>
      <template #footer>
        <button type="button" class="px-4 py-2 btn btn-secondary text-sm" @click="showDestaparModal = false">Cancelar</button>
        <button type="button" class="px-4 py-2 btn btn-primary text-sm disabled:opacity-60" :disabled="destaparLoading" @click="doDestapar">
          {{ destaparLoading ? 'Destapando…' : 'Destapar' }}
        </button>
      </template>
    </BaseModal>

    <!-- Modal: Ensamblar compuesto -->
    <BaseModal :open="showEnsamblarModal" :title="`Ensamblar: ${ensamblarTarget?.nombre ?? ''}`" size="sm" @close="showEnsamblarModal = false">
      <div class="space-y-3">
        <p class="text-sm text-muted">Ensamblar descuenta los ingredientes y suma al stock del producto final.</p>
        <div v-if="ensamblarTarget" class="bg-[var(--bg2)] border border-base rounded px-3 py-2 text-sm">
          Stock actual de <strong>{{ ensamblarTarget.nombre }}</strong>: <strong>{{ ensamblarTarget.stock }}</strong>
        </div>
        <FormField label="Cantidad a ensamblar" required>
          <input v-model.number="ensamblarCantidad" type="number" min="1" class="w-full px-3 py-2 input" placeholder="Ej: 5" />
        </FormField>
      </div>
      <template #footer>
        <button type="button" class="px-4 py-2 btn btn-secondary text-sm" @click="showEnsamblarModal = false">Cancelar</button>
        <button type="button" class="px-4 py-2 btn btn-primary text-sm disabled:opacity-60" :disabled="ensamblarLoading" @click="doEnsamblar">
          {{ ensamblarLoading ? 'Ensamblando…' : 'Ensamblar' }}
        </button>
      </template>
    </BaseModal>

    <!-- Modal: Nueva unidad de medida -->
    <BaseModal :open="showCreateUnidad" title="Nueva unidad de medida" size="sm" @close="showCreateUnidad = false">
      <div class="space-y-3">
        <FormField label="Nombre" required>
          <input v-model="newUnidadNombre" type="text" class="w-full px-3 py-2 input" placeholder="Ej: Kilogramo" />
        </FormField>
        <FormField label="Símbolo" hint="Abreviatura corta">
          <input v-model="newUnidadSimbolo" type="text" class="w-full px-3 py-2 input" placeholder="Ej: kg" />
        </FormField>
        <FormField label="Tipo">
          <select v-model="newUnidadTipo" class="w-full px-3 py-2 input">
            <option v-for="t in tiposUnidad" :key="t" :value="t">{{ t }}</option>
          </select>
        </FormField>
      </div>
      <template #footer>
        <button type="button" class="px-4 py-2 btn btn-secondary" @click="showCreateUnidad = false">Cancelar</button>
        <button type="button" class="px-4 py-2 btn btn-primary" :disabled="unidadLoading" @click="createUnidad">
          {{ unidadLoading ? 'Guardando...' : 'Guardar' }}
        </button>
      </template>
    </BaseModal>

    <!-- Modal: Editar unidad de medida -->
    <BaseModal :open="showEditUnidad" title="Editar unidad de medida" size="sm" @close="showEditUnidad = false">
      <div class="space-y-3">
        <FormField label="Nombre" required>
          <input v-model="editUnidadNombre" type="text" class="w-full px-3 py-2 input" placeholder="Ej: Kilogramo" />
        </FormField>
        <FormField label="Símbolo" hint="Abreviatura corta">
          <input v-model="editUnidadSimbolo" type="text" class="w-full px-3 py-2 input" placeholder="Ej: kg" />
        </FormField>
        <FormField label="Tipo">
          <select v-model="editUnidadTipo" class="w-full px-3 py-2 input">
            <option v-for="t in tiposUnidad" :key="t" :value="t">{{ t }}</option>
          </select>
        </FormField>
      </div>
      <template #footer>
        <button type="button" class="px-4 py-2 btn btn-secondary" @click="showEditUnidad = false">Cancelar</button>
        <button type="button" class="px-4 py-2 btn btn-primary" :disabled="editUnidadLoading" @click="updateUnidad">
          {{ editUnidadLoading ? 'Guardando...' : 'Guardar' }}
        </button>
      </template>
    </BaseModal>


    <!-- Modal: Nueva conversión -->
    <BaseModal :open="showCreateConversion" title="Nueva conversión" size="md" @close="showCreateConversion = false">
      <div class="space-y-3">
        <p class="text-sm text-muted mb-2">Regla: cantidad origen × factor = cantidad destino</p>
        <div class="grid grid-cols-2 gap-3">
          <FormField label="Unidad Origen" required>
            <select v-model="newConvOrigen" class="w-full px-3 py-2 input">
              <option :value="null">— Seleccionar —</option>
              <option v-for="u in unidades" :key="u.codumd" :value="u.codumd">{{ u.nombre }} ({{ u.simbolo || '—' }})</option>
            </select>
          </FormField>
          <FormField label="Unidad Destino" required>
            <select v-model="newConvDestino" class="w-full px-3 py-2 input">
              <option :value="null">— Seleccionar —</option>
              <option v-for="u in unidades" :key="u.codumd" :value="u.codumd">{{ u.nombre }} ({{ u.simbolo || '—' }})</option>
            </select>
          </FormField>
        </div>
        <FormField label="Factor" required hint="Ej: 1 caja = 12 unidades → factor = 12">
          <input v-model.number="newConvFactor" type="number" step="0.000001" min="0" class="w-full px-3 py-2 input" />
        </FormField>
      </div>
      <template #footer>
        <button type="button" class="px-4 py-2 btn btn-secondary" @click="showCreateConversion = false">Cancelar</button>
        <button type="button" class="px-4 py-2 btn btn-primary" :disabled="conversionLoading" @click="createConversion">
          {{ conversionLoading ? 'Guardando...' : 'Guardar' }}
        </button>
      </template>
    </BaseModal>

  </div>
</template>
