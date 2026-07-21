<script setup lang="ts">
/**
 * Módulo FIAOS — Deudas de clientes (ventas a crédito) y abonos.
 * El abono registra el ingreso contable (dinero real entrando).
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
import { normalizarTexto } from '@/composables/useCatalogosCache'

type FiaoRow = {
  codfia: number
  codcli: number
  tipo: string
  codfac: number
  monto: number
  saldo: number
  abonado: number
  estado: 'pendiente' | 'parcial' | 'pagado'
  codusr?: string | null
  fecha: string
  cliente_nombre: string
}

const { user } = useSession()
const codneg = computed(() => { const v = Number(user.value?.codneg); return Number.isFinite(v) && v > 0 ? v : null })

const loading = ref(false)
const error = ref<string | null>(null)
const okMsg = ref<string | null>(null)
const fiaos = ref<FiaoRow[]>([])
const fEstado = ref<'abiertos' | 'pagado' | 'todos'>('abiertos')
const busqueda = ref('')

const cols: Column[] = [
  { key: 'codfia', label: '#', width: '60px' },
  { key: 'cliente_nombre', label: 'Cliente' },
  { key: 'fecha', label: 'Fecha', width: '160px' },
  { key: 'monto', label: 'Monto', width: '110px', align: 'right' },
  { key: 'abonado', label: 'Abonado', width: '110px', align: 'right' },
  { key: 'saldo', label: 'Saldo', width: '110px', align: 'right' },
  { key: 'estado', label: 'Estado', width: '100px', align: 'center' },
  { key: 'actions', label: '', width: '110px', align: 'center' },
]

function fmtMoney(v: number) { return new Intl.NumberFormat('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v ?? 0) }
function fmtDate(v: string) { if (!v) return '—'; const d = new Date(v); return Number.isNaN(d.getTime()) ? v : d.toLocaleString() }
function estadoClass(e: string) {
  return { pendiente: 'bg-red-100 text-red-700', parcial: 'bg-amber-100 text-amber-700', pagado: 'bg-green-100 text-green-700' }[e] ?? 'bg-gray-200 text-gray-600'
}

const fiaosFiltrados = computed(() => {
  const q = normalizarTexto(busqueda.value.trim())
  let list = fiaos.value
  if (fEstado.value === 'abiertos') list = list.filter(f => f.estado !== 'pagado')
  else if (fEstado.value === 'pagado') list = list.filter(f => f.estado === 'pagado')
  if (q) list = list.filter(f => normalizarTexto(f.cliente_nombre).includes(q) || String(f.codfia).includes(q) || String(f.codfac).includes(q))
  return list
})

const saldoTotal = computed(() => fiaos.value.filter(f => f.estado !== 'pagado').reduce((s, f) => s + Number(f.saldo), 0))

async function loadFiaos() {
  if (!codneg.value) return
  loading.value = true; error.value = null
  try { fiaos.value = await apiFetch<FiaoRow[]>(`fiaos?codneg=${codneg.value}`) }
  catch (e: any) { error.value = e?.message ?? 'Error cargando fiaos' }
  finally { loading.value = false }
}

/* ── Abonar ── */
const showAbono = ref(false)
const abonoTarget = ref<FiaoRow | null>(null)
const abonoMonto = ref<number | null>(null)
const abonoNota = ref('')
const abonoLoading = ref(false)

function openAbono(f: FiaoRow) {
  abonoTarget.value = f
  abonoMonto.value = Number(f.saldo)
  abonoNota.value = ''
  showAbono.value = true
}

async function registrarAbono() {
  if (!abonoTarget.value || !codneg.value) return
  const monto = Number(abonoMonto.value)
  if (!Number.isFinite(monto) || monto <= 0) { error.value = 'Monto de abono inválido'; return }
  if (monto > Number(abonoTarget.value.saldo)) { error.value = 'El abono excede el saldo pendiente'; return }
  abonoLoading.value = true; error.value = null
  try {
    const res = await apiFetch<{ saldo: number; estado: string }>(`fiaos/${abonoTarget.value.codfia}/abonos`, {
      method: 'POST',
      body: JSON.stringify({ codneg: codneg.value, monto, nota: abonoNota.value.trim() || null }),
    })
    showAbono.value = false
    okMsg.value = res?.estado === 'pagado'
      ? `Fiao #${abonoTarget.value.codfia} saldado por completo. ✓`
      : `Abono registrado. Saldo restante: ${fmtMoney(Number(res?.saldo ?? 0))}.`
    await loadFiaos()
  } catch (e: any) { error.value = e?.message ?? 'Error registrando abono' }
  finally { abonoLoading.value = false }
}

