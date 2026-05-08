<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { apiFetch } from '@/utils/api'
import { useSession } from '@/utils/session'
import type {
  AuthzCheckResponse,
  ConversionUM,
  Transformacion,
  TransformacionCompleta,
  TransformacionItemDTO,
  UnidadMedida,
  ProductoConDetalles,
} from '@/types'

import BaseTable, { type Column } from '@/components/shared/BaseTable.vue'
import BaseModal from '@/components/shared/BaseModal.vue'
import FormField from '@/components/shared/FormField.vue'
import LoadingSpinner from '@/components/shared/LoadingSpinner.vue'
import ErrorAlert from '@/components/shared/ErrorAlert.vue'
import EmptyState from '@/components/shared/EmptyState.vue'

const { user } = useSession()
const codneg = computed(() => {
  const v = Number(user.value?.codneg)
  return Number.isFinite(v) && v > 0 ? v : null
})
const isAdmin = computed(() => Boolean(user.value?.isAdmin || user.value?.codusr === 'admin'))

const perms = ref({
  verInventario: false,
  gestionarUnidades: false,
  gestionarConversiones: false,
  gestionarTransformaciones: false,
})

async function loadPermisos() {
  if (isAdmin.value) {
    perms.value = {
      verInventario: true,
      gestionarUnidades: true,
      gestionarConversiones: true,
      gestionarTransformaciones: true,
    }
    return
  }

  if (!codneg.value)
    return

  try {
    const keys = [
      'INVENTARIO.VER',
      'INVENTARIO.UNIDADES.GESTIONAR',
      'INVENTARIO.CONVERSIONES.GESTIONAR',
      'INVENTARIO.TRANSFORMACIONES.GESTIONAR',
    ]
    const res = await apiFetch<AuthzCheckResponse>('authz/check', {
      method: 'POST',
      body: JSON.stringify({ codneg: codneg.value, permisos: keys }),
    })
    const m = res?.permisos ?? {}
    perms.value = {
      verInventario: Boolean(m['INVENTARIO.VER']),
      gestionarUnidades: Boolean(m['INVENTARIO.UNIDADES.GESTIONAR']),
      gestionarConversiones: Boolean(m['INVENTARIO.CONVERSIONES.GESTIONAR']),
      gestionarTransformaciones: Boolean(m['INVENTARIO.TRANSFORMACIONES.GESTIONAR']),
    }
  } catch {
    perms.value = {
      verInventario: false,
      gestionarUnidades: false,
      gestionarConversiones: false,
      gestionarTransformaciones: false,
    }
  }
}

const loading = ref(false)
const error = ref<string | null>(null)
const activeTab = ref<'unidades' | 'conversiones' | 'transformaciones'>('unidades')

const unidades = ref<UnidadMedida[]>([])
const showCreateUnidad = ref(false)
const unidadLoading = ref(false)
const newUnidadNombre = ref('')
const newUnidadSimbolo = ref('')
const newUnidadTipo = ref('conteo')
const tiposUnidad = ['conteo', 'volumen', 'peso', 'longitud', 'otro']

const unidadCols: Column[] = [
  { key: 'codumd', label: '#', width: '60px' },
  { key: 'nombre', label: 'Nombre' },
  { key: 'simbolo', label: 'Símbolo', width: '80px' },
  { key: 'tipo', label: 'Tipo', width: '120px' },
  { key: 'actions', label: '', width: '100px', align: 'center' },
]

async function loadUnidades() {
  loading.value = true
  try {
    unidades.value = await apiFetch<UnidadMedida[]>('inventario-avanzado/unidades')
  } catch (e: any) {
    error.value = e?.message ?? 'Error cargando unidades'
  } finally {
    loading.value = false
  }
}

function resetUnidadForm() {
  newUnidadNombre.value = ''
  newUnidadSimbolo.value = ''
  newUnidadTipo.value = 'conteo'
}

async function createUnidad() {
  if (!newUnidadNombre.value.trim()) {
    error.value = 'Nombre requerido'
    return
  }

  unidadLoading.value = true
  try {
    await apiFetch('inventario-avanzado/unidades', {
      method: 'POST',
      body: JSON.stringify({
        nombre: newUnidadNombre.value.trim(),
        simbolo: newUnidadSimbolo.value.trim() || undefined,
        tipo: newUnidadTipo.value,
      }),
    })
    showCreateUnidad.value = false
    resetUnidadForm()
    await loadUnidades()
  } catch (e: any) {
    error.value = e?.message ?? 'Error creando unidad'
  } finally {
    unidadLoading.value = false
  }
}

