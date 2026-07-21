<script setup lang="ts">
/**
 * BaseTable — Tabla reutilizable con columnas configurables.
 *
 * Uso:
 *   <BaseTable :columns="cols" :rows="data" row-key="codprd">
 *     <template #cell-nombre="{ row }">{{ row.nombre }}</template>
 *     <template #cell-actions="{ row }">…</template>
 *   </BaseTable>
 */

import type { TableColumn } from '@/types'
export type { TableColumn as Column } from '@/types'

defineProps<{
  columns: TableColumn[]
  rows: any[]
  rowKey?: string
  loading?: boolean
  striped?: boolean
}>()
</script>

<template>
  <div class="overflow-x-auto">
    <table class="min-w-full text-sm">
      <thead>
        <tr class="text-left text-muted border-b border-base">
          <th
            v-for="col in columns"
            :key="col.key"
            :class="[
              'py-2.5 px-3 font-medium text-xs uppercase tracking-wider',
              col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left',
            ]"
            :style="col.width ? { width: col.width } : undefined"
          >
            {{ col.label }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(row, idx) in rows"
          :key="rowKey ? row[rowKey] : idx"
          :class="[
            'border-b border-base transition-colors hover:bg-[var(--menu-hover)]',
            striped && idx % 2 === 1 ? 'bg-[var(--app-bg-2)]/30' : '',
          ]"
        >
          <td
            v-for="col in columns"
            :key="col.key"
            :class="[
              'py-2.5 px-3',
              col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left',
            ]"
          >
            <slot :name="`cell-${col.key}`" :row="row" :value="row[col.key]">
              {{ row[col.key] ?? '—' }}
            </slot>
          </td>
        </tr>
        <tr v-if="!loading && rows.length === 0">
          <td :colspan="columns.length" class="py-8 text-center text-muted">
            <slot name="empty">Sin datos.</slot>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
