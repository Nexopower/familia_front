<script setup lang="ts">
/**
 * Módulo CONTABILIDAD — Rediseñado.
 *
 * Tabs: Resumen | Ingresos | Egresos | Cuentas
 * - Resumen: KPIs (ingresos, egresos, balance), tendencia y desglose por cuenta.
 * - Filtros globales: rango de fechas + cuenta + búsqueda.
 * Auto: codcta/coding/codegr (PK), fecha (GETDATE)
 * FK sesión: codneg
 */
import { computed, onMounted, ref, watch } from 'vue'
import { apiFetch } from '@/utils/api'
import { useSession } from '@/utils/session'
import type {
  AuthzCheckResponse,
  CuentaContable,
  Ingreso,
  Egreso,
  ResumenContable,
  ContabilidadConfig,
  CierreCaja,
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

const perms = ref({ ver: false, ingreso: false, egreso: false })
async function loadPermisos() {
  if (isAdmin.value) { perms.value = { ver: true, ingreso: true, egreso: true }; return }
  if (!codneg.value) return
  try {
    const res = await apiFetch<AuthzCheckResponse>('authz/check', {
      method: 'POST', body: JSON.stringify({ codneg: codneg.value, permisos: ['CONTABILIDAD.VER', 'CONTABILIDAD.INGRESO.CREAR', 'CONTABILIDAD.EGRESO.CREAR'] }),
    })
    const m = res?.permisos ?? {}
    perms.value = { ver: Boolean(m['CONTABILIDAD.VER']), ingreso: Boolean(m['CONTABILIDAD.INGRESO.CREAR']), egreso: Boolean(m['CONTABILIDAD.EGRESO.CREAR']) }
  } catch { perms.value = { ver: false, ingreso: false, egreso: false } }
}

type Tab = 'resumen' | 'caja' | 'reportes' | 'ingresos' | 'egresos' | 'cuentas' | 'config'
const tab = ref<Tab>('resumen')
const tabs: { key: Tab; label: string }[] = [
  { key: 'resumen', label: 'Resumen' },
  { key: 'caja', label: 'Ventas del día' },
  { key: 'reportes', label: 'Reportes' },
  { key: 'ingresos', label: 'Ingresos' },
  { key: 'egresos', label: 'Egresos' },
  { key: 'cuentas', label: 'Cuentas' },
  { key: 'config', label: 'Configuración' },
]

/* ── Reportes (por proveedor / cliente / desglose por origen) ── */
const desglose = ref<any | null>(null)
const repProveedores = ref<any[]>([])
const repClientes = ref<any[]>([])
const provCols = [
  { key: 'proveedor', label: 'Proveedor' },
  { key: 'facturas', label: 'Facturas', width: '90px', align: 'center' as const },
  { key: 'total', label: 'Total comprado', width: '150px', align: 'right' as const },
  { key: 'ultima', label: 'Última compra', width: '160px' },
]
const cliCols = [
  { key: 'cliente', label: 'Cliente' },
  { key: 'facturas', label: 'Facturas', width: '90px', align: 'center' as const },
  { key: 'total', label: 'Total comprado', width: '150px', align: 'right' as const },
  { key: 'total_fiado', label: 'De eso, fiado', width: '130px', align: 'right' as const },
  { key: 'ultima', label: 'Última compra', width: '160px' },
]

async function loadReportes() {
  if (!codneg.value) return
  loading.value = true; error.value = null
  try {
    const qs = rangoQS()
    const [d, p, c] = await Promise.all([
      apiFetch<any>(`contabilidad/reportes/desglose?${qs}`),
      apiFetch<any[]>(`contabilidad/reportes/proveedores?${qs}`),
      apiFetch<any[]>(`contabilidad/reportes/clientes?${qs}`),
    ])
    desglose.value = d
    repProveedores.value = p ?? []
    repClientes.value = c ?? []
  } catch (e: any) { error.value = e?.message ?? 'Error' }
  finally { loading.value = false }
}

const loading = ref(false)
const error = ref<string | null>(null)

const cuentas = ref<CuentaContable[]>([])
const ingresos = ref<Ingreso[]>([])
const egresos = ref<Egreso[]>([])
const resumen = ref<ResumenContable | null>(null)
const config = ref<ContabilidadConfig | null>(null)
const caja = ref<CierreCaja | null>(null)
const cajaFecha = ref(yyyyMmDd(new Date()))
const cajaCerrando = ref(false)

/* ── Filtros globales ── */
function yyyyMmDd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const hoy = new Date()
const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
const fDesde = ref(yyyyMmDd(inicioMes))
const fHasta = ref(yyyyMmDd(hoy))
const usarRango = ref(true)
const fCodcta = ref<number | null>(null)
const fSearch = ref('')

function aplicarPreset(preset: 'hoy' | 'mes' | 'anio' | 'todo') {
  const ahora = new Date()
  if (preset === 'todo') { usarRango.value = false; return }
  usarRango.value = true
  if (preset === 'hoy') { fDesde.value = yyyyMmDd(ahora); fHasta.value = yyyyMmDd(ahora) }
  else if (preset === 'mes') { fDesde.value = yyyyMmDd(new Date(ahora.getFullYear(), ahora.getMonth(), 1)); fHasta.value = yyyyMmDd(ahora) }
  else if (preset === 'anio') { fDesde.value = yyyyMmDd(new Date(ahora.getFullYear(), 0, 1)); fHasta.value = yyyyMmDd(ahora) }
}

function rangoQS() {
  const qs = new URLSearchParams({ codneg: String(codneg.value) })
  if (usarRango.value) {
    if (fDesde.value) qs.set('desde', fDesde.value)
    if (fHasta.value) qs.set('hasta', fHasta.value)
  }
  return qs
}

/* ── Columnas ── */
const ctaCols: Column[] = [
  { key: 'codcta', label: '#', width: '60px' },
  { key: 'nombre', label: 'Nombre' },
  { key: 'tipo', label: 'Tipo', width: '140px' },
  { key: 'estado', label: 'Estado', width: '90px', align: 'center' },
]
const ingCols: Column[] = [
  { key: 'coding', label: '#', width: '60px' },
  { key: 'cuenta_nombre', label: 'Cuenta' },
  { key: 'detalle', label: 'Detalle' },
  { key: 'fecha', label: 'Fecha', width: '170px' },
  { key: 'monto', label: 'Monto', width: '130px', align: 'right' },
]
const egrCols: Column[] = [
  { key: 'codegr', label: '#', width: '60px' },
  { key: 'cuenta_nombre', label: 'Cuenta' },
  { key: 'detalle', label: 'Detalle' },
  { key: 'fecha', label: 'Fecha', width: '170px' },
  { key: 'monto', label: 'Monto', width: '130px', align: 'right' },
]
const cuentaCols: Column[] = [
  { key: 'cuenta_nombre', label: 'Cuenta' },
  { key: 'total_ingresos', label: 'Ingresos', width: '140px', align: 'right' },
  { key: 'total_egresos', label: 'Egresos', width: '140px', align: 'right' },
  { key: 'balance', label: 'Balance', width: '140px', align: 'right' },
  { key: 'movimientos', label: 'Movs.', width: '80px', align: 'center' },
]

function fmtMoney(v: number) { return new Intl.NumberFormat('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v ?? 0) }
function fmtDate(v: string) { if (!v) return '—'; const d = new Date(v); return Number.isNaN(d.getTime()) ? v : d.toLocaleString() }
function mmdd(v: string | Date) { const d = new Date(v); return Number.isNaN(d.getTime()) ? String(v).slice(5, 10) : `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

/* ── Listados filtrados (búsqueda en cliente) ── */
const ingresosFiltrados = computed(() => {
  const q = fSearch.value.trim().toLowerCase()
  if (!q) return ingresos.value
  return ingresos.value.filter(i => (i.cuenta_nombre ?? '').toLowerCase().includes(q) || (i.detalle ?? '').toLowerCase().includes(q))
})
const egresosFiltrados = computed(() => {
  const q = fSearch.value.trim().toLowerCase()
  if (!q) return egresos.value
  return egresos.value.filter(e => (e.cuenta_nombre ?? '').toLowerCase().includes(q) || (e.detalle ?? '').toLowerCase().includes(q))
})
const totalIngresosLista = computed(() => ingresosFiltrados.value.reduce((s, i) => s + Number(i.monto ?? 0), 0))
const totalEgresosLista = computed(() => egresosFiltrados.value.reduce((s, e) => s + Number(e.monto ?? 0), 0))

/* ── Gráfico de tendencia (por día) ── */
const chart = computed(() => {
  const dias = resumen.value?.por_dia ?? []
  if (!dias.length) return null
  const W = 640, H = 180, padX = 8, padTop = 12, padBottom = 24
  const max = Math.max(1, ...dias.map(d => Math.max(Number(d.total_ingresos), Number(d.total_egresos))))
  const n = dias.length
  const slot = (W - padX * 2) / n
  const barW = Math.max(3, Math.min(18, slot / 2 - 2))
  const scale = (v: number) => (H - padTop - padBottom) * (Number(v) / max)
  const baseY = H - padBottom
  const bars = dias.map((d, idx) => {
    const cx = padX + slot * idx + slot / 2
    const hi = scale(d.total_ingresos)
    const he = scale(d.total_egresos)
    return {
      ing: { x: cx - barW - 1, y: baseY - hi, w: barW, h: hi },
      egr: { x: cx + 1, y: baseY - he, w: barW, h: he },
      label: mmdd(d.dia),
      show: n <= 16 || idx % Math.ceil(n / 16) === 0,
    }
  })
  return { W, H, baseY, bars }
})

/* ── Cargas ── */
async function loadCuentas() {
  if (!codneg.value) return
  try { cuentas.value = await apiFetch<CuentaContable[]>(`contabilidad/cuentas?codneg=${codneg.value}`) }
  catch (e: any) { error.value = e?.message ?? 'Error' }
}

async function loadResumen() {
  if (!codneg.value) return
  loading.value = true; error.value = null
  try { resumen.value = await apiFetch<ResumenContable>(`contabilidad/resumen?${rangoQS()}`) }
  catch (e: any) { error.value = e?.message ?? 'Error' }
  finally { loading.value = false }
}

async function loadIngresos() {
  if (!codneg.value) return
  loading.value = true; error.value = null
  try {
    const qs = rangoQS()
    if (fCodcta.value) qs.set('codcta', String(fCodcta.value))
    qs.set('limit', '500')
    ingresos.value = await apiFetch<Ingreso[]>(`contabilidad/ingresos?${qs}`)
  } catch (e: any) { error.value = e?.message ?? 'Error' }
  finally { loading.value = false }
}

async function loadEgresos() {
  if (!codneg.value) return
  loading.value = true; error.value = null
  try {
    const qs = rangoQS()
    if (fCodcta.value) qs.set('codcta', String(fCodcta.value))
    qs.set('limit', '500')
    egresos.value = await apiFetch<Egreso[]>(`contabilidad/egresos?${qs}`)
  } catch (e: any) { error.value = e?.message ?? 'Error' }
  finally { loading.value = false }
}

async function loadConfig() {
  if (!codneg.value) return
  try { config.value = await apiFetch<ContabilidadConfig>(`contabilidad/config?codneg=${codneg.value}`) }
  catch (e: any) { error.value = e?.message ?? 'Error' }
}

/* Selección de cuenta por concepto (null = usar cuenta por defecto) */
const cfgVenta = ref<number | null>(null)
const cfgCompra = ref<number | null>(null)
const cfgDefault = ref<number | null>(null)
const cfgSaving = ref(false)
const cfgGuardado = ref(false)

watch(config, (c) => {
  cfgVenta.value = c?.venta?.codcta ?? null
  cfgCompra.value = c?.compra?.codcta ?? null
  cfgDefault.value = c?.default?.codcta ?? null
})

async function guardarConfig() {
  if (!codneg.value) return
  cfgSaving.value = true; cfgGuardado.value = false; error.value = null
  try {
    await Promise.all([
      apiFetch('contabilidad/config', { method: 'POST', body: JSON.stringify({ codneg: codneg.value, concepto: 'default', codcta: cfgDefault.value }) }),
      apiFetch('contabilidad/config', { method: 'POST', body: JSON.stringify({ codneg: codneg.value, concepto: 'venta', codcta: cfgVenta.value }) }),
      apiFetch('contabilidad/config', { method: 'POST', body: JSON.stringify({ codneg: codneg.value, concepto: 'compra', codcta: cfgCompra.value }) }),
    ])
    await loadConfig()
    cfgGuardado.value = true
    setTimeout(() => { cfgGuardado.value = false }, 2500)
  } catch (e: any) { error.value = e?.message ?? 'Error' }
  finally { cfgSaving.value = false }
}

/* ── Cierre de caja ── */
async function loadCaja() {
  if (!codneg.value) return
  loading.value = true; error.value = null
  try { caja.value = await apiFetch<CierreCaja>(`contabilidad/caja?codneg=${codneg.value}&fecha=${cajaFecha.value}`) }
  catch (e: any) { error.value = e?.message ?? 'Error' }
  finally { loading.value = false }
}

const cajaAbiertasTotal = computed(() => (caja.value?.abiertas_venta_cant ?? 0) + (caja.value?.abiertas_compra_cant ?? 0))

async function cerrarCajaDia() {
  if (!codneg.value || !cajaAbiertasTotal.value) return
  cajaCerrando.value = true; error.value = null
  try {
    const res = await apiFetch<{ cerradas: number; intentadas: number; errores: any[] }>('facturas/cerrar-lote', {
      method: 'POST',
      body: JSON.stringify({ codneg: codneg.value, desde: cajaFecha.value, hasta: cajaFecha.value }),
    })
    if (res.errores?.length) error.value = `Se cerraron ${res.cerradas}/${res.intentadas}. ${res.errores.length} con error.`
    await Promise.all([loadCaja(), loadResumen()])
  } catch (e: any) { error.value = e?.message ?? 'Error' }
  finally { cajaCerrando.value = false }
}

function loadTabData() {
  if (tab.value === 'resumen') loadResumen()
  else if (tab.value === 'caja') loadCaja()
  else if (tab.value === 'reportes') loadReportes()
  else if (tab.value === 'ingresos') loadIngresos()
  else if (tab.value === 'egresos') loadEgresos()
  else if (tab.value === 'config') loadConfig()
  else loadCuentas()
}

watch(cajaFecha, () => { if (tab.value === 'caja') loadCaja() })

/* ── Crear cuenta ── */
const showCreateCta = ref(false)
const ctaLoading = ref(false)
const ctaNombre = ref('')
const ctaTipo = ref('')

async function createCuenta() {
  if (!ctaNombre.value.trim()) { error.value = 'El nombre es requerido'; return }
  ctaLoading.value = true; error.value = null
  try {
    await apiFetch('contabilidad/cuentas', { method: 'POST', body: JSON.stringify({ codneg: codneg.value, nombre: ctaNombre.value.trim(), tipo: ctaTipo.value.trim() || undefined }) })
    showCreateCta.value = false; ctaNombre.value = ''; ctaTipo.value = ''; await loadCuentas()
  } catch (e: any) { error.value = e?.message ?? 'Error' }
  finally { ctaLoading.value = false }
}

/* ── Crear ingreso ── */
const showCreateIng = ref(false)
const ingLoading = ref(false)
const ingCodcta = ref<number | null>(null)
const ingMonto = ref<number | null>(null)
const ingDetalle = ref('')

async function createIngreso() {
  if (!ingCodcta.value || !ingMonto.value) { error.value = 'Completa los campos obligatorios'; return }
  ingLoading.value = true; error.value = null
  try {
    await apiFetch('contabilidad/ingresos', { method: 'POST', body: JSON.stringify({ codneg: codneg.value, codcta: ingCodcta.value, monto: ingMonto.value, descri: ingDetalle.value.trim() || undefined }) })
    showCreateIng.value = false; ingCodcta.value = null; ingMonto.value = null; ingDetalle.value = ''
    await Promise.all([loadIngresos(), loadResumen()])
  } catch (e: any) { error.value = e?.message ?? 'Error' }
  finally { ingLoading.value = false }
}

/* ── Crear egreso ── */
const showCreateEgr = ref(false)
const egrLoading = ref(false)
const egrCodcta = ref<number | null>(null)
const egrMonto = ref<number | null>(null)
const egrDetalle = ref('')

async function createEgreso() {
  if (!egrCodcta.value || !egrMonto.value) { error.value = 'Completa los campos obligatorios'; return }
  egrLoading.value = true; error.value = null
  try {
    await apiFetch('contabilidad/egresos', { method: 'POST', body: JSON.stringify({ codneg: codneg.value, codcta: egrCodcta.value, monto: egrMonto.value, descri: egrDetalle.value.trim() || undefined }) })
    showCreateEgr.value = false; egrCodcta.value = null; egrMonto.value = null; egrDetalle.value = ''
    await Promise.all([loadEgresos(), loadResumen()])
  } catch (e: any) { error.value = e?.message ?? 'Error' }
  finally { egrLoading.value = false }
}

onMounted(async () => { await loadPermisos(); await Promise.all([loadCuentas(), loadResumen()]) })
watch(codneg, async () => { await loadPermisos(); await loadCuentas(); loadTabData() })
watch(tab, () => loadTabData())
// Recargar al cambiar filtros que el backend usa
watch([fDesde, fHasta, usarRango, fCodcta], () => loadTabData())
</script>

<template>
  <div class="space-y-4">
    <!-- ═══ Cabecera + filtros ═══ -->
    <div class="card p-4">
      <div class="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 class="text-lg font-semibold text-main">Contabilidad</h2>
          <p class="text-sm text-muted">Resumen financiero, ingresos, egresos y cuentas.</p>
        </div>
        <div class="flex gap-2">
          <button v-if="tab === 'cuentas'" type="button" class="px-4 py-2 btn btn-primary text-sm" @click="showCreateCta = true; ctaNombre = ''; ctaTipo = ''">+ Cuenta</button>
          <button v-if="perms.ingreso || isAdmin" type="button" class="px-4 py-2 btn btn-primary text-sm" @click="showCreateIng = true; ingCodcta = null; ingMonto = null; ingDetalle = ''">+ Ingreso</button>
          <button v-if="perms.egreso || isAdmin" type="button" class="px-4 py-2 btn btn-secondary text-sm" @click="showCreateEgr = true; egrCodcta = null; egrMonto = null; egrDetalle = ''">+ Egreso</button>
        </div>
      </div>

      <!-- Filtros -->
      <div v-if="['resumen', 'ingresos', 'egresos', 'reportes'].includes(tab)" class="flex items-end gap-3 flex-wrap mt-4">
        <label class="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" v-model="usarRango" /> Filtrar por fecha
        </label>
        <div v-if="usarRango" class="flex items-end gap-2 flex-wrap">
          <div>
            <label class="block text-xs text-muted mb-1">Desde</label>
            <input v-model="fDesde" type="date" class="px-3 py-2 input text-sm" />
          </div>
          <div>
            <label class="block text-xs text-muted mb-1">Hasta</label>
            <input v-model="fHasta" type="date" class="px-3 py-2 input text-sm" />
          </div>
        </div>
        <div class="flex gap-1">
          <button type="button" class="px-2.5 py-1.5 text-xs btn btn-secondary" @click="aplicarPreset('hoy')">Hoy</button>
          <button type="button" class="px-2.5 py-1.5 text-xs btn btn-secondary" @click="aplicarPreset('mes')">Mes</button>
          <button type="button" class="px-2.5 py-1.5 text-xs btn btn-secondary" @click="aplicarPreset('anio')">Año</button>
          <button type="button" class="px-2.5 py-1.5 text-xs btn btn-secondary" @click="aplicarPreset('todo')">Todo</button>
        </div>
        <div v-if="tab === 'ingresos' || tab === 'egresos'" class="ml-auto flex items-end gap-2 flex-wrap">
          <div>
            <label class="block text-xs text-muted mb-1">Cuenta</label>
            <select v-model="fCodcta" class="px-3 py-2 input text-sm">
              <option :value="null">Todas</option>
              <option v-for="c in cuentas" :key="c.codcta" :value="c.codcta">{{ c.nombre }}</option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-muted mb-1">Buscar</label>
            <input v-model="fSearch" type="text" class="px-3 py-2 input text-sm" placeholder="Cuenta o detalle…" />
          </div>
        </div>
      </div>

      <!-- Tabs -->
      <div class="flex gap-1 mt-4 border-b" style="border-color: var(--color-border)">
        <button v-for="t in tabs" :key="t.key" type="button"
          class="px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors"
          :class="tab === t.key ? 'border-[var(--color-accent)] text-[var(--color-accent)]' : 'border-transparent text-muted hover:text-main'"
          @click="tab = t.key">{{ t.label }}</button>
      </div>
    </div>

    <ErrorAlert v-if="error" :message="error" @dismiss="error = null" />
    <LoadingSpinner v-if="loading" />

    <!-- ═══ RESUMEN ═══ -->
    <template v-if="!loading && tab === 'resumen'">
      <!-- KPIs -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div class="card p-4">
          <p class="text-xs uppercase tracking-wider text-muted">Ingresos</p>
          <p class="text-2xl font-bold text-green-600">{{ fmtMoney(resumen?.total_ingresos ?? 0) }}</p>
          <p class="text-xs text-muted mt-1">{{ resumen?.num_ingresos ?? 0 }} movimiento(s)</p>
        </div>
        <div class="card p-4">
          <p class="text-xs uppercase tracking-wider text-muted">Egresos</p>
          <p class="text-2xl font-bold text-red-600">{{ fmtMoney(resumen?.total_egresos ?? 0) }}</p>
          <p class="text-xs text-muted mt-1">{{ resumen?.num_egresos ?? 0 }} movimiento(s)</p>
        </div>
        <div class="card p-4">
          <p class="text-xs uppercase tracking-wider text-muted">Balance</p>
          <p class="text-2xl font-bold" :class="(resumen?.balance ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'">{{ fmtMoney(resumen?.balance ?? 0) }}</p>
          <p class="text-xs text-muted mt-1">{{ (resumen?.balance ?? 0) >= 0 ? 'Utilidad' : 'Pérdida' }} del período</p>
        </div>
      </div>

      <!-- Tendencia -->
      <div class="card p-4">
        <div class="flex items-center justify-between mb-2">
          <h3 class="text-sm font-semibold text-main">Tendencia diaria</h3>
          <div class="flex items-center gap-3 text-xs text-muted">
            <span class="flex items-center gap-1"><span class="inline-block w-2.5 h-2.5 rounded-sm bg-green-500" /> Ingresos</span>
            <span class="flex items-center gap-1"><span class="inline-block w-2.5 h-2.5 rounded-sm bg-red-500" /> Egresos</span>
          </div>
        </div>
        <div v-if="chart">
          <svg :viewBox="`0 0 ${chart.W} ${chart.H}`" class="w-full" style="max-height: 200px">
            <line :x1="0" :y1="chart.baseY" :x2="chart.W" :y2="chart.baseY" stroke="var(--color-border)" stroke-width="1" />
            <template v-for="(b, i) in chart.bars" :key="i">
              <rect :x="b.ing.x" :y="b.ing.y" :width="b.ing.w" :height="b.ing.h" class="fill-green-500" rx="1.5" />
              <rect :x="b.egr.x" :y="b.egr.y" :width="b.egr.w" :height="b.egr.h" class="fill-red-500" rx="1.5" />
              <text v-if="b.show" :x="(b.ing.x + b.egr.x + b.egr.w) / 2" :y="chart.H - 8" text-anchor="middle" fill="var(--color-text-muted, #888)" style="font-size: 9px">{{ b.label }}</text>
            </template>
          </svg>
        </div>
        <EmptyState v-else title="Sin movimientos" message="No hay datos en el período seleccionado." />
      </div>

      <!-- Desglose por cuenta -->
      <div class="card p-4">
        <h3 class="text-sm font-semibold text-main mb-3">Desglose por cuenta</h3>
        <BaseTable :columns="cuentaCols" :rows="resumen?.por_cuenta ?? []" row-key="codcta" striped>
          <template #cell-cuenta_nombre="{ row }">
            <span class="font-medium text-main">{{ row.cuenta_nombre }}</span>
            <span v-if="row.cuenta_tipo" class="ml-2 text-xs text-muted">{{ row.cuenta_tipo }}</span>
          </template>
          <template #cell-total_ingresos="{ value }"><span class="text-green-600">{{ fmtMoney(value ?? 0) }}</span></template>
          <template #cell-total_egresos="{ value }"><span class="text-red-600">{{ fmtMoney(value ?? 0) }}</span></template>
          <template #cell-balance="{ value }"><span :class="(value ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'" class="font-semibold">{{ fmtMoney(value ?? 0) }}</span></template>
          <template #empty><EmptyState title="Sin movimientos" message="No hay datos en el período seleccionado." /></template>
        </BaseTable>
      </div>
    </template>

    <!-- ═══ CAJA / CIERRE DE CAJA ═══ -->
    <template v-if="!loading && tab === 'caja'">
      <div class="card p-4">
        <div class="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h3 class="text-sm font-semibold text-main">Cierre de caja</h3>
            <p class="text-sm text-muted mt-1">Resumen del día y cierre de las facturas pendientes.</p>
          </div>
          <div>
            <label class="block text-xs text-muted mb-1">Día</label>
            <input v-model="cajaFecha" type="date" class="px-3 py-2 input text-sm" />
          </div>
        </div>
      </div>

      <!-- KPIs del día -->
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-4">
        <div class="card p-4">
          <p class="text-xs uppercase tracking-wider text-muted">Ventas contado</p>
          <p class="text-xl font-bold text-green-600">{{ fmtMoney(caja?.ventas_total ?? 0) }}</p>
          <p class="text-xs text-muted mt-1">{{ caja?.ventas_cant ?? 0 }} factura(s)</p>
        </div>
        <div class="card p-4">
          <p class="text-xs uppercase tracking-wider text-muted">Fiado del día</p>
          <p class="text-xl font-bold text-amber-600">{{ fmtMoney(caja?.fiado_total ?? 0) }}</p>
          <p class="text-xs text-muted mt-1">{{ caja?.fiado_cant ?? 0 }} — no suma a efectivo</p>
        </div>
        <div class="card p-4">
          <p class="text-xs uppercase tracking-wider text-muted">Abonos fiao</p>
          <p class="text-xl font-bold text-green-600">{{ fmtMoney(caja?.abonos_fiao ?? 0) }}</p>
          <p class="text-xs text-muted mt-1">cobrados hoy (sí es efectivo)</p>
        </div>
        <div class="card p-4">
          <p class="text-xs uppercase tracking-wider text-muted">Vía fondos</p>
          <p class="text-xl font-bold text-blue-600">{{ fmtMoney(caja?.fondo_total ?? 0) }}</p>
          <p class="text-xs text-muted mt-1">ya incluido en ventas</p>
        </div>
        <div class="card p-4">
          <p class="text-xs uppercase tracking-wider text-muted">Compras</p>
          <p class="text-xl font-bold text-red-600">{{ fmtMoney(caja?.compras_total ?? 0) }}</p>
          <p class="text-xs text-muted mt-1">{{ caja?.compras_cant ?? 0 }} factura(s)</p>
        </div>
        <div class="card p-4">
          <p class="text-xs uppercase tracking-wider text-muted">Efectivo en ventas</p>
          <p class="text-xl font-bold text-main">{{ fmtMoney(caja?.efectivo_ventas ?? 0) }}</p>
          <p class="text-xs text-muted mt-1">recibido en caja</p>
        </div>
        <div class="card p-4">
          <p class="text-xs uppercase tracking-wider text-muted">Balance del día</p>
          <p class="text-xl font-bold" :class="(caja?.balance ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'">{{ fmtMoney(caja?.balance ?? 0) }}</p>
          <p class="text-xs text-muted mt-1">contado + abonos − compras</p>
        </div>
      </div>

      <!-- Pendientes + acción de cierre -->
      <div class="card p-4">
        <h4 class="text-sm font-semibold text-main mb-2">Facturas abiertas (pendientes de cerrar)</h4>
        <div class="flex flex-wrap gap-6 text-sm">
          <div>
            <span class="text-muted">Ventas abiertas: </span>
            <span class="font-medium text-main">{{ caja?.abiertas_venta_cant ?? 0 }}</span>
            <span class="text-muted"> ({{ fmtMoney(caja?.abiertas_venta_total ?? 0) }})</span>
          </div>
          <div>
            <span class="text-muted">Compras abiertas: </span>
            <span class="font-medium text-main">{{ caja?.abiertas_compra_cant ?? 0 }}</span>
            <span class="text-muted"> ({{ fmtMoney(caja?.abiertas_compra_total ?? 0) }})</span>
          </div>
        </div>

        <div class="mt-4 pt-3 border-t" style="border-color: var(--color-border)">
          <p v-if="!cajaAbiertasTotal" class="text-sm text-muted">No hay facturas abiertas en este día. La caja está cuadrada. ✓</p>
          <template v-else>
            <p class="text-sm text-muted mb-2">
              Al cerrar la caja se cerrarán las <strong>{{ cajaAbiertasTotal }}</strong> factura(s) abiertas de este día y se generarán automáticamente sus asientos (ingresos/egresos). <strong>Esta acción no se puede deshacer.</strong>
            </p>
            <button type="button" class="px-4 py-2 btn btn-primary text-sm disabled:opacity-60" :disabled="cajaCerrando" @click="cerrarCajaDia">
              {{ cajaCerrando ? 'Cerrando…' : `Cerrar caja (cerrar ${cajaAbiertasTotal} factura(s))` }}
            </button>
          </template>
        </div>
      </div>
    </template>

    <!-- ═══ REPORTES ═══ -->
    <template v-if="!loading && tab === 'reportes'">
      <!-- Desglose de ventas por origen -->
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <div class="card p-4">
          <p class="text-xs uppercase tracking-wider text-muted">Ventas totales</p>
          <p class="text-xl font-bold text-main">{{ fmtMoney(desglose?.ventas_total ?? 0) }}</p>
        </div>
        <div class="card p-4">
          <p class="text-xs uppercase tracking-wider text-muted">Contado</p>
          <p class="text-xl font-bold text-green-600">{{ fmtMoney(desglose?.ventas_contado ?? 0) }}</p>
        </div>
        <div class="card p-4">
          <p class="text-xs uppercase tracking-wider text-muted">Fiado</p>
          <p class="text-xl font-bold text-amber-600">{{ fmtMoney(desglose?.ventas_fiadas ?? 0) }}</p>
          <p class="text-xs text-muted mt-1">pendiente total: {{ fmtMoney(desglose?.fiao_pendiente_total ?? 0) }}</p>
        </div>
        <div class="card p-4">
          <p class="text-xs uppercase tracking-wider text-muted">Vía fondos</p>
          <p class="text-xl font-bold text-blue-600">{{ fmtMoney(desglose?.ventas_fondo ?? 0) }}</p>
          <p class="text-xs text-muted mt-1">incluido en el total</p>
        </div>
        <div class="card p-4">
          <p class="text-xs uppercase tracking-wider text-muted">Abonos fiao</p>
          <p class="text-xl font-bold text-green-600">{{ fmtMoney(desglose?.abonos_fiao ?? 0) }}</p>
          <p class="text-xs text-muted mt-1">cobrados en el período</p>
        </div>
      </div>

      <!-- Gasto por proveedor -->
      <div class="card p-4">
        <h3 class="text-sm font-semibold text-main mb-3">Gasto por proveedor</h3>
        <BaseTable :columns="provCols" :rows="repProveedores" striped>
          <template #cell-total="{ value }"><span class="text-red-600 font-medium">{{ fmtMoney(value) }}</span></template>
          <template #cell-ultima="{ value }">{{ fmtDate(value) }}</template>
          <template #empty><EmptyState title="Sin compras" message="No hay compras cerradas en el período." /></template>
        </BaseTable>
      </div>

      <!-- Compras por cliente -->
      <div class="card p-4">
        <h3 class="text-sm font-semibold text-main mb-3">Compras por cliente</h3>
        <BaseTable :columns="cliCols" :rows="repClientes" striped>
          <template #cell-total="{ value }"><span class="text-green-600 font-medium">{{ fmtMoney(value) }}</span></template>
          <template #cell-total_fiado="{ value }"><span class="text-amber-600">{{ fmtMoney(value) }}</span></template>
          <template #cell-ultima="{ value }">{{ fmtDate(value) }}</template>
          <template #empty><EmptyState title="Sin ventas" message="No hay ventas cerradas en el período." /></template>
        </BaseTable>
      </div>
    </template>

    <!-- ═══ INGRESOS ═══ -->
    <div v-if="!loading && tab === 'ingresos'" class="card p-4">
      <BaseTable :columns="ingCols" :rows="ingresosFiltrados" row-key="coding" striped>
        <template #cell-detalle="{ value }"><span class="text-muted">{{ value || '—' }}</span></template>
        <template #cell-fecha="{ value }">{{ fmtDate(value) }}</template>
        <template #cell-monto="{ value }"><span class="text-green-600 font-medium">{{ fmtMoney(value ?? 0) }}</span></template>
        <template #empty><EmptyState title="Sin ingresos" message="No hay ingresos en el período/filtros." /></template>
      </BaseTable>
      <div v-if="ingresosFiltrados.length" class="flex justify-end mt-3 pt-3 border-t text-sm" style="border-color: var(--color-border)">
        <span class="text-muted mr-2">Total ingresos:</span>
        <span class="font-bold text-green-600">{{ fmtMoney(totalIngresosLista) }}</span>
      </div>
    </div>

    <!-- ═══ EGRESOS ═══ -->
    <div v-if="!loading && tab === 'egresos'" class="card p-4">
      <BaseTable :columns="egrCols" :rows="egresosFiltrados" row-key="codegr" striped>
        <template #cell-detalle="{ value }"><span class="text-muted">{{ value || '—' }}</span></template>
        <template #cell-fecha="{ value }">{{ fmtDate(value) }}</template>
        <template #cell-monto="{ value }"><span class="text-red-600 font-medium">{{ fmtMoney(value ?? 0) }}</span></template>
        <template #empty><EmptyState title="Sin egresos" message="No hay egresos en el período/filtros." /></template>
      </BaseTable>
      <div v-if="egresosFiltrados.length" class="flex justify-end mt-3 pt-3 border-t text-sm" style="border-color: var(--color-border)">
        <span class="text-muted mr-2">Total egresos:</span>
        <span class="font-bold text-red-600">{{ fmtMoney(totalEgresosLista) }}</span>
      </div>
    </div>

    <!-- ═══ CUENTAS ═══ -->
    <div v-if="!loading && tab === 'cuentas'" class="card p-4">
      <BaseTable :columns="ctaCols" :rows="cuentas" row-key="codcta" striped>
        <template #cell-estado="{ value }">
          <span :class="['inline-flex w-2 h-2 rounded-full', value === 'A' ? 'bg-green-500' : 'bg-red-500']" />
        </template>
        <template #empty><EmptyState title="Sin cuentas" message="Crea la primera cuenta contable." /></template>
      </BaseTable>
    </div>

    <!-- ═══ CONFIGURACIÓN ═══ -->
    <div v-if="!loading && tab === 'config'" class="card p-4 space-y-4">
      <div>
        <h3 class="text-sm font-semibold text-main">Contabilización automática</h3>
        <p class="text-sm text-muted mt-1">
          Al <strong>cerrar una factura</strong>, el sistema registra automáticamente el asiento:
          una <strong>venta</strong> genera un <strong>ingreso</strong> y una <strong>compra</strong> un <strong>egreso</strong>, por el total de la factura.
          Elige a qué cuenta va cada concepto. Si lo dejas en <em>«Cuenta por defecto»</em>, se usa la cuenta general.
        </p>
      </div>

      <div class="space-y-3 max-w-lg">
        <FormField label="Cuenta por defecto" hint="Se usa cuando un concepto no tiene cuenta propia. Si no eliges ninguna, el sistema crea/usa una cuenta «General».">
          <select v-model="cfgDefault" class="w-full px-3 py-2 input">
            <option :value="null">— Cuenta «General» automática —</option>
            <option v-for="c in cuentas" :key="c.codcta" :value="c.codcta">{{ c.nombre }}</option>
          </select>
        </FormField>
        <FormField label="Ventas → Ingresos" hint="Cuenta donde se registran los ingresos por ventas.">
          <select v-model="cfgVenta" class="w-full px-3 py-2 input">
            <option :value="null">Usar cuenta por defecto</option>
            <option v-for="c in cuentas" :key="c.codcta" :value="c.codcta">{{ c.nombre }}</option>
          </select>
        </FormField>
        <FormField label="Compras → Egresos" hint="Cuenta donde se registran los egresos por compras.">
          <select v-model="cfgCompra" class="w-full px-3 py-2 input">
            <option :value="null">Usar cuenta por defecto</option>
            <option v-for="c in cuentas" :key="c.codcta" :value="c.codcta">{{ c.nombre }}</option>
          </select>
        </FormField>
      </div>

      <div class="flex items-center gap-3 pt-2">
        <button type="button" class="px-4 py-2 btn btn-primary text-sm disabled:opacity-60" :disabled="cfgSaving" @click="guardarConfig">
          {{ cfgSaving ? 'Guardando…' : 'Guardar configuración' }}
        </button>
        <span v-if="cfgGuardado" class="text-sm text-green-600">✓ Configuración guardada</span>
        <span v-if="!cuentas.length" class="text-sm text-muted">Crea primero una cuenta en la pestaña «Cuentas».</span>
      </div>
    </div>

    <!-- ═══ Crear cuenta ═══ -->
    <BaseModal :open="showCreateCta" title="Nueva cuenta contable" size="sm" @close="showCreateCta = false">
      <div class="space-y-3">
        <FormField label="Nombre" required>
          <input v-model="ctaNombre" type="text" class="w-full px-3 py-2 input" placeholder="Ej. Caja principal" />
        </FormField>
        <FormField label="Tipo" hint="Ej. activo, pasivo, ingreso, gasto">
          <input v-model="ctaTipo" type="text" class="w-full px-3 py-2 input" />
        </FormField>
      </div>
      <template #footer>
        <button type="button" class="px-4 py-2 btn btn-secondary text-sm" @click="showCreateCta = false">Cancelar</button>
        <button type="button" class="px-4 py-2 btn btn-primary text-sm disabled:opacity-60" :disabled="ctaLoading" @click="createCuenta">Crear</button>
      </template>
    </BaseModal>

    <!-- ═══ Crear ingreso ═══ -->
    <BaseModal :open="showCreateIng" title="Nuevo ingreso" size="sm" @close="showCreateIng = false">
      <div class="space-y-3">
        <FormField label="Cuenta" required>
          <select v-model="ingCodcta" class="w-full px-3 py-2 input">
            <option :value="null">— Seleccionar —</option>
            <option v-for="c in cuentas" :key="c.codcta" :value="c.codcta">{{ c.nombre }}</option>
          </select>
        </FormField>
        <FormField label="Monto" required>
          <input v-model.number="ingMonto" type="number" min="0.01" step="0.01" class="w-full px-3 py-2 input" />
        </FormField>
        <FormField label="Detalle" hint="Opcional">
          <textarea v-model="ingDetalle" class="w-full px-3 py-2 input" rows="2" />
        </FormField>
      </div>
      <template #footer>
        <button type="button" class="px-4 py-2 btn btn-secondary text-sm" @click="showCreateIng = false">Cancelar</button>
        <button type="button" class="px-4 py-2 btn btn-primary text-sm disabled:opacity-60" :disabled="ingLoading" @click="createIngreso">Registrar</button>
      </template>
    </BaseModal>

    <!-- ═══ Crear egreso ═══ -->
    <BaseModal :open="showCreateEgr" title="Nuevo egreso" size="sm" @close="showCreateEgr = false">
      <div class="space-y-3">
        <FormField label="Cuenta" required>
          <select v-model="egrCodcta" class="w-full px-3 py-2 input">
            <option :value="null">— Seleccionar —</option>
            <option v-for="c in cuentas" :key="c.codcta" :value="c.codcta">{{ c.nombre }}</option>
          </select>
        </FormField>
        <FormField label="Monto" required>
          <input v-model.number="egrMonto" type="number" min="0.01" step="0.01" class="w-full px-3 py-2 input" />
        </FormField>
        <FormField label="Detalle" hint="Opcional">
          <textarea v-model="egrDetalle" class="w-full px-3 py-2 input" rows="2" />
        </FormField>
      </div>
      <template #footer>
        <button type="button" class="px-4 py-2 btn btn-secondary text-sm" @click="showCreateEgr = false">Cancelar</button>
        <button type="button" class="px-4 py-2 btn btn-primary text-sm disabled:opacity-60" :disabled="egrLoading" @click="createEgreso">Registrar</button>
      </template>
    </BaseModal>
  </div>
</template>