const conversiones = ref<ConversionUM[]>([])
const showCreateConversion = ref(false)
const conversionLoading = ref(false)
const newConvOrigen = ref<number | null>(null)
const newConvDestino = ref<number | null>(null)
const newConvFactor = ref<number | null>(null)

const conversionCols: Column[] = [
  { key: 'codcnv', label: '#', width: '60px' },
  { key: 'origen', label: 'Unidad Origen' },
  { key: 'destino', label: 'Unidad Destino' },
  { key: 'factor', label: 'Factor', width: '120px', align: 'right' },
  { key: 'actions', label: '', width: '100px', align: 'center' },
]

async function loadConversiones() {
  if (!codneg.value)
    return

  loading.value = true
  try {
    conversiones.value = await apiFetch<ConversionUM[]>(`inventario-avanzado/conversiones?codneg=${codneg.value}`)
  } catch (e: any) {
    error.value = e?.message ?? 'Error cargando conversiones'
  } finally {
    loading.value = false
  }
}

function resetConversionForm() {
  newConvOrigen.value = null
  newConvDestino.value = null
  newConvFactor.value = null
}

async function createConversion() {
  if (!newConvOrigen.value || !newConvDestino.value) {
    error.value = 'Selecciona las unidades origen y destino'
    return
  }
  if (!newConvFactor.value || newConvFactor.value <= 0) {
    error.value = 'Factor debe ser mayor a 0'
    return
  }

  conversionLoading.value = true
  try {
    await apiFetch('inventario-avanzado/conversiones', {
      method: 'POST',
      body: JSON.stringify({
        codneg: codneg.value,
        codumd_origen: newConvOrigen.value,
        codumd_destino: newConvDestino.value,
        factor: newConvFactor.value,
      }),
    })
    showCreateConversion.value = false
    resetConversionForm()
    await loadConversiones()
  } catch (e: any) {
    error.value = e?.message ?? 'Error creando conversión'
  } finally {
    conversionLoading.value = false
  }
}

const productosDisponibles = ref<ProductoConDetalles[]>([])
const transformaciones = ref<Transformacion[]>([])
const showCreateTransformacion = ref(false)
const transformacionLoading = ref(false)
const newTrfDetalle = ref('')
const newTrfItems = ref<TransformacionItemDTO[]>([])
const newTrfItemCodprd = ref<number | null>(null)
const newTrfItemTipo = ref<'salida' | 'entrada'>('salida')
const newTrfItemCantidad = ref<number | null>(null)
const showTransformacionDetalle = ref(false)
const transformacionDetalle = ref<TransformacionCompleta | null>(null)

const transformacionCols: Column[] = [
  { key: 'codtrf', label: '#', width: '60px' },
  { key: 'fecha', label: 'Fecha', width: '180px' },
  { key: 'tipo', label: 'Tipo', width: '100px' },
  { key: 'detalle', label: 'Detalle' },
  { key: 'num_items', label: 'Items', width: '80px', align: 'center' },
  { key: 'estado', label: 'Estado', width: '100px' },
  { key: 'actions', label: '', width: '100px', align: 'center' },
]

async function loadProductosDisponibles() {
  if (!codneg.value)
    return

  try {
    productosDisponibles.value = await apiFetch<ProductoConDetalles[]>(
      `inventario-avanzado/productos-detallados?codneg=${codneg.value}`,
    )
  } catch {
    productosDisponibles.value = []
  }
}

async function loadTransformaciones() {
  if (!codneg.value)
    return

  loading.value = true
  try {
    transformaciones.value = await apiFetch<Transformacion[]>(
      `inventario-avanzado/transformaciones?codneg=${codneg.value}`,
    )
  } catch (e: any) {
    error.value = e?.message ?? 'Error cargando transformaciones'
  } finally {
    loading.value = false
  }
}

function resetTransformacionForm() {
  newTrfDetalle.value = ''
  newTrfItems.value = []
  newTrfItemCodprd.value = null
  newTrfItemTipo.value = 'salida'
  newTrfItemCantidad.value = null
}

