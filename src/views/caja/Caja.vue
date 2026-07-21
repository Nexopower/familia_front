<script setup lang="ts">
/**
 * Módulo de GESTIÓN DE CAJA física (denominaciones RD$).
 * Tabs: Estado | Apertura | Conteo | Cierre | Historial | Configuración
 */
import { computed, onMounted, ref, watch } from 'vue'
import { apiFetch } from '@/utils/api'
import { useSession } from '@/utils/session'
import type { CajaConfig, CajaEstado, CajaRegistro, CajaRegistroDetalle } from '@/types'
import { construirConteo, calcularTotales, calcularCierre, sugerirRetiro, fmtMoney } from '@/utils/caja'

import BaseTable, { type Column } from '@/components/shared/BaseTable.vue'
import BaseModal from '@/components/shared/BaseModal.vue'
import FormField from '@/components/shared/FormField.vue'
import LoadingSpinner from '@/components/shared/LoadingSpinner.vue'
import ErrorAlert from '@/components/shared/ErrorAlert.vue'
import EmptyState from '@/components/shared/EmptyState.vue'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'
import DenominacionesGrid from '@/components/shared/DenominacionesGrid.vue'

const { user } = useSession()
const codneg = computed(() => { const v = Number(user.value?.codneg); return Number.isFinite(v) && v > 0 ? v : null })

type Tab = 'estado' | 'apertura' | 'conteo' | 'cierre' | 'historial' | 'config'
const tab = ref<Tab>('estado')
const tabs: { key: Tab; label: string }[] = [
  { key: 'estado', label: 'Estado' },
  { key: 'apertura', label: 'Apertura' },
  { key: 'conteo', label: 'Conteo' },
  { key: 'cierre', label: 'Cierre' },
  { key: 'historial', label: 'Historial' },
  { key: 'config', label: 'Configuración' },
]

const loading = ref(false)
const error = ref<string | null>(null)
const ok = ref<string | null>(null)

const estado = ref<CajaEstado | null>(null)
const config = ref<CajaConfig>({ fondoBilletes: 500, monedasModo: 'todas', monedasFijo: null, impresoraIp: null, impresoraPuerto: 9100, impresoraModo: 'usb', impresoraUsb: null })

function fmtDate(v: string) { if (!v) return '—'; const d = new Date(v); return Number.isNaN(d.getTime()) ? v : d.toLocaleString() }

/* ── Cargas ── */
async function loadEstado() {
  if (!codneg.value) { estado.value = null; return }
  loading.value = true; error.value = null
  try {
    estado.value = await apiFetch<CajaEstado>(`caja/estado?codneg=${codneg.value}`)
    if (estado.value?.config) config.value = { ...estado.value.config }
  } catch (e: any) { error.value = e?.message ?? 'Error' }
  finally { loading.value = false }
}

/* ── Apertura ── */
const aperturaCant = ref<Record<number, number>>({})
const aperturaTurno = ref('')
const aperturaNotas = ref('')
const aperturaLoading = ref(false)
const aperturaTotal = computed(() => calcularTotales(construirConteo(aperturaCant.value)).totalGeneral)
const aperturaDiff = computed(() => aperturaTotal.value - (estado.value?.fondoEsperado ?? 0))

async function confirmarApertura() {
  if (!codneg.value) return
  aperturaLoading.value = true; error.value = null; ok.value = null
  try {
    await apiFetch('caja/registrar', { method: 'POST', body: JSON.stringify({
      codneg: codneg.value, tipo: 'apertura', turno: aperturaTurno.value.trim() || null,
      cantidades: aperturaCant.value, notas: aperturaNotas.value.trim() || null,
    }) })
    ok.value = 'Apertura registrada.'; aperturaCant.value = {}; aperturaTurno.value = ''; aperturaNotas.value = ''
    await loadEstado(); tab.value = 'estado'
  } catch (e: any) { error.value = e?.message ?? 'Error' }
  finally { aperturaLoading.value = false }
}

/* ── Conteo parcial ── */
const conteoCant = ref<Record<number, number>>({})
const conteoNotas = ref('')
const conteoLoading = ref(false)
const conteoTotales = computed(() => calcularTotales(construirConteo(conteoCant.value)))

