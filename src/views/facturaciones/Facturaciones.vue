<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { apiFetch } from '@/utils/api'
import { useSession } from '@/utils/session'
import { useProductosCache, useClientesCache, useProveedoresCache, filtrarCatalogo, normalizarTexto } from '@/composables/useCatalogosCache'
import type { AuthzCheckResponse, ProductoOpt, ClienteOptFull as ClienteOpt, ProveedorOpt, DraftItem } from '@/types'

import BaseTable, { type Column } from '@/components/shared/BaseTable.vue'
import FormField from '@/components/shared/FormField.vue'
import LoadingSpinner from '@/components/shared/LoadingSpinner.vue'
import ErrorAlert from '@/components/shared/ErrorAlert.vue'
import EmptyState from '@/components/shared/EmptyState.vue'
import Factura from './Factura.vue'

// types moved to src/types

const route = useRoute()
const { user, negocios } = useSession()
const codneg = computed(() => { const v = Number(user.value?.codneg); return Number.isFinite(v) && v > 0 ? v : null })
const isAdmin = computed(() => Boolean(user.value?.isAdmin || user.value?.codusr === 'admin'))
const negocioSeleccionado = computed(() => negocios.value.find(n => Number(n.codneg) === Number(codneg.value)) ?? null)

const perms = ref({ ver: false, crear: false, cerrar: false, verOpcionModificarPrecio: false, modificarPrecio: false, fiar: false })
async function loadPermisos() {
  if (isAdmin.value) { perms.value = { ver: true, crear: true, cerrar: true, verOpcionModificarPrecio: true, modificarPrecio: true, fiar: true }; return }
  if (!codneg.value) return
  try {
    const res = await apiFetch<AuthzCheckResponse>('authz/check', {
      method: 'POST',
      body: JSON.stringify({ codneg: codneg.value, permisos: ['FACTURAS.VER', 'FACTURAS.CREAR', 'FACTURAS.CERRAR', 'FACTURAS.VER_OPCION_MODIFICAR_PRECIO', 'FACTURAS.MODIFICAR_PRECIO', 'FACTURAS.FIAR'] }),
    })
    const m = res?.permisos ?? {}
    perms.value = {
      ver: Boolean(m['FACTURAS.VER']),
      crear: Boolean(m['FACTURAS.CREAR']),
      cerrar: Boolean(m['FACTURAS.CERRAR']),
      verOpcionModificarPrecio: Boolean(m['FACTURAS.VER_OPCION_MODIFICAR_PRECIO']),
      modificarPrecio: Boolean(m['FACTURAS.MODIFICAR_PRECIO']),
      fiar: Boolean(m['FACTURAS.FIAR']),
    }
  } catch { perms.value = { ver: false, crear: false, cerrar: false, verOpcionModificarPrecio: false, modificarPrecio: false, fiar: false } }
}

const loading = ref(false)
const error = ref<string | null>(null)

const tipo = ref<'venta' | 'compra'>('venta')

// Catálogos cacheados en memoria (una petición por catálogo, filtrado local).
const productosCache = useProductosCache()
const clientesCache = useClientesCache()
const proveedoresCache = useProveedoresCache()
const productos = productosCache.items

const clienteQ = ref('')
const cliente = ref<ClienteOpt | null>(null)
const clientes = ref<ClienteOpt[]>([])
const clienteLoading = ref(false)

const proveedorQ = ref('')
const proveedor = ref<ProveedorOpt | null>(null)
const proveedores = ref<ProveedorOpt[]>([])
const proveedorLoading = ref(false)

const codigoInput = ref('')
const codigoInputRef = ref<HTMLInputElement | null>(null)
const items = ref<DraftItem[]>([])

// Productos autocomplete / suggestions (filtrado en memoria sobre el caché)
const productSuggestions = ref<ProductoOpt[]>([])
const productSearchLoading = ref(false)
const productSearchError = ref<string | null>(null)

const showPriceAuthDialog = ref(false)
const priceAuthMode = ref<'row' | 'save' | null>(null)
const pendingPriceRowId = ref<string | null>(null)
const authCodusr = ref('')
const authPassword = ref('')
const authLoading = ref(false)
const authError = ref<string | null>(null)
const invoicePriceAuthorization = ref<{ codusr: string; auditId?: number | null } | null>(null)
const priceEditingRowId = ref<string | null>(null)

// Estado para flujo de pago y vista previa
const showPaymentModal = ref(false)
const montoPagado = ref<number | null>(null)
const facturaCreada = ref<{ codfac: number; numero: string; fecha: string } | null>(null)
const showFacturaPreview = ref(false)
const facturaRef = ref<InstanceType<typeof Factura> | null>(null)

function uuid() { return crypto?.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()) }
function newItem(): DraftItem { return { id: uuid(), codprd: null, cantidad: 1, preuni: null } }

function resetDraft() {
  codigoInput.value = ''
  items.value = []
  clienteQ.value = ''; cliente.value = null; clientes.value = []
  proveedorQ.value = ''; proveedor.value = null; proveedores.value = []
  productSuggestions.value = []
  productSearchError.value = null
  showPriceAuthDialog.value = false
  priceAuthMode.value = null
  pendingPriceRowId.value = null
  priceEditingRowId.value = null
  authCodusr.value = ''
  authPassword.value = ''
  authError.value = null
  invoicePriceAuthorization.value = null
  void nextTick(() => {
    codigoInputRef.value?.focus()
  })
}

function fmtMoney(v: number) {
  return new Intl.NumberFormat('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v ?? 0)
}

// Fechas date-only (YYYY-MM-DD): formatear sin desfase de zona horaria.
function fmtFecha(v: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v ?? '')
  if (!m) return v ?? ''
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString()
}