function addTrfItem() {
  if (!newTrfItemCodprd.value || !newTrfItemCantidad.value || newTrfItemCantidad.value <= 0) {
    error.value = 'Selecciona producto y cantidad válida'
    return
  }

  newTrfItems.value.push({
    codprd: newTrfItemCodprd.value,
    tipo: newTrfItemTipo.value,
    cantidad: newTrfItemCantidad.value,
  })
  newTrfItemCodprd.value = null
  newTrfItemCantidad.value = null
  error.value = null
}

function removeTrfItem(idx: number) {
  newTrfItems.value.splice(idx, 1)
}

function getProductoNombre(codprd: number) {
  return productosDisponibles.value.find(p => p.codprd === codprd)?.nombre ?? `#${codprd}`
}

async function createTransformacion() {
  if (!newTrfItems.value.length) {
    error.value = 'Agrega al menos un item'
    return
  }

  transformacionLoading.value = true
  try {
    await apiFetch('inventario-avanzado/transformaciones', {
      method: 'POST',
      body: JSON.stringify({
        codneg: codneg.value,
        detalle: newTrfDetalle.value.trim() || undefined,
        tipo: 'manual',
        items: newTrfItems.value,
      }),
    })
    showCreateTransformacion.value = false
    resetTransformacionForm()
    await loadTransformaciones()
  } catch (e: any) {
    error.value = e?.message ?? 'Error creando transformación'
  } finally {
    transformacionLoading.value = false
  }
}

async function viewTransformacion(trf: Transformacion) {
  showTransformacionDetalle.value = true
  transformacionDetalle.value = null
  try {
    transformacionDetalle.value = await apiFetch<TransformacionCompleta>(
      `inventario-avanzado/transformaciones/${trf.codtrf}?codneg=${codneg.value}`,
    )
  } catch (e: any) {
    error.value = e?.message ?? 'Error cargando detalle'
  }
}

function fmtDate(v: string | null | undefined) {
  if (!v)
    return '—'
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString()
}

async function loadAll() {
  await loadPermisos()
  await Promise.all([loadUnidades(), loadConversiones(), loadProductosDisponibles(), loadTransformaciones()])
}

onMounted(loadAll)
watch(codneg, loadAll)
</script>

