<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { apiFetch } from '@/utils/api'
import { useSession } from '@/utils/session'
import type {
  AuthzCheckResponse,
  ComposicionInsumoDTO,
  ProductoComposicion,
  ProductoConDetalles,
  ProductoConReceta,
  ProductoDetalle,
} from '@/types'

import BaseTable, { type Column } from '@/components/shared/BaseTable.vue'
import BaseModal from '@/components/shared/BaseModal.vue'
import FormField from '@/components/shared/FormField.vue'
import StatusBadge from '@/components/shared/StatusBadge.vue'
import LoadingSpinner from '@/components/shared/LoadingSpinner.vue'
import ErrorAlert from '@/components/shared/ErrorAlert.vue'
import EmptyState from '@/components/shared/EmptyState.vue'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'

type TipoProductoVisual = 'simple' | 'receta' | 'subproducto'

type Producto = {
  codprd: number
  codneg: number
  nombre: string
  codigo?: string | null
  codcat?: number | null
  codmar?: number | null
  stockmin?: number | null
  estado?: string | null
  precio_venta?: number | null
  precio_compra?: number | null
  costo_unitario_referencia?: number | null
  num_insumos?: number
}

type Categoria = {
  codcat: number
  nombre: string
  codneg?: number | null
  estado?: string | null
}

type Marca = {
  codmar: number
  nombre: string
  codneg?: number | null
  estado?: string | null
}

const { user } = useSession()
const codneg = computed(() => {
  const v = Number(user.value?.codneg)
  return Number.isFinite(v) && v > 0 ? v : null
})
const isAdmin = computed(() => Boolean(user.value?.isAdmin || user.value?.codusr === 'admin'))

const perms = ref({
  crear: false,
  editar: false,
  eliminar: false,
  gestCategorias: false,
  gestMarcas: false,
  gestionarRecetas: false,
})

async function loadPermisos() {
  if (isAdmin.value) {
    perms.value = {
      crear: true,
      editar: true,
      eliminar: true,
      gestCategorias: true,
      gestMarcas: true,
      gestionarRecetas: true,
    }
    return
  }

  if (!codneg.value)
    return

  try {
    const keys = [
      'PRODUCTOS.CREAR',
      'PRODUCTOS.EDITAR',
      'PRODUCTOS.ELIMINAR',
      'PRODUCTOS.CATEGORIAS.GESTIONAR',
      'PRODUCTOS.MARCAS.GESTIONAR',
      'PRODUCTOS.RECETAS.GESTIONAR',
    ]

    const res = await apiFetch<AuthzCheckResponse>('authz/check', {
      method: 'POST',
      body: JSON.stringify({ codneg: codneg.value, permisos: keys }),
    })

    const m = res?.permisos ?? {}
    perms.value = {
      crear: Boolean(m['PRODUCTOS.CREAR']),
      editar: Boolean(m['PRODUCTOS.EDITAR']),
      eliminar: Boolean(m['PRODUCTOS.ELIMINAR']),
      gestCategorias: Boolean(m['PRODUCTOS.CATEGORIAS.GESTIONAR']),
      gestMarcas: Boolean(m['PRODUCTOS.MARCAS.GESTIONAR']),
      gestionarRecetas: Boolean(m['PRODUCTOS.RECETAS.GESTIONAR']),
    }
  } catch {
    perms.value = {
      crear: false,
      editar: false,
      eliminar: false,
      gestCategorias: false,
      gestMarcas: false,
      gestionarRecetas: false,
    }
  }
}

const loading = ref(false)
const error = ref<string | null>(null)
const productos = ref<Producto[]>([])
const categorias = ref<Categoria[]>([])
const marcas = ref<Marca[]>([])
const activeTab = ref<'productos' | 'categorias' | 'marcas'>('productos')

const prodCols: Column[] = [
  { key: 'codprd', label: '#', width: '60px' },
  { key: 'nombre', label: 'Nombre' },
  { key: 'codigo', label: 'Código', width: '120px' },
  { key: 'tipo_visual', label: 'Tipo', width: '120px', align: 'center' },
  { key: 'estructura', label: 'Estructura' },
  { key: 'precio_venta', label: 'P. Venta', width: '100px', align: 'right' },
  { key: 'precio_compra', label: 'P. Compra', width: '100px', align: 'right' },
  { key: 'costo_unitario_referencia', label: 'Costo Unit.', width: '100px', align: 'right' },
  { key: 'estado', label: 'Estado', width: '80px', align: 'center' },
  { key: 'actions', label: '', width: '330px', align: 'center' },
]

