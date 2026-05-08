<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, watch } from 'vue'

const props = withDefaults(defineProps<{
  open: boolean
  title?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  closable?: boolean
}>(), {
  title: '',
  size: 'md',
  closable: true,
})

const emit = defineEmits<{
  (e: 'close'): void
}>()

const sizeClass = computed(() => {
  const map: Record<string, string> = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  }
  return map[props.size] ?? 'max-w-lg'
})

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.closable) emit('close')
}

function onBackdropClick() {
  if (props.closable) emit('close')
}

onMounted(() => window.addEventListener('keydown', onKeyDown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeyDown))

watch(() => props.open, (val) => {
  document.body.style.overflow = val ? 'hidden' : ''
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <!-- Backdrop -->
        <div
          class="absolute inset-0 bg-black/40 backdrop-blur-sm"
          @click="onBackdropClick"
        />

        <!-- Panel -->
        <div
          :class="[sizeClass, 'relative w-full card p-0 overflow-hidden shadow-2xl']"
          @click.stop
        >
          <!-- Header -->
          <div
            v-if="title || closable || $slots.header"
            class="flex items-center justify-between px-5 py-3 border-b border-base"
          >
            <slot name="header">
              <h3 class="text-base font-semibold text-main">{{ title }}</h3>
            </slot>
            <button
              v-if="closable"
              type="button"
              class="p-1 rounded-md text-muted hover:text-main hover:bg-[var(--menu-hover)] transition"
              @click="emit('close')"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Body -->
          <div class="px-5 py-4 max-h-[70vh] overflow-y-auto">
            <slot />
          </div>

          <!-- Footer -->
          <div
            v-if="$slots.footer"
            class="px-5 py-3 border-t border-base flex items-center justify-end gap-2"
          >
            <slot name="footer" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>
