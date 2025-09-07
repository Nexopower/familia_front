<script setup lang="ts">
import { defineProps } from 'vue'
import MenuItem from './MenuItem.vue'
import { ref } from 'vue'

const props = defineProps({
  label: {
    type: String,
    required: true
  },
  imagen: {
    type: String,
    required: true
  },
  hasimagen: {
    type: Boolean,
    default: false
  },
  position: {
    type: Number,
    default: 0
  },
  css: {
    type: String,
    default: ""
  }
})

const isHovered = ref(false);
let timeoutId: number | undefined = undefined;

const menupositions={
  "0": "absolute left-0 mt-2 ml-2 w-48",      // Abajo
  "1": "absolute left-full top-0 w-48 ml-2", // Derecha
  "2": "absolute right-full top-0 w-48 mr-2", // Izquierda
  "3": "absolute left-0 bottom-full mb-2 ml-3 w-48" // Arriba
}

function onHoverStart() {
  if (timeoutId) {
    clearTimeout(timeoutId);
  }
  isHovered.value = true;
}

function onHoverEnd() {
  timeoutId = setTimeout(() => {
    isHovered.value = false;
  }, 500);
}

</script>

<template>
  <div 
  class="relative"

  >
    <div class="flex items-center px-3 py-2 text-white rounded-md group hover:bg-gray-600"
    @mouseover="onHoverStart"
    @mouseleave="onHoverEnd"
    >
      <img v-if="hasimagen" :src="`/img/${imagen}.png`" alt="" class="w-6 h-6 mr-3" />
      <span :class="`${css}`">{{ label }}</span>
    </div>
    <!-- <button 
      class="px-3 py-2 rounded-md text-sm font-medium text-white hover:bg-gray-700"
    >
      <img v-if="hasimagen" :src="`/img/${imagen}.png`" alt="" class="w-6 h-6 inline-block mr-2" />
      {{ label }}
    </button> -->
    <div v-if="isHovered"
      class="absolute z-50 w-48 bg-gray-500 text-black rounded-md shadow-lg opacity-0 transition duration-500 " :class="` ${menupositions[position]} ${isHovered? 'opacity-100' : 'opacity-0'}`"
          @mouseover="onHoverStart"
          @mouseleave="onHoverEnd"
    >
    <slot>

    </slot>
    </div>
  </div>
</template>