async function confirmarConteo() {
  if (!codneg.value) return
  conteoLoading.value = true; error.value = null; ok.value = null
  try {
    await apiFetch('caja/registrar', { method: 'POST', body: JSON.stringify({
      codneg: codneg.value, tipo: 'conteo_parcial', cantidades: conteoCant.value,
      notas: conteoNotas.value.trim() || null,
    }) })
    ok.value = 'Conteo registrado.'; conteoCant.value = {}; conteoNotas.value = ''
    await loadHistorial()
  } catch (e: any) { error.value = e?.message ?? 'Error' }
  finally { conteoLoading.value = false }
}

/* ── Cierre ── */
const cierreCant = ref<Record<number, number>>({})
const cierreModo = ref<'todas' | 'fijo'>('todas')
const cierreMonedasFijo = ref<number | null>(null)
const cierreNotas = ref('')
const cierreTurno = ref('')
const cierreLoading = ref(false)
const showConfirmCierre = ref(false)

watch(config, (c) => { cierreModo.value = c.monedasModo; cierreMonedasFijo.value = c.monedasFijo }, { immediate: true })

const cierreCalc = computed(() => calcularCierre({
  lineas: construirConteo(cierreCant.value),
  fondoBilletes: config.value.fondoBilletes,
  monedasModo: cierreModo.value,
  monedasFijo: cierreMonedasFijo.value,
}))
const cierreSugerencia = computed(() => sugerirRetiro(cierreCalc.value.montoRetirar, construirConteo(cierreCant.value)))
const cierreValido = computed(() => cierreCalc.value.totalContado >= (cierreCalc.value.billetesDejar + cierreCalc.value.monedasDejar) && cierreCalc.value.totalContado > 0)

async function confirmarCierre() {
  if (!codneg.value) return
  cierreLoading.value = true; error.value = null; ok.value = null
  try {
    const res = await apiFetch<{ facturasCerradas?: { cerradas: number; intentadas: number } | null }>('caja/registrar', { method: 'POST', body: JSON.stringify({
      codneg: codneg.value, tipo: 'cierre', turno: cierreTurno.value.trim() || null,
      cantidades: cierreCant.value, monedasModo: cierreModo.value,
      monedasFijo: cierreModo.value === 'fijo' ? cierreMonedasFijo.value : null,
      notas: cierreNotas.value.trim() || null,
    }) })
    const fc = res?.facturasCerradas
    ok.value = fc && fc.intentadas > 0
      ? `Cierre registrado. Se cerraron ${fc.cerradas}/${fc.intentadas} factura(s) abiertas del día. Caja lista para la próxima apertura.`
      : 'Cierre registrado. Caja lista para la próxima apertura.'
    cierreCant.value = {}; cierreNotas.value = ''; cierreTurno.value = ''; showConfirmCierre.value = false
    await loadEstado(); tab.value = 'estado'
  } catch (e: any) { error.value = e?.message ?? 'Error'; showConfirmCierre.value = false }
  finally { cierreLoading.value = false }
}

/* ── Historial ── */
const historial = ref<CajaRegistro[]>([])
const histCols: Column[] = [
  { key: 'fecha', label: 'Fecha', width: '170px' },
  { key: 'tipo', label: 'Tipo', width: '130px' },
  { key: 'turno', label: 'Turno', width: '90px' },
  { key: 'totalGeneral', label: 'Total contado', width: '140px', align: 'right' },
  { key: 'montoRetirado', label: 'Retirado', width: '130px', align: 'right' },
  { key: 'actions', label: '', width: '70px', align: 'center' },
]
async function loadHistorial() {
  if (!codneg.value) return
  loading.value = true; error.value = null
  try { historial.value = await apiFetch<CajaRegistro[]>(`caja/historial?codneg=${codneg.value}&limit=200`) }
  catch (e: any) { error.value = e?.message ?? 'Error' }
  finally { loading.value = false }
}

