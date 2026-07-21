<script setup lang="ts">
/**
 * Módulo RESERVAS.
 * Filtros (estado/cliente/fecha), crear, editar, reprogramar, completar y cancelar.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { apiFetch } from '@/utils/api'
import { useSession } from '@/utils/session'
import type { AuthzCheckResponse, Reserva, ClienteOpt } from '@/types'

import BaseTable, { type Column } from '@/components/shared/BaseTable.vue'
import BaseModal from '@/components/shared/BaseModal.vue'
import FormField from '@/components/shared/FormField.vue'
import LoadingSpinner from '@/components/shared/LoadingSpinner.vue'
import ErrorAlert from '@/components/shared/ErrorAlert.vue'
import EmptyState from '@/components/shared/EmptyState.vue'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'

const { user } = useSession()
const codneg = computed(() => { const v = Number(user.value?.codneg); return Number.isFinite(v) && v > 0 ? v : null })
const isAdmin = computed(() => Boolean(user.value?.isAdmin || user.value?.codusr === 'admin'))

const perms = ref({ ver: false, crear: false, reprogramar: false })
async function loadPermisos() {
  if (isAdmin.value) { perms.value = { ver: true, crear: true, reprogramar: true }; return }
  if (!codneg.value) return
  try {
    const res = await apiFetch<AuthzCheckResponse>('authz/check', {
      method: 'POST', body: JSON.stringify({ codneg: codneg.value, permisos: ['RESERVAS.VER', 'RESERVAS.CREAR', 'RESERVAS.REPROGRAMAR'] }),
    })
    const m = res?.permisos ?? {}
    perms.value = { ver: Boolean(m['RESERVAS.VER']), crear: Boolean(m['RESERVAS.CREAR']), reprogramar: Boolean(m['RESERVAS.REPROGRAMAR']) }
  } catch { perms.value = { ver: false, crear: false, reprogramar: false } }
}
const puedeGestionar = computed(() => perms.value.reprogramar || isAdmin.value)

const loading = ref(false)
const error = ref<string | null>(null)
const reservas = ref<Reserva[]>([])
const clientes = ref<ClienteOpt[]>([])

/* ── Filtros ── */
function yyyyMmDd(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const fEstado = ref<'todas' | 'pendiente' | 'confirmada' | 'completada' | 'cancelada'>('todas')
const fSearch = ref('')
const usarRango = ref(false)
const fDesde = ref(yyyyMmDd(new Date()))
const fHasta = ref(yyyyMmDd(new Date()))

const reservasFiltradas = computed(() => {
  const q = fSearch.value.trim().toLowerCase()
  return reservas.value.filter(r => {
    if (fEstado.value !== 'todas' && r.estado !== fEstado.value) return false
    if (q && !((r.cliente_nombre ?? '').toLowerCase().includes(q) || (r.detalle ?? '').toLowerCase().includes(q) || String(r.codres).includes(q))) return false
    if (usarRango.value) {
      const ini = (r.fecini ?? '').slice(0, 10)
      if (fDesde.value && ini < fDesde.value) return false
      if (fHasta.value && ini > fHasta.value) return false
    }
    return true
  })
})

const cols: Column[] = [
  { key: 'codres', label: '#', width: '60px' },
  { key: 'cliente_nombre', label: 'Cliente' },
  { key: 'fecini', label: 'Inicio', width: '170px' },
  { key: 'fecfin', label: 'Fin', width: '170px' },
  { key: 'estado', label: 'Estado', width: '120px', align: 'center' },
  { key: 'detalle', label: 'Detalle' },
  { key: 'actions', label: '', width: '230px', align: 'center' },
]

function fmtDT(v: string) { if (!v) return '—'; const d = new Date(v); return Number.isNaN(d.getTime()) ? v : d.toLocaleString() }
function estadoClass(e?: string) {
  return {
    pendiente: 'bg-yellow-100 text-yellow-700',
    confirmada: 'bg-blue-100 text-blue-700',
    completada: 'bg-green-100 text-green-700',
    cancelada: 'bg-red-100 text-red-700',
  }[e ?? ''] ?? 'bg-gray-200 text-gray-600'
}
const esFinal = (e?: string) => e === 'completada' || e === 'cancelada'

async function loadReservas() {
  if (!codneg.value) return
  loading.value = true; error.value = null
  try { reservas.value = await apiFetch<Reserva[]>(`reservas?codneg=${codneg.value}`) }
  catch (e: any) { error.value = e?.message ?? 'Error' }
  finally { loading.value = false }
}

async function loadClientes() {
  if (!codneg.value) return
  try { clientes.value = await apiFetch<ClienteOpt[]>(`clientes?codneg=${codneg.value}`) } catch { clientes.value = [] }
}

/* ── Crear / Editar (modal compartido) ── */
const showForm = ref(false)
const formLoading = ref(false)
const editTarget = ref<Reserva | null>(null)
const fCodcli = ref<number | null>(null)
const fFecini = ref('')
const fFecfin = ref('')
const fDetalle = ref('')

function openCrear() {
  editTarget.value = null; fCodcli.value = null; fFecini.value = ''; fFecfin.value = ''; fDetalle.value = ''; showForm.value = true
}
function openEditar(r: Reserva) {
  editTarget.value = r
  fCodcli.value = r.codcli ?? null
  fFecini.value = r.fecini?.slice(0, 16) ?? ''
  fFecfin.value = r.fecfin?.slice(0, 16) ?? ''
  fDetalle.value = r.detalle ?? ''
  showForm.value = true
}

async function guardarForm() {
  if (!fFecini.value || !fFecfin.value) { error.value = 'Completa las fechas'; return }
  error.value = null; formLoading.value = true
  try {
    if (editTarget.value) {
      await apiFetch(`reservas/${editTarget.value.codres}`, {
        method: 'PUT',
        body: JSON.stringify({ codcli: fCodcli.value, fecini: fFecini.value, fecfin: fFecfin.value, detalle: fDetalle.value.trim() || undefined }),
      })
    } else {
      await apiFetch('reservas', {
        method: 'POST',
        body: JSON.stringify({ codneg: codneg.value, codcli: fCodcli.value || undefined, fecini: fFecini.value, fecfin: fFecfin.value, detalle: fDetalle.value.trim() || undefined }),
      })
    }
    showForm.value = false; await loadReservas()
  } catch (e: any) { error.value = e?.message ?? 'Error' }
  finally { formLoading.value = false }
}

/* ── Cambiar estado (completar / cancelar) ── */
const showConfirmEstado = ref(false)
const estadoTarget = ref<Reserva | null>(null)
const estadoNuevo = ref<'completada' | 'cancelada'>('completada')
const estadoLoading = ref(false)

function pedirEstado(r: Reserva, estado: 'completada' | 'cancelada') {
  estadoTarget.value = r; estadoNuevo.value = estado; showConfirmEstado.value = true
}
async function doCambiarEstado() {
  if (!estadoTarget.value) return
  estadoLoading.value = true; error.value = null
  try {
    await apiFetch(`reservas/${estadoTarget.value.codres}/estado`, { method: 'PATCH', body: JSON.stringify({ estado: estadoNuevo.value }) })
    showConfirmEstado.value = false; await loadReservas()
  } catch (e: any) { error.value = e?.message ?? 'Error' }
  finally { estadoLoading.value = false }
}

onMounted(async () => { await loadPermisos(); await Promise.all([loadReservas(), loadClientes()]) })
watch(codneg, async () => { await loadPermisos(); await Promise.all([loadReservas(), loadClientes()]) })
</script>

<template>
  <div class="space-y-4">
    <div class="card p-4">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 class="text-lg font-semibold text-main">Reservas</h2>
          <p class="text-sm text-muted">Gestión de reservas del negocio.</p>
        </div>
        <div class="flex gap-2">
          <button v-if="perms.crear || isAdmin" type="button" class="px-4 py-2 btn btn-primary text-sm" @click="openCrear">+ Nueva reserva</button>
          <button type="button" class="px-4 py-2 btn btn-secondary text-sm" :disabled="loading" @click="loadReservas">Recargar</button>
        </div>
      </div>

      <!-- Filtros -->
      <div class="flex items-end gap-3 flex-wrap mt-4">
        <div>
          <label class="block text-xs text-muted mb-1">Estado</label>
          <select v-model="fEstado" class="px-3 py-2 input text-sm">
            <option value="todas">Todos</option>
            <option value="pendiente">Pendiente</option>
            <option value="confirmada">Confirmada</option>
            <option value="completada">Completada</option>
            <option value="cancelada">Cancelada</option>
          </select>
        </div>
        <div>
          <label class="block text-xs text-muted mb-1">Buscar</label>
          <input v-model="fSearch" type="text" class="px-3 py-2 input text-sm w-56" placeholder="Cliente, detalle o #…" />
        </div>
        <label class="flex items-center gap-2 text-sm text-muted mb-2">
          <input type="checkbox" v-model="usarRango" /> Filtrar por fecha
        </label>
        <template v-if="usarRango">
          <div>
            <label class="block text-xs text-muted mb-1">Desde</label>
            <input v-model="fDesde" type="date" class="px-3 py-2 input text-sm" />
          </div>
          <div>
            <label class="block text-xs text-muted mb-1">Hasta</label>
            <input v-model="fHasta" type="date" class="px-3 py-2 input text-sm" />
          </div>
        </template>
      </div>
    </div>

    <ErrorAlert v-if="error" :message="error" @dismiss="error = null" />
    <LoadingSpinner v-if="loading" />

    <div v-if="!loading" class="card p-4">
      <BaseTable :columns="cols" :rows="reservasFiltradas" row-key="codres" striped>
        <template #cell-cliente_nombre="{ value }">{{ value || 'Sin cliente' }}</template>
        <template #cell-fecini="{ value }">{{ fmtDT(value) }}</template>
        <template #cell-fecfin="{ value }">{{ fmtDT(value) }}</template>
        <template #cell-detalle="{ value }"><span class="text-muted">{{ value || '—' }}</span></template>
        <template #cell-estado="{ value }">
          <span :class="['inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize', estadoClass(value)]">{{ value || '—' }}</span>
        </template>
        <template #cell-actions="{ row }">
          <div v-if="puedeGestionar && !esFinal(row.estado)" class="flex gap-1 justify-center flex-wrap">
            <button type="button" class="px-2.5 py-1 btn btn-secondary text-xs" @click="openEditar(row)">Editar</button>
            <button type="button" class="px-2.5 py-1 btn text-xs bg-green-100 text-green-700 hover:bg-green-200" @click="pedirEstado(row, 'completada')">Completar</button>
            <button type="button" class="px-2.5 py-1 btn text-xs bg-red-100 text-red-700 hover:bg-red-200" @click="pedirEstado(row, 'cancelada')">Cancelar</button>
          </div>
          <span v-else class="text-xs text-muted">—</span>
        </template>
        <template #empty><EmptyState title="Sin reservas" message="No hay reservas que coincidan con los filtros." /></template>
      </BaseTable>
    </div>

    <!-- ═══ Crear / Editar ═══ -->
    <BaseModal :open="showForm" :title="editTarget ? `Editar reserva #${editTarget.codres}` : 'Nueva reserva'" size="md" @close="showForm = false">
      <div class="space-y-3">
        <FormField label="Cliente" hint="Opcional">
          <select v-model="fCodcli" class="w-full px-3 py-2 input">
            <option :value="null">— Sin cliente —</option>
            <option v-for="c in clientes" :key="c.codcli" :value="c.codcli">{{ c.nombre }}</option>
          </select>
        </FormField>
        <div class="grid grid-cols-2 gap-3">
          <FormField label="Fecha inicio" required>
            <input v-model="fFecini" type="datetime-local" class="w-full px-3 py-2 input" />
          </FormField>
          <FormField label="Fecha fin" required>
            <input v-model="fFecfin" type="datetime-local" class="w-full px-3 py-2 input" />
          </FormField>
        </div>
        <FormField label="Detalle / notas" hint="Opcional">
          <textarea v-model="fDetalle" class="w-full px-3 py-2 input" rows="2" placeholder="Descripción de la reserva…" />
        </FormField>
      </div>
      <template #footer>
        <button type="button" class="px-4 py-2 btn btn-secondary text-sm" @click="showForm = false">Cancelar</button>
        <button type="button" class="px-4 py-2 btn btn-primary text-sm disabled:opacity-60" :disabled="formLoading" @click="guardarForm">
          {{ formLoading ? 'Guardando…' : (editTarget ? 'Guardar cambios' : 'Crear') }}
        </button>
      </template>
    </BaseModal>

    <!-- ═══ Confirmar cambio de estado ═══ -->
    <ConfirmDialog
      :open="showConfirmEstado"
      :title="estadoNuevo === 'completada' ? 'Completar reserva' : 'Cancelar reserva'"
      :message="`¿Marcar la reserva #${estadoTarget?.codres} como ${estadoNuevo}?`"
      :variant="estadoNuevo === 'cancelada' ? 'danger' : 'warning'"
      :confirm-label="estadoNuevo === 'completada' ? 'Completar' : 'Cancelar reserva'"
      :loading="estadoLoading"
      @confirm="doCambiarEstado"
      @cancel="showConfirmEstado = false"
    />
  </div>
</template>
