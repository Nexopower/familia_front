<script setup lang="ts">
/**
 * Menu horizontal principal — estilo barra oscura original.
 *
 * Agrupa ítems por categoría usando MenuDesplegable.
 * Visibilidad controlada por useRbac().can(moduleKey).
 */
import { computed } from 'vue'
import MenuItem from './MenuItem.vue'
import MenuDesplegable from './MenuDesplegable.vue'
import { useRbac } from '@/utils/useRbac'

const { can, loading } = useRbac()

const isAdmin = computed(() => {
  try {
    const raw = localStorage.getItem('user')
    if (!raw) return false
    const u = JSON.parse(raw)
    return Boolean(u?.isAdmin || u?.codusr === 'admin')
  } catch { return false }
})

function show(moduleKey: string): boolean {
  return isAdmin.value || can(moduleKey)
}
</script>

<template>
  <div class="flex justify-center items-center bg-gray-900 w-full py-4">
    <div class="flex items-center bg-gray-700 w-full max-w-screen-xl mx-4 h-16 rounded-md px-2">
      <!-- Inicio (siempre visible) -->
      <MenuItem to="/" name="home" label="Inicio" imagen="home" :hasimagen="false" />

      <!-- Catálogos -->
      <MenuDesplegable v-if="show('PRODUCTOS')" label="Catálogos" imagen="" :hasimagen="false" :position="0" css="text-sm font-medium">
        <MenuItem v-if="show('PRODUCTOS')" to="/productos" name="productos" label="Productos" imagen="" :hasimagen="false" />
      </MenuDesplegable>

      <!-- Operaciones -->
      <MenuDesplegable v-if="show('INVENTARIO') || show('FACTURAS') || show('RESERVAS')" label="Operaciones" imagen="" :hasimagen="false" :position="0" css="text-sm font-medium">
        <MenuItem v-if="show('INVENTARIO')" to="/inventario" name="inventario" label="Inventario" imagen="" :hasimagen="false" />
        <MenuItem v-if="show('INVENTARIO')" to="/inventario-avanzado" name="inventario-avanzado" label="Inv. Técnico" imagen="" :hasimagen="false" />
        <MenuItem v-if="show('FACTURAS')" to="/facturas" name="facturas" label="Facturas" imagen="" :hasimagen="false" />
        <MenuItem v-if="show('RESERVAS')" to="/reservas" name="reservas" label="Reservas" imagen="" :hasimagen="false" />
      </MenuDesplegable>

      <!-- Administración -->
      <MenuDesplegable v-if="show('CONTABILIDAD') || show('USUARIOS')" label="Administración" imagen="" :hasimagen="false" :position="0" css="text-sm font-medium">
        <MenuItem v-if="show('CONTABILIDAD')" to="/contabilidad" name="contabilidad" label="Contabilidad" imagen="" :hasimagen="false" />
        <MenuItem v-if="show('USUARIOS')" to="/usuarios" name="usuarios" label="Usuarios" imagen="" :hasimagen="false" />
      </MenuDesplegable>

      <!-- Configuración (solo admin/dueño) -->
      <MenuItem v-if="isAdmin" to="/configuraciones" name="configuraciones" label="Config." imagen="" :hasimagen="false" />

      <!-- Espaciador -->
      <div class="flex-1" />

      <!-- Perfil siempre visible -->
      <MenuItem to="/perfil" name="perfil" label="Perfil" imagen="" :hasimagen="false" />
    </div>
  </div>
</template>
