<script setup lang="ts">
/**
 * Módulo CLIENTES — Gestión de clientes del negocio actual.
 * Un cliente siempre está vinculado a una persona.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { apiFetch } from '@/utils/api'
import { useSession } from '@/utils/session'
import BaseTable, { type Column } from '@/components/shared/BaseTable.vue'
import BaseModal from '@/components/shared/BaseModal.vue'
import LoadingSpinner from '@/components/shared/LoadingSpinner.vue'
import ErrorAlert from '@/components/shared/ErrorAlert.vue'
import EmptyState from '@/components/shared/EmptyState.vue'
import StatusBadge from '@/components/shared/StatusBadge.vue'
import PersonaSearchModal from '@/components/personas/PersonaSearchModal.vue'
import PersonaCreateModal from '@/components/personas/PersonaCreateModal.vue'
import FormField from '@/components/shared/FormField.vue'
import { normalizarTexto, useClientesCache } from '@/composables/useCatalogosCache'

type ClienteRow = {
  codcli: number
  codper: number
  estado: 'A' | 'I'
  nombre: string
  apellidos?: string | null
  email?: string | null
  telefono?: string | null
  cedula?: string | null
  fiar: boolean | number
  limite_fiado?: number | null
  deuda_fiao?: number
}

const { user } = useSession()
const codneg = computed(() => { const v = Number(user.value?.codneg); return Number.isFinite(v) && v > 0 ? v : null })
const clientesCache = useClientesCache()

const loading = ref(false)
const error = ref<string | null>(null)
const okMsg = ref<string | null>(null)
const clientes = ref<ClienteRow[]>([])
const busqueda = ref('')

const cols: Column[] = [
  { key: 'codcli', label: '#', width: '60px' },
  { key: 'nombre', label: 'Nombre' },
  { key: 'cedula', label: 'Cédula', width: '130px' },
  { key: 'telefono', label: 'Teléfono', width: '120px' },
  { key: 'email', label: 'Email' },
  { key: 'fiao', label: 'Fiao', width: '160px', align: 'center' },
  { key: 'estado', label: 'Estado', width: '90px', align: 'center' },
  { key: 'actions', label: '', width: '170px', align: 'center' },
]

function fmtMoney(v: number) { return new Intl.NumberFormat('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v ?? 0) }

const clientesFiltrados = computed(() => {
  const q = normalizarTexto(busqueda.value.trim())
  if (!q) return clientes.value
  return clientes.value.filter(c =>
    [c.nombre, c.apellidos, c.cedula, c.email, c.telefono].some(v => normalizarTexto(v).includes(q)),
  )
})

async function loadClientes() {
  if (!codneg.value) return
  loading.value = true; error.value = null
  try { clientes.value = await apiFetch<ClienteRow[]>(`clientes/todos?codneg=${codneg.value}`) }
  catch (e: any) { error.value = e?.message ?? 'Error cargando clientes' }
  finally { loading.value = false }
}

/* ── Crear cliente: elegir/crear persona ── */
const showPersonaSearch = ref(false)
const showPersonaCreate = ref(false)
const creando = ref(false)

async function vincularPersona(persona: any) {
  showPersonaSearch.value = false
  showPersonaCreate.value = false
  if (!persona?.codper || !codneg.value) return
  creando.value = true; error.value = null
  try {
    await apiFetch('clientes', {
      method: 'POST',
      body: JSON.stringify({ codneg: codneg.value, codper: persona.codper }),
    })
    okMsg.value = `Cliente "${persona.nombre ?? ''}" registrado.`
    clientesCache.invalidar() // refleja en el buscador de la caja
    await loadClientes()
  } catch (e: any) { error.value = e?.message ?? 'Error creando cliente' }
  finally { creando.value = false }
}

/* ── Configuración de fiao (permitir + límite máximo de deuda) ── */
const showFiado = ref(false)
const fiadoTarget = ref<ClienteRow | null>(null)
const fFiar = ref(false)
const fLimite = ref<number | null>(null)
const fiadoLoading = ref(false)

function openFiado(c: ClienteRow) {
  fiadoTarget.value = c
  fFiar.value = Boolean(Number(c.fiar ?? 0))
  fLimite.value = c.limite_fiado == null ? null : Number(c.limite_fiado)
  showFiado.value = true
}

async function guardarFiado() {
  if (!fiadoTarget.value) return
  if (fLimite.value !== null && Number(fLimite.value) < 0) { error.value = 'Límite inválido'; return }
  fiadoLoading.value = true; error.value = null
  try {
    await apiFetch(`clientes/${fiadoTarget.value.codcli}/fiado`, {
      method: 'PATCH',
      body: JSON.stringify({ codneg: codneg.value, fiar: fFiar.value, limiteFiado: fLimite.value }),
    })
    okMsg.value = fFiar.value
      ? `Fiao habilitado para ${fiadoTarget.value.nombre}${fLimite.value !== null ? ` (límite ${fmtMoney(Number(fLimite.value))})` : ' (sin límite)'}.`
      : `Fiao deshabilitado para ${fiadoTarget.value.nombre}.`
    showFiado.value = false
    clientesCache.invalidar() // la caja usa el flag para ofrecer fiar
    await loadClientes()
  } catch (e: any) { error.value = e?.message ?? 'Error guardando fiao' }
  finally { fiadoLoading.value = false }
}