function esConteo(codprd: number | null | undefined): boolean {
  if (!codprd) return true
  const p = productos.value.find(x => x.codprd === codprd)
  // Sin unidad o tipo 'conteo' → solo enteros
  return !p?.tipo_umd || p.tipo_umd === 'conteo'
}

function cantidadStep(codprd: number | null | undefined): number {
  return esConteo(codprd) ? 1 : 0.001
}

function findProductoByCodigo(codeRaw: string): ProductoOpt | null {
  const code = String(codeRaw ?? '').trim()
  if (!code) return null
  const norm = code.toLowerCase()
  return productos.value.find(p => String(p.codigo ?? '').trim().toLowerCase() === norm) ?? null
}

function addProductoToItems(p: ProductoOpt) {
  const existing = items.value.find(x => x.codprd === p.codprd)
  if (existing) {
    existing.cantidad += 1
  } else {
    const line = newItem()
    line.codprd = p.codprd
    line.cantidad = 1
    const picked = tipo.value === 'compra' ? (p.precio_compra ?? p.precio ?? null) : (p.precio ?? null)
    line.preuni = picked === null || picked === undefined ? null : Number(picked)
    line.precioOriginal = line.preuni
    items.value.push(line)
  }
}

/** Busca en el caché local: primero código exacto (escáner), luego contiene. */
function buscarEnCacheProductos(q: string): ProductoOpt[] {
  const nq = normalizarTexto(q)
  const exactos = productos.value.filter(p => normalizarTexto(p.codigo) === nq)
  if (exactos.length) return exactos
  return productos.value.filter(p =>
    normalizarTexto(p.codigo).includes(nq) || normalizarTexto(p.nombre).includes(nq),
  )
}

async function addByCodigo() {
  const code = String(codigoInput.value ?? '').trim()
  if (!code) return
  error.value = null
  // Sin red por escaneo: se resuelve contra el caché (asegurar solo carga la 1ª vez).
  await productosCache.asegurar(codneg.value)
  const raw = buscarEnCacheProductos(code)
  const res = filtrarPorPrecio(raw)
  if (res.length === 0) {
    error.value = raw.length > 0
      ? `El producto existe pero no tiene precio de ${tipo.value === 'venta' ? 'venta' : 'compra'} configurado`
      : 'Producto no encontrado'
    codigoInput.value = ''
    productSuggestions.value = []
    return
  }
  if (res.length === 1) {
    addProductoToItems(res[0])
    codigoInput.value = ''
    productSuggestions.value = []
    return
  }
  // muchos resultados -> mostrar sugerencias para seleccionar
  productSuggestions.value = res
}

function filtrarPorPrecio(list: ProductoOpt[]): ProductoOpt[] {
  if (tipo.value === 'venta') return list.filter(p => p.precio != null && Number(p.precio) > 0)
  return list.filter(p => p.precio_compra != null && Number(p.precio_compra) > 0)
}

// Filtrado en memoria en cada tecla: cero peticiones de red mientras se escribe.
watch(codigoInput, () => {
  productSearchError.value = null
  const q = String(codigoInput.value ?? '').trim()
  if (!q) { productSuggestions.value = []; return }
  productSuggestions.value = filtrarPorPrecio(buscarEnCacheProductos(q)).slice(0, 12)
})

function canSeeModifyPriceOption() {
  return Boolean(isAdmin.value || perms.value.verOpcionModificarPrecio || perms.value.modificarPrecio)
}

function canModifyPrice() {
  return Boolean(isAdmin.value || perms.value.modificarPrecio || invoicePriceAuthorization.value)
}

function hasPricesEdited(): boolean {
  return items.value.some(row => row.codprd && row.preuni !== null && row.preuni !== row.precioOriginal)
}

function startPriceEdit(row: DraftItem) {
  if (!row.codprd) return
  if (canModifyPrice()) {
    priceEditingRowId.value = priceEditingRowId.value === row.id ? null : row.id
    return
  }

  pendingPriceRowId.value = row.id
  priceAuthMode.value = 'row'
  authCodusr.value = ''
  authPassword.value = ''
  authError.value = null
  showPriceAuthDialog.value = true
}

async function requestPriceAuthorization(permission: 'FACTURAS.MODIFICAR_PRECIO') {
  if (!codneg.value) { authError.value = 'Negocio no disponible'; return false }
  authLoading.value = true
  authError.value = null
  try {
    const res = await apiFetch<{ ok: boolean; codusr: string; auditId?: number }>('authz/authorize', {
      method: 'POST',
      body: JSON.stringify({
        codusr: authCodusr.value,
        password: authPassword.value,
        permiso: permission,
        codneg: codneg.value,
      }),
    })
    if (!res?.ok) {
      authError.value = 'No autorizado'
      return false
    }

    invoicePriceAuthorization.value = { codusr: res.codusr, auditId: res.auditId ?? null }
    authCodusr.value = ''
    authPassword.value = ''
    authError.value = null
    showPriceAuthDialog.value = false

    if (priceAuthMode.value === 'row' && pendingPriceRowId.value) {
      priceEditingRowId.value = pendingPriceRowId.value
      pendingPriceRowId.value = null
    }

    return true
  } catch (e: any) {
    authError.value = e?.message ?? 'Error de autorización'
    return false
  } finally {
    authLoading.value = false
  }
}

function removeLine(id: string) { if (items.value.length > 1) items.value = items.value.filter(x => x.id !== id) }

// Productos disponibles según el tipo de factura (filtra los sin precio)
const productosParaFacturar = computed(() => {
  if (tipo.value === 'venta') {
    return productos.value.filter(p => p.precio != null && Number(p.precio) > 0)
  }
  return productos.value.filter(p => p.precio_compra != null && Number(p.precio_compra) > 0)
})

