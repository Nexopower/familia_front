<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { apiFetch } from '@/utils/api'
import { useSession } from '@/utils/session'
import type { Factura, FacturaLinea, FacturaPreviewProps } from '@/types'
import FacturaPreview from '@/views/facturaciones/Factura.vue'
import LoadingSpinner from '@/components/shared/LoadingSpinner.vue'
import ErrorAlert from '@/components/shared/ErrorAlert.vue'

const route = useRoute()
const router = useRouter()
const { user, negocios } = useSession()

const codfac = Number(route.query.codfac)
const tipo = String(route.query.tipo ?? '')

const loading = ref(false)
const deleteLoading = ref(false)
const error = ref<string | null>(null)
const factura = ref<Factura | null>(null)
const lineas = ref<FacturaLinea[]>([])

const codneg = computed(() => { const v = Number(user.value?.codneg); return Number.isFinite(v) && v > 0 ? v : null })
const negocioActual = computed(() => negocios.value.find(n => Number(n.codneg) === Number(codneg.value)) ?? null)

const previewProps = computed<FacturaPreviewProps | null>(() => {
  if (!factura.value) return null
  const subtotal = lineas.value.reduce((s, l) => s + Number(l.subtotal ?? 0), 0)
  const total = Number(factura.value.total ?? subtotal)
  return {
    numero: factura.value.codfac,
    fecha: factura.value.fecha,
    tipo: factura.value.tipo as 'venta' | 'compra',
    cliente: (factura.value as any).cliente_nombre ? { nombre: (factura.value as any).cliente_nombre } : undefined,
    proveedor: (factura.value as any).proveedor_nombre ? { nombre: (factura.value as any).proveedor_nombre } : undefined,
    items: lineas.value.map((l: any) => ({ nombre: l.producto_nombre ?? String(l.codprd), codigo: l.codigo, cantidad: l.cantidad, preuni: l.precio })),
    subtotal,
    impuestos: Math.max(0, total - subtotal),
    total,
    negocio: negocioActual.value ? { nombre: String(negocioActual.value.nombre) } : undefined,
  }
})

const estaAbierta = computed(() => factura.value?.estado !== 'cerrada')

async function cargar() {
  if (!codfac || !tipo) { error.value = 'Parámetros inválidos'; return }
  loading.value = true; error.value = null
  try {
    const data = await apiFetch<any>(`facturas/${codfac}?tipo=${tipo}`)
    factura.value = data.factura ?? data
    lineas.value = data.detalle ?? []
  } catch (e: any) { error.value = e?.message ?? 'Error cargando factura' }
  finally { loading.value = false }
}

function irAEditar() {
  router.push({ path: '/facturaciones', query: { codfac: String(codfac), tipo } })
}

async function eliminar() {
  if (!confirm('¿Eliminar esta factura? Esta acción no se puede deshacer.')) return
  deleteLoading.value = true; error.value = null
  try {
    await apiFetch(`facturas/${codfac}?tipo=${tipo}`, { method: 'DELETE' })
    router.back()
  } catch (e: any) { error.value = e?.message ?? 'Error eliminando factura' }
  finally { deleteLoading.value = false }
}

onMounted(cargar)
</script>

<template>
  <div class="space-y-4 p-4 max-w-2xl mx-auto">
    <!-- Toolbar -->
    <div class="flex items-center gap-3 flex-wrap">
      <button type="button" class="px-3 py-1.5 btn btn-secondary text-sm" @click="router.back()">← Volver</button>
      <h2 class="text-lg font-semibold text-main flex-1">Factura #{{ codfac }}</h2>
      <template v-if="!loading && factura && estaAbierta">
        <span class="px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">Abierta</span>
        <button type="button" class="px-4 py-1.5 btn btn-secondary text-sm" @click="irAEditar">Editar</button>
        <button type="button" class="px-4 py-1.5 btn text-sm bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-60" :disabled="deleteLoading" @click="eliminar">
          {{ deleteLoading ? 'Eliminando…' : 'Eliminar' }}
        </button>
      </template>
      <template v-else-if="!loading && factura">
        <span class="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">Cerrada</span>
      </template>
    </div>

    <ErrorAlert v-if="error" :message="error" @dismiss="error = null" />
    <LoadingSpinner v-if="loading" />

    <div v-if="!loading && previewProps" class="flex justify-center">
      <FacturaPreview v-bind="previewProps" />
    </div>
  </div>
</template>
