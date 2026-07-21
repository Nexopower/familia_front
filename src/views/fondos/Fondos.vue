<script setup lang="ts">
/**
 * Módulo FONDOS DIARIOS — vale/bono acumulable por cliente y negocio.
 * Config (monto diario + días habilitados), saldo, historial y transferencias.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { apiFetch } from '@/utils/api'
import { useSession } from '@/utils/session'
import BaseTable, { type Column } from '@/components/shared/BaseTable.vue'
import BaseModal from '@/components/shared/BaseModal.vue'
import FormField from '@/components/shared/FormField.vue'
import LoadingSpinner from '@/components/shared/LoadingSpinner.vue'
import ErrorAlert from '@/components/shared/ErrorAlert.vue'
import EmptyState from '@/components/shared/EmptyState.vue'
import type { ClienteOpt } from '@/types'

type FondoRow = {
  codfon: number
  codcli: number
  cliente_nombre: string
  monto_diario: number
  dias_semana: number
  estado: 'A' | 'I'
  saldo: number
  disponible_hoy: number
  adelanto_activo: boolean
  proximo_dia_habilitado?: string | null
}

const DIAS = [
  { bit: 1, label: 'Dom' }, { bit: 2, label: 'Lun' }, { bit: 4, label: 'Mar' },
  { bit: 8, label: 'Mié' }, { bit: 16, label: 'Jue' }, { bit: 32, label: 'Vie' }, { bit: 64, label: 'Sáb' },
]

const { user, negocios } = useSession()
const codneg = computed(() => { const v = Number(user.value?.codneg); return Number.isFinite(v) && v > 0 ? v : null })
const otrosNegocios = computed(() => negocios.value.filter(n => Number(n.codneg) !== Number(codneg.value)))

const loading = ref(false)
const error = ref<string | null>(null)
const okMsg = ref<string | null>(null)
const fondos = ref<FondoRow[]>([])
const clientes = ref<ClienteOpt[]>([])

const cols: Column[] = [
  { key: 'cliente_nombre', label: 'Cliente' },
  { key: 'monto_diario', label: 'Límite/día', width: '110px', align: 'right' },
  { key: 'dias_semana', label: 'Días', width: '170px' },
  { key: 'saldo', label: 'Saldo', width: '110px', align: 'right' },
  { key: 'disponible_hoy', label: 'Disponible hoy', width: '120px', align: 'right' },
  { key: 'adelanto_activo', label: 'Adelanto', width: '90px', align: 'center' },
  { key: 'estado', label: 'Estado', width: '80px', align: 'center' },
  { key: 'actions', label: '', width: '290px', align: 'center' },
]

function fmtMoney(v: number) { return new Intl.NumberFormat('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v ?? 0) }
function diasLabel(mask: number) {
  if ((mask & 127) === 127) return 'Todos'
  return DIAS.filter(d => (mask & d.bit) > 0).map(d => d.label).join(' ') || '—'
}

async function loadFondos() {
  if (!codneg.value) return
  loading.value = true; error.value = null
  try { fondos.value = await apiFetch<FondoRow[]>(`fondos?codneg=${codneg.value}`) }
  catch (e: any) { error.value = e?.message ?? 'Error cargando fondos' }
  finally { loading.value = false }
}
async function loadClientes() {
  if (!codneg.value) return
  try { clientes.value = await apiFetch<ClienteOpt[]>(`clientes?codneg=${codneg.value}`) } catch { clientes.value = [] }
}

/* ── Crear / editar ── */
const showForm = ref(false)
const formLoading = ref(false)
const editTarget = ref<FondoRow | null>(null)
const fCodcli = ref<number | null>(null)
const fMonto = ref<number | null>(null)
const fMask = ref(127)

function toggleDia(bit: number) { fMask.value = (fMask.value & bit) ? fMask.value & ~bit : fMask.value | bit }
function openCrear() { editTarget.value = null; fCodcli.value = null; fMonto.value = null; fMask.value = 127; showForm.value = true }
function openEditar(f: FondoRow) { editTarget.value = f; fCodcli.value = f.codcli; fMonto.value = Number(f.monto_diario); fMask.value = Number(f.dias_semana); showForm.value = true }