watch(() => tipo.value, () => {
  cliente.value = null; clienteQ.value = ''; clientes.value = []
  proveedor.value = null; proveedorQ.value = ''; proveedores.value = []
  // Al cambiar tipo: eliminar ítems que no tienen precio válido para el nuevo tipo
  items.value = items.value.filter(item => {
    if (!item.codprd) return true // línea vacía, mantener
    const p = productos.value.find(x => x.codprd === item.codprd)
    if (!p) return false
    if (tipo.value === 'compra') {
      if (!p.precio_compra || Number(p.precio_compra) <= 0) return false
    } else {
      if (!p.precio || Number(p.precio) <= 0) return false
    }
    return true
  })
  // Actualizar precio de los ítems que se mantienen
  for (const item of items.value) {
    if (!item.codprd) continue
    const p = productos.value.find(x => x.codprd === item.codprd)
    if (!p) continue
    const newPrice = tipo.value === 'compra' ? (p.precio_compra ?? null) : (p.precio ?? null)
    item.preuni = newPrice == null ? null : Number(newPrice)
    item.precioOriginal = item.preuni
  }
})

const subtotal = computed(() => items.value.reduce((acc, it) => {
  if (!it.codprd) return acc
  const price = it.preuni == null ? 0 : Number(it.preuni)
  return acc + (Number(it.cantidad || 0) * price)
}, 0))

// Por ahora: impuestos/desc. se agregan después. Dejamos estructura lista.
const impuestos = computed(() => 0)
const total = computed(() => subtotal.value + impuestos.value)

const itemCols: Column[] = [
  { key: 'producto', label: 'Producto' },
  { key: 'cantidad', label: 'Cant', width: '130px', align: 'right' },
  { key: 'precio', label: 'Precio', width: '130px', align: 'right' },
  { key: 'subtotal', label: 'Total', width: '130px', align: 'right' },
  { key: 'actions', label: '', width: '60px', align: 'center' },
]

const creating = ref(false)
const cerrarAlCrear = ref(true)

async function loadProductos() {
  if (!codneg.value) return
  try { await productosCache.asegurar(codneg.value) } catch { /* caché vacío */ }
}

// Filtrado EN MEMORIA en cada tecla (antes: una petición de red por tecla).
function buscarClientes() {
  const q = clienteQ.value.trim()
  if (!q) { clientes.value = []; return }
  clientes.value = filtrarCatalogo(clientesCache.items.value, q, ['nombre', 'apellidos', 'cedula', 'email', 'telefono'])
}

function buscarProveedores() {
  const q = proveedorQ.value.trim()
  if (!q) { proveedores.value = []; return }
  proveedores.value = filtrarCatalogo(proveedoresCache.items.value, q, ['nombre', 'apellidos', 'cedula', 'email', 'telefono'])
}

/* ── Refresco manual de catálogos (útil con varias cajas activas) ── */
const refrescandoCatalogos = ref(false)
async function refrescarCatalogos() {
  refrescandoCatalogos.value = true
  try {
    await Promise.all([
      productosCache.refrescar(),
      clientesCache.refrescar(),
      proveedoresCache.refrescar(),
    ])
    // Re-aplicar los filtros visibles con la lista fresca.
    if (clienteQ.value) buscarClientes()
    if (proveedorQ.value) buscarProveedores()
    if (codigoInput.value.trim()) productSuggestions.value = filtrarPorPrecio(buscarEnCacheProductos(codigoInput.value.trim())).slice(0, 12)
  } finally {
    refrescandoCatalogos.value = false
  }
}

function buildPayloadItems() {
  return items.value
    .filter(x => x.codprd && x.cantidad > 0)
    .map(x => {
      const cant = Number(x.cantidad)
      return {
        codprd: Number(x.codprd),
        cantidad: esConteo(x.codprd) ? Math.round(cant) : cant,
        preuni: x.preuni == null || Number.isNaN(Number(x.preuni)) ? null : Number(x.preuni),
      }
    })
}

// Venta a crédito (fiao): requiere permiso FACTURAS.FIAR + cliente con fiao permitido.
// La opción SOLO aparece al intentar cobrar con un monto menor al que se debe.
const fiarVenta = ref(false)
const fiarMonto = ref(0)
const fiarOferta = ref<number | null>(null) // faltante ofrecido a fiar
const clientePuedeFiar = computed(() => Boolean(cliente.value && Number((cliente.value as any).fiar ?? 0)))

/* ── Fondo diario del cliente (vale/bono acumulable) ── */
const fondoInfo = ref<any | null>(null)
const usarFondo = ref(false)
const fondoAdelantar = ref(false)

watch(cliente, async (c) => {
  fondoInfo.value = null; usarFondo.value = false; fondoAdelantar.value = false
  fiarOferta.value = null
  if (!c?.codcli || tipo.value !== 'venta' || !codneg.value) return
  try {
    const info = await apiFetch<any>(`fondos/saldo?codneg=${codneg.value}&codcli=${c.codcli}`)
    if (info?.tiene_fondo) fondoInfo.value = info
  } catch { /* sin fondo */ }
})

// Monto de la factura que cubre el fondo: hasta lo disponible HOY (límite
// diario menos lo ya consumido, sin exceder saldo), más el adelanto si aplica.
const fondoAplicarMonto = computed(() => {
  if (!usarFondo.value || !fondoInfo.value) return 0
  const tope = Number(fondoInfo.value.disponible_hoy ?? 0)
    + (fondoAdelantar.value ? Number(fondoInfo.value.adelanto_posible ?? 0) : 0)
  return Math.max(0, Math.min(total.value, tope))
})
// Lo que falta por pagar en efectivo (o fiao) tras aplicar el fondo.
const restanteTrasFondo = computed(() => Math.max(0, total.value - fondoAplicarMonto.value))
// Lo que realmente se cobra en efectivo (tras fondo y tras lo fiado).
const efectivoACobrar = computed(() => Math.max(0, restanteTrasFondo.value - (fiarMonto.value || 0)))

