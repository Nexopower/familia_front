<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { apiFetch } from '@/utils/api'
import { useSession } from '@/utils/session'
import { useProductosCache } from '@/composables/useCatalogosCache'
import type {
  AuthzCheckResponse,
  ComposicionInsumoDTO,
  ProductoComposicion,
  ProductoConDetalles,
  ProductoConReceta,
  ProductoDetalle,
  TipoPrd,
  ProductoEmpaque,
  Producto,
  Categoria,
  Marca,
  UnidadMedida,
} from '@/types'

import BaseTable, { type Column } from '@/components/shared/BaseTable.vue'
import BaseModal from '@/components/shared/BaseModal.vue'
import FormField from '@/components/shared/FormField.vue'
import StatusBadge from '@/components/shared/StatusBadge.vue'
import LoadingSpinner from '@/components/shared/LoadingSpinner.vue'
import ErrorAlert from '@/components/shared/ErrorAlert.vue'
import EmptyState from '@/components/shared/EmptyState.vue'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'

// types moved to src/types

const { user } = useSession()
// Caché compartido con el buscador de la caja: se invalida al crear/editar aquí.
const productosCacheFacturacion = useProductosCache()
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
const unidades = ref<UnidadMedida[]>([])
const activeTab = ref<'productos' | 'categorias' | 'marcas'>('productos')

// ── Filtros y agrupación ──
const filterSearch = ref('')
const filterTipo = ref<TipoPrd | ''>('')
const filterCodcat = ref<number | null>(null)
const filterCodmar = ref<number | null>(null)
const groupBy = ref<'none' | 'tipo' | 'categoria' | 'marca'>('none')

const filteredProductos = computed(() => {
  let list = productos.value
  const q = filterSearch.value.trim().toLowerCase()
  if (q) list = list.filter(p => p.nombre.toLowerCase().includes(q) || (p.codigo ?? '').toLowerCase().includes(q))
  if (filterTipo.value) list = list.filter(p => (p.tipo_prd ?? 'simple') === filterTipo.value)
  if (filterCodcat.value) list = list.filter(p => p.codcat === filterCodcat.value)
  if (filterCodmar.value) list = list.filter(p => p.codmar === filterCodmar.value)
  return list
})

const productGroups = computed(() => {
  if (groupBy.value === 'none') return null
  const map = new Map<string, { label: string; rows: typeof filteredProductos.value }>()
  for (const p of filteredProductos.value) {
    let key: string
    let label: string
    if (groupBy.value === 'tipo') {
      key = p.tipo_prd ?? 'simple'
      label = key === 'simple' ? 'Simple' : key === 'compuesto' ? 'Compuesto' : 'Empaque'
    } else if (groupBy.value === 'categoria') {
      key = p.codcat != null ? String(p.codcat) : '__sin__'
      label = categorias.value.find(c => c.codcat === p.codcat)?.nombre ?? 'Sin categoría'
    } else {
      key = p.codmar != null ? String(p.codmar) : '__sin__'
      label = marcas.value.find(m => m.codmar === p.codmar)?.nombre ?? 'Sin marca'
    }
    if (!map.has(key)) map.set(key, { label, rows: [] })
    map.get(key)!.rows.push(p)
  }
  return Array.from(map.values())
})

const prodCols: Column[] = [
  { key: 'codprd', label: '#', width: '60px' },
  { key: 'nombre', label: 'Nombre' },
  { key: 'codigo', label: 'Código', width: '110px' },
  { key: 'tipo_visual', label: 'Tipo', width: '110px', align: 'center' },
  { key: 'unidad', label: 'Unidad', width: '80px', align: 'center' },
  { key: 'precio_venta', label: 'P. Venta', width: '90px', align: 'right' },
  { key: 'precio_compra', label: 'P. Compra', width: '90px', align: 'right' },
  { key: 'costo_por_empaque', label: 'Costo/Emp.', width: '95px', align: 'right' },
  { key: 'stockmin', label: 'Stock mín.', width: '80px', align: 'right' },
  { key: 'estado', label: 'Estado', width: '80px', align: 'center' },
  { key: 'actions', label: '', width: '180px', align: 'center' },
]

function formatMoney(value: number | null | undefined) {
  if (value == null || Number.isNaN(Number(value)))
    return '—'
  return Number(value).toFixed(2)
}

function getTipoPrd(p: Producto): TipoPrd {
  return (p.tipo_prd && ['simple', 'compuesto', 'empaque'].includes(p.tipo_prd))
    ? (p.tipo_prd as TipoPrd)
    : 'simple'
}

function tipoLabel(tipo: TipoPrd) {
  if (tipo === 'compuesto') return 'Compuesto'
  if (tipo === 'empaque') return 'Empaque'
  return 'Simple'
}

function estructuraResumen(p: Producto) {
  const tipo = getTipoPrd(p)
  if (tipo === 'compuesto') return `${p.num_insumos ?? 0} ingredientes`
  if (tipo === 'empaque') return 'Jerarquía de empaque'
  return '—'
}