const showDetalle = ref(false)
const detalle = ref<CajaRegistroDetalle | null>(null)
async function verDetalle(r: CajaRegistro) {
  showDetalle.value = true; detalle.value = null
  try { detalle.value = await apiFetch<CajaRegistroDetalle>(`caja/${r.codcaj}`) }
  catch (e: any) { error.value = e?.message ?? 'Error' }
}
const tipoLabel: Record<string, string> = { apertura: 'Apertura', cierre: 'Cierre', conteo_parcial: 'Conteo parcial' }

/* ── Config ── */
const configLoading = ref(false)
async function guardarConfig() {
  if (!codneg.value) {
    error.value = 'Selecciona un negocio en el selector superior: la configuración de caja es por negocio.'
    return
  }
  configLoading.value = true; error.value = null; ok.value = null
  try {
    config.value = await apiFetch<CajaConfig>('caja/config', { method: 'PUT', body: JSON.stringify({
      codneg: codneg.value, fondoBilletes: config.value.fondoBilletes,
      monedasModo: config.value.monedasModo,
      monedasFijo: config.value.monedasModo === 'fijo' ? config.value.monedasFijo : null,
      impresoraIp: config.value.impresoraIp?.trim() || null,
      impresoraPuerto: config.value.impresoraPuerto ?? null,
      impresoraModo: config.value.impresoraModo ?? null,
      impresoraUsb: config.value.impresoraUsb?.trim() || null,
    }) })
    ok.value = 'Configuración guardada.'
  } catch (e: any) { error.value = e?.message ?? 'Error' }
  finally { configLoading.value = false }
}

function loadTab() {
  ok.value = null
  if (tab.value === 'estado') loadEstado()
  else if (tab.value === 'historial') loadHistorial()
}

onMounted(loadEstado)
watch(codneg, loadEstado)
watch(tab, loadTab)
</script>