onMounted(loadFiaos)
watch(codneg, loadFiaos)
</script>

<template>
  <div class="space-y-4">
    <div class="card p-4">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 class="text-lg font-semibold text-main">Fiaos (crédito)</h2>
          <p class="text-sm text-muted">
            Deudas de clientes por ventas fiadas.
            <span v-if="saldoTotal > 0" class="font-semibold text-red-600">Pendiente total: {{ fmtMoney(saldoTotal) }}</span>
          </p>
        </div>
        <div class="flex gap-2 items-center">
          <select v-model="fEstado" class="px-3 py-2 input text-sm">
            <option value="abiertos">Con saldo pendiente</option>
            <option value="pagado">Pagados</option>
            <option value="todos">Todos</option>
          </select>
          <input v-model="busqueda" type="search" class="px-3 py-2 input text-sm w-52" placeholder="Cliente o # fiao…" />
          <button type="button" class="px-4 py-2 btn btn-secondary text-sm" :disabled="loading" @click="loadFiaos">Recargar</button>
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
      <BaseTable :columns="cols" :rows="fiaosFiltrados" row-key="codfia" striped>
        <template #cell-cliente_nombre="{ row }">
          <span class="font-medium text-main">{{ row.cliente_nombre }}</span>
          <span class="ml-2 text-xs text-muted">factura {{ row.tipo }}-{{ row.codfac }}</span>
        </template>
        <template #cell-fecha="{ value }">{{ fmtDate(value) }}</template>
        <template #cell-monto="{ value }">{{ fmtMoney(value) }}</template>
        <template #cell-abonado="{ value }"><span class="text-green-600">{{ fmtMoney(value) }}</span></template>
        <template #cell-saldo="{ value }"><span class="font-semibold" :class="value > 0 ? 'text-red-600' : 'text-green-600'">{{ fmtMoney(value) }}</span></template>
        <template #cell-estado="{ value }">
          <span :class="['inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize', estadoClass(value)]">{{ value }}</span>
        </template>
        <template #cell-actions="{ row }">
          <button v-if="row.estado !== 'pagado'" type="button" class="px-3 py-1 btn btn-primary text-xs" @click="openAbono(row)">Abonar</button>
          <span v-else class="text-xs text-muted">✓</span>
        </template>
        <template #empty><EmptyState title="Sin fiaos" message="No hay ventas fiadas con este filtro." /></template>
      </BaseTable>
    </div>

    <div v-if="!codneg" class="card p-8 text-center">
      <p class="text-lg font-semibold text-main">Selecciona un negocio</p>
      <p class="text-sm text-muted mt-1">Los fiaos se gestionan por negocio.</p>
    </div>

    <!-- ═══ Registrar abono ═══ -->
    <BaseModal :open="showAbono" :title="`Abono al fiao #${abonoTarget?.codfia ?? ''}`" size="sm" @close="showAbono = false">
      <div class="space-y-3">
        <p class="text-sm text-main">
          Cliente: <strong>{{ abonoTarget?.cliente_nombre }}</strong><br />
          Saldo pendiente: <strong class="text-red-600">{{ fmtMoney(Number(abonoTarget?.saldo ?? 0)) }}</strong>
        </p>
        <FormField label="Monto del abono" required hint="Puede ser parcial">
          <input v-model.number="abonoMonto" type="number" min="0.01" step="0.01" class="w-full px-3 py-2 input text-lg font-bold text-right" />
        </FormField>
        <FormField label="Nota" hint="Opcional">
          <input v-model="abonoNota" type="text" class="w-full px-3 py-2 input" />
        </FormField>
        <p class="text-xs text-muted">El abono se registra como ingreso en contabilidad y suma al efectivo del día.</p>
      </div>
      <template #footer>
        <button type="button" class="px-4 py-2 btn btn-secondary text-sm" @click="showAbono = false">Cancelar</button>
        <button type="button" class="px-4 py-2 btn btn-primary text-sm disabled:opacity-60" :disabled="abonoLoading" @click="registrarAbono">
          {{ abonoLoading ? 'Registrando…' : 'Registrar abono' }}
        </button>
      </template>
    </BaseModal>
  </div>
</template>