/* ── Activar / inactivar ── */
async function toggleEstado(c: ClienteRow) {
  error.value = null
  const nuevo = c.estado === 'A' ? 'I' : 'A'
  try {
    await apiFetch(`clientes/${c.codcli}/estado`, {
      method: 'PATCH',
      body: JSON.stringify({ codneg: codneg.value, estado: nuevo }),
    })
    okMsg.value = nuevo === 'I' ? 'Cliente inactivado.' : 'Cliente reactivado.'
    clientesCache.invalidar()
    await loadClientes()
  } catch (e: any) { error.value = e?.message ?? 'Error cambiando estado' }
}

onMounted(loadClientes)
watch(codneg, loadClientes)
</script>

<template>
  <div class="space-y-4">
    <div class="card p-4">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 class="text-lg font-semibold text-main">Clientes</h2>
          <p class="text-sm text-muted">Clientes del negocio actual (vinculados a una persona).</p>
        </div>
        <div class="flex gap-2 items-center">
          <input v-model="busqueda" type="search" class="px-3 py-2 input text-sm w-56" placeholder="Buscar nombre, cédula…" />
          <button type="button" class="px-4 py-2 btn btn-secondary text-sm" :disabled="creando" @click="showPersonaSearch = true">Vincular existente</button>
          <button type="button" class="px-4 py-2 btn btn-primary text-sm" :disabled="creando" @click="showPersonaCreate = true">+ Nuevo cliente</button>
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
      <BaseTable :columns="cols" :rows="clientesFiltrados" row-key="codcli" striped>
        <template #cell-nombre="{ row }">
          <span class="font-medium text-main">{{ row.nombre }} {{ row.apellidos ?? '' }}</span>
        </template>
        <template #cell-fiao="{ row }">
          <div v-if="Number(row.fiar ?? 0)" class="text-xs">
            <span class="inline-flex px-2 py-0.5 rounded bg-amber-100 text-amber-700">Permitido</span>
            <p class="text-muted mt-0.5">
              {{ row.limite_fiado != null ? `límite ${fmtMoney(Number(row.limite_fiado))}` : 'sin límite' }}
              <template v-if="Number(row.deuda_fiao ?? 0) > 0"> · debe {{ fmtMoney(Number(row.deuda_fiao)) }}</template>
            </p>
          </div>
          <span v-else class="text-muted text-xs">No</span>
        </template>
        <template #cell-estado="{ value }"><StatusBadge :estado="value" /></template>
        <template #cell-actions="{ row }">
          <div class="flex gap-1 justify-center">
            <button type="button" class="px-2.5 py-1 btn text-xs bg-amber-100 text-amber-700 hover:bg-amber-200" @click="openFiado(row)">Fiao</button>
            <button type="button"
              :class="['px-2.5 py-1 btn text-xs', row.estado === 'A' ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-green-100 text-green-700 hover:bg-green-200']"
              @click="toggleEstado(row)">
              {{ row.estado === 'A' ? 'Inactivar' : 'Reactivar' }}
            </button>
          </div>
        </template>
        <template #empty><EmptyState title="Sin clientes" message="Registra el primer cliente." /></template>
      </BaseTable>
    </div>

    <div v-if="!codneg" class="card p-8 text-center">
      <p class="text-lg font-semibold text-main">Selecciona un negocio</p>
      <p class="text-sm text-muted mt-1">Los clientes se gestionan por negocio.</p>
    </div>

    <!-- Vincular persona existente / crear persona nueva como cliente -->
    <PersonaSearchModal :open="showPersonaSearch" @select="vincularPersona" @close="showPersonaSearch = false" />
    <PersonaCreateModal :open="showPersonaCreate" @created="vincularPersona" @close="showPersonaCreate = false" />

    <!-- Configurar fiao del cliente -->
    <BaseModal :open="showFiado" :title="`Fiao — ${fiadoTarget?.nombre ?? ''} ${fiadoTarget?.apellidos ?? ''}`" size="sm" @close="showFiado = false">
      <div class="space-y-3">
        <label class="flex items-center gap-2 text-sm text-main">
          <input v-model="fFiar" type="checkbox" class="rounded" />
          Permitir fiar a este cliente
        </label>
        <FormField v-if="fFiar" label="Límite de fiado" hint="Deuda máxima acumulada permitida. Vacío = sin límite.">
          <input v-model.number="fLimite" type="number" min="0" step="0.01" class="w-full px-3 py-2 input" placeholder="Sin límite" />
        </FormField>
        <p v-if="fFiar && Number(fiadoTarget?.deuda_fiao ?? 0) > 0" class="text-xs text-muted">
          Deuda pendiente actual: <strong class="text-amber-600">{{ fmtMoney(Number(fiadoTarget?.deuda_fiao)) }}</strong>
        </p>
      </div>
      <template #footer>
        <button type="button" class="px-4 py-2 btn btn-secondary text-sm" @click="showFiado = false">Cancelar</button>
        <button type="button" class="px-4 py-2 btn btn-primary text-sm disabled:opacity-60" :disabled="fiadoLoading" @click="guardarFiado">
          {{ fiadoLoading ? 'Guardando…' : 'Guardar' }}
        </button>
      </template>
    </BaseModal>
  </div>
</template>