<template>
  <div class="space-y-4">
    <div class="card p-4">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 class="text-lg font-semibold text-main">Inventario técnico</h2>
          <p class="text-sm text-muted">
            Unidades, conversiones y transformaciones. La composición de productos ahora se gestiona desde Productos.
          </p>
        </div>
        <button type="button" class="px-4 py-2 btn btn-secondary text-sm" :disabled="loading" @click="loadAll">
          Recargar
        </button>
      </div>
    </div>

    <ErrorAlert v-if="error" :message="error" @dismiss="error = null" />

    <div class="card p-0">
      <div class="flex border-b border-base overflow-x-auto">
        <button
          v-for="tab in (['unidades', 'conversiones', 'transformaciones'] as const)"
          :key="tab"
          type="button"
          :class="[
            'px-5 py-2.5 text-sm font-medium transition whitespace-nowrap',
            activeTab === tab ? 'border-b-2 border-[var(--primary)] text-[var(--primary)]' : 'text-muted hover:text-main',
          ]"
          @click="activeTab = tab"
        >
          {{ tab === 'unidades' ? 'Unidades' : tab === 'conversiones' ? 'Conversiones' : 'Transformaciones' }}
        </button>
      </div>

      <div class="p-4">
        <LoadingSpinner v-if="loading" />

        <div v-if="!loading && activeTab === 'unidades'">
          <div class="flex justify-between mb-3 flex-wrap gap-2">
            <p class="text-sm text-muted">Catálogo global de unidades para definir bases y equivalencias.</p>
            <button
              v-if="perms.gestionarUnidades || isAdmin"
              type="button"
              class="px-4 py-2 btn btn-primary text-sm"
              @click="showCreateUnidad = true; resetUnidadForm()"
            >
              + Nueva unidad
            </button>
          </div>
          <BaseTable :columns="unidadCols" :rows="unidades" row-key="codumd" striped>
            <template #cell-actions><span class="text-xs text-muted">—</span></template>
            <template #empty>
              <EmptyState title="Sin unidades" message="No hay unidades de medida registradas." />
            </template>
          </BaseTable>
        </div>

        <div v-if="!loading && activeTab === 'conversiones'">
          <div class="flex justify-between mb-3 flex-wrap gap-2">
            <p class="text-sm text-muted">Usa esto para equivalencias globales de medida dentro del negocio.</p>
            <button
              v-if="perms.gestionarConversiones || isAdmin"
              type="button"
              class="px-4 py-2 btn btn-primary text-sm"
              @click="showCreateConversion = true; resetConversionForm()"
            >
              + Nueva conversión
            </button>
          </div>
          <BaseTable :columns="conversionCols" :rows="conversiones" row-key="codcnv" striped>
            <template #cell-origen="{ row }">{{ row.nombre_origen }} ({{ row.simbolo_origen || '—' }})</template>
            <template #cell-destino="{ row }">{{ row.nombre_destino }} ({{ row.simbolo_destino || '—' }})</template>
            <template #cell-actions><span class="text-xs text-muted">—</span></template>
            <template #empty>
              <EmptyState title="Sin conversiones" message="No hay conversiones configuradas para este negocio." />
            </template>
          </BaseTable>
        </div>

        <div v-if="!loading && activeTab === 'transformaciones'">
          <div class="flex justify-between mb-3 flex-wrap gap-2">
            <p class="text-sm text-muted">
              Registra destapes, conversiones físicas y otros movimientos entre presentaciones o estados.
            </p>
            <button
              v-if="perms.gestionarTransformaciones || isAdmin"
              type="button"
              class="px-4 py-2 btn btn-primary text-sm"
              @click="showCreateTransformacion = true; resetTransformacionForm()"
            >
              + Nueva transformación
            </button>
          </div>
          <BaseTable :columns="transformacionCols" :rows="transformaciones" row-key="codtrf" striped>
            <template #cell-fecha="{ row }">{{ fmtDate(row.fecha) }}</template>
            <template #cell-actions="{ row }">
              <button class="px-2 py-1 btn btn-secondary text-xs" @click="viewTransformacion(row)">Ver</button>
            </template>
            <template #empty>
              <EmptyState title="Sin transformaciones" message="No hay transformaciones registradas." />
            </template>
          </BaseTable>
        </div>
      </div>
    </div>

    <BaseModal :open="showCreateUnidad" title="Nueva unidad de medida" size="sm" @close="showCreateUnidad = false">
      <div class="space-y-3">
        <FormField label="Nombre" required>
          <input v-model="newUnidadNombre" type="text" class="w-full px-3 py-2 input" placeholder="Ej: Kilogramo" />
        </FormField>
        <FormField label="Símbolo" hint="Abreviatura corta">
          <input v-model="newUnidadSimbolo" type="text" class="w-full px-3 py-2 input" placeholder="Ej: kg" />
        </FormField>
        <FormField label="Tipo">
          <select v-model="newUnidadTipo" class="w-full px-3 py-2 input">
            <option v-for="t in tiposUnidad" :key="t" :value="t">{{ t }}</option>
          </select>
        </FormField>
      </div>
      <template #footer>
        <button type="button" class="px-4 py-2 btn btn-secondary" @click="showCreateUnidad = false">Cancelar</button>
        <button type="button" class="px-4 py-2 btn btn-primary" :disabled="unidadLoading" @click="createUnidad">
          {{ unidadLoading ? 'Guardando...' : 'Guardar' }}
        </button>
      </template>
    </BaseModal>

    <BaseModal :open="showCreateConversion" title="Nueva conversión" size="md" @close="showCreateConversion = false">
      <div class="space-y-3">
        <p class="text-sm text-muted mb-2">Regla: cantidad origen × factor = cantidad destino</p>
        <div class="grid grid-cols-2 gap-3">
          <FormField label="Unidad Origen" required>
            <select v-model="newConvOrigen" class="w-full px-3 py-2 input">
              <option :value="null">— Seleccionar —</option>
              <option v-for="u in unidades" :key="u.codumd" :value="u.codumd">{{ u.nombre }} ({{ u.simbolo || '—' }})</option>
            </select>
          </FormField>
          <FormField label="Unidad Destino" required>
            <select v-model="newConvDestino" class="w-full px-3 py-2 input">
              <option :value="null">— Seleccionar —</option>
              <option v-for="u in unidades" :key="u.codumd" :value="u.codumd">{{ u.nombre }} ({{ u.simbolo || '—' }})</option>
            </select>
          </FormField>
        </div>
        <FormField label="Factor" required hint="Ej: 1 caja = 12 unidades → factor = 12">
          <input v-model.number="newConvFactor" type="number" step="0.000001" min="0" class="w-full px-3 py-2 input" />
        </FormField>
      </div>
      <template #footer>
        <button type="button" class="px-4 py-2 btn btn-secondary" @click="showCreateConversion = false">Cancelar</button>
        <button type="button" class="px-4 py-2 btn btn-primary" :disabled="conversionLoading" @click="createConversion">
          {{ conversionLoading ? 'Guardando...' : 'Guardar' }}
        </button>
      </template>
    </BaseModal>

    <BaseModal :open="showCreateTransformacion" title="Nueva transformación" size="lg" @close="showCreateTransformacion = false">
      <div class="space-y-4">
        <FormField label="Detalle" hint="Ej: destape de caja, conversión a unidades, producción interna">
          <input v-model="newTrfDetalle" type="text" class="w-full px-3 py-2 input" placeholder="Detalle" />
        </FormField>

        <div v-if="newTrfItems.length" class="border border-base rounded p-3 space-y-2 max-h-56 overflow-auto">
          <div v-for="(item, idx) in newTrfItems" :key="`${item.codprd}-${item.tipo}-${idx}`" class="flex items-center justify-between gap-3 text-sm">
            <span>{{ getProductoNombre(item.codprd) }} · {{ item.tipo }}</span>
            <div class="flex items-center gap-2">
              <span>{{ item.cantidad }}</span>
              <button type="button" class="text-red-500 hover:text-red-700" @click="removeTrfItem(idx)">Quitar</button>
            </div>
          </div>
        </div>
        <div v-else class="text-sm text-muted italic">Aún no agregaste items.</div>

        <div class="border-t border-base pt-3">
          <p class="text-sm font-medium mb-2">Agregar item</p>
          <div class="grid md:grid-cols-[1fr_150px_120px_110px] gap-2">
            <select v-model="newTrfItemCodprd" class="w-full px-3 py-2 input">
              <option :value="null">— Seleccionar producto —</option>
              <option v-for="p in productosDisponibles" :key="p.codprd" :value="p.codprd">
                {{ p.nombre }}{{ p.codigo ? ` (${p.codigo})` : '' }}
              </option>
            </select>
            <select v-model="newTrfItemTipo" class="w-full px-3 py-2 input">
              <option value="salida">Salida</option>
              <option value="entrada">Entrada</option>
            </select>
            <input v-model.number="newTrfItemCantidad" type="number" min="1" class="w-full px-3 py-2 input" placeholder="Cantidad" />
            <button type="button" class="px-3 py-2 btn btn-secondary" @click="addTrfItem">Agregar</button>
          </div>
        </div>
      </div>
      <template #footer>
        <button type="button" class="px-4 py-2 btn btn-secondary text-sm" @click="showCreateTransformacion = false">Cancelar</button>
        <button type="button" class="px-4 py-2 btn btn-primary text-sm" :disabled="transformacionLoading" @click="createTransformacion">
          {{ transformacionLoading ? 'Guardando...' : 'Guardar transformación' }}
        </button>
      </template>
    </BaseModal>

    <BaseModal :open="showTransformacionDetalle" title="Detalle de transformación" size="lg" @close="showTransformacionDetalle = false">
      <div v-if="!transformacionDetalle" class="py-6 flex justify-center">
        <LoadingSpinner />
      </div>
      <div v-else class="space-y-3">
        <div class="grid md:grid-cols-2 gap-3 text-sm">
          <div><span class="font-medium">Fecha:</span> {{ fmtDate(transformacionDetalle.fecha) }}</div>
          <div><span class="font-medium">Tipo:</span> {{ transformacionDetalle.tipo || '—' }}</div>
          <div><span class="font-medium">Estado:</span> {{ transformacionDetalle.estado || '—' }}</div>
          <div><span class="font-medium">Detalle:</span> {{ transformacionDetalle.detalle || '—' }}</div>
        </div>
        <div class="border border-base rounded p-3 space-y-2">
          <div v-for="item in transformacionDetalle.items" :key="item.codtfd" class="flex items-center justify-between text-sm gap-3">
            <span>{{ item.nombre_producto || `#${item.codprd}` }} · {{ item.tipo }}</span>
            <span>{{ item.cantidad }}</span>
          </div>
        </div>
      </div>
      <template #footer>
        <button type="button" class="px-4 py-2 btn btn-secondary text-sm" @click="showTransformacionDetalle = false">Cerrar</button>
      </template>
    </BaseModal>
  </div>
</template>