function formatMoney(value: number | null | undefined) {
  if (value == null || Number.isNaN(Number(value)))
    return '—'
  return Number(value).toFixed(2)
}

function getTipoProducto(p: Producto): TipoProductoVisual {
  const insumos = Number(p.num_insumos ?? 0)
  if (insumos <= 0)
    return 'simple'
  if (insumos === 1)
    return 'subproducto'
  return 'receta'
}

function tipoLabel(tipo: TipoProductoVisual) {
  if (tipo === 'simple')
    return 'Simple'
  if (tipo === 'subproducto')
    return 'Subproducto'
  return 'Receta'
}

function estructuraResumen(p: Producto) {
  const tipo = getTipoProducto(p)
  if (tipo === 'simple')
    return 'Sin estructura de consumo'
  if (tipo === 'subproducto')
    return 'Nivel empaque: 1 insumo base'
  return `${p.num_insumos ?? 0} insumos de receta`
}

async function loadAll() {
  if (!codneg.value)
    return

  error.value = null
  loading.value = true

  try {
    const [p, c, m, d, r] = await Promise.all([
      apiFetch<Producto[]>(`productos?codneg=${codneg.value}`),
      apiFetch<Categoria[]>(`productos/categorias?codneg=${codneg.value}`),
      apiFetch<Marca[]>(`productos/marcas?codneg=${codneg.value}`),
      apiFetch<ProductoConDetalles[]>(`inventario-avanzado/productos-detallados?codneg=${codneg.value}`),
      apiFetch<ProductoConReceta[]>(`inventario-avanzado/recetas?codneg=${codneg.value}`),
    ])

    const detallesMap = new Map<number, ProductoConDetalles>()
    for (const item of (Array.isArray(d) ? d : []))
      detallesMap.set(Number(item.codprd), item)

    const recetasMap = new Map<number, ProductoConReceta>()
    for (const item of (Array.isArray(r) ? r : []))
      recetasMap.set(Number(item.codprd), item)

    productos.value = (Array.isArray(p) ? p : []).map((item) => {
      const detalle = detallesMap.get(Number(item.codprd))
      const receta = recetasMap.get(Number(item.codprd))
      return {
        ...item,
        precio_venta: detalle?.precio_venta ?? detalle?.precio ?? null,
        precio_compra: detalle?.precio_compra ?? null,
        costo_unitario_referencia: detalle?.costo_unitario_referencia ?? null,
        num_insumos: receta?.num_insumos ?? 0,
      }
    })

    categorias.value = Array.isArray(c) ? c : []
    marcas.value = Array.isArray(m) ? m : []
  } catch (e: any) {
    error.value = e?.message ?? 'Error cargando datos'
  } finally {
    loading.value = false
  }
}

const showCreateProd = ref(false)
const createProdLoading = ref(false)
const newProdNombre = ref('')
const newProdCodigo = ref('')
const newProdCodcat = ref<number | null>(null)
const newProdCodmar = ref<number | null>(null)
const newProdTipo = ref<TipoProductoVisual>('simple')

function resetProdForm() {
  newProdNombre.value = ''
  newProdCodigo.value = ''
  newProdCodcat.value = null
  newProdCodmar.value = null
  newProdTipo.value = 'simple'
}

async function createProducto() {
  error.value = null
  if (!newProdNombre.value.trim()) {
    error.value = 'Nombre requerido'
    return
  }

  createProdLoading.value = true
  try {
    const created = await apiFetch<Producto>('productos', {
      method: 'POST',
      body: JSON.stringify({
        codneg: codneg.value,
        nombre: newProdNombre.value.trim(),
        codigo: newProdCodigo.value.trim() || undefined,
        codcat: newProdCodcat.value,
        codmar: newProdCodmar.value,
      }),
    })

    showCreateProd.value = false

    if (newProdTipo.value === 'simple') {
      resetProdForm()
      await loadAll()
      return
    }

    const row: Producto = {
      ...created,
      precio_venta: null,
      precio_compra: null,
      costo_unitario_referencia: null,
      num_insumos: 0,
    }

    await loadAll()
    await openEstructuraModal(row, newProdTipo.value)
    resetProdForm()
  } catch (e: any) {
    error.value = e?.message ?? 'Error creando producto'
  } finally {
    createProdLoading.value = false
  }
}