async function crearFacturaYPrevisualizar() {
  if (!codneg.value) return
  const payloadItems = buildPayloadItems()

  if (!payloadItems.length) { error.value = 'Agrega al menos un producto'; return }
  if (fiarVenta.value && !cliente.value?.codcli) {
    error.value = 'Para fiar debes seleccionar el cliente (a quién se le cobra).'
    return
  }

  creating.value = true
  error.value = null
  try {
    const res = await apiFetch<any>('facturas/completa', {
      method: 'POST',
      body: JSON.stringify({
        codneg: codneg.value,
        tipo: tipo.value,
        codcli: tipo.value === 'venta' ? (cliente.value?.codcli ?? null) : null,
        codpro: tipo.value === 'compra' ? (proveedor.value?.codpro ?? null) : null,
        items: payloadItems,
        cerrar: fiarVenta.value ? true : cerrarAlCrear.value,
        efectivo: montoPagado.value,
        fiar: fiarVenta.value && tipo.value === 'venta',
        fiarMonto: fiarVenta.value && fiarMonto.value > 0 ? fiarMonto.value : null,
        fondoAplicar: fondoAplicarMonto.value > 0 ? fondoAplicarMonto.value : null,
        fondoAdelantar: fondoAdelantar.value,
        autorizacion: invoicePriceAuthorization.value,
      }),
    })
    const factura = res?.factura ?? res
    const codfacValue = Number(factura?.codfac ?? factura?.codfac_fac ?? 0)
    facturaCreada.value = {
      codfac: codfacValue,
      numero: String(factura?.codfac ?? factura?.codfac_fac ?? codfacValue ?? ''),
      fecha: factura?.fecha ?? factura?.fecha_fac ?? new Date().toISOString(),
    }
    showPaymentModal.value = false
    showFacturaPreview.value = true
  } catch (e: any) {
    error.value = e?.message ?? 'Error creando factura'
  } finally {
    creating.value = false
  }
}

function handleGuardarClick() {
  error.value = null
  montoPagado.value = null
  fiarOferta.value = null
  fiarVenta.value = false
  fiarMonto.value = 0
  showPaymentModal.value = true
}

// Si cambia el monto o el fondo, la oferta de fiao anterior deja de valer.
watch([montoPagado, usarFondo, fondoAdelantar], () => { fiarOferta.value = null })

async function handleConfirmarPago() {
  if (hasPricesEdited() && !canModifyPrice()) {
    priceAuthMode.value = 'save'
    authError.value = null
    authCodusr.value = ''
    authPassword.value = ''
    showPriceAuthDialog.value = true
    return
  }
  await crearFacturaYPrevisualizar()
}

async function submitPriceAuthorization() {
  const ok = await requestPriceAuthorization('FACTURAS.MODIFICAR_PRECIO')
  if (!ok) return

  if (priceAuthMode.value === 'save') {
    await crearFacturaYPrevisualizar()
    return
  }
}

function confirmarPago() {
  fiarVenta.value = false
  fiarMonto.value = 0
  error.value = null
  if (montoPagado.value !== null && montoPagado.value < 0) {
    error.value = 'Ingresa un monto válido'
    return
  }
  // Si el fondo cubre todo, se puede continuar sin escribir monto (efectivo 0).
  if (montoPagado.value === null && restanteTrasFondo.value > 0.009) {
    error.value = 'Ingresa el monto pagado'
    return
  }
  // ¿El pago no cubre lo que se debe cobrar? Solo entonces se ofrece fiar.
  const faltante = Math.round((restanteTrasFondo.value - (montoPagado.value ?? 0)) * 100) / 100
  if (faltante > 0.009) {
    if (tipo.value === 'venta' && perms.value.fiar && clientePuedeFiar.value) {
      fiarOferta.value = faltante
    } else if (tipo.value === 'venta' && !cliente.value) {
      error.value = `El monto no cubre el total: faltan ${fmtMoney(faltante)}. Para fiar, selecciona un cliente con fiao permitido.`
    } else if (tipo.value === 'venta' && cliente.value && !clientePuedeFiar.value) {
      error.value = `El monto no cubre el total: faltan ${fmtMoney(faltante)}. A ${cliente.value.nombre} no se le puede fiar.`
    } else {
      error.value = `El monto no cubre el total: faltan ${fmtMoney(faltante)}.`
    }
    return
  }
  fiarOferta.value = null
  void handleConfirmarPago()
}

/** Acepta fiar el faltante ofrecido (deuda parcial: total − fondo − efectivo). */
function confirmarFiarRestante() {
  if (!fiarOferta.value) return
  fiarVenta.value = true
  fiarMonto.value = fiarOferta.value
  fiarOferta.value = null
  void handleConfirmarPago()
}

/* ── Impresión directa (ESC/POS por red, sin diálogo del navegador) ── */
const printLoading = ref(false)
const printError = ref<string | null>(null)

