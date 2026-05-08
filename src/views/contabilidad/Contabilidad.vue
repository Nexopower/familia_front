<script setup lang="ts">
/**
 * Módulo CONTABILIDAD — Vista reestructurada.
 *
 * Tabs: Cuentas contables | Ingresos | Egresos
 * Auto: codcta/coding/codegr (PK), fecha (GETDATE)
 * FK sesión: codneg
 * FK dropdown: codcta (en ingresos/egresos)
 * Usuario: nombre (cuenta), monto, detalle (ing/egr)
 */
import { computed, onMounted, ref, watch } from 'vue'
import { apiFetch } from '@/utils/api'
import { useSession } from '@/utils/session'
import type { AuthzCheckResponse } from '@/types'

import BaseTable, { type Column } from '@/components/shared/BaseTable.vue'
import BaseModal from '@/components/shared/BaseModal.vue'
import FormField from '@/components/shared/FormField.vue'
import LoadingSpinner from '@/components/shared/LoadingSpinner.vue'
import ErrorAlert from '@/components/shared/ErrorAlert.vue'
import EmptyState from '@/components/shared/EmptyState.vue'

type CuentaContable = { codcta: number; nombre: string; tipo?: string; codneg: number; estado?: string }
type Ingreso = { coding: number; codcta: number; monto: number; detalle?: string; fecha: string; cuenta_nombre?: string }
type Egreso = { codegr: number; codcta: number; monto: number; detalle?: string; fecha: string; cuenta_nombre?: string }

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

const tab = ref<'cuentas' | 'ingresos' | 'egresos'>('cuentas')
const loading = ref(false)
const error = ref<string | null>(null)

const cuentas = ref<CuentaContable[]>([])
const ingresos = ref<Ingreso[]>([])
const egresos = ref<Egreso[]>([])

const ctaCols: Column[] = [
  { key: 'codcta', label: '#', width: '60px' },
  { key: 'nombre', label: 'Nombre' },
  { key: 'tipo', label: 'Tipo', width: '120px' },
  { key: 'estado', label: 'Estado', width: '90px', align: 'center' },
]
const ingCols: Column[] = [
  { key: 'coding', label: '#', width: '60px' },
  { key: 'cuenta_nombre', label: 'Cuenta' },
  { key: 'monto', label: 'Monto', width: '120px', align: 'right' },
  { key: 'detalle', label: 'Detalle' },
  { key: 'fecha', label: 'Fecha', width: '180px' },
]
const egrCols: Column[] = [
  { key: 'codegr', label: '#', width: '60px' },
  { key: 'cuenta_nombre', label: 'Cuenta' },
  { key: 'monto', label: 'Monto', width: '120px', align: 'right' },
  { key: 'detalle', label: 'Detalle' },
  { key: 'fecha', label: 'Fecha', width: '180px' },
]

function fmtMoney(v: number) { return new Intl.NumberFormat('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v ?? 0) }
function fmtDate(v: string) { if (!v) return '—'; const d = new Date(v); return Number.isNaN(d.getTime()) ? v : d.toLocaleString() }

async function loadCuentas() {
  if (!codneg.value) return
  loading.value = true; error.value = null
  try { cuentas.value = await apiFetch<CuentaContable[]>(`contabilidad/cuentas?codneg=${codneg.value}`) }
  catch (e: any) { error.value = e?.message ?? 'Error' }
  finally { loading.value = false }
}

async function loadIngresos() {
  if (!codneg.value) return
  loading.value = true; error.value = null
  try { ingresos.value = await apiFetch<Ingreso[]>(`contabilidad/ingresos?codneg=${codneg.value}`) }
  catch (e: any) { error.value = e?.message ?? 'Error' }
  finally { loading.value = false }
}

async function loadEgresos() {
  if (!codneg.value) return
  loading.value = true; error.value = null
  try { egresos.value = await apiFetch<Egreso[]>(`contabilidad/egresos?codneg=${codneg.value}`) }
  catch (e: any) { error.value = e?.message ?? 'Error' }
  finally { loading.value = false }
}

function loadTabData() {
  if (tab.value === 'cuentas') loadCuentas()
  else if (tab.value === 'ingresos') loadIngresos()
  else loadEgresos()
}

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
    showCreateIng.value = false; ingCodcta.value = null; ingMonto.value = null; ingDetalle.value = ''; await loadIngresos()
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
    showCreateEgr.value = false; egrCodcta.value = null; egrMonto.value = null; egrDetalle.value = ''; await loadEgresos()
  } catch (e: any) { error.value = e?.message ?? 'Error' }
  finally { egrLoading.value = false }
}