async function guardarFondo() {
  if (!codneg.value) return
  if (!editTarget.value && !fCodcli.value) { error.value = 'Selecciona el cliente'; return }
  if (!(Number(fMonto.value) > 0)) { error.value = 'Monto diario inválido'; return }
  if ((fMask.value & 127) === 0) { error.value = 'Selecciona al menos un día'; return }
  formLoading.value = true; error.value = null
  try {
    if (editTarget.value) {
      await apiFetch(`fondos/${editTarget.value.codfon}`, {
        method: 'PATCH',
        body: JSON.stringify({ codneg: codneg.value, montoDiario: fMonto.value, diasSemana: fMask.value }),
      })
      okMsg.value = 'Fondo actualizado.'
    } else {
      await apiFetch('fondos', {
        method: 'POST',
        body: JSON.stringify({ codneg: codneg.value, codcli: fCodcli.value, montoDiario: fMonto.value, diasSemana: fMask.value }),
      })
      okMsg.value = 'Fondo creado con saldo 0. Usa «+ Saldo» para recargarle la cartera.'
    }
    showForm.value = false
    await loadFondos()
  } catch (e: any) { error.value = e?.message ?? 'Error guardando fondo' }
  finally { formLoading.value = false }
}

async function toggleEstado(f: FondoRow) {
  error.value = null
  try {
    await apiFetch(`fondos/${f.codfon}`, {
      method: 'PATCH',
      body: JSON.stringify({ codneg: codneg.value, estado: f.estado === 'A' ? 'I' : 'A' }),
    })
    await loadFondos()
  } catch (e: any) { error.value = e?.message ?? 'Error' }
}

/* ── Recargar saldo (ajuste manual) ── */
const showRecarga = ref(false)
const recargaTarget = ref<FondoRow | null>(null)
const rMonto = ref<number | null>(null)
const rNota = ref('')
const recargaLoading = ref(false)

function openRecargar(f: FondoRow) { recargaTarget.value = f; rMonto.value = null; rNota.value = ''; showRecarga.value = true }

async function recargarSaldo() {
  if (!recargaTarget.value || !(Number(rMonto.value) > 0)) { error.value = 'Indica un monto mayor a 0'; return }
  recargaLoading.value = true; error.value = null
  try {
    await apiFetch(`fondos/${recargaTarget.value.codfon}/recargar`, {
      method: 'POST',
      body: JSON.stringify({ codneg: codneg.value, monto: rMonto.value, nota: rNota.value.trim() || null }),
    })
    showRecarga.value = false
    okMsg.value = `Saldo recargado a ${recargaTarget.value.cliente_nombre}.`
    await loadFondos()
  } catch (e: any) { error.value = e?.message ?? 'Error recargando saldo' }
  finally { recargaLoading.value = false }
}

/* ── Historial ── */
const showHist = ref(false)
const histTarget = ref<FondoRow | null>(null)
const historial = ref<any[]>([])
const histLoading = ref(false)
const tipoMovLabel: Record<string, string> = {
  ajuste: 'Recarga', consumo: 'Consumo', adelanto: 'Adelanto (día futuro)',
  transf_in: 'Transf. recibida', transf_out: 'Transf. enviada',
}
async function openHistorial(f: FondoRow) {
  histTarget.value = f; showHist.value = true; histLoading.value = true; historial.value = []
  try { historial.value = await apiFetch<any[]>(`fondos/${f.codfon}/historial?codneg=${codneg.value}`) }
  catch (e: any) { error.value = e?.message ?? 'Error' }
  finally { histLoading.value = false }
}
function fmtDate(v: string) {
  if (!v) return '—'
  // Fechas date-only (YYYY-MM-DD o ISO a medianoche UTC): formatear sin desfase de zona horaria.
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00(?:\.000)?Z?)?$/.exec(v)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString()
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString()
}
function fmtDateTime(v: string) { if (!v) return '—'; const d = new Date(v); return Number.isNaN(d.getTime()) ? v : d.toLocaleString() }