async function imprimirYAbrirCaja() {
  if (!facturaCreada.value) return
  printLoading.value = true; printError.value = null
  try {
    await apiFetch('impresion/factura', {
      method: 'POST',
      body: JSON.stringify({
        codneg: codneg.value,
        codfac: facturaCreada.value.codfac,
        tipo: tipo.value,
        abrirCajon: true,
        montoPagado: montoPagado.value ?? 0,
        cambio: (montoPagado.value ?? 0) - efectivoACobrar.value,
        fondoAplicado: fondoAplicarMonto.value > 0 ? fondoAplicarMonto.value : null,
        fiado: fiarMonto.value > 0 ? fiarMonto.value : null,
      }),
    })
    finalizarFactura()
  } catch (e: any) {
    const msg = String(e?.message ?? '')
    if (msg.includes('IMPRESORA_NO_CONFIGURADA')) {
      // Sin impresora de red configurada: usar la impresión del navegador.
      printError.value = 'Sin impresora de red configurada (Caja → Configuración). Usando impresión del navegador…'
      facturaRef.value?.imprimirFactura()
      setTimeout(finalizarFactura, 800)
    } else {
      // Falla de conexión: mostrar y dejar la vista abierta para reintentar.
      printError.value = msg || 'No se pudo imprimir'
    }
  } finally {
    printLoading.value = false
  }
}

async function continuarSinImprimir() {
  // Abrir el cajón sin imprimir (el cajón está conectado a la impresora).
  try {
    await apiFetch('impresion/abrir-cajon', { method: 'POST', body: JSON.stringify({ codneg: codneg.value }) })
  } catch { /* sin impresora configurada: continuar igual */ }
  finalizarFactura()
}

function finalizarFactura() {
  showFacturaPreview.value = false
  facturaCreada.value = null
  printError.value = null
  montoPagado.value = null
  fiarVenta.value = false
  fiarMonto.value = 0
  fiarOferta.value = null
  fondoInfo.value = null
  usarFondo.value = false
  fondoAdelantar.value = false
  resetDraft()
}

async function loadFacturaParaEditar(codfac: number, tipoFac: string) {
  try {
    const data = await apiFetch<any>(`facturas/${codfac}?tipo=${tipoFac}`)
    const fac = data.factura ?? data
    if (fac.estado === 'cerrada') return
    tipo.value = tipoFac as 'venta' | 'compra'
    const lineas: any[] = data.detalle ?? []
    items.value = lineas.map((l: any) => ({
      id: uuid(),
      codprd: l.codprd,
      cantidad: l.cantidad,
      preuni: l.precio,
    }))
  } catch { /* silencioso */ }
}

onMounted(async () => {
  await loadPermisos()
  await loadProductos()
  // Precarga de clientes/proveedores en segundo plano (una petición por catálogo).
  void clientesCache.asegurar(codneg.value)
  void proveedoresCache.asegurar(codneg.value)
  resetDraft()
  const qCodfac = route.query.codfac ? Number(route.query.codfac) : null
  const qTipo = route.query.tipo ? String(route.query.tipo) : null
  if (qCodfac && qTipo) {
    await loadFacturaParaEditar(qCodfac, qTipo)
  }
})
watch(codneg, async () => {
  await loadPermisos()
  await loadProductos()
  void clientesCache.asegurar(codneg.value)
  void proveedoresCache.asegurar(codneg.value)
  resetDraft()
})
</script>

