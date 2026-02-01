<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'

defineProps<{
  src: string
  alt?: string
  caption?: string
}>()

const open = ref(false)

function close() {
  open.value = false
}

// ESC key closes
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <figure class="zoom-image">
    <!-- Thumbnail -->
    <img
        :src="src"
        :alt="alt"
        class="zoom-thumb"
        role="button"
        tabindex="0"
        @click="open = true"
        @keydown.enter="open = true"
    />

    <!-- Optional caption -->
    <figcaption v-if="caption">{{ caption }}</figcaption>

    <!-- Overlay -->
    <teleport to="body">
      <div
          v-if="open"
          class="zoom-overlay"
          role="dialog"
          aria-modal="true"
          @mousedown="close"
      >
        <!-- Close button -->
        <button
            class="zoom-close"
            aria-label="Close image"
            @mousedown.stop="close"
        >
          ×
        </button>

        <!-- Full-size image -->
        <img
            :src="src"
            :alt="alt"
            class="zoom-full"
            @mousedown.stop
        />
      </div>
    </teleport>
  </figure>
</template>