const showEditProd = ref(false)
const editTarget = ref<Producto | null>(null)
const editNombre = ref('')
const editCodigo = ref('')
const editCodcat = ref<number | null>(null)
const editCodmar = ref<number | null>(null)
const editStockmin = ref('')
const editLoading = ref(false)

function openEditProd(p: Producto) {
  editTarget.value = p
  editNombre.value = p.nombre
  editCodigo.value = p.codigo ?? ''
  editCodcat.value = p.codcat ?? null
  editCodmar.value = p.codmar ?? null
  editStockmin.value = p.stockmin != null ? String(p.stockmin) : ''
  showEditProd.value = true
}

async function saveEditProd() {
  if (!editTarget.value)
    return

  error.value = null
  editLoading.value = true
  try {
    const body: any = { codneg: codneg.value }
    if (editNombre.value.trim())
      body.nombre = editNombre.value.trim()
    body.codigo = editCodigo.value.trim() || null
    body.codcat = editCodcat.value
    body.codmar = editCodmar.value
    body.stockmin = editStockmin.value.trim() ? Number(editStockmin.value) : null
    await apiFetch(`productos/${editTarget.value.codprd}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
    showEditProd.value = false
    await loadAll()
  } catch (e: any) {
    error.value = e?.message ?? 'Error actualizando'
  } finally {
    editLoading.value = false
  }
}

const showPrecioModal = ref(false)
const precioTarget = ref<Producto | null>(null)
const precioVenta = ref('')
const precioCompra = ref('')
const precioRef = ref<number | null>(null)
const precioLoading = ref(false)

async function openPrecioModal(p: Producto) {
  if (!codneg.value)
    return

  error.value = null
  precioTarget.value = p
  precioVenta.value = p.precio_venta != null ? String(p.precio_venta) : ''
  precioCompra.value = p.precio_compra != null ? String(p.precio_compra) : ''
  precioRef.value = p.costo_unitario_referencia ?? null
  showPrecioModal.value = true

  try {
    const detalle = await apiFetch<ProductoDetalle>(`inventario-avanzado/producto-detalle/${p.codprd}?codneg=${codneg.value}`)
    precioVenta.value = detalle?.precio_venta != null ? String(detalle.precio_venta) : ''
    precioCompra.value = detalle?.precio_compra != null ? String(detalle.precio_compra) : ''
    precioRef.value = detalle?.costo_unitario_referencia ?? null
  } catch {
    // Se conserva la data de la grilla.
  }
}

async function savePrecios() {
  if (!codneg.value || !precioTarget.value)
    return

  const ventaRaw = precioVenta.value.trim()
  const compraRaw = precioCompra.value.trim()
  const venta = ventaRaw ? Number(ventaRaw) : null
  const compra = compraRaw ? Number(compraRaw) : null

  if (venta !== null && (!Number.isFinite(venta) || venta < 0)) {
    error.value = 'El precio de venta debe ser mayor o igual a 0'
    return
  }

  if (compra !== null && (!Number.isFinite(compra) || compra < 0)) {
    error.value = 'El precio de compra debe ser mayor o igual a 0'
    return
  }

  precioLoading.value = true
  try {
    const detalle = await apiFetch<ProductoDetalle>('inventario-avanzado/producto-detalle', {
      method: 'POST',
      body: JSON.stringify({
        codneg: codneg.value,
        codprd: precioTarget.value.codprd,
        precio_venta: venta,
        precio_compra: compra,
      }),
    })

    const idx = productos.value.findIndex(x => x.codprd === precioTarget.value?.codprd)
    if (idx >= 0) {
      productos.value[idx] = {
        ...productos.value[idx],
        precio_venta: detalle?.precio_venta ?? venta,
        precio_compra: detalle?.precio_compra ?? compra,
        costo_unitario_referencia: detalle?.costo_unitario_referencia ?? null,
      }
    }

    precioRef.value = detalle?.costo_unitario_referencia ?? null
    showPrecioModal.value = false
  } catch (e: any) {
    error.value = e?.message ?? 'Error guardando precios'
  } finally {
    precioLoading.value = false
  }
}

const showEstructuraModal = ref(false)
const estructuraLoading = ref(false)
const estructuraTarget = ref<Producto | null>(null)
const estructuraTipo = ref<TipoProductoVisual>('receta')
const estructuraItems = ref<ComposicionInsumoDTO[]>([])
const newInsumoCodprd = ref<number | null>(null)
const newInsumoCantidad = ref<number | null>(null)

async function openEstructuraModal(p: Producto, forceType?: TipoProductoVisual) {
  if (!codneg.value)
    return

  estructuraTarget.value = p
  const detected = getTipoProducto(p)
  estructuraTipo.value = forceType && forceType !== 'simple' ? forceType : (detected === 'simple' ? 'receta' : detected)
  estructuraItems.value = []
  showEstructuraModal.value = true
  estructuraLoading.value = true

  try {
    const detalle = await apiFetch<ProductoComposicion[]>(`inventario-avanzado/recetas/${p.codprd}?codneg=${codneg.value}`)
    estructuraItems.value = detalle.map(item => ({ codprd_insumo: item.codprd_insumo, cantidad: item.cantidad }))

    if (estructuraTipo.value === 'subproducto' && estructuraItems.value.length > 1)
      estructuraItems.value = [estructuraItems.value[0]]
  } catch {
    estructuraItems.value = []
  } finally {
    estructuraLoading.value = false
  }
}

function onChangeEstructuraTipo() {
  if (estructuraTipo.value === 'subproducto' && estructuraItems.value.length > 1)
    estructuraItems.value = [estructuraItems.value[0]]
}

function addEstructuraItem() {
  if (!newInsumoCodprd.value || !newInsumoCantidad.value || newInsumoCantidad.value <= 0) {
    error.value = 'Selecciona insumo y cantidad válida'
    return
  }

  if (estructuraTarget.value?.codprd === newInsumoCodprd.value) {
    error.value = 'Un producto no puede consumirse a sí mismo'
    return
  }

  if (estructuraItems.value.some(item => item.codprd_insumo === newInsumoCodprd.value)) {
    error.value = 'Ese insumo ya existe en la estructura'
    return
  }

  if (estructuraTipo.value === 'subproducto') {
    estructuraItems.value = [{ codprd_insumo: newInsumoCodprd.value, cantidad: newInsumoCantidad.value }]
  } else {
    estructuraItems.value.push({ codprd_insumo: newInsumoCodprd.value, cantidad: newInsumoCantidad.value })
  }

  newInsumoCodprd.value = null
  newInsumoCantidad.value = null
  error.value = null
}

function removeEstructuraItem(idx: number) {
  estructuraItems.value.splice(idx, 1)
}

function getProductoNombre(codprd: number) {
  return productos.value.find(p => p.codprd === codprd)?.nombre ?? `#${codprd}`
}

async function saveEstructura() {
  if (!codneg.value || !estructuraTarget.value)
    return

  if (estructuraTipo.value !== 'simple' && estructuraItems.value.length === 0) {
    error.value = 'Debes agregar al menos un insumo'
    return
  }

  if (estructuraTipo.value === 'subproducto' && estructuraItems.value.length !== 1) {
    error.value = 'Un subproducto debe tener exactamente un insumo base'
    return
  }

  estructuraLoading.value = true
  try {
    await apiFetch('inventario-avanzado/recetas', {
      method: 'POST',
      body: JSON.stringify({
        codneg: codneg.value,
        codprd_final: estructuraTarget.value.codprd,
        insumos: estructuraItems.value,
      }),
    })
    showEstructuraModal.value = false
    await loadAll()
  } catch (e: any) {
    error.value = e?.message ?? 'Error guardando estructura'
  } finally {
    estructuraLoading.value = false
  }
}

async function convertirASimple() {
  if (!codneg.value || !estructuraTarget.value)
    return

  estructuraLoading.value = true
  try {
    await apiFetch('inventario-avanzado/recetas', {
      method: 'POST',
      body: JSON.stringify({
        codneg: codneg.value,
        codprd_final: estructuraTarget.value.codprd,
        insumos: [],
      }),
    })
    showEstructuraModal.value = false
    await loadAll()
  } catch (e: any) {
    error.value = e?.message ?? 'Error convirtiendo a simple'
  } finally {
    estructuraLoading.value = false
  }
}

const showConfirmInactivar = ref(false)
const inactivarTarget = ref<Producto | null>(null)
const inactivarLoading = ref(false)

async function doInactivar() {
  if (!inactivarTarget.value)
    return

  inactivarLoading.value = true
  try {
    await apiFetch(`productos/${inactivarTarget.value.codprd}?codneg=${codneg.value}`, { method: 'DELETE' })
    showConfirmInactivar.value = false
    await loadAll()
  } catch (e: any) {
    error.value = e?.message ?? 'Error inactivando'
  } finally {
    inactivarLoading.value = false
  }
}

const showCreateCat = ref(false)
const newCatNombre = ref('')
const catLoading = ref(false)

async function createCategoria() {
  if (!newCatNombre.value.trim()) {
    error.value = 'Nombre de categoría requerido'
    return
  }

  catLoading.value = true
  try {
    await apiFetch('productos/categorias', {
      method: 'POST',
      body: JSON.stringify({ codneg: codneg.value, nombre: newCatNombre.value.trim() }),
    })
    showCreateCat.value = false
    newCatNombre.value = ''
    await loadAll()
  } catch (e: any) {
    error.value = e?.message ?? 'Error creando categoría'
  } finally {
    catLoading.value = false
  }
}

const showCreateMarca = ref(false)
const newMarcaNombre = ref('')
const marcaLoading = ref(false)

async function createMarca() {
  if (!newMarcaNombre.value.trim()) {
    error.value = 'Nombre de marca requerido'
    return
  }

  marcaLoading.value = true
  try {
    await apiFetch('productos/marcas', {
      method: 'POST',
      body: JSON.stringify({ codneg: codneg.value, nombre: newMarcaNombre.value.trim() }),
    })
    showCreateMarca.value = false
    newMarcaNombre.value = ''
    await loadAll()
  } catch (e: any) {
    error.value = e?.message ?? 'Error creando marca'
  } finally {
    marcaLoading.value = false
  }
}

onMounted(async () => {
  await loadPermisos()
  await loadAll()
})

watch(codneg, async () => {
  await loadPermisos()
  await loadAll()
})
</script>

<template>
  <div class="space-y-4">
    <div class="card p-4">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 class="text-lg font-semibold text-main">Productos</h2>
          <p class="text-sm text-muted">
            Gestiona desde una sola tabla: productos simples, productos receta y subproductos de empaque.
          </p>
        </div>
        <button type="button" class="px-4 py-2 btn btn-secondary text-sm" :disabled="loading" @click="loadAll">Recargar</button>
      </div>
    </div>

    <ErrorAlert v-if="error" :message="error" @dismiss="error = null" />

    <div class="card p-0">
      <div class="flex border-b border-base overflow-x-auto">
        <button
          v-for="tab in (['productos', 'categorias', 'marcas'] as const)"
          :key="tab"
          type="button"
          :class="[
            'px-5 py-2.5 text-sm font-medium transition whitespace-nowrap',
            activeTab === tab ? 'border-b-2 border-[var(--primary)] text-[var(--primary)]' : 'text-muted hover:text-main',
          ]"
          @click="activeTab = tab"
        >
          {{ tab === 'productos' ? 'Productos' : tab === 'categorias' ? 'Categorías' : 'Marcas' }}
        </button>
      </div>

      <div class="p-4">
        <LoadingSpinner v-if="loading" />

        <div v-if="!loading && activeTab === 'productos'">
          <div class="flex justify-end mb-3">
            <button
              v-if="perms.crear || isAdmin"
              type="button"
              class="px-4 py-2 btn btn-primary text-sm"
              @click="showCreateProd = true; resetProdForm()"
            >
              + Nuevo producto
            </button>
          </div>

          <BaseTable :columns="prodCols" :rows="productos" row-key="codprd" striped>
            <template #cell-tipo_visual="{ row }">
              <span class="px-2 py-1 rounded text-xs font-medium"
                :class="getTipoProducto(row) === 'simple'
                  ? 'bg-gray-100 text-gray-700'
                  : getTipoProducto(row) === 'subproducto'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-blue-100 text-blue-700'"
              >
                {{ tipoLabel(getTipoProducto(row)) }}
              </span>
            </template>
            <template #cell-estructura="{ row }">{{ estructuraResumen(row) }}</template>
            <template #cell-precio_venta="{ row }">{{ formatMoney(row.precio_venta) }}</template>
            <template #cell-precio_compra="{ row }">{{ formatMoney(row.precio_compra) }}</template>
            <template #cell-costo_unitario_referencia="{ row }">{{ formatMoney(row.costo_unitario_referencia) }}</template>
            <template #cell-estado="{ row }"><StatusBadge :estado="row.estado" /></template>
            <template #cell-actions="{ row }">
              <div class="flex gap-1 justify-center flex-wrap">
                <button v-if="perms.editar || isAdmin" class="px-2 py-1 btn btn-secondary text-xs" @click="openEditProd(row)">Editar</button>
                <button v-if="perms.editar || isAdmin" class="px-2 py-1 btn btn-secondary text-xs" @click="openPrecioModal(row)">Precios</button>
                <button
                  v-if="perms.gestionarRecetas || isAdmin"
                  class="px-2 py-1 btn btn-secondary text-xs"
                  @click="openEstructuraModal(row)"
                >
                  Estructura
                </button>
                <button
                  v-if="(perms.eliminar || isAdmin) && row.estado === 'A'"
                  class="px-2 py-1 btn text-xs bg-red-100 text-red-700 hover:bg-red-200"
                  @click="inactivarTarget = row; showConfirmInactivar = true"
                >
                  Inactivar
                </button>
              </div>
            </template>
            <template #empty>
              <EmptyState title="Sin productos" message="Aún no hay productos registrados." />
            </template>
          </BaseTable>
        </div>

        <div v-if="!loading && activeTab === 'categorias'">
          <div class="flex justify-end mb-3">
            <button
              v-if="perms.gestCategorias || isAdmin"
              type="button"
              class="px-4 py-2 btn btn-primary text-sm"
              @click="showCreateCat = true; newCatNombre = ''"
            >
              + Nueva categoría
            </button>
          </div>

          <BaseTable
            :columns="[
              { key: 'codcat', label: '#', width: '60px' },
              { key: 'nombre', label: 'Nombre' },
              { key: 'estado', label: 'Estado', width: '80px', align: 'center' },
            ]"
            :rows="categorias"
            row-key="codcat"
            striped
          >
            <template #cell-estado="{ row }"><StatusBadge :estado="row.estado" /></template>
          </BaseTable>
        </div>

        <div v-if="!loading && activeTab === 'marcas'">
          <div class="flex justify-end mb-3">
            <button
              v-if="perms.gestMarcas || isAdmin"
              type="button"
              class="px-4 py-2 btn btn-primary text-sm"
              @click="showCreateMarca = true; newMarcaNombre = ''"
            >
              + Nueva marca
            </button>
          </div>

          <BaseTable
            :columns="[
              { key: 'codmar', label: '#', width: '60px' },
              { key: 'nombre', label: 'Nombre' },
              { key: 'estado', label: 'Estado', width: '80px', align: 'center' },
            ]"
            :rows="marcas"
            row-key="codmar"
            striped
          >
            <template #cell-estado="{ row }"><StatusBadge :estado="row.estado" /></template>
          </BaseTable>
        </div>
      </div>
    </div>

    <BaseModal :open="showCreateProd" title="Nuevo producto" size="md" @close="showCreateProd = false">
      <div class="space-y-3">
        <FormField label="Nombre" required>
          <input v-model="newProdNombre" type="text" class="w-full px-3 py-2 input" placeholder="Nombre del producto" />
        </FormField>
        <FormField label="Código" hint="Opcional, p. ej. SKU o código de barras">
          <input v-model="newProdCodigo" type="text" class="w-full px-3 py-2 input" placeholder="SKU-001" />
        </FormField>
        <div class="grid grid-cols-2 gap-3">
          <FormField label="Categoría">
            <select v-model="newProdCodcat" class="w-full px-3 py-2 input">
              <option :value="null">— Sin categoría —</option>
              <option v-for="c in categorias" :key="c.codcat" :value="c.codcat">{{ c.nombre }}</option>
            </select>
          </FormField>
          <FormField label="Marca">
            <select v-model="newProdCodmar" class="w-full px-3 py-2 input">
              <option :value="null">— Sin marca —</option>
              <option v-for="m in marcas" :key="m.codmar" :value="m.codmar">{{ m.nombre }}</option>
            </select>
          </FormField>
        </div>
        <FormField label="Tipo inicial" hint="Luego podrás convertirlo desde el botón Estructura en la tabla.">
          <select v-model="newProdTipo" class="w-full px-3 py-2 input">
            <option value="simple">Simple</option>
            <option value="receta">Receta (varios insumos)</option>
            <option value="subproducto">Subproducto (caja/paquete/unidad)</option>
          </select>
        </FormField>
      </div>
      <template #footer>
        <button type="button" class="px-4 py-2 btn btn-secondary text-sm" @click="showCreateProd = false">Cancelar</button>
        <button type="button" class="px-4 py-2 btn btn-primary text-sm disabled:opacity-60" :disabled="createProdLoading" @click="createProducto">
          {{ createProdLoading ? 'Creando…' : 'Crear' }}
        </button>
      </template>
    </BaseModal>

    <BaseModal :open="showPrecioModal" title="Precios del producto" size="sm" @close="showPrecioModal = false">
      <div class="space-y-3">
        <p class="text-sm text-muted">{{ precioTarget?.nombre }}</p>
        <FormField label="Precio de venta" hint="Precio final al cliente.">
          <input v-model="precioVenta" type="number" min="0" step="0.01" class="w-full px-3 py-2 input" placeholder="0.00" />
        </FormField>
        <FormField label="Precio de compra" hint="Déjalo vacío si no lo tienes directo.">
          <input v-model="precioCompra" type="number" min="0" step="0.01" class="w-full px-3 py-2 input" placeholder="0.00" />
        </FormField>
        <div class="text-xs text-muted bg-[var(--bg2)] border border-base rounded px-3 py-2">
          Costo unitario de referencia: <span class="font-semibold text-main">{{ formatMoney(precioRef) }}</span>
        </div>
      </div>
      <template #footer>
        <button type="button" class="px-4 py-2 btn btn-secondary text-sm" @click="showPrecioModal = false">Cancelar</button>
        <button type="button" class="px-4 py-2 btn btn-primary text-sm disabled:opacity-60" :disabled="precioLoading" @click="savePrecios">
          {{ precioLoading ? 'Guardando…' : 'Guardar' }}
        </button>
      </template>
    </BaseModal>

    <BaseModal :open="showEstructuraModal" :title="`Estructura: ${estructuraTarget?.nombre ?? ''}`" size="lg" @close="showEstructuraModal = false">
      <div class="space-y-4">
        <FormField label="Tipo de estructura" hint="Puedes convertir este producto entre simple, receta y subproducto.">
          <select v-model="estructuraTipo" class="w-full px-3 py-2 input" @change="onChangeEstructuraTipo">
            <option value="receta">Receta (varios insumos)</option>
            <option value="subproducto">Subproducto (1 insumo base)</option>
          </select>
        </FormField>

        <div v-if="estructuraLoading" class="py-4 flex justify-center">
          <LoadingSpinner />
        </div>

        <div v-else class="space-y-3">
          <div class="border border-base rounded p-3 space-y-2 max-h-56 overflow-auto" v-if="estructuraItems.length">
            <div v-for="(item, idx) in estructuraItems" :key="`${item.codprd_insumo}-${idx}`" class="flex items-center justify-between text-sm gap-3">
              <span>{{ getProductoNombre(item.codprd_insumo) }}</span>
              <div class="flex items-center gap-2">
                <input v-model.number="item.cantidad" type="number" step="0.01" min="0.01" class="w-24 px-2 py-1 input text-right" />
                <button type="button" class="text-red-500 hover:text-red-700" @click="removeEstructuraItem(idx)">Quitar</button>
              </div>
            </div>
          </div>
          <div v-else class="text-sm text-muted italic">
            Sin insumos configurados.
          </div>

          <div class="border-t border-base pt-3">
            <p class="text-sm font-medium mb-2">Agregar insumo</p>
            <div class="flex gap-2 flex-wrap">
              <select v-model="newInsumoCodprd" class="flex-1 min-w-[220px] px-3 py-2 input">
                <option :value="null">— Seleccionar insumo —</option>
                <option
                  v-for="p in productos.filter(item => item.codprd !== estructuraTarget?.codprd)"
                  :key="p.codprd"
                  :value="p.codprd"
                >
                  {{ p.nombre }}{{ p.codigo ? ` (${p.codigo})` : '' }}
                </option>
              </select>
              <input v-model.number="newInsumoCantidad" type="number" step="0.01" min="0.01" class="w-28 px-3 py-2 input" placeholder="Cantidad" />
              <button type="button" class="px-3 py-2 btn btn-secondary" @click="addEstructuraItem">Agregar</button>
            </div>
            <p class="text-xs text-muted mt-2" v-if="estructuraTipo === 'subproducto'">
              En subproducto solo se permite 1 insumo base (ej: Caja -> 6 Paquetes, Paquete -> 6 Unidades).
            </p>
          </div>
        </div>
      </div>
      <template #footer>
        <button type="button" class="px-4 py-2 btn btn-secondary text-sm" @click="showEstructuraModal = false">Cancelar</button>
        <button type="button" class="px-4 py-2 btn text-sm bg-red-100 text-red-700 hover:bg-red-200" :disabled="estructuraLoading" @click="convertirASimple">
          Convertir a simple
        </button>
        <button type="button" class="px-4 py-2 btn btn-primary text-sm disabled:opacity-60" :disabled="estructuraLoading" @click="saveEstructura">
          {{ estructuraLoading ? 'Guardando…' : 'Guardar estructura' }}
        </button>
      </template>
    </BaseModal>

    <BaseModal :open="showEditProd" title="Editar producto" size="md" @close="showEditProd = false">
      <div class="space-y-3">
        <FormField label="Nombre">
          <input v-model="editNombre" type="text" class="w-full px-3 py-2 input" />
        </FormField>
        <FormField label="Código">
          <input v-model="editCodigo" type="text" class="w-full px-3 py-2 input" />
        </FormField>
        <div class="grid grid-cols-2 gap-3">
          <FormField label="Categoría">
            <select v-model="editCodcat" class="w-full px-3 py-2 input">
              <option :value="null">— Sin categoría —</option>
              <option v-for="c in categorias" :key="c.codcat" :value="c.codcat">{{ c.nombre }}</option>
            </select>
          </FormField>
          <FormField label="Marca">
            <select v-model="editCodmar" class="w-full px-3 py-2 input">
              <option :value="null">— Sin marca —</option>
              <option v-for="m in marcas" :key="m.codmar" :value="m.codmar">{{ m.nombre }}</option>
            </select>
          </FormField>
        </div>
        <FormField label="Stock mínimo" hint="Alerta cuando el stock esté por debajo. Vacío = sin control.">
          <input v-model="editStockmin" type="number" min="0" class="w-full px-3 py-2 input" placeholder="Ej: 10" />
        </FormField>
      </div>
      <template #footer>
        <button type="button" class="px-4 py-2 btn btn-secondary text-sm" @click="showEditProd = false">Cancelar</button>
        <button type="button" class="px-4 py-2 btn btn-primary text-sm disabled:opacity-60" :disabled="editLoading" @click="saveEditProd">
          {{ editLoading ? 'Guardando…' : 'Guardar' }}
        </button>
      </template>
    </BaseModal>

    <BaseModal :open="showCreateCat" title="Nueva categoría" size="sm" @close="showCreateCat = false">
      <FormField label="Nombre" required>
        <input v-model="newCatNombre" type="text" class="w-full px-3 py-2 input" placeholder="Nombre de la categoría" />
      </FormField>
      <template #footer>
        <button type="button" class="px-4 py-2 btn btn-secondary text-sm" @click="showCreateCat = false">Cancelar</button>
        <button type="button" class="px-4 py-2 btn btn-primary text-sm disabled:opacity-60" :disabled="catLoading" @click="createCategoria">Crear</button>
      </template>
    </BaseModal>

    <BaseModal :open="showCreateMarca" title="Nueva marca" size="sm" @close="showCreateMarca = false">
      <FormField label="Nombre" required>
        <input v-model="newMarcaNombre" type="text" class="w-full px-3 py-2 input" placeholder="Nombre de la marca" />
      </FormField>
      <template #footer>
        <button type="button" class="px-4 py-2 btn btn-secondary text-sm" @click="showCreateMarca = false">Cancelar</button>
        <button type="button" class="px-4 py-2 btn btn-primary text-sm disabled:opacity-60" :disabled="marcaLoading" @click="createMarca">Crear</button>
      </template>
    </BaseModal>

    <ConfirmDialog
      :open="showConfirmInactivar"
      title="Inactivar producto"
      :message="`¿Inactivar el producto '${inactivarTarget?.nombre}'?`"
      variant="danger"
      confirm-label="Inactivar"
      :loading="inactivarLoading"
      @confirm="doInactivar"
      @cancel="showConfirmInactivar = false"
    />
  </div>
</template>