async function sincronizarPreciosEmpaque() {
  if (!codneg.value) return
  try {
    await apiFetch('inventario-avanzado/empaques/propagar-precios', {
      method: 'POST',
      body: JSON.stringify({ codneg: codneg.value }),
    })
  } catch { /* silencioso, no bloquea la carga */ }
}

async function loadAll() {
  if (!codneg.value)
    return

  error.value = null
  loading.value = true

  try {
    const [p, c, m, u] = await Promise.all([
      apiFetch<Producto[]>(`productos?codneg=${codneg.value}`),
      apiFetch<Categoria[]>(`productos/categorias?codneg=${codneg.value}`),
      apiFetch<Marca[]>(`productos/marcas?codneg=${codneg.value}`),
      apiFetch<UnidadMedida[]>('productos/unidades-medida'),
    ])

    productos.value = (Array.isArray(p) ? p : []).map((item: any) => ({
      ...item,
      precio_venta: item.precio ?? null,
    }))
    categorias.value = Array.isArray(c) ? c : []
    marcas.value = Array.isArray(m) ? m : []
    unidades.value = Array.isArray(u) ? u : []
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
const newProdTipo = ref<TipoPrd>('simple')
const newProdStockmin = ref('')
const newProdPrecioVenta = ref('')
const newProdPrecioCompra = ref('')
const newProdCodumd = ref<number | null>(null)
const newEmpaqueContenidoCodprd = ref<number | null>(null)
const newEmpaqueCantidad = ref<number | null>(null)

function resetProdForm() {
  newProdNombre.value = ''
  newProdCodigo.value = ''
  newProdCodcat.value = null
  newProdCodmar.value = null
  newProdTipo.value = 'simple'
  newProdStockmin.value = ''
  newProdPrecioVenta.value = ''
  newProdPrecioCompra.value = ''
  newProdCodumd.value = null
  newEmpaqueContenidoCodprd.value = null
  newEmpaqueCantidad.value = null
}

async function createProducto() {
  error.value = null
  if (!newProdNombre.value.trim()) { error.value = 'Nombre requerido'; return }
  if (newProdTipo.value === 'empaque') {
    if (!newEmpaqueContenidoCodprd.value) { error.value = 'Selecciona el producto que contiene el empaque'; return }
    if (!newEmpaqueCantidad.value || newEmpaqueCantidad.value <= 0) { error.value = 'La cantidad por empaque debe ser mayor a 0'; return }
  }

  createProdLoading.value = true
  try {
    const stockmin = String(newProdStockmin.value ?? '').trim() ? Number(newProdStockmin.value) : null
    const created = await apiFetch<Producto>('productos', {
      method: 'POST',
      body: JSON.stringify({
        codneg: codneg.value,
        nombre: newProdNombre.value.trim(),
        codigo: newProdCodigo.value.trim() || undefined,
        codcat: newProdCodcat.value,
        codmar: newProdCodmar.value,
        tipo_prd: newProdTipo.value,
        stockmin,
      }),
    })

    const venta = String(newProdPrecioVenta.value ?? '').trim() ? Number(newProdPrecioVenta.value) : null
    const compra = String(newProdPrecioCompra.value ?? '').trim() ? Number(newProdPrecioCompra.value) : null
    if (venta !== null || compra !== null) {
      await apiFetch('inventario-avanzado/producto-detalle', {
        method: 'POST',
        body: JSON.stringify({ codneg: codneg.value, codprd: created.codprd, precio_venta: venta, precio_compra: compra }),
      })
    }

    if (newProdTipo.value === 'empaque' && newEmpaqueContenidoCodprd.value && newEmpaqueCantidad.value) {
      await apiFetch('inventario-avanzado/empaques', {
        method: 'POST',
        body: JSON.stringify({ codneg: codneg.value, codprd_empaque: created.codprd, codprd_contenido: newEmpaqueContenidoCodprd.value, cantidad: newEmpaqueCantidad.value }),
      })
    }
    if (newProdCodumd.value) {
      await apiFetch('productos/producto-um', {
        method: 'POST',
        body: JSON.stringify({ codneg: codneg.value, codprd: created.codprd, codumd: newProdCodumd.value }),
      })
    }

    const tipoCreadoFue = newProdTipo.value
    const codprdCreadoFue = created.codprd
    showCreateProd.value = false
    resetProdForm()
    await loadAll()
    // Refleja el producto nuevo al instante en el buscador de la caja.
    productosCacheFacturacion.invalidar()

    if (tipoCreadoFue === 'compuesto') {
      const row = productos.value.find(p => p.codprd === codprdCreadoFue) ?? { ...created, precio_venta: null, precio_compra: null, costo_unitario_referencia: null, num_insumos: 0 }
      await openEstructuraModal(row)
    }
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
const editPrecioVenta = ref('')
const editPrecioCompra = ref('')
const editCodumd = ref<number | null>(null)
const editEmpaqueContenidoCodprd = ref<number | null>(null)
const editEmpaqueCantidad = ref<number | null>(null)
const editLoading = ref(false)

async function openEditProd(p: Producto) {
  editTarget.value = p
  editNombre.value = p.nombre
  editCodigo.value = p.codigo ?? ''
  editCodcat.value = p.codcat ?? null
  editCodmar.value = p.codmar ?? null
  editStockmin.value = p.stockmin != null ? String(p.stockmin) : ''
  editPrecioVenta.value = p.precio_venta != null ? String(p.precio_venta) : ''
  editPrecioCompra.value = p.precio_compra != null ? String(p.precio_compra) : ''
  editCodumd.value = p.codumd ?? null
  editEmpaqueContenidoCodprd.value = null
  editEmpaqueCantidad.value = null
  showEditProd.value = true
  if (codneg.value) {
    try {
      const detalle = await apiFetch<ProductoDetalle>(`inventario-avanzado/producto-detalle/${p.codprd}?codneg=${codneg.value}`)
      editPrecioVenta.value = detalle?.precio_venta != null ? String(detalle.precio_venta) : ''
      editPrecioCompra.value = detalle?.precio_compra != null ? String(detalle.precio_compra) : ''
    } catch { /* conserva los valores de la grilla */ }
    if (p.tipo_prd === 'empaque') {
      try {
        const cfg = await apiFetch<ProductoEmpaque | null>(`inventario-avanzado/empaques/${p.codprd}?codneg=${codneg.value}`)
        if (cfg) { editEmpaqueContenidoCodprd.value = cfg.codprd_contenido; editEmpaqueCantidad.value = cfg.cantidad }
      } catch { /* sin config previa */ }
    }
  }
}

async function saveEditProd() {
  if (!editTarget.value) return
  error.value = null
  if (editTarget.value.tipo_prd === 'empaque') {
    if (!editEmpaqueContenidoCodprd.value) { error.value = 'Selecciona el producto que contiene el empaque'; return }
    if (!editEmpaqueCantidad.value || editEmpaqueCantidad.value <= 0) { error.value = 'La cantidad por empaque debe ser mayor a 0'; return }
  }
  editLoading.value = true
  try {
    const body: any = { codneg: codneg.value }
    if (editNombre.value.trim()) body.nombre = editNombre.value.trim()
    body.codigo = editCodigo.value.trim() || null
    body.codcat = editCodcat.value
    body.codmar = editCodmar.value
    body.stockmin = String(editStockmin.value ?? '').trim() ? Number(editStockmin.value) : null
    await apiFetch(`productos/${editTarget.value.codprd}`, { method: 'PATCH', body: JSON.stringify(body) })

    const venta = String(editPrecioVenta.value ?? '').trim() ? Number(editPrecioVenta.value) : null
    const compra = String(editPrecioCompra.value ?? '').trim() ? Number(editPrecioCompra.value) : null
    await apiFetch('inventario-avanzado/producto-detalle', {
      method: 'POST',
      body: JSON.stringify({ codneg: codneg.value, codprd: editTarget.value.codprd, precio_venta: venta, precio_compra: compra }),
    })

    if (editTarget.value.tipo_prd === 'empaque' && editEmpaqueContenidoCodprd.value && editEmpaqueCantidad.value) {
      await apiFetch('inventario-avanzado/empaques', {
        method: 'POST',
        body: JSON.stringify({ codneg: codneg.value, codprd_empaque: editTarget.value.codprd, codprd_contenido: editEmpaqueContenidoCodprd.value, cantidad: editEmpaqueCantidad.value }),
      })
    }
    await apiFetch('productos/producto-um', {
      method: 'POST',
      body: JSON.stringify({ codneg: codneg.value, codprd: editTarget.value.codprd, codumd: editCodumd.value ?? null }),
    })

    showEditProd.value = false
    await loadAll()
    // Refleja la edición (precio/nombre) al instante en el buscador de la caja.
    productosCacheFacturacion.invalidar()
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

  const ventaRaw = String(precioVenta.value ?? '').trim()
  const compraRaw = String(precioCompra.value ?? '').trim()
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
const estructuraItems = ref<ComposicionInsumoDTO[]>([])
const newInsumoCodprd = ref<number | null>(null)
const newInsumoCantidad = ref<number | null>(null)
const newInsumoInputCodumd = ref<number | null>(null) // unidad en la que el usuario ingresa la cantidad

// Conversiones cargadas para el modal de receta
const conversionesEstructura = ref<any[]>([])

async function loadConversionesEstructura() {
  if (!codneg.value) return
  try { conversionesEstructura.value = await apiFetch<any[]>(`inventario-avanzado/conversiones?codneg=${codneg.value}`) }
  catch { conversionesEstructura.value = [] }
}

// Factor para convertir de 'fromCodumd' a 'toCodumd' usando la tabla de conversiones
// Regla: cantidad_origen * factor = cantidad_destino
// Si buscamos origen→destino: multiplica por factor
// Si buscamos destino→origen: divide por factor
function getConversionFactor(fromCodumd: number, toCodumd: number): number | null {
  if (fromCodumd === toCodumd) return 1
  const dir = conversionesEstructura.value.find(c => c.codumd_origen === fromCodumd && c.codumd_destino === toCodumd)
  if (dir) return Number(dir.factor)
  const inv = conversionesEstructura.value.find(c => c.codumd_origen === toCodumd && c.codumd_destino === fromCodumd)
  if (inv) return 1 / Number(inv.factor)
  return null
}

// Unidad natural del ingrediente seleccionado
const insumoUmdNatural = computed(() => {
  if (!newInsumoCodprd.value) return null
  return productos.value.find(p => p.codprd === newInsumoCodprd.value)?.codumd ?? null
})

// Cantidad convertida a la unidad natural del ingrediente
const cantidadConvertida = computed(() => {
  if (!newInsumoCantidad.value || newInsumoCantidad.value <= 0) return null
  if (!newInsumoInputCodumd.value || !insumoUmdNatural.value) return newInsumoCantidad.value
  if (newInsumoInputCodumd.value === insumoUmdNatural.value) return newInsumoCantidad.value
  const factor = getConversionFactor(newInsumoInputCodumd.value, insumoUmdNatural.value)
  if (factor === null) return null
  return newInsumoCantidad.value * factor
})

// Nombre de una unidad por codumd
function getNombreUmd(codumd: number | null | undefined): string {
  if (!codumd) return ''
  const u = unidades.value.find(u => u.codumd === codumd)
  return u ? (u.simbolo ?? u.nombre) : ''
}

async function openEstructuraModal(p: Producto) {
  if (!codneg.value) return
  estructuraTarget.value = p
  estructuraItems.value = []
  newInsumoCodprd.value = null; newInsumoCantidad.value = null; newInsumoInputCodumd.value = null
  showEstructuraModal.value = true
  estructuraLoading.value = true
  try {
    const [detalle] = await Promise.all([
      apiFetch<ProductoComposicion[]>(`inventario-avanzado/recetas/${p.codprd}?codneg=${codneg.value}`),
      loadConversionesEstructura(),
    ])
    estructuraItems.value = detalle.map(item => ({ codprd_insumo: item.codprd_insumo, cantidad: item.cantidad }))
  } catch {
    estructuraItems.value = []
  } finally {
    estructuraLoading.value = false
  }
}

// ── Empaque modal ──────────────────────────────────────────────────
const showEmpaqueModal = ref(false)
const empaqueLoading = ref(false)
const empaqueTarget = ref<Producto | null>(null)
const empaqueContenidoCodprd = ref<number | null>(null)
const empaqueCantidad = ref<number | null>(null)
const empaqueConfig = ref<ProductoEmpaque | null>(null)

async function openEmpaqueModal(p: Producto) {
  if (!codneg.value) return
  empaqueTarget.value = p
  empaqueContenidoCodprd.value = null
  empaqueCantidad.value = null
  empaqueConfig.value = null
  showEmpaqueModal.value = true
  empaqueLoading.value = true
  try {
    const cfg = await apiFetch<ProductoEmpaque | null>(`inventario-avanzado/empaques/${p.codprd}?codneg=${codneg.value}`)
    if (cfg) {
      empaqueConfig.value = cfg
      empaqueContenidoCodprd.value = cfg.codprd_contenido
      empaqueCantidad.value = cfg.cantidad
    }
  } catch {
    empaqueConfig.value = null
  } finally {
    empaqueLoading.value = false
  }
}

async function saveEmpaque() {
  if (!codneg.value || !empaqueTarget.value) return
  if (!empaqueContenidoCodprd.value) { error.value = 'Selecciona el producto contenido'; return }
  if (!empaqueCantidad.value || empaqueCantidad.value <= 0) { error.value = 'La cantidad debe ser mayor a 0'; return }
  empaqueLoading.value = true
  try {
    await apiFetch('inventario-avanzado/empaques', {
      method: 'POST',
      body: JSON.stringify({
        codneg: codneg.value,
        codprd_empaque: empaqueTarget.value.codprd,
        codprd_contenido: empaqueContenidoCodprd.value,
        cantidad: empaqueCantidad.value,
      }),
    })
    showEmpaqueModal.value = false
    await loadAll()
  } catch (e: any) {
    error.value = e?.message ?? 'Error guardando configuración de empaque'
  } finally {
    empaqueLoading.value = false
  }
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
  // Si el usuario eligió unidad diferente a la natural, verificar que haya conversión
  if (newInsumoInputCodumd.value && insumoUmdNatural.value && newInsumoInputCodumd.value !== insumoUmdNatural.value) {
    if (cantidadConvertida.value === null) {
      error.value = `No hay conversión definida entre "${getNombreUmd(newInsumoInputCodumd.value)}" y "${getNombreUmd(insumoUmdNatural.value)}". Define la conversión en Inventario → Conversiones.`
      return
    }
  }
  const cantFinal = cantidadConvertida.value ?? newInsumoCantidad.value
  estructuraItems.value.push({ codprd_insumo: newInsumoCodprd.value, cantidad: cantFinal })
  newInsumoCodprd.value = null
  newInsumoCantidad.value = null
  newInsumoInputCodumd.value = null
  error.value = null
}

function removeEstructuraItem(idx: number) {
  estructuraItems.value.splice(idx, 1)
}

function getProductoNombre(codprd: number) {
  return productos.value.find(p => p.codprd === codprd)?.nombre ?? `#${codprd}`
}

async function saveEstructura() {
  if (!codneg.value || !estructuraTarget.value) return
  if (estructuraItems.value.length === 0) {
    error.value = 'Debes agregar al menos un ingrediente'
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
    error.value = e?.message ?? 'Error guardando ingredientes'
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
          <!-- Filtros y agrupación -->
          <div class="flex flex-wrap gap-2 mb-3 items-end">
            <input v-model="filterSearch" type="text" class="px-3 py-1.5 input text-sm w-44" placeholder="Buscar nombre/código…" />
            <select v-model="filterTipo" class="px-2 py-1.5 input text-sm">
              <option value="">Todos los tipos</option>
              <option value="simple">Simple</option>
              <option value="compuesto">Compuesto</option>
              <option value="empaque">Empaque</option>
            </select>
            <select v-model="filterCodcat" class="px-2 py-1.5 input text-sm">
              <option :value="null">Todas las categorías</option>
              <option v-for="c in categorias" :key="c.codcat" :value="c.codcat">{{ c.nombre }}</option>
            </select>
            <select v-model="filterCodmar" class="px-2 py-1.5 input text-sm">
              <option :value="null">Todas las marcas</option>
              <option v-for="m in marcas" :key="m.codmar" :value="m.codmar">{{ m.nombre }}</option>
            </select>
            <div class="flex items-center gap-1 text-sm text-muted ml-1">
              <span>Agrupar:</span>
              <select v-model="groupBy" class="px-2 py-1.5 input text-sm">
                <option value="none">Sin agrupación</option>
                <option value="tipo">Por tipo</option>
                <option value="categoria">Por categoría</option>
                <option value="marca">Por marca</option>
              </select>
            </div>
            <div class="flex-1" />
            <button
              v-if="perms.crear || isAdmin"
              type="button"
              class="px-4 py-2 btn btn-primary text-sm"
              @click="showCreateProd = true; resetProdForm()"
            >
              + Nuevo producto
            </button>
          </div>

          <!-- Tabla sin agrupación -->
          <BaseTable v-if="!productGroups" :columns="prodCols" :rows="filteredProductos" row-key="codprd" striped>
            <template #cell-tipo_visual="{ row }">
              <span class="px-2 py-1 rounded text-xs font-medium"
                :class="getTipoPrd(row) === 'simple'
                  ? 'bg-gray-100 text-gray-700'
                  : getTipoPrd(row) === 'empaque'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-blue-100 text-blue-700'"
              >
                {{ tipoLabel(getTipoPrd(row)) }}
              </span>
            </template>
            <template #cell-estructura="{ row }">{{ estructuraResumen(row) }}</template>
            <template #cell-unidad="{ row }">
              <span class="text-xs font-medium">{{ row.simbolo_umd ?? row.nombre_umd ?? '—' }}</span>
            </template>
            <template #cell-precio_venta="{ row }">{{ formatMoney(row.precio_venta) }}</template>
            <template #cell-precio_compra="{ row }">{{ formatMoney(row.precio_compra) }}</template>
            <template #cell-costo_por_empaque="{ row }">
              <span v-if="row.costo_por_empaque != null" class="text-xs text-blue-400">{{ formatMoney(row.costo_por_empaque) }}</span>
              <span v-else class="text-muted">—</span>
            </template>
            <template #cell-stockmin="{ row }">{{ row.stockmin != null ? row.stockmin : '—' }}</template>
            <template #cell-estado="{ row }"><StatusBadge :estado="row.estado" /></template>
            <template #cell-actions="{ row }">
              <div class="flex gap-1 justify-center flex-wrap">
                <button v-if="perms.editar || isAdmin" class="px-2 py-1 btn btn-secondary text-xs" @click="openEditProd(row)">Editar</button>
                <button
                  v-if="(perms.gestionarRecetas || isAdmin) && getTipoPrd(row) === 'compuesto'"
                  class="px-2 py-1 btn btn-secondary text-xs"
                  @click="openEstructuraModal(row)"
                >
                  Ingredientes
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

          <!-- Tabla agrupada -->
          <div v-if="productGroups" class="space-y-4">
            <div v-for="group in productGroups" :key="group.label">
              <div class="text-xs font-semibold uppercase text-muted px-1 mb-1 border-b border-base pb-1">{{ group.label }} ({{ group.rows.length }})</div>
              <BaseTable :columns="prodCols" :rows="group.rows" row-key="codprd" striped>
                <template #cell-tipo_visual="{ row }">
                  <span class="px-2 py-1 rounded text-xs font-medium"
                    :class="getTipoPrd(row) === 'simple' ? 'bg-gray-100 text-gray-700' : getTipoPrd(row) === 'empaque' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'"
                  >{{ tipoLabel(getTipoPrd(row)) }}</span>
                </template>
                <template #cell-unidad="{ row }"><span class="text-xs font-medium">{{ row.simbolo_umd ?? row.nombre_umd ?? '—' }}</span></template>
                <template #cell-precio_venta="{ row }">{{ formatMoney(row.precio_venta) }}</template>
                <template #cell-precio_compra="{ row }">{{ formatMoney(row.precio_compra) }}</template>
                <template #cell-costo_por_empaque="{ row }">
                  <span v-if="row.costo_por_empaque != null" class="text-xs text-blue-400">{{ formatMoney(row.costo_por_empaque) }}</span>
                  <span v-else class="text-muted">—</span>
                </template>
                <template #cell-stockmin="{ row }">{{ row.stockmin != null ? row.stockmin : '—' }}</template>
                <template #cell-estado="{ row }"><StatusBadge :estado="row.estado" /></template>
                <template #cell-actions="{ row }">
                  <div class="flex gap-1 justify-center flex-wrap">
                    <button v-if="perms.editar || isAdmin" class="px-2 py-1 btn btn-secondary text-xs" @click="openEditProd(row)">Editar</button>
                    <button v-if="(perms.gestionarRecetas || isAdmin) && getTipoPrd(row) === 'compuesto'" class="px-2 py-1 btn btn-secondary text-xs" @click="openEstructuraModal(row)">Ingredientes</button>
                    <button v-if="(perms.eliminar || isAdmin) && row.estado === 'A'" class="px-2 py-1 btn text-xs bg-red-100 text-red-700 hover:bg-red-200" @click="inactivarTarget = row; showConfirmInactivar = true">Inactivar</button>
                  </div>
                </template>
                <template #empty><EmptyState title="Sin productos" message="Sin resultados." /></template>
              </BaseTable>
            </div>
          </div>
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
        <FormField label="Tipo" hint="Define cómo se gestiona el inventario de este producto.">
          <select v-model="newProdTipo" class="w-full px-3 py-2 input">
            <option value="simple">Simple — producto común</option>
            <option value="compuesto">Compuesto — canasta, combo, kit (consume ingredientes al armar)</option>
            <option value="empaque">Empaque — caja o paquete que contiene otros (destapable)</option>
          </select>
        </FormField>
        <!-- Campos de empaque (solo cuando tipo = empaque) -->
        <div v-if="newProdTipo === 'empaque'" class="border border-amber-300 rounded-md p-3 space-y-3 bg-amber-50/10">
          <p class="text-xs font-medium text-amber-600">Configuración de empaque</p>
          <FormField label="Contiene (producto)" required hint="El producto individual que hay dentro de este empaque">
            <select v-model="newEmpaqueContenidoCodprd" class="w-full px-3 py-2 input">
              <option :value="null">— Seleccionar producto —</option>
              <option v-for="p in productos" :key="p.codprd" :value="p.codprd">
                {{ p.nombre }}{{ p.codigo ? ` (${p.codigo})` : '' }}
                {{ p.tipo_prd === 'empaque' ? ' [empaque]' : ' [unidad]' }}
              </option>
            </select>
          </FormField>
          <FormField label="Cantidad por empaque" required hint="Cuántas unidades del producto seleccionado trae cada pieza">
            <input v-model.number="newEmpaqueCantidad" type="number" min="1" step="1" class="w-full px-3 py-2 input" placeholder="Ej: 6" />
          </FormField>
          <div v-if="newEmpaqueCantidad && newEmpaqueCantidad > 0 && newProdPrecioCompra" class="text-xs text-muted bg-[var(--bg2)] border border-base rounded px-3 py-2">
            Costo unitario calculado: <strong class="text-main">{{ (Number(newProdPrecioCompra) / newEmpaqueCantidad).toFixed(2) }}</strong> por unidad
          </div>
        </div>
        <div class="border-t border-base pt-3 grid grid-cols-2 gap-3">
          <FormField label="Unidad de medida" hint="Cómo se mide este producto (und, kg, lt…)">
            <select v-model="newProdCodumd" class="w-full px-3 py-2 input">
              <option :value="null">— Sin unidad —</option>
              <option v-for="u in unidades" :key="u.codumd" :value="u.codumd">
                {{ u.nombre }}{{ u.simbolo ? ` (${u.simbolo})` : '' }}
              </option>
            </select>
          </FormField>
          <FormField label="Stock mínimo" hint="Alerta cuando baje de este nivel">
            <input v-model="newProdStockmin" type="number" min="0"
              :step="!newProdCodumd || unidades.find(u => u.codumd === newProdCodumd)?.tipo === 'conteo' ? 1 : 0.001"
              class="w-full px-3 py-2 input" placeholder="Ej: 2.5" />
          </FormField>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <FormField label="Precio de venta">
            <input v-model="newProdPrecioVenta" type="number" min="0" step="0.01" class="w-full px-3 py-2 input" placeholder="0.00" />
          </FormField>
          <FormField label="Precio de compra">
            <input v-model="newProdPrecioCompra" type="number" min="0" step="0.01" class="w-full px-3 py-2 input" placeholder="0.00" />
          </FormField>
        </div>
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

    <BaseModal :open="showEstructuraModal" :title="`Ingredientes: ${estructuraTarget?.nombre ?? ''}`" size="lg" @close="showEstructuraModal = false">
      <div class="space-y-4">
        <p class="text-sm text-muted">
          Define qué ingredientes se consumen cuando se <strong>ensambla</strong> este producto compuesto.<br>
          Al agregar stock del compuesto, los ingredientes se descuentan automáticamente.
        </p>

        <div v-if="estructuraLoading" class="py-4 flex justify-center">
          <LoadingSpinner />
        </div>

        <div v-else class="space-y-3">
          <div class="border border-base rounded p-3 space-y-2 max-h-56 overflow-auto" v-if="estructuraItems.length">
            <div v-for="(item, idx) in estructuraItems" :key="`${item.codprd_insumo}-${idx}`" class="flex items-center justify-between text-sm gap-3">
              <span class="font-medium">{{ getProductoNombre(item.codprd_insumo) }}</span>
              <div class="flex items-center gap-2">
                <span class="text-muted text-xs">Cantidad:</span>
                <input v-model.number="item.cantidad" type="number" step="0.01" min="0.01" class="w-24 px-2 py-1 input text-right" />
                <button type="button" class="text-red-500 hover:text-red-700 text-xs" @click="removeEstructuraItem(idx)">Quitar</button>
              </div>
            </div>
          </div>
          <div v-else class="text-sm text-muted italic">Sin ingredientes configurados.</div>

          <div class="border-t border-base pt-3 space-y-2">
            <p class="text-sm font-medium">Agregar ingrediente</p>
            <div class="flex gap-2 flex-wrap">
              <select v-model="newInsumoCodprd" class="flex-1 min-w-[220px] px-3 py-2 input" @change="newInsumoInputCodumd = null">
                <option :value="null">— Seleccionar ingrediente —</option>
                <option v-for="p in productos.filter(item => item.codprd !== estructuraTarget?.codprd)" :key="p.codprd" :value="p.codprd">
                  {{ p.nombre }}{{ p.codigo ? ` (${p.codigo})` : '' }}{{ p.simbolo_umd ? ` [${p.simbolo_umd}]` : '' }}
                </option>
              </select>
              <input v-model.number="newInsumoCantidad" type="number" step="any" min="0.000001" class="w-28 px-3 py-2 input" placeholder="Cantidad" />
              <!-- Selector de unidad para conversión -->
              <select v-model="newInsumoInputCodumd" class="px-3 py-2 input text-sm">
                <option :value="null">{{ insumoUmdNatural ? getNombreUmd(insumoUmdNatural) || 'Unidad propia' : 'Unidad propia' }}</option>
                <option v-for="u in unidades.filter(u => u.codumd !== insumoUmdNatural)" :key="u.codumd" :value="u.codumd">
                  {{ u.simbolo ?? u.nombre }}
                </option>
              </select>
              <button type="button" class="px-3 py-2 btn btn-secondary" @click="addEstructuraItem">Agregar</button>
            </div>
            <!-- Preview de conversión -->
            <div v-if="newInsumoInputCodumd && insumoUmdNatural && newInsumoInputCodumd !== insumoUmdNatural && newInsumoCantidad" class="text-xs px-3 py-2 rounded border" :class="cantidadConvertida !== null ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-red-50 border-red-200 text-red-700'">
              <template v-if="cantidadConvertida !== null">
                {{ newInsumoCantidad }} {{ getNombreUmd(newInsumoInputCodumd) }} → <strong>{{ cantidadConvertida.toFixed(6).replace(/\.?0+$/, '') }} {{ getNombreUmd(insumoUmdNatural) }}</strong> que se descontarán del ingrediente
              </template>
              <template v-else>
                No hay conversión entre "{{ getNombreUmd(newInsumoInputCodumd) }}" y "{{ getNombreUmd(insumoUmdNatural) }}". Ve a <strong>Inventario → Conversiones</strong> para definirla.
              </template>
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <button type="button" class="px-4 py-2 btn btn-secondary text-sm" @click="showEstructuraModal = false">Cancelar</button>
        <button type="button" class="px-4 py-2 btn text-sm bg-red-100 text-red-700 hover:bg-red-200" :disabled="estructuraLoading" @click="convertirASimple">
          Limpiar ingredientes
        </button>
        <button type="button" class="px-4 py-2 btn btn-primary text-sm disabled:opacity-60" :disabled="estructuraLoading" @click="saveEstructura">
          {{ estructuraLoading ? 'Guardando…' : 'Guardar ingredientes' }}
        </button>
      </template>
    </BaseModal>

    <BaseModal :open="showEmpaqueModal" :title="`Configurar empaque: ${empaqueTarget?.nombre ?? ''}`" size="md" @close="showEmpaqueModal = false">
      <div class="space-y-4">
        <p class="text-sm text-muted">
          Define qué contiene este empaque y cuántas unidades por pieza.<br>
          Ejemplo: "Paquete Coca-Cola" contiene <strong>6</strong> unidades de "Coca-Cola Unidad".
        </p>

        <div v-if="empaqueConfig" class="bg-[var(--bg2)] border border-base rounded px-3 py-2 text-sm">
          Configuración actual: <strong>{{ empaqueConfig.cantidad }}</strong> × <span class="text-[var(--primary)]">{{ empaqueConfig.nombre_contenido }}</span>
        </div>

        <div v-if="empaqueLoading" class="py-4 flex justify-center"><LoadingSpinner /></div>
        <div v-else class="space-y-3">
          <FormField label="Contiene (producto)" required>
            <select v-model="empaqueContenidoCodprd" class="w-full px-3 py-2 input">
              <option :value="null">— Seleccionar producto —</option>
              <option
                v-for="p in productos.filter(item => item.codprd !== empaqueTarget?.codprd)"
                :key="p.codprd"
                :value="p.codprd"
              >
                {{ p.nombre }}{{ p.codigo ? ` (${p.codigo})` : '' }}
                {{ p.tipo_prd === 'empaque' ? ' [empaque]' : p.tipo_prd === 'simple' ? ' [unidad]' : '' }}
              </option>
            </select>
          </FormField>
          <FormField label="Cantidad por empaque" required hint="Cuántas unidades del producto seleccionado hay en cada pieza de este empaque.">
            <input v-model.number="empaqueCantidad" type="number" min="1" step="1" class="w-full px-3 py-2 input" placeholder="Ej: 6" />
          </FormField>
        </div>
      </div>
      <template #footer>
        <button type="button" class="px-4 py-2 btn btn-secondary text-sm" @click="showEmpaqueModal = false">Cancelar</button>
        <button type="button" class="px-4 py-2 btn btn-primary text-sm disabled:opacity-60" :disabled="empaqueLoading" @click="saveEmpaque">
          {{ empaqueLoading ? 'Guardando…' : 'Guardar empaque' }}
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
        <!-- Campos de empaque (solo cuando tipo = empaque) -->
        <div v-if="editTarget?.tipo_prd === 'empaque'" class="border border-amber-300 rounded-md p-3 space-y-3 bg-amber-50/10">
          <p class="text-xs font-medium text-amber-600">Configuración de empaque</p>
          <FormField label="Contiene (producto)" required hint="El producto individual que hay dentro de este empaque">
            <select v-model="editEmpaqueContenidoCodprd" class="w-full px-3 py-2 input">
              <option :value="null">— Seleccionar producto —</option>
              <option v-for="p in productos.filter(x => x.codprd !== editTarget?.codprd)" :key="p.codprd" :value="p.codprd">
                {{ p.nombre }}{{ p.codigo ? ` (${p.codigo})` : '' }}
                {{ p.tipo_prd === 'empaque' ? ' [empaque]' : ' [unidad]' }}
              </option>
            </select>
          </FormField>
          <FormField label="Cantidad por empaque" required hint="Cuántas unidades del producto seleccionado trae cada pieza">
            <input v-model.number="editEmpaqueCantidad" type="number" min="1" step="1" class="w-full px-3 py-2 input" placeholder="Ej: 6" />
          </FormField>
          <div v-if="editEmpaqueCantidad && editEmpaqueCantidad > 0 && editPrecioCompra" class="text-xs text-muted bg-[var(--bg2)] border border-base rounded px-3 py-2">
            Costo unitario calculado: <strong class="text-main">{{ (Number(editPrecioCompra) / editEmpaqueCantidad).toFixed(2) }}</strong> por unidad
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <FormField label="Unidad de medida">
            <select v-model="editCodumd" class="w-full px-3 py-2 input">
              <option :value="null">— Sin unidad —</option>
              <option v-for="u in unidades" :key="u.codumd" :value="u.codumd">
                {{ u.nombre }}{{ u.simbolo ? ` (${u.simbolo})` : '' }}
              </option>
            </select>
          </FormField>
          <FormField label="Stock mínimo" hint="Vacío = sin control">
            <input v-model="editStockmin" type="number" min="0"
              :step="!editCodumd || unidades.find(u => u.codumd === editCodumd)?.tipo === 'conteo' ? 1 : 0.001"
              class="w-full px-3 py-2 input" placeholder="Ej: 2.5" />
          </FormField>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <FormField label="Precio de venta">
            <input v-model="editPrecioVenta" type="number" min="0" step="0.01" class="w-full px-3 py-2 input" placeholder="0.00" />
          </FormField>
          <FormField label="Precio de compra" hint="Precio cuando lo compras directamente">
            <input v-model="editPrecioCompra" type="number" min="0" step="0.01" class="w-full px-3 py-2 input" placeholder="0.00" />
          </FormField>
        </div>
        <div v-if="editTarget?.costo_por_empaque != null" class="text-xs bg-blue-500/10 border border-blue-400/30 rounded px-3 py-2 text-blue-400">
          Costo por empaque padre: <strong>{{ formatMoney(editTarget.costo_por_empaque) }}</strong>
          <span class="opacity-70"> (precio de compra ÷ cantidad del empaque que contiene este producto)</span>
        </div>
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