<template>
  <div class="space-y-4">
    <!-- Cabecera -->
    <div class="card p-4">
      <div class="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 class="text-lg font-semibold text-main">Gestión de caja</h2>
          <p class="text-sm text-muted">Apertura, conteo físico, cierre de turno e historial.</p>
        </div>
        <div v-if="estado" class="text-right">
          <span :class="['inline-flex px-2.5 py-1 rounded text-xs font-medium', estado.cajaAbierta ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600']">
            {{ estado.cajaAbierta ? '● Caja abierta' : '○ Caja cerrada' }}
          </span>
        </div>
      </div>
      <div class="flex gap-1 mt-4 border-b overflow-x-auto" style="border-color: var(--color-border)">
        <button v-for="t in tabs" :key="t.key" type="button"
          class="px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors whitespace-nowrap"
          :class="tab === t.key ? 'border-[var(--color-accent)] text-[var(--color-accent)]' : 'border-transparent text-muted hover:text-main'"
          @click="tab = t.key">{{ t.label }}</button>
      </div>
    </div>

    <!-- La caja es POR NEGOCIO: sin negocio seleccionado no hay nada que gestionar -->
    <div v-if="!codneg" class="card p-8 text-center">
      <p class="text-lg font-semibold text-main">Selecciona un negocio</p>
      <p class="text-sm text-muted mt-1">La caja (fondo, conteos, cierres e impresora) se gestiona por negocio. Elige uno en el selector de arriba — la 🌐 Vista general no aplica aquí.</p>
    </div>

    <ErrorAlert v-if="error" :message="error" @dismiss="error = null" />
    <div v-if="ok" class="card p-3 text-sm text-green-700 bg-green-50 border border-green-200">{{ ok }}</div>
    <LoadingSpinner v-if="loading" />

    <!-- ═══ ESTADO ═══ -->
    <template v-if="!loading && tab === 'estado' && estado">
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div class="card p-4">
          <p class="text-xs uppercase tracking-wider text-muted">Estado</p>
          <p class="text-xl font-bold" :class="estado.cajaAbierta ? 'text-green-600' : 'text-main'">{{ estado.cajaAbierta ? 'Abierta' : 'Cerrada' }}</p>
          <p v-if="estado.ultimaApertura" class="text-xs text-muted mt-1">Apertura: {{ fmtDate(estado.ultimaApertura.fecha) }}</p>
        </div>
        <div class="card p-4">
          <p class="text-xs uppercase tracking-wider text-muted">Fondo esperado en caja</p>
          <p class="text-xl font-bold text-main">{{ fmtMoney(estado.fondoEsperado) }}</p>
          <p class="text-xs text-muted mt-1">billetes + monedas del último cierre</p>
        </div>
        <div class="card p-4">
          <p class="text-xs uppercase tracking-wider text-muted">Último cierre</p>
          <p class="text-xl font-bold text-main">{{ estado.ultimoCierre ? fmtMoney(estado.ultimoCierre.retirado ?? 0) : '—' }}</p>
          <p class="text-xs text-muted mt-1">{{ estado.ultimoCierre ? `retirado · ${fmtDate(estado.ultimoCierre.fecha)}` : 'sin cierres registrados' }}</p>
        </div>
      </div>
      <div class="card p-4 flex flex-wrap gap-2">
        <button v-if="!estado.cajaAbierta" type="button" class="px-4 py-2 btn btn-primary text-sm" @click="tab = 'apertura'">Abrir caja</button>
        <button v-if="estado.cajaAbierta" type="button" class="px-4 py-2 btn btn-primary text-sm" @click="tab = 'cierre'">Cerrar caja</button>
        <button type="button" class="px-4 py-2 btn btn-secondary text-sm" @click="tab = 'conteo'">Contar monedas</button>
        <button type="button" class="px-4 py-2 btn btn-secondary text-sm" @click="tab = 'historial'">Ver historial</button>
      </div>
    </template>

    <!-- ═══ APERTURA ═══ -->
    <div v-if="codneg && !loading && tab === 'apertura'" class="card p-4 space-y-4">
      <div>
        <h3 class="text-sm font-semibold text-main">Apertura de caja</h3>
        <p class="text-sm text-muted">Ingresa el efectivo con el que arranca el turno.</p>
      </div>
      <div class="flex flex-wrap gap-3">
        <FormField label="Turno" hint="Opcional">
          <input v-model="aperturaTurno" type="text" class="px-3 py-2 input text-sm" placeholder="Mañana / Tarde / Noche" list="turnos" />
          <datalist id="turnos"><option value="Mañana" /><option value="Tarde" /><option value="Noche" /></datalist>
        </FormField>
      </div>
      <DenominacionesGrid v-model="aperturaCant" />
      <div v-if="estado && aperturaTotal > 0 && Math.abs(aperturaDiff) >= 0.01" class="text-sm px-3 py-2 rounded border"
        :class="aperturaDiff < 0 ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-blue-50 border-blue-200 text-blue-700'">
        El total ({{ fmtMoney(aperturaTotal) }}) {{ aperturaDiff < 0 ? 'es menor' : 'es mayor' }} que el fondo esperado ({{ fmtMoney(estado.fondoEsperado) }}). Diferencia: {{ fmtMoney(aperturaDiff) }}.
      </div>
      <FormField label="Notas" hint="Opcional">
        <textarea v-model="aperturaNotas" rows="2" class="w-full px-3 py-2 input text-sm" />
      </FormField>
      <div class="flex gap-2">
        <button type="button" class="px-4 py-2 btn btn-secondary text-sm" @click="tab = 'estado'">Cancelar</button>
        <button type="button" class="px-4 py-2 btn btn-primary text-sm disabled:opacity-60" :disabled="aperturaLoading || aperturaTotal <= 0" @click="confirmarApertura">Confirmar apertura</button>
      </div>
    </div>

    <!-- ═══ CONTEO PARCIAL ═══ -->
    <div v-if="codneg && !loading && tab === 'conteo'" class="card p-4 space-y-4">
      <div>
        <h3 class="text-sm font-semibold text-main">Conteo parcial</h3>
        <p class="text-sm text-muted">Cuenta el efectivo en cualquier momento (típicamente las monedas). Se guarda como registro de conteo, no cierra el turno.</p>
      </div>
      <DenominacionesGrid v-model="conteoCant" />
      <FormField label="Notas" hint="Opcional">
        <textarea v-model="conteoNotas" rows="2" class="w-full px-3 py-2 input text-sm" />
      </FormField>
      <div class="flex gap-2">
        <button type="button" class="px-4 py-2 btn btn-secondary text-sm" @click="tab = 'estado'">Cancelar</button>
        <button type="button" class="px-4 py-2 btn btn-primary text-sm disabled:opacity-60" :disabled="conteoLoading || conteoTotales.totalGeneral <= 0" @click="confirmarConteo">Guardar conteo</button>
      </div>
    </div>

    <!-- ═══ CIERRE ═══ -->
    <div v-if="codneg && !loading && tab === 'cierre'" class="card p-4 space-y-4">
      <div>
        <h3 class="text-sm font-semibold text-main">Cierre de caja</h3>
        <p class="text-sm text-muted">Cuenta físicamente todo el efectivo. El sistema calcula cuánto dejar y cuánto retirar.</p>
      </div>
      <div class="flex flex-wrap gap-3">
        <FormField label="Turno" hint="Opcional">
          <input v-model="cierreTurno" type="text" class="px-3 py-2 input text-sm" placeholder="Mañana / Tarde / Noche" list="turnos" />
        </FormField>
      </div>
      <DenominacionesGrid v-model="cierreCant" />

      <!-- Opciones de monedas -->
      <div class="flex flex-wrap items-end gap-4 pt-2">
        <FormField label="Monedas a dejar">
          <select v-model="cierreModo" class="px-3 py-2 input text-sm">
            <option value="todas">Dejar todas las monedas</option>
            <option value="fijo">Dejar monto fijo</option>
          </select>
        </FormField>
        <FormField v-if="cierreModo === 'fijo'" label="Monto de monedas a dejar">
          <input v-model.number="cierreMonedasFijo" type="number" min="0" step="0.01" class="px-3 py-2 input text-sm" />
        </FormField>
        <p class="text-xs text-muted mb-2">Fondo de billetes a dejar: <strong>{{ fmtMoney(config.fondoBilletes) }}</strong> (editable en Configuración)</p>
      </div>

      <!-- Cálculo del cierre -->
      <div class="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div class="card p-3"><p class="text-xs text-muted">Total contado</p><p class="text-lg font-bold text-main">{{ fmtMoney(cierreCalc.totalContado) }}</p></div>
        <div class="card p-3"><p class="text-xs text-muted">Billetes a dejar</p><p class="text-lg font-bold text-main">{{ fmtMoney(cierreCalc.billetesDejar) }}</p></div>
        <div class="card p-3"><p class="text-xs text-muted">Monedas a dejar</p><p class="text-lg font-bold text-main">{{ fmtMoney(cierreCalc.monedasDejar) }}</p></div>
        <div class="card p-3 bg-blue-50 border-blue-200"><p class="text-xs text-blue-700">A retirar</p><p class="text-lg font-bold text-blue-700">{{ fmtMoney(cierreCalc.montoRetirar) }}</p></div>
      </div>

      <!-- Sugerencia de retiro -->
      <div v-if="cierreCalc.montoRetirar > 0" class="card p-3">
        <p class="text-xs font-semibold uppercase tracking-wider text-muted mb-2">Sugerencia de retiro (orientativa)</p>
        <div class="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span v-for="l in cierreSugerencia.lineas" :key="l.valor" class="text-main">{{ l.cantidad }} × ${{ fmtMoney(l.valor) }} = {{ fmtMoney(l.subtotal) }}</span>
        </div>
        <p v-if="cierreSugerencia.restante > 0" class="text-xs text-amber-700 mt-2">No se puede cubrir exacto con los billetes contados; faltarían {{ fmtMoney(cierreSugerencia.restante) }} (revisa el conteo).</p>
      </div>

      <FormField label="Notas" hint="Opcional">
        <textarea v-model="cierreNotas" rows="2" class="w-full px-3 py-2 input text-sm" />
      </FormField>
      <div class="flex gap-2">
        <button type="button" class="px-4 py-2 btn btn-secondary text-sm" @click="tab = 'estado'">Cancelar</button>
        <button type="button" class="px-4 py-2 btn btn-primary text-sm disabled:opacity-60" :disabled="!cierreValido" @click="showConfirmCierre = true">Cerrar caja</button>
      </div>
      <p v-if="!cierreValido && cierreCalc.totalContado > 0" class="text-xs text-red-600">El efectivo contado es menor que el fondo a dejar; no se puede cerrar.</p>
    </div>

    <!-- ═══ HISTORIAL ═══ -->
    <div v-if="codneg && !loading && tab === 'historial'" class="card p-4">
      <BaseTable :columns="histCols" :rows="historial" row-key="codcaj" striped>
        <template #cell-fecha="{ value }">{{ fmtDate(value) }}</template>
        <template #cell-tipo="{ value }">
          <span :class="['inline-flex px-2 py-0.5 rounded text-xs font-medium',
            value === 'cierre' ? 'bg-blue-100 text-blue-700' : value === 'apertura' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600']">
            {{ tipoLabel[value] ?? value }}
          </span>
        </template>
        <template #cell-turno="{ value }">{{ value || '—' }}</template>
        <template #cell-totalGeneral="{ value }">{{ fmtMoney(value ?? 0) }}</template>
        <template #cell-montoRetirado="{ value }">{{ value == null ? '—' : fmtMoney(value) }}</template>
        <template #cell-actions="{ row }"><button type="button" class="px-3 py-1 btn btn-secondary text-xs" @click="verDetalle(row)">Ver</button></template>
        <template #empty><EmptyState title="Sin registros" message="No hay movimientos de caja registrados." /></template>
      </BaseTable>
    </div>

    <!-- ═══ CONFIG ═══ -->
    <div v-if="codneg && !loading && tab === 'config'" class="card p-4 space-y-4 max-w-lg">
      <div>
        <h3 class="text-sm font-semibold text-main">Configuración de caja</h3>
        <p class="text-sm text-muted">Define el fondo que se deja al cerrar el turno.</p>
      </div>
      <FormField label="Fondo de billetes a dejar" hint="Se deja en caja al cerrar (default 500)">
        <input v-model.number="config.fondoBilletes" type="number" min="0" step="0.01" class="w-full px-3 py-2 input text-sm" />
      </FormField>
      <FormField label="Monedas">
        <select v-model="config.monedasModo" class="w-full px-3 py-2 input text-sm">
          <option value="todas">Dejar todas las monedas (default)</option>
          <option value="fijo">Dejar un monto fijo de monedas</option>
        </select>
      </FormField>
      <FormField v-if="config.monedasModo === 'fijo'" label="Monto fijo de monedas a dejar">
        <input v-model.number="config.monedasFijo" type="number" min="0" step="0.01" class="w-full px-3 py-2 input text-sm" />
      </FormField>

      <div class="pt-3 border-t space-y-3" style="border-color: var(--color-border)">
        <div>
          <h4 class="text-sm font-semibold text-main">Impresora térmica</h4>
          <p class="text-xs text-muted">Impresora ESC/POS para imprimir tickets directo y abrir el cajón, sin diálogos del navegador.</p>
        </div>

        <FormField label="Conexión">
          <select v-model="config.impresoraModo" class="w-full px-3 py-2 input text-sm">
            <option value="usb">USB (impresora compartida de Windows)</option>
            <option value="red">Red / Ethernet (IP)</option>
          </select>
        </FormField>

        <template v-if="config.impresoraModo === 'usb'">
          <FormField label="Nombre compartido" hint="El nombre con el que compartiste la impresora en Windows">
            <input v-model="config.impresoraUsb" type="text" class="w-full px-3 py-2 input text-sm" placeholder="POS80" />
          </FormField>
          <div class="text-xs text-muted p-2 rounded border border-base space-y-1">
            <p class="font-medium text-main">Cómo compartir la impresora (una sola vez):</p>
            <p>1. Windows → Configuración → Bluetooth y dispositivos → Impresoras → tu impresora (POS80).</p>
            <p>2. Propiedades de impresora → pestaña <strong>Compartir</strong> → marcar <strong>Compartir esta impresora</strong>.</p>
            <p>3. Ponle un nombre sin espacios (ej. <strong>POS80</strong>) y escríbelo aquí.</p>
          </div>
        </template>

        <div v-else class="grid grid-cols-2 gap-3">
          <FormField label="IP de la impresora" hint="Sale en el ticket de autotest">
            <input v-model="config.impresoraIp" type="text" class="w-full px-3 py-2 input text-sm" placeholder="192.168.1.87" />
          </FormField>
          <FormField label="Puerto" hint="RAW, normalmente 9100">
            <input v-model.number="config.impresoraPuerto" type="number" min="1" max="65535" class="w-full px-3 py-2 input text-sm" placeholder="9100" />
          </FormField>
        </div>
      </div>

      <button type="button" class="px-4 py-2 btn btn-primary text-sm disabled:opacity-60" :disabled="configLoading" @click="guardarConfig">Guardar configuración</button>
    </div>

    <!-- ═══ Confirmar cierre ═══ -->
    <ConfirmDialog
      :open="showConfirmCierre"
      title="Confirmar cierre de caja"
      :message="`Total contado: ${fmtMoney(cierreCalc.totalContado)}. Se dejará ${fmtMoney(cierreCalc.fondoResultante)} en caja y se retirará ${fmtMoney(cierreCalc.montoRetirar)}. Además se cerrarán las facturas abiertas de hoy (generando su contabilización). ¿Confirmar cierre?`"
      variant="warning"
      confirm-label="Cerrar caja"
      :loading="cierreLoading"
      @confirm="confirmarCierre"
      @cancel="showConfirmCierre = false"
    />

    <!-- ═══ Detalle de registro ═══ -->
    <BaseModal :open="showDetalle" :title="detalle ? `${tipoLabel[detalle.tipo] ?? detalle.tipo} · ${fmtDate(detalle.fecha)}` : 'Detalle'" size="md" @close="showDetalle = false">
      <div v-if="!detalle" class="py-6 text-center"><LoadingSpinner size="sm" /></div>
      <div v-else class="space-y-3">
        <div class="grid grid-cols-3 gap-2 text-sm">
          <div><p class="text-xs text-muted">Billetes</p><p class="font-semibold text-main">{{ fmtMoney(detalle.totalBilletes) }}</p></div>
          <div><p class="text-xs text-muted">Monedas</p><p class="font-semibold text-main">{{ fmtMoney(detalle.totalMonedas) }}</p></div>
          <div><p class="text-xs text-muted">Total</p><p class="font-semibold text-main">{{ fmtMoney(detalle.totalGeneral) }}</p></div>
        </div>
        <div v-if="detalle.tipo === 'cierre'" class="grid grid-cols-3 gap-2 text-sm pt-2 border-t" style="border-color: var(--color-border)">
          <div><p class="text-xs text-muted">Dejó billetes</p><p class="font-semibold text-main">{{ fmtMoney(detalle.billetesDejar ?? 0) }}</p></div>
          <div><p class="text-xs text-muted">Dejó monedas</p><p class="font-semibold text-main">{{ fmtMoney(detalle.monedasDejar ?? 0) }}</p></div>
          <div><p class="text-xs text-muted">Retiró</p><p class="font-semibold text-blue-700">{{ fmtMoney(detalle.montoRetirado ?? 0) }}</p></div>
        </div>
        <div class="pt-2 border-t" style="border-color: var(--color-border)">
          <p class="text-xs font-semibold uppercase tracking-wider text-muted mb-2">Desglose</p>
          <div class="space-y-1">
            <div v-for="d in detalle.detalle" :key="d.denominacion" class="flex justify-between text-sm">
              <span class="text-main">{{ d.esMoneda ? 'Moneda' : 'Billete' }} ${{ fmtMoney(d.denominacion) }} × {{ d.cantidad }}</span>
              <span class="text-muted">{{ fmtMoney(d.subtotal) }}</span>
            </div>
          </div>
        </div>
        <p v-if="detalle.notas" class="text-sm text-muted pt-2 border-t" style="border-color: var(--color-border)">{{ detalle.notas }}</p>
      </div>
      <template #footer><button type="button" class="px-4 py-2 btn btn-secondary text-sm" @click="showDetalle = false">Cerrar</button></template>
    </BaseModal>
  </div>
</template>