<template>
  <div class="space-y-4">
    <div class="card p-4">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 class="text-lg font-semibold text-main">Facturaciones</h2>
          <p class="text-sm text-muted">Registro rápido de ventas/compras (ideal teclado).</p>
        </div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="px-3 py-2 btn btn-secondary text-sm disabled:opacity-60"
            :disabled="refrescandoCatalogos"
            title="Vuelve a cargar productos, clientes y proveedores desde el servidor (útil si otra caja registró cambios)"
            @click="refrescarCatalogos"
          >
            {{ refrescandoCatalogos ? '⟳ Actualizando…' : '⟳ Actualizar listas' }}
          </button>
          <select v-model="tipo" class="px-3 py-2 input text-sm">
            <option value="venta">Venta</option>
            <option value="compra">Compra</option>
          </select>
          <label class="inline-flex items-center gap-2 text-sm text-main">
            <input v-model="cerrarAlCrear" type="checkbox" />
            Cerrar al guardar
          </label>
        </div>
      </div>
    </div>

    <ErrorAlert v-if="error" :message="error" @dismiss="error = null" />

    <div v-if="!(perms.crear || isAdmin)" class="card p-4">
      <EmptyState title="Sin permisos" message="No tienes permiso para facturar." />
    </div>

    <div v-else class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div class="lg:col-span-2 space-y-4">
        <div class="card p-4 space-y-3">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
            <FormField label="Código de barras / Código" hint="Enter para agregar">
              <div>
                <input
                  ref="codigoInputRef"
                  v-model="codigoInput"
                  class="w-full px-3 py-2 input"
                  placeholder="Escanear…"
                  autofocus
                  @keydown.enter.prevent="addByCodigo"
                />

                <LoadingSpinner v-if="productSearchLoading" size="sm" />

                <div v-if="productSuggestions.length" class="max-h-56 overflow-auto border border-white/10 rounded mt-2">
                  <button
                    v-for="p in productSuggestions"
                    :key="p.codprd"
                    type="button"
                    class="w-full text-left px-3 py-2 hover:bg-white/5 text-sm"
                    @click="() => { addProductoToItems(p); productSuggestions = []; codigoInput = ''; }"
                  >
                    <div class="text-main font-medium">{{ p.nombre }} <span v-if="p.codigo">({{ p.codigo }})</span><span v-if="p.simbolo_umd" class="ml-1 text-xs text-muted">[{{ p.simbolo_umd }}]</span></div>
                    <div class="text-xs text-muted">{{ tipo === 'compra' ? fmtMoney(Number(p.precio_compra ?? 0)) : fmtMoney(Number(p.precio ?? 0)) }}</div>
                  </button>
                </div>

                <div v-if="productSearchError" class="text-xs text-red-400 mt-1">{{ productSearchError }}</div>
              </div>
            </FormField>
          </div>

          <div class="card p-3">
            <BaseTable :columns="itemCols" :rows="items" row-key="id" striped>
              <template #cell-producto="{ row }">
                <select v-model="row.codprd" class="w-full px-3 py-2 input text-sm" @change="() => { const p = productosParaFacturar.find(x => x.codprd === row.codprd); if (p) { const price = tipo === 'compra' ? (p.precio_compra ?? null) : (p.precio ?? null); row.preuni = price == null ? null : Number(price); row.precioOriginal = row.preuni } }">
                  <option :value="null">— Seleccionar —</option>
                  <option v-for="p in productosParaFacturar" :key="p.codprd" :value="p.codprd">{{ p.nombre }}{{ p.codigo ? ` (${p.codigo})` : '' }}{{ p.simbolo_umd ? ` [${p.simbolo_umd}]` : '' }}</option>
                </select>
              </template>
              <template #cell-cantidad="{ row }">
                <div class="flex flex-row items-end gap-0.5">
                  <input
                    v-model.number="row.cantidad"
                    type="number"
                    min="0"
                    step="any"
                    class="w-full px-3 py-2 input text-sm text-right"
                    @blur="() => { if (esConteo(row.codprd) && row.cantidad % 1 !== 0) row.cantidad = Math.round(row.cantidad) }"
                  />
                  <span v-if="row.codprd && productos.find(p => p.codprd === row.codprd)?.simbolo_umd" class="text-xs text-muted pb-3 pl-1">
                    {{ productos.find(p => p.codprd === row.codprd)?.simbolo_umd }}
                  </span>
                </div>
              </template>
              <template #cell-precio="{ row }">
                <div class="flex items-center justify-end gap-2">
                  <div class="text-right text-sm text-main">{{ fmtMoney(row.preuni || 0) }}</div>
                  <input
                    v-if="priceEditingRowId === row.id"
                    v-model.number="row.preuni"
                    type="number"
                    min="0"
                    step="0.01"
                    class="w-28 px-2 py-1 input text-sm text-right"
                    @keydown.enter.prevent="priceEditingRowId = null"
                  />
                </div>
              </template>
              <template #cell-subtotal="{ row }">
                <div class="text-right text-sm text-main">
                  {{ fmtMoney((row.cantidad || 0) * (row.preuni || 0)) }}
                </div>
              </template>
              <template #cell-actions="{ row }">
                <div class="flex items-center justify-center gap-1">
                  <button
                    v-if="canSeeModifyPriceOption()"
                    type="button"
                    class="px-3 py-2 btn btn-secondary text-sm"
                    :disabled="!row.codprd"
                    @click="startPriceEdit(row)"
                  >
                    {{ priceEditingRowId === row.id ? 'Cerrar' : 'Modificar precio' }}
                  </button>
                  <button type="button" class="px-3 py-2 btn btn-secondary text-sm" @click="removeLine(row.id)">×</button>
                </div>
              </template>
            </BaseTable>
          </div>
        </div>
      </div>

      <div class="space-y-4">
        <div class="card p-4 space-y-3">
          <div class="text-sm font-medium text-main">Cliente / Proveedor (opcional)</div>

          <div v-if="tipo === 'venta'" class="space-y-2">
            <FormField label="Buscar cliente" hint="Nombre/cedula/email (opcional)">
              <input v-model="clienteQ" class="w-full px-3 py-2 input text-sm" @input="buscarClientes" placeholder="Escribe para buscar…" />
            </FormField>
            <LoadingSpinner v-if="clienteLoading" size="sm" />
            <div v-if="clientes.length" class="max-h-56 overflow-auto border border-white/10 rounded">
              <button
                v-for="c in clientes"
                :key="c.codcli"
                type="button"
                class="w-full text-left px-3 py-2 hover:bg-white/5 text-sm"
                @click="cliente = c; clientes = []; clienteQ = `${c.nombre} ${c.apellidos ?? ''}`.trim()"
              >
                <div class="text-main font-medium">{{ c.nombre }} {{ c.apellidos }}</div>
                <div class="text-xs text-muted">{{ c.cedula || c.email || '' }}</div>
              </button>
            </div>
            <div v-if="cliente" class="text-xs text-muted">Seleccionado: <span class="text-main font-medium">{{ cliente.nombre }} {{ cliente.apellidos }}</span></div>
          </div>

          <div v-else class="space-y-2">
            <FormField label="Buscar proveedor" hint="Nombre/cedula/email (opcional)">
              <input v-model="proveedorQ" class="w-full px-3 py-2 input text-sm" @input="buscarProveedores" placeholder="Escribe para buscar…" />
            </FormField>
            <LoadingSpinner v-if="proveedorLoading" size="sm" />
            <div v-if="proveedores.length" class="max-h-56 overflow-auto border border-white/10 rounded">
              <button
                v-for="p in proveedores"
                :key="p.codpro"
                type="button"
                class="w-full text-left px-3 py-2 hover:bg-white/5 text-sm"
                @click="proveedor = p; proveedores = []; proveedorQ = `${p.nombre} ${p.apellidos ?? ''}`.trim()"
              >
                <div class="text-main font-medium">{{ p.nombre }} {{ p.apellidos }}</div>
                <div class="text-xs text-muted">{{ p.cedula || p.email || '' }}</div>
              </button>
            </div>
            <div v-if="proveedor" class="text-xs text-muted">Seleccionado: <span class="text-main font-medium">{{ proveedor.nombre }} {{ proveedor.apellidos }}</span></div>
          </div>
        </div>

        <div class="card p-4 space-y-2">
          <div class="flex items-center justify-between">
            <div class="text-sm text-muted">Subtotal</div>
            <div class="text-xl font-semibold text-main">{{ fmtMoney(subtotal) }}</div>
          </div>
          <div class="flex items-center justify-between">
            <div class="text-sm text-muted">Impuestos</div>
            <div class="text-lg font-medium text-main">{{ fmtMoney(impuestos) }}</div>
          </div>
          <div class="h-px bg-white/10 my-2" />
          <div class="flex items-center justify-between">
            <div class="text-sm text-muted">Total</div>
            <div class="text-2xl font-bold text-main">{{ fmtMoney(total) }}</div>
          </div>

          <button
            type="button"
            class="w-full mt-3 px-4 py-3 btn btn-primary text-base disabled:opacity-60"
            :disabled="creating"
            @click="handleGuardarClick"
          >
            {{ creating ? 'Cobrando' : 'Cobrar' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Modal de autorización para cambio de precio en factura -->
    <div v-if="showPriceAuthDialog" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div class="card p-6 w-full max-w-md">
        <h3 class="text-lg font-semibold text-main mb-3">
          {{ priceAuthMode === 'row' ? 'Autorizar modificación de precio' : 'Autorizar cambios de precio para esta factura' }}
        </h3>
        <p class="text-sm text-muted mb-4">Ingresa credenciales de un usuario autorizado con permiso para modificar precios:</p>
        
        <div class="space-y-3">
          <input
            v-model="authCodusr"
            type="text"
            class="w-full px-3 py-2 input text-sm"
            placeholder="Usuario"
            autocomplete="off"
            name="auth-usuario"
          />
          <input
            v-model="authPassword"
            type="password"
            class="w-full px-3 py-2 input text-sm"
            placeholder="Contraseña"
            autocomplete="new-password"
            name="auth-contrasena"
          />
          <div v-if="authError" class="text-xs text-red-400">{{ authError }}</div>
        </div>

        <div class="flex gap-2 mt-6 justify-end">
          <button
            type="button"
            class="px-4 py-2 btn btn-secondary text-sm"
            :disabled="authLoading"
            @click="showPriceAuthDialog = false; priceAuthMode = null; pendingPriceRowId = null"
          >
            Cancelar
          </button>
          <button
            type="button"
            class="px-4 py-2 btn btn-primary text-sm"
            :disabled="authLoading"
            @click="submitPriceAuthorization"
          >
            {{ authLoading ? 'Autorizando…' : 'Autorizar' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Modal de Pago -->
    <div v-if="showPaymentModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div class="card p-6 w-full max-w-md">
        <h3 class="text-lg font-semibold text-main mb-4">Ingresar Pago del Cliente</h3>
        
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-main mb-2">Total a Pagar</label>
            <div class="text-3xl font-bold text-green-600">{{ fmtMoney(total) }}</div>
          </div>

          <!-- Fondo diario del cliente -->
          <div v-if="fondoInfo" class="p-3 rounded border border-base space-y-2">
            <label class="flex items-center gap-2 text-sm text-main font-medium">
              <input v-model="usarFondo" type="checkbox" class="rounded" />
              💳 Aplicar fondo del cliente
            </label>
            <p class="text-xs text-muted ml-6">
              Saldo: <span class="font-semibold" :class="fondoInfo.saldo >= 0 ? 'text-green-600' : 'text-red-600'">{{ fmtMoney(fondoInfo.saldo) }}</span>
              · Límite diario: <span class="font-semibold text-main">{{ fmtMoney(fondoInfo.monto_diario) }}</span>
              · Disponible hoy: <span class="font-semibold" :class="fondoInfo.disponible_hoy > 0 ? 'text-green-600' : 'text-red-600'">{{ fmtMoney(fondoInfo.disponible_hoy) }}</span>
              <span v-if="!fondoInfo.hoy_habilitado" class="text-amber-600"> · hoy no es día habilitado</span>
              <span v-if="fondoInfo.adelanto_activo" class="text-amber-600"> · adelanto activo</span>
            </p>
            <template v-if="usarFondo">
              <!-- El total excede lo disponible hoy: faltante + opción de adelanto -->
              <div v-if="total > Number(fondoInfo.disponible_hoy)" class="ml-6 p-2 rounded bg-amber-500/10 space-y-1.5">
                <p class="text-xs text-amber-700">
                  {{ fondoInfo.hoy_habilitado ? 'Excede lo disponible hoy' : 'Hoy no puede consumir del fondo' }}:
                  faltan <strong>{{ fmtMoney(total - Number(fondoInfo.disponible_hoy)) }}</strong>.
                </p>
                <label v-if="Number(fondoInfo.adelanto_posible) > 0" class="flex items-center gap-2 text-xs text-amber-700">
                  <input v-model="fondoAdelantar" type="checkbox" class="rounded" />
                  Adelantar del {{ fmtFecha(fondoInfo.proximo_dia_habilitado) }} (hasta +{{ fmtMoney(fondoInfo.adelanto_posible) }}; el límite de ese día queda reducido; máx. 1 adelanto)
                </label>
                <p v-else-if="fondoInfo.adelanto_activo" class="text-xs text-red-600">
                  Ya tiene un adelanto activo: la diferencia se paga en efectivo (o se fía).
                </p>
                <p v-if="total > Number(fondoInfo.disponible_con_adelanto)" class="text-xs text-amber-700">
                  Aun con el adelanto faltarían <strong>{{ fmtMoney(total - Number(fondoInfo.disponible_con_adelanto)) }}</strong> a pagar aparte.
                </p>
              </div>
              <div class="flex justify-between text-sm ml-6">
                <span class="text-muted">Cubre el fondo:</span>
                <span class="font-medium text-green-600">{{ fmtMoney(fondoAplicarMonto) }}</span>
              </div>
              <div class="flex justify-between text-sm ml-6">
                <span class="text-muted">Restante a pagar:</span>
                <span class="font-bold" :class="restanteTrasFondo > 0 ? 'text-main' : 'text-green-600'">{{ fmtMoney(restanteTrasFondo) }}</span>
              </div>
            </template>
          </div>

          <div>
            <label class="block text-sm font-medium text-main mb-2">Monto Pagado{{ usarFondo && fondoAplicarMonto > 0 ? ' (restante)' : '' }}</label>
            <input
              v-model.number="montoPagado"
              type="number"
              min="0"
              step="0.01"
              class="w-full px-3 py-2 input text-lg font-bold text-right"
              placeholder="0.00"
              autofocus
            />
          </div>

          <div v-if="montoPagado !== null && montoPagado >= 0" class="p-3 bg-white/5 rounded">
            <div class="flex justify-between text-sm mb-2">
              <span class="text-muted">{{ usarFondo && fondoAplicarMonto > 0 ? 'Restante (tras fondo):' : 'Total:' }}</span>
              <span class="font-medium">{{ fmtMoney(restanteTrasFondo) }}</span>
            </div>
            <div class="flex justify-between text-lg font-bold" :class="montoPagado - restanteTrasFondo >= 0 ? 'text-green-500' : 'text-red-500'">
              <span>{{ montoPagado - restanteTrasFondo >= 0 ? 'Cambio' : 'Falta' }}:</span>
              <span>{{ fmtMoney(Math.abs(montoPagado - restanteTrasFondo)) }}</span>
            </div>
          </div>

          <!-- Oferta de fiao: aparece SOLO al intentar cobrar con monto insuficiente,
               con cliente que tiene el fiao permitido y usuario autorizado. -->
          <div v-if="fiarOferta" class="p-3 rounded bg-amber-500/10 border border-amber-500/30 space-y-2">
            <p class="text-sm text-amber-700">
              El pago no cubre el total: faltan <strong>{{ fmtMoney(fiarOferta) }}</strong>.
            </p>
            <p v-if="cliente && (cliente as any).limite_fiado != null" class="text-xs text-muted">
              Límite de fiado de {{ cliente.nombre }}: {{ fmtMoney(Number((cliente as any).limite_fiado)) }}
            </p>
            <div class="flex gap-2 flex-wrap">
              <button
                type="button"
                class="px-4 py-2 btn text-sm bg-amber-100 text-amber-800 hover:bg-amber-200 disabled:opacity-50"
                :disabled="creating"
                @click="confirmarFiarRestante"
              >
                📒 Fiar {{ fmtMoney(fiarOferta) }} a {{ cliente?.nombre }}
              </button>
              <button type="button" class="px-4 py-2 btn btn-secondary text-sm" @click="fiarOferta = null">
                No fiar
              </button>
            </div>
          </div>

          <div v-if="error" class="text-xs text-red-400">{{ error }}</div>
        </div>

        <div class="flex gap-2 mt-6 justify-between items-center flex-wrap">
          <span />

          <div class="flex gap-2">
            <button
              type="button"
              class="px-4 py-2 btn btn-secondary text-sm"
              @click="showPaymentModal = false"
            >
              Cancelar
            </button>
            <button
              type="button"
              class="px-4 py-2 btn btn-primary text-sm"
              :disabled="creating || (montoPagado === null && restanteTrasFondo > 0.009) || (montoPagado !== null && montoPagado < 0)"
              @click="confirmarPago"
            >
              Continuar a Factura
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Vista Previa de Factura (Fullscreen) -->
    <div v-if="showFacturaPreview && facturaCreada" class="fixed inset-0 !mt-0 bg-gray-200 z-50 overflow-auto">
      <div class="flex items-center justify-between sticky top-0 bg-gray-900 p-4 border-b border-gray-700 print:hidden">
        <h2 class="text-white font-semibold">Vista Previa de Factura</h2>
        <div class="flex gap-2">
          <button
            type="button"
            class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm disabled:opacity-60"
            :disabled="printLoading"
            @click="imprimirYAbrirCaja"
          >
            {{ printLoading ? '🖨️ Imprimiendo…' : '🖨️ Imprimir y Abrir Caja' }}
          </button>
          <button
            type="button"
            class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
            @click="continuarSinImprimir"
          >
            ▶️ Continuar (sin imprimir)
          </button>
          <button
            type="button"
            class="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-800 text-sm"
            @click="finalizarFactura"
          >
            ✕ Cerrar
          </button>
        </div>
      </div>

      <div v-if="printError" class="bg-amber-500 text-black text-sm text-center py-1.5 px-3 print:hidden">
        {{ printError }}
      </div>

      <div class="mx-auto mt-0 mb-4 w-fit rounded shadow-lg bg-white">
        <Factura
          ref="facturaRef"
          :numero="facturaCreada.numero"
          :fecha="facturaCreada.fecha"
          :tipo="tipo as 'venta' | 'compra'"
          :cliente="tipo === 'venta' ? cliente || undefined : undefined"
          :proveedor="tipo === 'compra' ? proveedor || undefined : undefined"
            :items="items.filter(x => x.codprd).map(x => ({
            nombre: productos.find(p => p.codprd === x.codprd)?.nombre || 'Producto',
            codigo: productos.find(p => p.codprd === x.codprd)?.codigo ?? undefined,
            cantidad: x.cantidad,
            preuni: x.preuni || 0,
          }))"
          :subtotal="subtotal"
          :impuestos="impuestos"
          :total="total"
          :fondo_aplicado="fondoAplicarMonto > 0 ? fondoAplicarMonto : undefined"
          :fiado="fiarMonto > 0 ? fiarMonto : undefined"
          :monto_pagado="montoPagado ?? 0"
          :cambio="(montoPagado ?? 0) - efectivoACobrar"
          :negocio="negocioSeleccionado ? { nombre: negocioSeleccionado.nombre } : undefined"
        />
      </div>
    </div>
  </div>
</template>

