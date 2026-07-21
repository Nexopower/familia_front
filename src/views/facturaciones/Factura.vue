<script setup lang="ts">
import { computed, ref } from 'vue'
import type { FacturaPreviewProps } from '@/types'

const props = withDefaults(defineProps<FacturaPreviewProps>(), {
  negocio: () => ({ nombre: '' }),
})

const isPrinting = ref(false)
const cambioSeguro = computed(() => props.cambio ?? 0)

function imprimirFactura() {
  isPrinting.value = true
  window.print()
  setTimeout(() => {
    isPrinting.value = false
  }, 500)
}

function abrirCajaPOS() {
  // Enviar señal ESC para abrir caja registradora térmica
  // Esto es específico para impresoras térmicas con ESC/POS
  try {
    // Intenta enviar comando a través de API WebUSB o similar
    if (typeof navigator !== 'undefined' && 'usb' in navigator) {
      console.log('WebUSB disponible para abrir caja')
    }
    // Alternativa: enviar a backend para que abra la caja
    const event = new Event('posDrawerOpen')
    window.dispatchEvent(event)
  } catch (e) {
    console.error('Error abriendo caja:', e)
  }
}


function fmtMoney(v: number) {
  return new Intl.NumberFormat('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v ?? 0)
}

function fmtDate(date?: string | Date) {
  if (!date) return new Date().toLocaleDateString('es-ES', { year: 'numeric', month: '2-digit', day: '2-digit' })
  return new Date(date).toLocaleDateString('es-ES', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

defineExpose({ imprimirFactura, abrirCajaPOS })
</script>

<template>
  <div class="bg-white text-black print:bg-white w-[300px] ">
    <!-- CABECERA DE FACTURA -->
    <div class="px-3 pb-2 border-b-2 border-black">
      
      <div class="grid grid-cols-3 gap-8 items-center mb-3">
        <!-- Logo y Negocio -->
        <div class="col-span-3 flex items-center w-full justify-center">
          
          <div class="w-24 h-24 -mr-4 -ml-5 rounded flex items-center justify-center text-xs text-gray-600 print:block">
            <img src="@/assets/logos/multi servicios doña juana.svg" alt="logo" />
          </div>
          
          <!-- Centro - Nombre del Negocio -->
          <div class="text-center ">
            <h1 class="text-sm font-bold uppercase w-32 m-0 p-0 leading-none ">{{ negocio.nombre || 'Multi Servicios Doña Juana' }}</h1>
            <p class="text-xs text-gray-600 w-32">{{ negocio.ruc ? `RUC: ${negocio.ruc}` : '' }}</p>
            <p class="text-xs text-gray-600 w-32">{{ negocio.direccion}}</p>
            <p v-if="negocio.telefono" class="text-xs text-gray-600 w-32">Tel: {{ negocio.telefono }}</p>
          </div>
        </div>
        
      </div>
      
      <!-- Info de Factura -->
      <div class="grid grid-cols-3 items-center w-full">
        <p class="text-left text-xs font-bold col-span-2 ">{{ tipo === 'venta' ? 'FACTURA DE VENTA' : 'FACTURA DE COMPRA' }}</p>
        <div class="flex col-start-3 text-right text-xs items-end justify-end">
          <p class="font-bold">Nº </p>
          <p class="ml-0.5">{{ numero || '—' }}</p>          
        </div>
      </div>
      <div class="grid grid-cols-2 gap-8 text-sm">
        <p class="font-bold text-xs">FECHA EMISIÓN</p>
        <p class="text-xs text-right">{{ fmtDate(fecha) }}</p>
      </div>
    </div>

    <!-- CLIENTE / PROVEEDOR -->
    <div class="px-8 " :class="[(cliente || proveedor) ? 'py-4 border-b border-gray-300' : '']" >
      <div class="grid grid-cols-2 gap-8 text-sm">
        <div v-if="tipo === 'venta' && cliente">
          <p class="font-bold text-xs mb-1">CLIENTE:</p>
          <p>{{ cliente.nombre }} {{ cliente.apellidos ?? '' }}</p>
          <p v-if="cliente.cedula" class="text-xs text-gray-600">Cédula: {{ cliente.cedula }}</p>
        </div>
        <div v-else-if="tipo === 'compra' && proveedor">
          <p class="font-bold text-xs mb-1">PROVEEDOR:</p>
          <p>{{ proveedor.nombre }} {{ proveedor.apellidos ?? '' }}</p>
          <p v-if="proveedor.cedula" class="text-xs text-gray-600">Cédula: {{ proveedor.cedula }}</p>
        </div>
      </div>
    </div>

    <!-- TABLA DE PRODUCTOS -->
    <div class="px-3 pb-4">
      <table class="w-full text-sm border-collapse">
        <thead>
          <tr class="border-b-2 border-black">
            <th class="text-left py-2 font-bold text-xs">DESCRIPCIÓN</th>
            <th class="text-right py-2 font-bold text-xs w-16">CANT.</th>
            <th class="text-right py-2 font-bold text-xs w-20">PRECIO</th>
            <th class="text-right py-2 font-bold text-xs w-20">SUBTOTAL</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(item, idx) in items" :key="idx" class="border-b border-gray-300">
            <td class="py-3">
              <p class="font-medium">{{ item.nombre }}</p>
              <p v-if="item.codigo" class="text-xs text-gray-500">{{ item.codigo }}</p>
            </td>
            <td class="text-right py-3">{{ item.cantidad }}</td>
            <td class="text-right py-3">{{ fmtMoney(item.preuni) }}</td>
            <td class="text-right py-3 font-medium">{{ fmtMoney(item.cantidad * item.preuni) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- TOTALES -->
    <div class="px-3 py-4 border-t-2 border-black">
      <div class="  ">
        <div class="flex justify-between text-sm">
          <span>Subtotal:</span>
          <span>{{ fmtMoney(subtotal) }}</span>
        </div>
        <div class="flex justify-between text-sm">
          <span>Impuestos (IVA):</span>
          <span>{{ fmtMoney(impuestos) }}</span>
        </div>
        <div class="flex justify-between border-t-2 border-black pt-2 font-bold text-lg">
          <span>TOTAL:</span>
          <span>{{ fmtMoney(total) }}</span>
        </div>

        <!-- Pago y Cambio -->
        <div v-if="monto_pagado !== undefined || fondo_aplicado || fiado" class="border-t-2 border-gray-300 pt-2 mt-4 space-y-2">
          <div v-if="fondo_aplicado" class="flex justify-between text-sm">
            <span>Pagado con fondo:</span>
            <span class="font-medium">{{ fmtMoney(fondo_aplicado) }}</span>
          </div>
          <div v-if="fiado" class="flex justify-between text-sm text-amber-700 font-medium">
            <span>Fiado (a crédito):</span>
            <span>{{ fmtMoney(fiado) }}</span>
          </div>
          <div v-if="monto_pagado !== undefined" class="flex justify-between text-sm">
            <span>{{ (fondo_aplicado || fiado) ? 'Efectivo:' : 'Monto Pagado:' }}</span>
            <span class="font-medium">{{ fmtMoney(monto_pagado) }}</span>
          </div>
          <div v-if="monto_pagado !== undefined" class="flex justify-between text-sm font-bold"
            :class="cambioSeguro >= 0 ? 'text-green-700' : 'text-red-700'">
            <span>{{ cambioSeguro >= 0 ? 'Cambio' : 'Falta' }}:</span>
            <span>{{ fmtMoney(Math.abs(cambioSeguro)) }}</span>
          </div>
        </div>
      </div>


    </div>

    <!-- PIE DE FACTURA -->
    <div class="px-8 py-4 border-t-2 border-black text-center text-xs space-y-2 text-gray-700">
      <p class="font-bold">GRACIAS POR SU COMPRA</p>
      <p class="text-gray-500 text-xs mt-4">Factura generada: {{ new Date().toLocaleString('es-ES') }}</p>
    </div>


  </div>
</template>

<style scoped>
@media print {
  :global(body) {
    margin: 0;
    padding: 0;
  }

  .print\:hidden {
    display: none !important;
  }

  .print\:block {
    display: block !important;
  }

  .print\:bg-white {
    background-color: white !important;
  }
}
</style>
