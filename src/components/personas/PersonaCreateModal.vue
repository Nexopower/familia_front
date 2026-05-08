<script setup lang="ts">
/**
 * PersonaCreateModal — Modal para registrar una persona nueva.
 * Campos que llena el usuario: nombre, apellido, email, teléfono, dirección, sexo, fecha nacimiento.
 * Campos auto: codper (PK auto), estado (default 'A'), usercrea/fechcrea (back).
 */
import { ref, watch } from 'vue'
import BaseModal from '../shared/BaseModal.vue'
import FormField from '../shared/FormField.vue'
import ErrorAlert from '../shared/ErrorAlert.vue'
import { apiFetch } from '@/utils/api'
import type { Persona } from '@/types'

const props = defineProps<{ open: boolean }>()

const emit = defineEmits<{
  (e: 'created', persona: Persona): void
  (e: 'close'): void
}>()

const nombre = ref('')
const apellido = ref('')
const email = ref('')
const telefono = ref('')
const direccion = ref('')
const codsex = ref<string>('')
const fecnac = ref('')

const loading = ref(false)
const error = ref<string | null>(null)

function reset() {
  nombre.value = ''
  apellido.value = ''
  email.value = ''
  telefono.value = ''
  direccion.value = ''
  codsex.value = ''
  fecnac.value = ''
  error.value = null
}

watch(() => props.open, (val) => { if (val) reset() })

async function onSubmit() {
  error.value = null
  if (!nombre.value.trim() || !apellido.value.trim()) {
    error.value = 'Nombre y apellido son requeridos'
    return
  }

  loading.value = true
  try {
    const persona = await apiFetch<Persona>('personas', {
      method: 'POST',
      body: JSON.stringify({
        nombre: nombre.value.trim(),
        apellido: apellido.value.trim(),
        email: email.value.trim() || null,
        telefono: telefono.value.trim() || null,
        direccion: direccion.value.trim() || null,
        codsex: codsex.value || null,
        fecnac: fecnac.value || null,
      }),
    })
    emit('created', persona)
    emit('close')
  }
  catch (e: any) {
    error.value = e?.message ?? 'Error creando persona'
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <BaseModal :open="open" title="Registrar persona" size="md" @close="emit('close')">
    <form class="space-y-3" @submit.prevent="onSubmit">
      <ErrorAlert v-if="error" :message="error" @dismiss="error = null" />

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label="Nombre" required>
          <input v-model="nombre" type="text" class="w-full px-3 py-2 input" placeholder="Juan" />
        </FormField>

        <FormField label="Apellido" required>
          <input v-model="apellido" type="text" class="w-full px-3 py-2 input" placeholder="Pérez" />
        </FormField>

        <FormField label="Email" hint="Debe ser único en el sistema">
          <input v-model="email" type="email" class="w-full px-3 py-2 input" placeholder="correo@ejemplo.com" />
        </FormField>

        <FormField label="Teléfono">
          <input v-model="telefono" type="tel" class="w-full px-3 py-2 input" placeholder="+1 234 567 8900" />
        </FormField>

        <FormField label="Dirección">
          <input v-model="direccion" type="text" class="w-full px-3 py-2 input" placeholder="Calle 123" />
        </FormField>

        <FormField label="Sexo">
          <select v-model="codsex" class="w-full px-3 py-2 input">
            <option value="">— Sin especificar —</option>
            <option value="M">Masculino</option>
            <option value="F">Femenino</option>
          </select>
        </FormField>

        <FormField label="Fecha de nacimiento">
          <input v-model="fecnac" type="date" class="w-full px-3 py-2 input" />
        </FormField>
      </div>
    </form>

    <template #footer>
      <button type="button" class="px-4 py-2 btn btn-secondary text-sm" :disabled="loading" @click="emit('close')">
        Cancelar
      </button>
      <button type="button" class="px-4 py-2 btn btn-primary text-sm disabled:opacity-60" :disabled="loading" @click="onSubmit">
        {{ loading ? 'Guardando…' : 'Guardar persona' }}
      </button>
    </template>
  </BaseModal>
</template>
