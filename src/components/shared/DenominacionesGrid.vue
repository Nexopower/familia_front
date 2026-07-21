<script setup lang="ts">
/**
 * Grilla de conteo físico de denominaciones (RD$).
 * v-model: Record<valor, cantidad>
 */
import { computed } from 'vue'
import { DENOMINACIONES, construirConteo, calcularTotales, fmtMoney } from '@/utils/caja'

const props = defineProps<{ modelValue: Record<number, number>; disabled?: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: Record<number, number>): void }>()

const billetes = DENOMINACIONES.filter(d => !d.esMoneda)
const monedas = DENOMINACIONES.filter(d => d.esMoneda)

const totales = computed(() => calcularTotales(construirConteo(props.modelValue ?? {})))

function setCant(valor: number, raw: any) {
  const cantidad = Math.max(0, Math.floor(Number(raw) || 0))
  emit('update:modelValue', { ...(props.modelValue ?? {}), [valor]: cantidad })
}
function subtotal(valor: number) {
  return (Math.max(0, Math.floor(Number(props.modelValue?.[valor] ?? 0)) || 0)) * valor
}
</script>

<template>
  <div class="space-y-4">
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <!-- Billetes -->
      <div>
        <p class="text-xs font-semibold uppercase tracking-wider text-muted mb-2">Billetes</p>
        <div class="space-y-1.5">
          <div v-for="d in billetes" :key="d.valor" class="flex items-center gap-2">
            <span class="w-20 text-sm text-main font-medium">${{ fmtMoney(d.valor) }}</span>
            <input
              type="number" min="0" step="1" :disabled="disabled"
              :value="modelValue?.[d.valor] ?? 0"
              @input="setCant(d.valor, ($event.target as HTMLInputElement).value)"
              class="w-24 px-2 py-1.5 input text-sm text-right"
            />
            <span class="flex-1 text-right text-sm text-muted">{{ fmtMoney(subtotal(d.valor)) }}</span>
          </div>
        </div>
        <div class="flex justify-between mt-2 pt-2 border-t text-sm" style="border-color: var(--color-border)">
          <span class="text-muted">Total billetes</span>
          <span class="font-semibold text-main">{{ fmtMoney(totales.totalBilletes) }}</span>
        </div>
      </div>

      <!-- Monedas -->
      <div>
        <p class="text-xs font-semibold uppercase tracking-wider text-muted mb-2">Monedas</p>
        <div class="space-y-1.5">
          <div v-for="d in monedas" :key="d.valor" class="flex items-center gap-2">
            <span class="w-20 text-sm text-main font-medium">${{ fmtMoney(d.valor) }}</span>
            <input
              type="number" min="0" step="1" :disabled="disabled"
              :value="modelValue?.[d.valor] ?? 0"
              @input="setCant(d.valor, ($event.target as HTMLInputElement).value)"
              class="w-24 px-2 py-1.5 input text-sm text-right"
            />
            <span class="flex-1 text-right text-sm text-muted">{{ fmtMoney(subtotal(d.valor)) }}</span>
          </div>
        </div>
        <div class="flex justify-between mt-2 pt-2 border-t text-sm" style="border-color: var(--color-border)">
          <span class="text-muted">Total monedas</span>
          <span class="font-semibold text-main">{{ fmtMoney(totales.totalMonedas) }}</span>
        </div>
      </div>
    </div>

    <div class="flex justify-between items-center pt-3 border-t" style="border-color: var(--color-border)">
      <span class="text-sm font-semibold text-main">TOTAL GENERAL</span>
      <span class="text-xl font-bold text-main">{{ fmtMoney(totales.totalGeneral) }}</span>
    </div>
  </div>
</template>