/* ── Transferir ── */
const showTransf = ref(false)
const transfTarget = ref<FondoRow | null>(null)
const tNegocio = ref<number | null>(null)
const tMonto = ref<number | null>(null)
const tNota = ref('')
const transfLoading = ref(false)

function openTransferir(f: FondoRow) { transfTarget.value = f; tNegocio.value = null; tMonto.value = null; tNota.value = ''; showTransf.value = true }

async function transferir() {
  if (!transfTarget.value || !tNegocio.value || !(Number(tMonto.value) > 0)) { error.value = 'Completa negocio destino y monto'; return }
  transfLoading.value = true; error.value = null
  try {
    await apiFetch(`fondos/${transfTarget.value.codfon}/transferir`, {
      method: 'POST',
      body: JSON.stringify({ codneg: codneg.value, codnegDestino: tNegocio.value, monto: tMonto.value, nota: tNota.value.trim() || null }),
    })
    showTransf.value = false
    okMsg.value = 'Transferencia registrada.'
    await loadFondos()
  } catch (e: any) { error.value = e?.message ?? 'Error transfiriendo' }
  finally { transfLoading.value = false }
}

onMounted(async () => { await Promise.all([loadFondos(), loadClientes()]) })
watch(codneg, async () => { await Promise.all([loadFondos(), loadClientes()]) })
</script>

