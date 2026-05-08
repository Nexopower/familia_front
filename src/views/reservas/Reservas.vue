<script setup lang="ts">
/**
 * Módulo RESERVAS — Vista reestructurada.
 *
 * Auto: codres (PK), fecres (GETDATE), estado
 * FK sesión: codneg
 * FK dropdown: codcli (cliente)
 * Usuario: fecini, fecfin (datetime pickers), detalle
 */
import { computed, onMounted, ref, watch } from 'vue'
import { apiFetch } from '@/utils/api'
import { useSession } from '@/utils/session'
import type { AuthzCheckResponse } from '@/types'

import BaseTable, { type Column } from '@/components/shared/BaseTable.vue'
import BaseModal from '@/components/shared/BaseModal.vue'
import FormField from '@/components/shared/FormField.vue'
import StatusBadge from '@/components/shared/StatusBadge.vue'
import LoadingSpinner from '@/components/shared/LoadingSpinner.vue'
import ErrorAlert from '@/components/shared/ErrorAlert.vue'
import EmptyState from '@/components/shared/EmptyState.vue'

type Reserva = { codres: number; codneg: number; codcli?: number; fecini: string; fecfin: string; fecres: string; estado: string; detalle?: string; cliente_nombre?: string }
type ClienteOpt = { codcli: number; nombre: string }

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

const loading = ref(false)
const error = ref<string | null>(null)
const reservas = ref<Reserva[]>([])
const clientes = ref<ClienteOpt[]>([])

const cols: Column[] = [
  { key: 'codres', label: '#', width: '60px' },
  { key: 'cliente_nombre', label: 'Cliente' },
  { key: 'fecini', label: 'Inicio', width: '180px' },
  { key: 'fecfin', label: 'Fin', width: '180px' },
  { key: 'estado', label: 'Estado', width: '110px', align: 'center' },
  { key: 'detalle', label: 'Detalle' },
  { key: 'actions', label: '', width: '140px', align: 'center' },
]

function fmtDT(v: string) { if (!v) return '—'; const d = new Date(v); return Number.isNaN(d.getTime()) ? v : d.toLocaleString() }

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

/* ── Crear reserva ── */
const showCreate = ref(false)
const createLoading = ref(false)
const newCodcli = ref<number | null>(null)
const newFecini = ref('')
const newFecfin = ref('')
const newDetalle = ref('')

function resetCreate() { newCodcli.value = null; newFecini.value = ''; newFecfin.value = ''; newDetalle.value = '' }

async function createReserva() {
  if (!newFecini.value || !newFecfin.value) { error.value = 'Completa las fechas'; return }
  error.value = null; createLoading.value = true
  try {
    await apiFetch('reservas', {
      method: 'POST',
      body: JSON.stringify({ codneg: codneg.value, codcli: newCodcli.value || undefined, fecini: newFecini.value, fecfin: newFecfin.value, detalle: newDetalle.value.trim() || undefined }),
    })
    showCreate.value = false; resetCreate(); await loadReservas()
  } catch (e: any) { error.value = e?.message ?? 'Error' }
  finally { createLoading.value = false }
}

/* ── Reprogramar ── */
const showReprogram = ref(false)
const reprogramTarget = ref<Reserva | null>(null)
const repFecini = ref('')
const repFecfin = ref('')
const repLoading = ref(false)

function openReprogram(r: Reserva) {
  reprogramTarget.value = r; repFecini.value = r.fecini?.slice(0, 16) ?? ''; repFecfin.value = r.fecfin?.slice(0, 16) ?? ''; showReprogram.value = true
}