onMounted(async () => { await loadPermisos(); await loadCuentas() })
watch(codneg, async () => { await loadPermisos(); loadTabData() })
watch(tab, () => loadTabData())
</script>

<template>
  <div class="space-y-4">
    <div class="card p-4">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 class="text-lg font-semibold text-main">Contabilidad</h2>
          <p class="text-sm text-muted">Cuentas, ingresos y egresos.</p>
        </div>
        <div class="flex gap-2">
          <button v-if="tab === 'cuentas'" type="button" class="px-4 py-2 btn btn-primary text-sm" @click="showCreateCta = true; ctaNombre = ''; ctaTipo = ''">+ Cuenta</button>
          <button v-if="tab === 'ingresos' && (perms.ingreso || isAdmin)" type="button" class="px-4 py-2 btn btn-primary text-sm" @click="showCreateIng = true; ingCodcta = null; ingMonto = null; ingDetalle = ''">+ Ingreso</button>
          <button v-if="tab === 'egresos' && (perms.egreso || isAdmin)" type="button" class="px-4 py-2 btn btn-primary text-sm" @click="showCreateEgr = true; egrCodcta = null; egrMonto = null; egrDetalle = ''">+ Egreso</button>
        </div>
      </div>
      <div class="flex gap-1 mt-4 border-b" style="border-color: var(--color-border)">
        <button v-for="t in (['cuentas', 'ingresos', 'egresos'] as const)" :key="t" type="button"
          class="px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors"
          :class="tab === t ? 'border-[var(--color-accent)] text-[var(--color-accent)]' : 'border-transparent text-muted hover:text-main'"
          @click="tab = t">{{ t.charAt(0).toUpperCase() + t.slice(1) }}</button>
      </div>
    </div>

    <ErrorAlert v-if="error" :message="error" @dismiss="error = null" />
    <LoadingSpinner v-if="loading" />

    <!-- Cuentas -->
    <div v-if="!loading && tab === 'cuentas'" class="card p-4">
      <BaseTable :columns="ctaCols" :rows="cuentas" row-key="codcta" striped>
        <template #cell-estado="{ value }">
          <span :class="['inline-flex w-2 h-2 rounded-full', value === 'A' ? 'bg-green-500' : 'bg-red-500']" />
        </template>
        <template #empty><EmptyState title="Sin cuentas" message="Crea la primera cuenta contable." /></template>
      </BaseTable>
    </div>

    <!-- Ingresos -->
    <div v-if="!loading && tab === 'ingresos'" class="card p-4">
      <BaseTable :columns="ingCols" :rows="ingresos" row-key="coding" striped>
        <template #cell-monto="{ value }">{{ fmtMoney(value ?? 0) }}</template>
        <template #cell-fecha="{ value }">{{ fmtDate(value) }}</template>
        <template #empty><EmptyState title="Sin ingresos" message="No hay ingresos registrados." /></template>
      </BaseTable>
    </div>

    <!-- Egresos -->
    <div v-if="!loading && tab === 'egresos'" class="card p-4">
      <BaseTable :columns="egrCols" :rows="egresos" row-key="codegr" striped>
        <template #cell-monto="{ value }">{{ fmtMoney(value ?? 0) }}</template>
        <template #cell-fecha="{ value }">{{ fmtDate(value) }}</template>
        <template #empty><EmptyState title="Sin egresos" message="No hay egresos registrados." /></template>
      </BaseTable>
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