<template>
  <div class="space-y-4">
    <div class="card p-4">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 class="text-lg font-semibold text-main">Fondos de clientes</h2>
          <p class="text-sm text-muted">Cartera prepagada: el saldo se recarga o transfiere, y el cliente consume hasta su límite diario en los días habilitados.</p>
        </div>
        <div class="flex gap-2">
          <button type="button" class="px-4 py-2 btn btn-primary text-sm" @click="openCrear">+ Nuevo fondo</button>
          <button type="button" class="px-4 py-2 btn btn-secondary text-sm" :disabled="loading" @click="loadFondos">Recargar</button>
        </div>
      </div>
    </div>

    <ErrorAlert v-if="error" :message="error" @dismiss="error = null" />
    <div v-if="okMsg" class="card p-3 text-sm text-green-700 bg-green-50 border border-green-200 flex items-center justify-between">
      <span>{{ okMsg }}</span>
      <button type="button" class="text-green-700 hover:underline text-xs" @click="okMsg = null">×</button>
    </div>
    <LoadingSpinner v-if="loading" />

    <div v-if="!loading && codneg" class="card p-4">
      <BaseTable :columns="cols" :rows="fondos" row-key="codfon" striped>
        <template #cell-cliente_nombre="{ value }"><span class="font-medium text-main">{{ value }}</span></template>
        <template #cell-monto_diario="{ value }">{{ fmtMoney(value) }}</template>
        <template #cell-dias_semana="{ value }"><span class="font-mono text-xs">{{ diasLabel(Number(value)) }}</span></template>
        <template #cell-saldo="{ value }">
          <span class="font-semibold" :class="value >= 0 ? 'text-green-600' : 'text-red-600'">{{ fmtMoney(value) }}</span>
        </template>
        <template #cell-disponible_hoy="{ value, row }">
          <span v-if="row.estado === 'A'" class="font-medium" :class="Number(value) > 0 ? 'text-green-600' : 'text-muted'"
            :title="row.proximo_dia_habilitado ? `Próximo día hábil: ${fmtDate(row.proximo_dia_habilitado)}` : ''">{{ fmtMoney(Number(value)) }}</span>
          <span v-else class="text-muted text-xs">—</span>
        </template>
        <template #cell-adelanto_activo="{ value }">
          <span v-if="value" class="inline-flex px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-700" title="Tiene un adelanto pendiente de compensar">Sí</span>
          <span v-else class="text-muted text-xs">—</span>
        </template>
        <template #cell-estado="{ value }">
          <span :class="['inline-flex w-2 h-2 rounded-full', value === 'A' ? 'bg-green-500' : 'bg-red-500']" />
        </template>
        <template #cell-actions="{ row }">
          <div class="flex gap-1 justify-center flex-wrap">
            <button type="button" class="px-2 py-1 btn text-xs bg-green-100 text-green-700 hover:bg-green-200" @click="openRecargar(row)">+ Saldo</button>
            <button type="button" class="px-2 py-1 btn btn-secondary text-xs" @click="openEditar(row)">Editar</button>
            <button type="button" class="px-2 py-1 btn btn-secondary text-xs" @click="openHistorial(row)">Historial</button>
            <button v-if="otrosNegocios.length" type="button" class="px-2 py-1 btn text-xs bg-blue-100 text-blue-700 hover:bg-blue-200" @click="openTransferir(row)">Transferir</button>
            <button type="button" :class="['px-2 py-1 btn text-xs', row.estado === 'A' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700']" @click="toggleEstado(row)">
              {{ row.estado === 'A' ? 'Inactivar' : 'Activar' }}
            </button>
          </div>
        </template>
        <template #empty><EmptyState title="Sin fondos" message="Configura el primer fondo de un cliente." /></template>
      </BaseTable>
    </div>

    <div v-if="!codneg" class="card p-8 text-center">
      <p class="text-lg font-semibold text-main">Selecciona un negocio</p>
      <p class="text-sm text-muted mt-1">Los fondos se configuran por negocio.</p>
    </div>

    <!-- ═══ Crear / editar fondo ═══ -->
    <BaseModal :open="showForm" :title="editTarget ? `Editar fondo de ${editTarget.cliente_nombre}` : 'Nuevo fondo diario'" size="md" @close="showForm = false">
      <div class="space-y-3">
        <FormField v-if="!editTarget" label="Cliente" required>
          <select v-model="fCodcli" class="w-full px-3 py-2 input">
            <option :value="null">— Seleccionar —</option>
            <option v-for="c in clientes" :key="c.codcli" :value="c.codcli">{{ c.nombre }}</option>
          </select>
        </FormField>
        <FormField label="Límite diario de consumo" required>
          <input v-model.number="fMonto" type="number" min="0.01" step="0.01" class="w-full px-3 py-2 input" />
        </FormField>
        <FormField label="Días habilitados" hint="El cliente solo puede consumir del fondo estos días">
          <div class="flex gap-1.5 flex-wrap">
            <button v-for="d in DIAS" :key="d.bit" type="button"
              class="min-w-12 px-2 h-9 rounded-lg text-sm font-semibold border transition-colors"
              :class="(fMask & d.bit) ? 'bg-blue-600 text-white border-blue-600' : 'bg-transparent text-muted border-base hover:bg-blue-600/15'"
              @click="toggleDia(d.bit)">{{ d.label }}</button>
          </div>
        </FormField>
      </div>
      <template #footer>
        <button type="button" class="px-4 py-2 btn btn-secondary text-sm" @click="showForm = false">Cancelar</button>
        <button type="button" class="px-4 py-2 btn btn-primary text-sm disabled:opacity-60" :disabled="formLoading" @click="guardarFondo">
          {{ formLoading ? 'Guardando…' : (editTarget ? 'Guardar' : 'Crear fondo') }}
        </button>
      </template>
    </BaseModal>

    <!-- ═══ Recargar saldo ═══ -->
    <BaseModal :open="showRecarga" :title="`Subir saldo a ${recargaTarget?.cliente_nombre ?? ''}`" size="sm" @close="showRecarga = false">
      <div class="space-y-3">
        <p class="text-sm text-muted">
          Saldo actual: <strong :class="Number(recargaTarget?.saldo ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'">{{ fmtMoney(Number(recargaTarget?.saldo ?? 0)) }}</strong>.
          La recarga se suma de inmediato y queda registrada en el historial.
        </p>
        <FormField label="Monto a recargar" required>
          <input v-model.number="rMonto" type="number" min="0.01" step="0.01" class="w-full px-3 py-2 input" />
        </FormField>
        <FormField label="Nota" hint="Opcional (ej. motivo de la recarga)">
          <input v-model="rNota" type="text" class="w-full px-3 py-2 input" />
        </FormField>
        <p v-if="Number(rMonto) > 0" class="text-sm text-muted">
          Saldo resultante: <strong class="text-green-600">{{ fmtMoney(Number(recargaTarget?.saldo ?? 0) + Number(rMonto)) }}</strong>
        </p>
      </div>
      <template #footer>
        <button type="button" class="px-4 py-2 btn btn-secondary text-sm" @click="showRecarga = false">Cancelar</button>
        <button type="button" class="px-4 py-2 btn btn-primary text-sm disabled:opacity-60" :disabled="recargaLoading" @click="recargarSaldo">
          {{ recargaLoading ? 'Recargando…' : 'Recargar' }}
        </button>
      </template>
    </BaseModal>

    <!-- ═══ Historial ═══ -->
    <BaseModal :open="showHist" :title="`Historial — ${histTarget?.cliente_nombre ?? ''}`" size="lg" @close="showHist = false">
      <LoadingSpinner v-if="histLoading" size="sm" />
      <div v-else class="space-y-1 max-h-[60vh] overflow-y-auto">
        <div v-for="m in historial" :key="m.codfmv" class="flex items-center gap-3 px-3 py-2 border-b border-base text-sm">
          <span class="w-36 shrink-0 text-xs" :class="{
            'text-green-600': m.tipo === 'ajuste' || m.tipo === 'transf_in',
            'text-red-600': m.tipo === 'consumo' || m.tipo === 'transf_out',
            'text-amber-600': m.tipo === 'adelanto',
          }">{{ tipoMovLabel[m.tipo] ?? m.tipo }}</span>
          <span class="w-24 shrink-0 text-right font-medium" :class="(m.tipo === 'ajuste' || m.tipo === 'transf_in') ? 'text-green-600' : (m.tipo === 'adelanto' ? 'text-amber-600' : 'text-red-600')">
            {{ (m.tipo === 'ajuste' || m.tipo === 'transf_in') ? '+' : '−' }}{{ fmtMoney(m.monto) }}
          </span>
          <span class="flex-1 text-muted text-xs truncate">
            {{ m.nota }}<template v-if="m.codfac"> · factura {{ m.tipo_fac }}-{{ m.codfac }}</template>
            · aplica al {{ fmtDate(m.fecha_aplicacion) }}
          </span>
          <span class="shrink-0 text-xs text-muted">{{ fmtDateTime(m.fecha_real) }}<template v-if="m.codusr"> · {{ m.codusr }}</template></span>
        </div>
        <p v-if="!historial.length" class="text-sm text-muted py-4 text-center">Sin movimientos.</p>
      </div>
      <template #footer><button type="button" class="px-4 py-2 btn btn-secondary text-sm" @click="showHist = false">Cerrar</button></template>
    </BaseModal>

    <!-- ═══ Transferir ═══ -->
    <BaseModal :open="showTransf" :title="`Transferir fondo de ${transfTarget?.cliente_nombre ?? ''}`" size="sm" @close="showTransf = false">
      <div class="space-y-3">
        <p class="text-sm text-muted">Saldo disponible: <strong class="text-main">{{ fmtMoney(Number(transfTarget?.saldo ?? 0)) }}</strong>. El cliente debe tener fondo activo en el negocio destino.</p>
        <FormField label="Negocio destino" required>
          <select v-model="tNegocio" class="w-full px-3 py-2 input">
            <option :value="null">— Seleccionar —</option>
            <option v-for="n in otrosNegocios" :key="n.codneg" :value="Number(n.codneg)">{{ n.nombre }}</option>
          </select>
        </FormField>
        <FormField label="Monto" required>
          <input v-model.number="tMonto" type="number" min="0.01" step="0.01" class="w-full px-3 py-2 input" />
        </FormField>
        <FormField label="Nota" hint="Opcional">
          <input v-model="tNota" type="text" class="w-full px-3 py-2 input" />
        </FormField>
      </div>
      <template #footer>
        <button type="button" class="px-4 py-2 btn btn-secondary text-sm" @click="showTransf = false">Cancelar</button>
        <button type="button" class="px-4 py-2 btn btn-primary text-sm disabled:opacity-60" :disabled="transfLoading" @click="transferir">
          {{ transfLoading ? 'Transfiriendo…' : 'Transferir' }}
        </button>
      </template>
    </BaseModal>
  </div>
</template>