async function doReprogram() {
  if (!reprogramTarget.value || !repFecini.value || !repFecfin.value) return
  repLoading.value = true; error.value = null
  try {
    await apiFetch(`reservas/${reprogramTarget.value.codres}/reprogramar`, {
      method: 'POST',
      body: JSON.stringify({ codneg: codneg.value, fecini: repFecini.value, fecfin: repFecfin.value }),
    })
    showReprogram.value = false; await loadReservas()
  } catch (e: any) { error.value = e?.message ?? 'Error' }
  finally { repLoading.value = false }
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
          <button v-if="perms.crear || isAdmin" type="button" class="px-4 py-2 btn btn-primary text-sm" @click="showCreate = true; resetCreate()">+ Nueva reserva</button>
          <button type="button" class="px-4 py-2 btn btn-secondary text-sm" :disabled="loading" @click="loadReservas">Recargar</button>
        </div>
      </div>
    </div>

    <ErrorAlert v-if="error" :message="error" @dismiss="error = null" />
    <LoadingSpinner v-if="loading" />

    <div v-if="!loading" class="card p-4">
      <BaseTable :columns="cols" :rows="reservas" row-key="codres" striped>
        <template #cell-fecini="{ value }">{{ fmtDT(value) }}</template>
        <template #cell-fecfin="{ value }">{{ fmtDT(value) }}</template>
        <template #cell-estado="{ value }">
          <StatusBadge :estado="value === 'activa' ? 'A' : 'I'" :active-label="value" :inactive-label="value" />
        </template>
        <template #cell-actions="{ row }">
          <button v-if="(perms.reprogramar || isAdmin) && row.estado === 'activa'" type="button" class="px-3 py-1 btn btn-secondary text-xs" @click="openReprogram(row)">Reprogramar</button>
        </template>
        <template #empty><EmptyState title="Sin reservas" message="No hay reservas registradas." /></template>
      </BaseTable>
    </div>

    <!-- ═══ Crear reserva ═══ -->
    <BaseModal :open="showCreate" title="Nueva reserva" size="md" @close="showCreate = false">
      <div class="space-y-3">
        <FormField label="Cliente" hint="Opcional">
          <select v-model="newCodcli" class="w-full px-3 py-2 input">
            <option :value="null">— Sin cliente —</option>
            <option v-for="c in clientes" :key="c.codcli" :value="c.codcli">{{ c.nombre }}</option>
          </select>
        </FormField>
        <div class="grid grid-cols-2 gap-3">
          <FormField label="Fecha inicio" required>
            <input v-model="newFecini" type="datetime-local" class="w-full px-3 py-2 input" />
          </FormField>
          <FormField label="Fecha fin" required>
            <input v-model="newFecfin" type="datetime-local" class="w-full px-3 py-2 input" />
          </FormField>
        </div>
        <FormField label="Detalle / notas" hint="Opcional">
          <textarea v-model="newDetalle" class="w-full px-3 py-2 input" rows="2" placeholder="Descripción de la reserva…" />
        </FormField>
      </div>
      <template #footer>
        <button type="button" class="px-4 py-2 btn btn-secondary text-sm" @click="showCreate = false">Cancelar</button>
        <button type="button" class="px-4 py-2 btn btn-primary text-sm disabled:opacity-60" :disabled="createLoading" @click="createReserva">
          {{ createLoading ? 'Creando…' : 'Crear' }}
        </button>
      </template>
    </BaseModal>

    <!-- ═══ Reprogramar ═══ -->
    <BaseModal :open="showReprogram" title="Reprogramar reserva" size="sm" @close="showReprogram = false">
      <div class="space-y-3">
        <FormField label="Nueva fecha inicio" required>
          <input v-model="repFecini" type="datetime-local" class="w-full px-3 py-2 input" />
        </FormField>
        <FormField label="Nueva fecha fin" required>
          <input v-model="repFecfin" type="datetime-local" class="w-full px-3 py-2 input" />
        </FormField>
      </div>
      <template #footer>
        <button type="button" class="px-4 py-2 btn btn-secondary text-sm" @click="showReprogram = false">Cancelar</button>
        <button type="button" class="px-4 py-2 btn btn-primary text-sm disabled:opacity-60" :disabled="repLoading" @click="doReprogram">
          {{ repLoading ? 'Guardando…' : 'Guardar' }}
        </button>
      </template>
    </BaseModal>
  </div>
</template>
